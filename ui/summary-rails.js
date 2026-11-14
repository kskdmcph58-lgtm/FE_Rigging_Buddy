/* Summary rail geometry and gesture handlers.
   app.js registers these once, in the original order/phase/options.
   WeakMap owns node-local state; delayed callbacks retain their isConnected guards. */
const expandedJournals = new Set();
// How many forecast rows each person's list has asked for. Display only, never saved.
const forecastLengths = new Map();
const FORECAST_BATCH = 30;
let recordReturnPosition = null;
const recordRails = new WeakMap();
// The mobile shell lays each person out as a vertical column, so touch tablets wider than 600px leave the rail too.
const desktopRecords = { get matches() { return UI_MEDIA.desktopRecordRail.matches && !UI_MEDIA.mobileShell.matches; } };
function compactRecords(item) {
  const records = M.live(item);
  return Boolean(item.seed) || records.length > 5 || records.filter(r => r.status !== 'normal').length >= 2;
}
function railState(rail) {
  if (!recordRails.has(rail)) recordRails.set(rail, { frame: 0, timer: 0, signature: '', initialized: false, step: 0 });
  return recordRails.get(rail);
}
function stopRail(rail, keepWheel = false) {
  const status = railState(rail);
  cancelAnimationFrame(status.frame); clearTimeout(status.timer); status.frame = 0;
  clearTimeout(status.autoTimer); status.autoUntil = 0;
  status.edgeAnimations?.forEach(animation => animation.cancel());
  status.edgeAnimations = null;
  if (!keepWheel) status.wheelGesture = null;
}
function moveRail(rail, target, duration = 120) {
  stopRail(rail);
  target = Math.max(0, Math.min(target, rail.scrollWidth - rail.clientWidth));
  const from = rail.scrollLeft, status = railState(rail);
  if (!duration || Math.abs(target - from) < 1 || !motionAllowed()) {
    rail.scrollLeft = target; return;
  }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    rail.scrollLeft = from + (target - from) * (1 - Math.pow(1 - t, 3));
    if (t < 1) status.frame = requestAnimationFrame(tick);
    else { status.frame = 0; clearTimeout(status.timer); }
  };
  status.frame = requestAnimationFrame(tick);
}
function defaultRailPosition(rail) {
  // The last marked card sits at the left edge; with no marks the rail starts at the beginning.
  const marks = [...rail.querySelectorAll('.record-chip')].map(chip => chip.matches('.upgraded,.skipped'));
  return Math.max(0, marks.lastIndexOf(true)) * (parseFloat(rail.style.getPropertyValue('--chip-width')) + 10);
}
function autoPositionRail(rail, duration = 120) {
  const status = railState(rail);
  clearTimeout(status.autoTimer);
  const deadline = Math.max(status.autoUntil || 0, status.returnUntil || 0);
  if (deadline > performance.now()) {
    status.autoTimer = setTimeout(() => {
      if (!rail.isConnected) return;
      autoPositionRail(rail, duration);
    }, deadline - performance.now());
    return;
  }
  status.autoPending = false;
  status.returnUntil = 0;
  clearTimeout(status.returnTimer);
  if (status.retiring) { finishRecordRail(rail, duration); return; }
  moveRail(rail, defaultRailPosition(rail), duration);
}
function scheduleRecordReturn(rail) {
  const status = railState(rail);
  clearTimeout(status.returnTimer);
  status.returnUntil = performance.now() + 5000;
  status.returnTimer = setTimeout(() => {
    if (!rail.isConnected) return;
    status.returnUntil = 0;
    status.autoUntil = 0;
    autoPositionRail(rail);
  }, 5000);
}
function finishRecordRail(rail, duration = 120) {
  const status = railState(rail);
  const chips = [...rail.querySelectorAll('.record-chip')];
  const before = chips.map(chip => chip.getBoundingClientRect());
  const height = rail.getBoundingClientRect().height;
  status.retiring = false;
  status.autoPending = false;
  stopRail(rail);
  expandedJournals.delete(rail.closest('.journal').dataset.sortId);
  renderSummary();
  if (!duration || !motionAllowed()) return;
  // Leaving rail mode resets scrollLeft in layout. Animate from the old visual
  // positions so the return to the grid has the same motion as a normal scroll.
  chips.forEach((chip, index) => {
    const next = chip.getBoundingClientRect(), previous = before[index];
    const x = previous.left - next.left, y = previous.top - next.top;
    if (Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(previous.width - next.width) > 1) {
      chip.animate([
        { transformOrigin: 'top left', transform: `translate(${x}px,${y}px) scaleX(${previous.width / next.width})` },
        { transformOrigin: 'top left', transform: 'none' }
      ], { duration, easing: MOTION.ease });
    }
  });
  const nextHeight = rail.getBoundingClientRect().height;
  if (Math.abs(height - nextHeight) > 1) rail.animate([
    { height: `${height}px` }, { height: `${nextHeight}px` }
  ], { duration, easing: MOTION.ease });
}
// A large height change needs a gentler curve than the standard one, which covers most of it in one frame.
// MOTION.large; this file loads before features.js defines MOTION.
const EXPAND_MOTION = { duration: 200, easing: 'cubic-bezier(.3,0,.2,1)' };
function visibleCards(rail) {
  const box = rail.getBoundingClientRect();
  return [...rail.querySelectorAll('.record-chip')].filter(chip => {
    const card = chip.getBoundingClientRect();
    return card.right > box.left + 1 && card.left < box.right - 1 && card.bottom > box.top + 1 && card.top < box.bottom - 1;
  });
}
// The rail folds into rows: every card starts where it sat on the rail, so each row moves as one.
// Rows further down share the second row's sideways distance, so they all arrive together.
function animateOpeningCards(rail, anchorIndex, anchorBefore) {
  const cards = [...rail.querySelectorAll('.record-chip')];
  const columns = Number(rail.style.getPropertyValue('--record-columns'));
  const step = parseFloat(rail.style.getPropertyValue('--chip-width')) + 10;
  const anchorRow = Math.floor(anchorIndex / columns);
  visibleCards(rail).forEach(chip => {
    const index = cards.indexOf(chip), next = chip.getBoundingClientRect();
    const rows = Math.min(Math.floor(index / columns) - anchorRow, 1);
    const x = anchorBefore.left + (index - anchorIndex) * step - next.left;
    const sideways = x - (Math.floor(index / columns) - anchorRow - rows) * columns * step;
    chip.animate([{ transform: `translate(${sideways}px,${anchorBefore.top - next.top}px)` }, { transform: 'none' }], EXPAND_MOTION);
  });
}
function setJournalExpanded(journal, expanded, animate = true) {
  const rail = journal.querySelector('.records');
  railState(rail).autoPending = false;
  railState(rail).returnUntil = 0;
  clearTimeout(railState(rail).returnTimer);
  if (railState(rail).retiring) { finishRecordRail(rail, animate ? 120 : 0); return; }
  const previousHeight = rail.getBoundingClientRect().height;
  const chips = [...rail.querySelectorAll('.record-chip')];
  const slideOpen = expanded && !journal.classList.contains('records-expanded') && chips.length <= 5;
  const previousPositions = slideOpen ? chips.map(chip => chip.getBoundingClientRect()) : [];
  // On wide screens the card at the rail's left edge keeps its place: its row becomes the top row.
  const anchoring = expanded && UI_MEDIA.wideRecordRow.matches && !journal.classList.contains('records-expanded');
  const anchorChip = anchoring ? visibleCards(rail)[0] : null;
  const anchorIndex = chips.indexOf(anchorChip);
  const anchorBefore = anchorChip?.getBoundingClientRect();
  stopRail(rail);
  rail.getAnimations().forEach(animation => animation.cancel());
  chips.forEach(chip => chip.getAnimations().forEach(animation => animation.cancel()));
  expanded ? expandedJournals.add(journal.dataset.sortId) : expandedJournals.delete(journal.dataset.sortId);
  journal.classList.toggle('records-expanded', expanded);
  const button = journal.querySelector('[data-expand-records]');
  if (button) { button.textContent = expanded ? '收起' : '展开'; button.setAttribute('aria-expanded', String(expanded)); }
  if (expanded) {
    rail.scrollLeft = 0; rail.scrollTop = 0;
    if (anchoring) {
      const topRow = Math.floor(Math.max(0, anchorIndex) / Number(rail.style.getPropertyValue('--record-columns')));
      fillExpandedForecast(rail, topRow);
      rail.scrollTop = chips[Math.max(0, anchorIndex)].getBoundingClientRect().top - rail.getBoundingClientRect().top;
    }
  }
  else moveRail(rail, defaultRailPosition(rail));
  const nextHeight = rail.getBoundingClientRect().height;
  // Short lists keep the same height: animate the cards back from their
  // scrolled positions so revealing hidden history still has a visible motion.
  if (slideOpen && animate && motionAllowed()) {
    chips.forEach((chip, index) => {
      const next = chip.getBoundingClientRect(), previous = previousPositions[index];
      const x = previous.left - next.left, y = previous.top - next.top;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) chip.animate([
        { transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }
      ], { duration: MOTION.medium, easing: MOTION.ease });
    });
  }
  if (anchorChip && animate && motionAllowed()) animateOpeningCards(rail, anchorIndex, anchorBefore);
  if (animate && motionAllowed() && Math.abs(nextHeight - previousHeight) > 1) {
    rail.animate([{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }], anchoring ? EXPAND_MOTION : {
      duration: MOTION.medium, easing: MOTION.ease
    }).onfinish = () => scheduleForecastCheck(rail);
  }
  scheduleForecastCheck(rail);
}
// Keeps forecast rows ready past the visible edge: two widths along a rail, one height when expanded.
function extendForecast(rail) {
  const journal = rail.closest('.journal'), status = railState(rail);
  if (!UI_MEDIA.wideRecordRow.matches || page !== 'summary' || !journal?.classList.contains('has-record-rail')) return;
  if (rail.getAnimations().length) return;
  const rows = rail.querySelectorAll('.queue-row'), id = journal.dataset.sortId;
  // Fewer rows than requested means the sequence ended at the level cap.
  if (!rows.length || rows.length < (forecastLengths.get(id) || 0)) return;
  let ahead;
  if (journal.classList.contains('records-expanded')) {
    // The opening animation is still short at this point, so measure against the final height.
    const height = parseFloat(getComputedStyle(rail).maxHeight);
    ahead = (rail.scrollHeight - rail.scrollTop - height) / height;
  } else {
    const box = rail.getBoundingClientRect(), last = rows[rows.length - 1].getBoundingClientRect();
    ahead = (last.right - box.right) / box.width / 2;
  }
  if (ahead >= 1) return;
  forecastLengths.set(id, rows.length + FORECAST_BATCH);
  status.extending = true;
  renderSummary();
  refreshRecordRails();
}
// Opening needs only five rows from the anchor; the rest follow once the animation has finished.
function fillExpandedForecast(rail, topRow) {
  const rows = rail.querySelectorAll('.queue-row'), status = railState(rail);
  const missing = Number(rail.style.getPropertyValue('--record-columns')) * (topRow + 5) - rail.querySelectorAll('.record-chip').length;
  if (!rows.length || missing <= 0) return;
  forecastLengths.set(rail.closest('.journal').dataset.sortId, rows.length + missing);
  status.extending = true;
  renderSummary();
  refreshRecordRails();
}
function scheduleForecastCheck(rail) {
  const status = railState(rail);
  if (status.forecastFrame) return;
  status.forecastFrame = requestAnimationFrame(() => {
    status.forecastFrame = 0;
    if (rail.isConnected) extendForecast(rail);
  });
}
function refreshRecordRails() {
  app.querySelectorAll('.journal').forEach(journal => {
    const rail = journal.querySelector('.records');
    const status = railState(rail);
    const first = !status.initialized;
    status.initialized = true;
    if (!desktopRecords.matches || !journal.classList.contains('has-record-rail')) {
      status.autoPending = false;
      status.returnUntil = 0;
      clearTimeout(status.returnTimer);
      stopRail(rail); rail.scrollLeft = 0; status.signature = ''; return;
    }
    const width = rail.clientWidth;
    const [maxColumns, minStep] = UI_MEDIA.wideRecordRow.matches ? [6, 150] : [5, 190];
    const columns = Math.max(1, Math.min(maxColumns, Math.floor((width + 10) / minStep)));
    const exactWidth = (width - (columns - 1) * 10) / columns;
    // scrollLeft rounds to whole pixels, so a fractional step would clip the first card's border.
    const step = (UI_MEDIA.wideRecordRow.matches ? Math.floor(exactWidth) : exactWidth) + 10;
    const previousPosition = status.step ? rail.scrollLeft / status.step : 0;
    rail.style.setProperty('--chip-width', `${step - 10}px`);
    rail.style.setProperty('--record-columns', columns);
    const signature = [...rail.querySelectorAll('.record-chip')].map(chip => `${chip.dataset.queue ? 'q' : ''}${chip.dataset.index}:${chip.matches('.upgraded,.skipped')}`).join('|');
    // Rows appearing because the engine finished loading are not a change the user made.
    const seedReady = window.RiggingSeed.ready();
    const seedJustLoaded = seedReady && status.seedReady === false;
    status.seedReady = seedReady;
    // Rows added past the edge must not move the list the user is reading.
    if (status.extending) { status.signature = signature; status.extending = false; }
    if (status.signature !== signature || seedJustLoaded) {
      status.signature = signature;
      if (!journal.classList.contains('records-expanded')) autoPositionRail(rail, first || seedJustLoaded ? 0 : 120);
    } else if (status.step !== step && !journal.classList.contains('records-expanded')) {
      // Selection adds a checkbox column. Keep the same reviewed card when
      // its width changes, instead of resetting the user's browsing position.
      moveRail(rail, previousPosition * step, 0);
    }
    status.step = step;
    scheduleForecastCheck(rail);
  });
  fitCardClasses();
}
function bounceRailEdge(rail, direction) {
  stopRail(rail);
  if (!motionAllowed()) return;
  const status = railState(rail);
  const distance = -direction * parseFloat(rail.style.getPropertyValue('--chip-width')) / 2;
  status.edgeDirection = direction;
  status.edgeAnimations = [...rail.querySelectorAll('.record-chip')].map(chip => chip.animate([
    { transform: 'translateX(0)', offset: 0, easing: 'ease-out' },
    { transform: `translateX(${distance}px)`, offset: .4, easing: 'ease-in-out' },
    { transform: 'translateX(0)', offset: 1 }
  ], { duration: 240 }));
}
function scheduleRailSnap(rail) {
  const status = railState(rail);
  clearTimeout(status.timer);
  status.timer = setTimeout(() => {
    const step = parseFloat(rail.style.getPropertyValue('--chip-width')) + 10;
    let target = Math.round(rail.scrollLeft / step) * step;
    // Finish wheel gestures in their direction, including any partial card.
    const gesture = status.wheelGesture;
    if (gesture) {
      // scrollLeft is pixel-rounded while card widths can be fractional.
      const position = (rail.scrollLeft - gesture.direction * .5) / step;
      target = (gesture.direction > 0 ? Math.ceil(position) : Math.floor(position)) * step;
      const minimum = (Math.round(gesture.start / step) + gesture.direction) * step;
      target = gesture.direction > 0 ? Math.max(target, minimum) : Math.min(target, minimum);
    }
    moveRail(rail, target, 80);
  }, 70);
}

function onRecordRailPointerOut(event) {
  if (event.pointerType !== 'mouse' || !desktopRecords.matches) return;
  const journal = event.target.closest('.journal');
  if (!journal?.matches('.has-record-rail:not(.records-expanded)') || journal.contains(event.relatedTarget)) return;
  const rail = journal.querySelector('.records'), status = railState(rail);
  if (!status.autoPending || status.returnUntil) return;
  status.autoUntil = 0;
  autoPositionRail(rail);
}

/* Which device a wheel gesture comes from, decided on its first event and kept until it pauses for 200ms.
   Browsers do not say, so this reads the event: line or page steps, or a whole number of 120-unit notches
   with no sideways part, are a mouse wheel; small continuous pixels, or any sideways part, a trackpad. A
   mouse taken for a trackpad scrolls the page (Shift+wheel or dragging still moves the rail); a trackpad
   taken for a mouse behaves as before. */
const wheelSource = { kind: null, until: 0 };
function wheelKind(event) {
  const now = performance.now();
  if (!wheelSource.kind || now > wheelSource.until) {
    wheelSource.kind = event.deltaMode !== 0 ? 'mouse'
      : event.deltaX !== 0 ? 'trackpad'
      : event.wheelDeltaY && event.wheelDeltaY % 120 === 0 ? 'mouse' : 'trackpad';
  }
  wheelSource.until = now + 200;
  return wheelSource.kind;
}
function onRecordRailWheel(event) {
  const rail = event.target.closest('.has-record-rail:not(.records-expanded) .records');
  if (!desktopRecords.matches || !rail || event.ctrlKey) return;
  // A trackpad's up/down swipe scrolls the page, as on macOS; only its sideways swipe moves the rail.
  if (wheelKind(event) === 'trackpad' && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) return;
  event.preventDefault();
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? rail.clientWidth : 1);
  if (!delta) return;
  const status = railState(rail), direction = Math.sign(delta);
  if (status.returnUntil) scheduleRecordReturn(rail);
  // Let one edge bounce finish during a wheel burst; reversing cancels it.
  if (status.edgeDirection === direction && status.edgeAnimations?.some(animation => animation.playState === 'running')) return;
  stopRail(rail, true);
  const target = Math.max(0, Math.min(rail.scrollLeft + delta, rail.scrollWidth - rail.clientWidth));
  if (target === rail.scrollLeft) { bounceRailEdge(rail, direction); return; }
  if (status.wheelGesture?.direction !== direction) status.wheelGesture = { start: rail.scrollLeft, direction };
  rail.scrollLeft = target;
  scheduleRailSnap(rail);
}

function onRecordRailScroll(event) {
  const rail = event.target;
  if (rail.matches?.('.has-record-rail .records')) scheduleForecastCheck(rail);
  if (!desktopRecords.matches || !rail.matches?.('.has-record-rail:not(.records-expanded) .records')) return;
  const status = railState(rail);
  if (status.frame || status.autoUntil > performance.now()) return;
  scheduleRailSnap(rail);
}

function onRecordRailPointerDown(event) {
  const rail = event.target.closest('.records');
  if (rail) stopRail(rail);
}

function onSummaryOutsideClick(event) {
  // A dialog opened from a card is still part of that card's work, not a click elsewhere.
  if (page !== 'summary' || !desktopRecords.matches || Date.now() < suppressGestureClickUntil || event.target.closest('dialog,.expectation-tip')) return;
  if (event.target.closest('.part3-segment,.route-segment,.recommend-filter')) return;
  app.querySelectorAll('.has-record-rail').forEach(journal => {
    if (!journal.contains(event.target)) setJournalExpanded(journal, false);
  });
}
// Class fields are clickable on wide screens only, so crossing the width redraws the cards.
UI_MEDIA.wideRecordRow.addEventListener('change', () => { if (page === 'summary') renderSummary(); });
