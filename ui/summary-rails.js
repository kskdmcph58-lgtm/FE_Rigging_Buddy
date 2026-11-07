/* Summary rail geometry and gesture handlers.
   app.js registers these once, in the original order/phase/options.
   WeakMap owns node-local state; delayed callbacks retain their isConnected guards. */
const expandedJournals = new Set();
let recordReturnPosition = null;
const recordRails = new WeakMap();
const desktopRecords = UI_MEDIA.desktopRecordRail;
function compactRecords(item) {
  const records = M.live(item);
  return records.length > 5 || records.filter(r => r.upgraded || r.skipped).length >= 2;
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
  const chips = [...rail.querySelectorAll('.record-chip')];
  let processed = 0;
  while (processed < chips.length && chips[processed].matches('.upgraded,.skipped')) processed++;
  return Math.max(0, processed - 1) * (parseFloat(rail.style.getPropertyValue('--chip-width')) + 10);
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
  stopRail(rail);
  rail.getAnimations().forEach(animation => animation.cancel());
  chips.forEach(chip => chip.getAnimations().forEach(animation => animation.cancel()));
  expanded ? expandedJournals.add(journal.dataset.sortId) : expandedJournals.delete(journal.dataset.sortId);
  journal.classList.toggle('records-expanded', expanded);
  const button = journal.querySelector('[data-expand-records]');
  if (button) { button.textContent = expanded ? '收起' : '展开'; button.setAttribute('aria-expanded', String(expanded)); }
  if (expanded) rail.scrollLeft = 0;
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
      ], { duration: 120, easing: MOTION.ease });
    });
  }
  if (animate && motionAllowed() && Math.abs(nextHeight - previousHeight) > 1) {
    rail.animate([{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }], {
      duration: 130, easing: MOTION.ease
    });
  }
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
    const columns = Math.max(1, Math.min(5, Math.floor((width + 10) / 190)));
    const step = (width - (columns - 1) * 10) / columns + 10;
    const previousPosition = status.step ? rail.scrollLeft / status.step : 0;
    rail.style.setProperty('--chip-width', `${step - 10}px`);
    rail.style.setProperty('--record-columns', columns);
    const signature = [...rail.querySelectorAll('.record-chip')].map(chip => `${chip.dataset.index}:${chip.matches('.upgraded,.skipped')}`).join('|');
    if (status.signature !== signature) {
      status.signature = signature;
      if (!journal.classList.contains('records-expanded')) autoPositionRail(rail, first ? 0 : 120);
    } else if (status.step !== step && !journal.classList.contains('records-expanded')) {
      // Selection adds a checkbox column. Keep the same reviewed card when
      // its width changes, instead of resetting the user's browsing position.
      moveRail(rail, previousPosition * step, 0);
    }
    status.step = step;
  });
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
  ], { duration: 320 }));
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

function onRecordRailWheel(event) {
  const rail = event.target.closest('.has-record-rail:not(.records-expanded) .records');
  if (!desktopRecords.matches || !rail || event.ctrlKey) return;
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
  if (page !== 'summary' || !desktopRecords.matches || Date.now() < suppressGestureClickUntil) return;
  app.querySelectorAll('.has-record-rail').forEach(journal => {
    if (!journal.contains(event.target)) setJournalExpanded(journal, false);
  });
}
