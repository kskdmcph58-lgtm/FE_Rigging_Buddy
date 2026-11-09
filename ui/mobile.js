/* Mobile shell: iOS-style navigation bar, the step 3 column board and its list modes.
   Active only while UI_MEDIA.mobileShell matches; desktop never builds any of it. Business actions stay
   in the page itself: navigation bar buttons forward to the page's own controls, so every delegated
   handler, disabled state and confirmation is the one the desktop uses. Loaded after app.js. */
(() => {
  const media = UI_MEDIA.mobileShell;
  // Short screens (a phone on its side) keep the compact bar on every page, as iOS does in landscape.
  const shortScreen = matchMedia('(max-height:500px)');
  const header = document.querySelector('body>header');
  const TITLES = { select: '选择人物', levels: '初始设置', summary: '升级记录' };
  // The bar shows the brand (the header's star and name) in place of a page title.
  const BRAND_TITLE = '<span class="m-nav-brand"><svg viewBox="0 0 32 40" width="20" height="25" fill="currentColor" aria-hidden="true"><path d="M16 3C13 14 10 17 2 20c8 3 11 6 14 17 3-11 6-14 14-17C22 17 19 14 16 3Z"/></svg>Rigging Buddy</span>';
  const ICONS = {
    back: '<svg viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2 2 10l8 8"/></svg>',
    add: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M10 3.5v13M3.5 10h13"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.25"/><circle cx="7.6" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.4" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>'
  };
  // Display state for this visit only: never saved, reset when step 3 is left.
  let sortMode = false, settingsOpen = false, nav = null, largeTitle = null, frame = 0;
  const columnScroll = new Map();
  let boardScroll = 0;
  /* Where the board stood, kept for this tab only (sessionStorage), so a refresh reopens each column where it
     was instead of at its rest. Read once; each column takes its position the first time it is placed. */
  const POSITIONS_KEY = 'rigging-buddy:mobile-board';
  let reloaded = null;
  try { reloaded = JSON.parse(sessionStorage.getItem(POSITIONS_KEY) || 'null'); } catch { reloaded = null; }
  if (reloaded) {
    if (Number.isFinite(reloaded.board)) boardScroll = reloaded.board;
    Object.entries(reloaded.forecast || {}).forEach(([id, length]) => {
      if (Number.isFinite(length) && !forecastLengths.has(id)) forecastLengths.set(id, length);
    });
  }
  let saveTimer = 0;
  function savePositions() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const columns = Object.fromEntries(columnScroll);
      // Columns not placed yet since the refresh keep the position they were read with.
      Object.entries(reloaded?.columns || {}).forEach(([id, top]) => { if (!(id in columns)) columns[id] = top; });
      try { sessionStorage.setItem(POSITIONS_KEY, JSON.stringify({ board: boardScroll, columns, forecast: Object.fromEntries(forecastLengths) })); } catch { /* Optional storage. */ }
    }, 200);
  }
  let knownBoard = null;

  const onSummary = () => page === 'summary';
  const listMode = () => sortMode || app.classList.contains('multi-select-mode');

  /* ---------- Navigation bar ---------- */
  function buildNav() {
    if (nav) return;
    nav = document.createElement('div');
    nav.className = 'm-nav';
    nav.innerHTML = '<div class="m-nav-bar"><div class="m-nav-leading"></div><span class="m-nav-title" aria-hidden="true"></span><div class="m-nav-trailing"></div></div>';
    header.append(nav);
    // The large title scrolls with the page under the pinned bar, so it lives outside the sticky header.
    largeTitle = document.createElement('h1');
    largeTitle.className = 'm-large-title';
    header.after(largeTitle);
    header.classList.add('m-header');
    nav.addEventListener('click', onNavClick);
  }
  function removeNav() {
    if (!nav) return;
    nav.remove(); nav = null;
    largeTitle?.remove(); largeTitle = null;
    header.classList.remove('m-header', 'm-collapsed', 'm-compact');
  }
  // A forwarding button: same label, same disabled state, and the click goes to the original control.
  function proxy(source, { label = source.textContent.trim(), icon = '', kind = '', aria = label } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `m-nav-button ${kind}`.trim();
    button.innerHTML = `${icon}${icon && kind.includes('icon') ? '' : `<span>${label}</span>`}`;
    button.setAttribute('aria-label', aria);
    button.disabled = source.disabled;
    button._source = source;
    return button;
  }
  function local(action, { label, icon = '', kind = '', aria = label, pressed } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `m-nav-button ${kind}`.trim();
    button.innerHTML = `${icon}${icon && kind.includes('icon') ? '' : `<span>${label}</span>`}`;
    button.setAttribute('aria-label', aria);
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    button.dataset.mobileAction = action;
    return button;
  }
  function navItems() {
    const leading = [], trailing = [];
    const find = selector => app.querySelector(selector);
    if (page === 'select') {
      const back = find('.toolbar [data-action="summary"]');
      if (back) leading.push(proxy(back, { label: '记录', icon: ICONS.back, kind: 'm-back', aria: '返回升级记录' }));
      const undo = find('.toolbar [data-action="undo-delete"]');
      if (undo) trailing.push(proxy(undo));
      const restore = find('.toolbar [data-action="import"]');
      if (restore) trailing.push(proxy(restore));
    } else if (page === 'levels') {
      const back = find('.bottom-bar [data-action="select"]');
      if (back) leading.push(proxy(back, { label: '选择', icon: ICONS.back, kind: 'm-back', aria: '返回选择人物' }));
    } else if (page === 'summary') {
      leading.push(local('sort', { label: sortMode ? '完成' : '排序', kind: sortMode ? 'strong' : '', aria: sortMode ? '完成排序' : '调整人物顺序', pressed: sortMode }));
      trailing.push(local('settings', { label: '显示设置', icon: ICONS.settings, kind: 'icon', aria: '剧情范围、路线与兵种推荐范围', pressed: settingsOpen }));
      const add = find('.summary-actions [data-action="select"]');
      if (add) trailing.push(proxy(add, { icon: ICONS.add, kind: 'icon', aria: '添加人物' }));
      trailing.push(local('more', { label: '更多', icon: ICONS.more, kind: 'icon', aria: '备份与更多操作' }));
    }
    return { leading, trailing };
  }
  // Only rebuild when something visible changed, so focus and press states survive page updates.
  function signature(items) {
    return items.map(button => `${button.className}|${button.textContent}|${button.disabled}|${button.getAttribute('aria-pressed')}|${button.getAttribute('aria-label')}`).join(';');
  }
  function refreshNav() {
    if (!media.matches) { removeNav(); return; }
    buildNav();
    const title = TITLES[page] || '';
    // Steps 1-3 show the brand in the middle of the bar instead of a page title (the large title stays,
    // hidden, as the heading for screen readers). Other pages have no bar title.
    if (TITLES[page]) nav.querySelector('.m-nav-title').innerHTML = BRAND_TITLE;
    else nav.querySelector('.m-nav-title').textContent = '';
    largeTitle.textContent = title;
    header.classList.toggle('m-compact', page === 'summary' || shortScreen.matches);
    const { leading, trailing } = navItems();
    for (const [slot, items] of [['.m-nav-leading', leading], ['.m-nav-trailing', trailing]]) {
      const host = nav.querySelector(slot);
      if (host.dataset.signature === signature(items) && host.children.length === items.length) {
        // Keep the mounted buttons; only refresh which original control each forwards to.
        [...host.children].forEach((button, index) => { button._source = items[index]._source; });
        continue;
      }
      host.dataset.signature = signature(items);
      host.replaceChildren(...items);
    }
    updateCollapse();
    layoutTitle();
  }
  // Like UINavigationBar: the title stays centred while it clears the bar items, slides toward the wider
  // side when it does not, and truncates only when even the gap between the items is too narrow.
  function titleSpan(bar, leading, trailing, need) {
    const box = bar.getBoundingClientRect();
    const edge = (host, side) => {
      const items = [...host.children].map(item => item.getBoundingClientRect()).filter(r => r.width);
      if (!items.length) return side === 'left' ? 0 : box.width;
      return side === 'left' ? Math.max(...items.map(r => r.right)) - box.left : Math.min(...items.map(r => r.left)) - box.left;
    };
    const start = edge(leading, 'left') + 8, end = edge(trailing, 'right') - 8, room = Math.max(0, end - start);
    const half = Math.min(need, room) / 2;
    return { start, end, room, half, left: Math.min(Math.max(box.width / 2, start + half), end - half) };
  }
  /* Where the brand sits on step 3 at this width. Steps 1 and 2 put it in the same place, so it does not move
     between pages when step 3's bar items push it off centre. Measured on a hidden copy of step 3's bar, as
     wide as the window (step 3 never scrolls the page, so it has no page scrollbar), in window coordinates. */
  function summaryBrandCenter(need) {
    const probe = document.createElement('div');
    probe.className = 'm-nav';
    probe.setAttribute('aria-hidden', 'true');
    // Same insets as the real bar inside the header (the header's padding and safe areas).
    const real = nav.querySelector('.m-nav-bar').getBoundingClientRect(), outer = header.getBoundingClientRect();
    probe.style.cssText = `position:fixed;top:0;left:0;box-sizing:border-box;width:${window.innerWidth}px;padding:0 ${outer.right - real.right}px 0 ${real.left - outer.left}px;visibility:hidden;pointer-events:none`;
    const bar = document.createElement('div');
    bar.className = 'm-nav-bar';
    const leading = document.createElement('div'), trailing = document.createElement('div');
    leading.className = 'm-nav-leading'; trailing.className = 'm-nav-trailing';
    leading.append(local('sort', { label: '排序' }));
    trailing.append(...[ICONS.settings, ICONS.add, ICONS.more].map(icon => local('probe', { label: '', icon, kind: 'icon' })));
    bar.append(leading, trailing);
    probe.append(bar);
    header.append(probe);
    const center = bar.getBoundingClientRect().left + titleSpan(bar, leading, trailing, need).left;
    probe.remove();
    return center;
  }
  function layoutTitle() {
    if (!nav) return;
    const bar = nav.querySelector('.m-nav-bar'), title = nav.querySelector('.m-nav-title');
    if (!bar.getBoundingClientRect().width) return;
    title.style.maxWidth = 'none';
    const need = title.scrollWidth;
    const span = titleSpan(bar, nav.querySelector('.m-nav-leading'), nav.querySelector('.m-nav-trailing'), need);
    let left = span.left;
    if (page !== 'summary' && title.querySelector('.m-nav-brand')) {
      const own = summaryBrandCenter(need) - bar.getBoundingClientRect().left;
      left = Math.min(Math.max(own, span.start + span.half), span.end - span.half);
    }
    title.style.left = `${left}px`;
    title.style.maxWidth = `${Math.floor(span.room)}px`;
  }
  function onNavClick(event) {
    const button = event.target.closest('.m-nav-button');
    if (!button || button.disabled) return;
    if (button._source) {
      // The page may have re-rendered since the bar was built: use the live control.
      if (button._source.isConnected && !button._source.disabled) button._source.click();
      return;
    }
    const action = button.dataset.mobileAction;
    if (action === 'sort') setSortMode(!sortMode);
    else if (action === 'settings') {
      settingsOpen = !settingsOpen;
      app.classList.toggle('m-settings-entering', settingsOpen);
      applyClasses(); refreshNav(); layoutBoard();
      // Starting styles belong to this button press, not to controls rebuilt by a story switch.
      const panel = app.querySelector('.m-settings');
      if (panel) getComputedStyle(panel).opacity;
      app.classList.remove('m-settings-entering');
    }
    else if (action === 'more') openMoreSheet(button);
  }
  function updateCollapse() {
    if (!nav) return;
    // No large title to fold away any more: the bar shows its edge as soon as anything passes beneath it.
    header.classList.toggle('m-collapsed', header.classList.contains('m-compact') || window.scrollY > 0);
  }

  /* ---------- Step 3: board and list modes ---------- */
  function setSortMode(on) {
    if (on === sortMode) return;
    rememberBoard();
    sortMode = on;
    if (on && typeof multiSelectMode !== 'undefined' && multiSelectMode) {
      // Sorting and multi-select share the list view; leaving one keeps the other's selection rules.
      app.querySelector('[data-action="multi-select"]')?.click();
    }
    applyClasses();
    refreshNav();
    window.scrollTo(0, 0);
    schedule();
  }
  function applyClasses() {
    const active = media.matches && onSummary();
    app.classList.toggle('m-sort-mode', active && sortMode);
    app.classList.toggle('m-settings-open', active && settingsOpen);
    // A closing panel stays painted for its transition, but stops accepting focus immediately.
    app.querySelector('.m-settings')?.toggleAttribute('inert', active && !settingsOpen);
    app.classList.toggle('m-board', active && !listMode());
  }
  function board() { return onSummary() && app.classList.contains('m-board') ? app.querySelector('.journals') : null; }
  function rememberBoard() {
    const host = board();
    if (!host) return;
    boardScroll = host.scrollLeft;
    host.querySelectorAll('.journal').forEach(journal => {
      const rail = journal.querySelector('.records');
      if (rail) columnScroll.set(journal.dataset.sortId, rail.scrollTop);
    });
  }
  /* ---------- Step 3: folding marked cards in a column ----------
     The mobile form of the desktop record rail (ui/summary-rails.js), turned on its side: for the people the
     desktop folds (compactRecords), the column rests with its last 已升级/已跳过 card at the top of the card area;
     the cards before it are above, a scroll up away. It moves there as soon as the marks change (no 1s wait:
     the desktop waits for the pointer to leave, a finger has already lifted), and comes back 5s after the user scrolls it away. Other people keep
     whatever position they were read at. */
  const RAIL_RETURN = 5000;
  /* Column moves: long enough to be seen (iOS animates a scroll-to in about 0.3s), growing only with the log of
     the distance, so a long trip is not much slower than a short one — it simply moves faster in the middle.
     The curve starts slowly so the eye catches the column setting off, then runs and settles briefly. */
  const railDuration = distance => Math.min(600, 300 + 90 * Math.log2(1 + distance / 300));
  // cubic-bezier(.45, 0, .15, 1), solved for y at time t.
  function railEase(t) {
    const x1 = .45, x2 = .15, curve = (a, b, u) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
    let lo = 0, hi = 1, u = t;
    for (let i = 0; i < 20; i++) { u = (lo + hi) / 2; if (curve(x1, x2, u) < t) lo = u; else hi = u; }
    return curve(0, 1, u);
  }
  const railInfo = new WeakMap();
  const recordCounts = new Map();
  let boardShown = false;
  function rail$(rail) {
    if (!railInfo.has(rail)) railInfo.set(rail, { marks: null, frame: 0, timer: 0, set: -1, touching: false });
    return railInfo.get(rail);
  }
  function personOf(rail) { return state.roster.find(item => item.id === rail.closest('.journal')?.dataset.sortId); }
  function folds(rail) { const item = personOf(rail); return Boolean(item) && compactRecords(item); }
  function markSignature(rail) {
    return [...rail.querySelectorAll('.record-chip')].map(chip => chip.matches('.upgraded,.skipped') ? `${chip.dataset.queue ? 'q' : ''}${chip.dataset.index}` : '').filter(Boolean).join('|');
  }
  // How far down a card sits in its column's scroll area, its top meeting the area's top padding. The rail's
  // box includes its top border (clientTop), which is not scrolled content: leaving it in put a marked first
  // card 1px above where it rests unmarked.
  function cardOffset(rail, chip) {
    return rail.scrollTop + chip.getBoundingClientRect().top - rail.getBoundingClientRect().top - rail.clientTop - (parseFloat(getComputedStyle(rail).paddingTop) || 0);
  }
  function restingTop(rail) {
    const marked = [...rail.querySelectorAll('.record-chip.upgraded,.record-chip.skipped')].pop();
    return marked ? cardOffset(rail, marked) : 0;
  }
  function stopColumn(rail) {
    const info = rail$(rail);
    cancelAnimationFrame(info.frame); info.frame = 0;
    clearTimeout(info.timer); info.timer = 0;
  }
  function scrollColumn(rail, target, animate = true) {
    const info = rail$(rail);
    stopColumn(rail);
    target = Math.round(Math.max(0, Math.min(target, rail.scrollHeight - rail.clientHeight)));
    const from = rail.scrollTop;
    if (!animate || Math.abs(target - from) < 1 || !motionAllowed()) { rail.scrollTop = info.set = target; return; }
    const start = performance.now(), duration = railDuration(Math.abs(target - from));
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      rail.scrollTop = info.set = Math.round(from + (target - from) * railEase(t));
      info.frame = t < 1 ? requestAnimationFrame(tick) : 0;
    };
    info.frame = requestAnimationFrame(tick);
  }
  // Back to rest once the user has left the column alone for 5s; a finger on it or a scroll restarts the wait.
  function scheduleColumnReturn(rail) {
    const info = rail$(rail);
    clearTimeout(info.timer);
    info.timer = setTimeout(() => {
      info.timer = 0;
      if (!rail.isConnected || info.touching || !board()?.contains(rail)) return;
      scrollColumn(rail, restingTop(rail));
    }, RAIL_RETURN);
  }
  // A freshly shown board (first visit, back from the upgrade page, or out of a list mode) and every page update.
  function settleBoard() {
    const host = board();
    const fresh = !boardShown;
    boardShown = Boolean(host);
    if (!host) return;
    host.querySelectorAll('.journal').forEach(journal => {
      const rail = journal.querySelector('.records');
      if (!rail) return;
      const info = rail$(rail), id = journal.dataset.sortId, item = personOf(rail);
      const marks = markSignature(rail), count = item ? M.live(item).length : 0;
      /* A seeded person's forecast cards (and their marks) appear only once the seed engine has loaded, a moment
         after the page. Until then the column is not really placed: its marks changing then is the page loading,
         not the user, so it is placed again at once rather than animated there. */
      const waiting = Boolean(item?.seed) && !window.RiggingSeed.ready();
      const loaded = info.waiting && !waiting;
      info.waiting = waiting;
      // One more record than last time is the one just saved on the upgrade page; a restored backup is not.
      const added = count === (recordCounts.get(id) ?? count) + 1;
      recordCounts.set(id, count);
      if (info.marks === null || fresh || loaded || (waiting && info.marks !== marks)) {
        info.marks = marks;
        // After a refresh: back where the user left it, once its cards are all there.
        const saved = reloaded?.columns?.[id];
        if (Number.isFinite(saved)) {
          scrollColumn(rail, saved, 0);
          if (!waiting) delete reloaded.columns[id];
          return;
        }
        if (!folds(rail)) { rail.scrollTop = columnScroll.get(id) || 0; return; }
        // Like the desktop after 记录升级: show the record just added, then settle 5s later.
        const latest = added && [...rail.querySelectorAll('.record-chip[data-edit]')].pop();
        if (latest) {
          scrollColumn(rail, cardOffset(rail, latest) + latest.offsetHeight - rail.clientHeight + 20, 0);
          scheduleColumnReturn(rail);
        } else scrollColumn(rail, restingTop(rail), 0);
        return;
      }
      if (info.marks === marks) return;
      info.marks = marks;
      if (!folds(rail)) return;
      scrollColumn(rail, restingTop(rail));
    });
    if (knownBoard !== host) {
      knownBoard = host;
      if (boardScroll) host.scrollLeft = boardScroll;
    }
  }
  app.addEventListener('touchstart', event => {
    const rail = board() && event.target.closest?.('.journal .records');
    if (!rail) return;
    const info = rail$(rail);
    info.touching = true;
    if (info.frame) stopColumn(rail);
    clearTimeout(info.timer); info.timer = 0;
  }, { passive: true });
  const releaseColumn = event => {
    const rail = event.target.closest?.('.journal .records');
    if (!rail || !railInfo.has(rail)) return;
    const info = rail$(rail);
    info.touching = false;
    if (board() && folds(rail) && Math.abs(rail.scrollTop - restingTop(rail)) > 1) scheduleColumnReturn(rail);
  };
  app.addEventListener('touchend', releaseColumn, { passive: true });
  app.addEventListener('touchcancel', releaseColumn, { passive: true });
  // Step 3 fits the screen: the board (or the sorting / multi-select list) takes the height left under the bars,
  // so the page itself never scrolls and each column, or the list, scrolls inside. The page is locked (html.m-fit:
  // no window scroll, no rubber band, no 100vh body), and the height follows window.innerHeight, which on iOS
  // changes as Safari shows or hides its toolbars. A screen too short for a usable board (a landscape phone with
  // the settings open) keeps a 200px board and lets the page scroll instead.
  const BOARD_MIN = 200, root = document.documentElement;
  function layoutBoard() {
    const host = onSummary() ? app.querySelector('.journals') : null;
    if (!host) { app.style.removeProperty('--m-board-height'); root.classList.remove('m-fit'); return; }
    // Lock before measuring: the lock drops the body's 100vh minimum, and the page must sit at the top.
    root.classList.add('m-fit');
    if (window.scrollY) window.scrollTo(0, 0);
    const box = host.getBoundingClientRect();
    const top = box.top + window.scrollY;
    // Whatever the page puts under the board (main's padding and the like), measured, not assumed.
    const after = Math.max(0, document.body.getBoundingClientRect().bottom - box.bottom);
    // The board runs to the bottom of the window and the columns are open at the bottom, so the cards run on
    // to the window's edge; the rail's bottom padding (the safe area, mobile/summary.css) lets the last card
    // come up clear of the home indicator. Safari does not paint the page beside its expanded bottom bar, so
    // the board does not reach past the window.
    const fit = Math.floor(window.innerHeight - top - after);
    const fits = fit >= BOARD_MIN;
    root.classList.toggle('m-fit', fits);
    const height = `${Math.max(BOARD_MIN, fit)}px`;
    // Write only on a change: most page updates leave the height as it is.
    if (app.style.getPropertyValue('--m-board-height') !== height) app.style.setProperty('--m-board-height', height);
  }
  /* Reordering in the screen-fitted list: app.js scrolls the window while a person is dragged (near an edge, or
     with a second finger), and the window no longer scrolls here, so the list does the same itself. */
  function sortList() { return onSummary() && sortMode && typeof touchSort !== 'undefined' && touchSort ? app.querySelector('.journals') : null; }
  let following = false;
  function followSortDrag() {
    const list = sortList();
    if (!list) { following = false; return; }
    const gesture = touchSort, box = list.getBoundingClientRect();
    const delta = gesture.y < box.top + 48 ? -8 : gesture.y > box.bottom - 48 ? 8 : 0;
    if (delta && !gesture.scrollFinger) {
      const before = list.scrollTop;
      list.scrollTop += delta;
      if (list.scrollTop !== before) updateSortMarker(gesture);
    }
    requestAnimationFrame(followSortDrag);
  }
  // After app.js has started the drag (this listener is added later), follow it until it ends.
  app.addEventListener('touchstart', () => {
    if (following || !sortList()) return;
    following = true;
    requestAnimationFrame(followSortDrag);
  });
  // Before app.js records the second finger's new position, move the list by the distance it travelled.
  app.addEventListener('touchmove', event => {
    const list = sortList(), finger = list && touchSort.scrollFinger;
    if (!finger) return;
    const extra = [...event.touches].find(touch => touch.identifier === finger.identifier);
    if (extra) list.scrollTop += finger.y - extra.clientY;
  }, { capture: true, passive: true });
  /* Forecasts load as a column is scrolled: once its last card comes within a screen of the bottom of the card
     area, ten more rows are added (to LV 99). Computing rows costs next to nothing; drawing cards is what costs,
     so small steps keep every phone smooth without a button or a speed test. */
  const FORECAST_STEP = 10;
  const extending = new Set();
  function extendForecast(rail) {
    const journal = rail.closest('.journal'), id = journal?.dataset.sortId;
    if (!id || extending.has(id) || !window.RiggingSeed.ready() || document.querySelector('dialog[open]') || app.querySelector('[data-initial-form]')) return;
    const last = rail.querySelector('.record-chip:last-of-type');
    if (!last || last.getBoundingClientRect().bottom - rail.getBoundingClientRect().bottom > rail.clientHeight) return;
    const item = state.roster.find(entry => entry.id === id);
    if (!item) return;
    const count = window.RiggingSeed.queueRows(state, item, char(id), forecastLengths.get(id)).length;
    if (!count || window.RiggingSeed.rowDisplayLevel(item, count) > 99) return;
    extending.add(id);
    requestAnimationFrame(() => {
      extending.delete(id);
      if (!board() || !rail.isConnected) return;
      forecastLengths.set(id, count + FORECAST_STEP);
      renderSummary();
    });
  }
  function onBoardScroll(event) {
    const target = event.target;
    if (!(target instanceof Element) || !board()) return;
    if (target.matches('.journals')) { boardScroll = target.scrollLeft; savePositions(); return; }
    if (!target.matches('.journal .records')) return;
    // A column still waiting for its forecast cards is too short to hold its real position.
    if (railInfo.get(target)?.waiting) return;
    columnScroll.set(target.closest('.journal').dataset.sortId, target.scrollTop);
    savePositions();
    extendForecast(target);
    // The user's own scrolling (not this file's) starts, or restarts, the 5s wait to return.
    const info = railInfo.get(target);
    if (info && !info.frame && Math.abs(target.scrollTop - info.set) >= 1 && folds(target)) scheduleColumnReturn(target);
  }

  /* ---------- Action sheet for step 3's backup and maintenance menus ---------- */
  function openMoreSheet(trigger) {
    if (document.querySelector('dialog[open]')) return;
    const groups = [...app.querySelectorAll('.summary-actions .action-menu .menu-panel')]
      .map(panel => [...panel.querySelectorAll('button')]);
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog m-sheet';
    dialog.setAttribute('aria-label', '备份与更多操作');
    dialog.innerHTML = `<div class="m-sheet-body"><div class="m-sheet-groups">${groups.map((buttons, group) => `<div class="m-sheet-group">${buttons.map((button, index) => `<button type="button" class="${button.classList.contains('menu-danger') ? 'danger-text' : ''}" data-sheet="${group}:${index}" ${button.disabled ? 'disabled' : ''}>${escapeValue(button.textContent.trim())}</button>`).join('')}</div>`).join('')}</div><footer><button type="button" data-sheet-close autofocus>取消</button></footer></div><div class="m-sheet-edge" aria-hidden="true"></div>`;
    let chosen = null, leaving = false;
    /* Cancelling leaves the way the sheet came in (HIG Motion: dismiss along the axis of the reveal): it slides
       back down while the dimming fades, then closes. Choosing an action closes at once, so that action's own
       dialog or file picker opens inside the same tap. */
    const dismiss = () => {
      if (leaving) return;
      leaving = true;
      if (!motionAllowed()) { dialog.close(); return; }
      dialog.classList.add('m-sheet-leaving');
      const body = dialog.querySelector('.m-sheet-body');
      body.addEventListener('animationend', event => { if (event.target === body) dialog.close(); });
      setTimeout(() => dialog.close(), 400);
    };
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener('click', event => {
      const option = event.target.closest('[data-sheet]');
      if (leaving) return;
      if (option && !option.disabled) {
        const [group, index] = option.dataset.sheet.split(':').map(Number);
        chosen = groups[group][index];
        dialog.close();
        // Run the original item inside this tap: iOS Safari only opens the file picker (恢复备份) or starts a
        // download (导出备份) during a user gesture, and the sheet is already closed so its confirmation opens cleanly.
        if (chosen.isConnected && !chosen.disabled) chosen.click();
      } else if (event.target.closest('[data-sheet-close]')) dismiss();
      // An action sheet, like iOS: a tap on the dimmed page outside the groups cancels it. The tool dialogs
      // keep the general rule (exit button or Esc only).
      else if (event.target === dialog) dismiss();
    });
    dialog.addEventListener('close', () => {
      retireDialog(dialog);
      if (!chosen && trigger.isConnected) trigger.focus({ preventScroll: true });
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }

  /* ---------- Lifecycle ---------- */
  let storyMotion = null;
  const storyGhosts = new Set();
  function clearStoryMotion() {
    storyMotion = null;
    storyGhosts.forEach(node => node.remove());
    storyGhosts.clear();
    app.getAnimations({ subtree: true }).forEach(animation => {
      if (animation.id === 'mobile-story') animation.cancel();
    });
  }
  function captureStoryControl(selector) {
    const node = app.querySelector(selector);
    if (!node || !node.getClientRects().length) return null;
    return { node: node.cloneNode(true), rect: node.getBoundingClientRect() };
  }
  // Capture before app.js rebuilds the controls; play after the mobile settings panel is restored.
  app.addEventListener('change', event => {
    if (event.target.name !== 'part3') return;
    clearStoryMotion();
    if (!media.matches || !motionAllowed()) return;
    storyMotion = {
      page,
      route: captureStoryControl('.route-segment'),
      slider: captureStoryControl('.recommend-slider'),
      track: captureStoryControl('.recommend-track'),
      fill: captureStoryControl('.recommend-fill'),
      thumb: captureStoryControl('.recommend-thumb')
    };
  }, true);
  function playStoryMotion() {
    const before = storyMotion;
    storyMotion = null;
    if (!before || before.page !== page || !motionAllowed()) return;
    const options = { id: 'mobile-story', duration: MOTION.base, easing: MOTION.ease };
    const part = app.querySelector('.part3-segment');
    if (!part) return;
    const retire = (entry, host, clip) => {
      const ghost = entry.node;
      ghost.inert = true;
      ghost.setAttribute('aria-hidden', 'true');
      [ghost, ...ghost.querySelectorAll('*')].forEach(node => {
        ['id', 'name', 'tabindex'].forEach(attr => node.removeAttribute(attr));
      });
      ghost.classList.add('list-ghost');
      Object.assign(ghost.style, { left: `${entry.rect.left}px`, top: `${entry.rect.top}px`, width: `${entry.rect.width}px`, height: `${entry.rect.height}px`, clipPath: clip || 'none' });
      host.append(ghost);
      storyGhosts.add(ghost);
      const remove = () => { ghost.remove(); storyGhosts.delete(ghost); };
      const animation = ghost.animate({ opacity: [1, 0] }, options);
      animation.onfinish = animation.oncancel = remove;
    };
    const route = app.querySelector('.route-segment');
    if (before.route && !route) retire(before.route, part.parentElement);
    else if (!before.route && route) route.animate({ opacity: [0, 1] }, options);
    const slider = app.querySelector('.recommend-slider');
    if (!before.slider || !slider || !slider.getClientRects().length) return;
    const rect = slider.getBoundingClientRect();
    // Measure every destination before starting any animation: the fill's percentage width depends
    // on the track. Starting the track first would make us capture its old width as the fill's target.
    const rails = ['track', 'fill'].map(name => {
      const node = slider.querySelector(`.recommend-${name}`);
      return { node, old: before[name], width: node?.getBoundingClientRect().width };
    });
    const thumb = slider.querySelector('.recommend-thumb');
    const thumbX = thumb && before.thumb ? before.thumb.rect.left - thumb.getBoundingClientRect().left : 0;
    for (const { node, old, width } of rails) {
      if (node && old) node.animate({ width: [`${old.rect.width}px`, `${width}px`] }, options);
    }
    if (thumb && before.thumb) {
      thumb.animate({ transform: [`translateX(${thumbX}px)`, 'translateX(0)'] }, options);
    }
    if (before.slider.rect.width > rect.width) {
      // Only the retired stops fade. Keeping the old rail or thumb here would paint a second,
      // full-length gold line behind the live rail while it shrinks.
      before.slider.node.querySelectorAll('.recommend-track,.recommend-thumb').forEach(node => node.remove());
      retire(before.slider, slider.parentElement, `inset(0 0 0 ${rect.width}px)`);
    } else {
      slider.querySelectorAll('.recommend-stop').forEach((stop, index) => {
        if (index * 40 >= before.slider.rect.width) stop.animate({ opacity: [0, 1] }, options);
      });
    }
  }
  function update() {
    frame = 0;
    if (!media.matches) {
      clearStoryMotion();
      removeNav();
      ['m-sort-mode', 'm-settings-open', 'm-board'].forEach(name => app.classList.remove(name));
      app.style.removeProperty('--m-board-height'); app.style.removeProperty('--m-list-name');
      root.classList.remove('m-fit');
      return;
    }
    if (!onSummary()) { sortMode = false; settingsOpen = false; }
    applyClasses();
    refreshNav();
    layoutBoard();
    // Locking the board page drops the page scrollbar, which widens the bar on a desktop browser: place the
    // title again in the same frame, so the brand does not jump sideways one frame later.
    layoutTitle();
    alignListNames();
    shadeBoardNames();
    settleBoard();
    playStoryMotion();
  }
  /* The sort and multi-select lists put 初始等级 on the name's line. Every row is its own grid, so the name
     column takes the widest name's width in all of them, measured, and the levels start at one edge. */
  function alignListNames() {
    const listed = onSummary() && app.matches('.m-sort-mode,.multi-select-mode');
    if (!listed) { app.style.removeProperty('--m-list-name'); return; }
    // The text's own width: scrollWidth reports the clipped width in WebKit once a name is cut short.
    const range = document.createRange();
    const widest = Math.ceil(Math.max(0, ...[...app.querySelectorAll('.journals .journal-head h2')].map(name => { range.selectNodeContents(name); return range.getBoundingClientRect().width; })));
    const value = `${widest}px`;
    if (app.style.getPropertyValue('--m-list-name') !== value) app.style.setProperty('--m-list-name', value);
  }
  /* A board column's name sits on the portrait's bottom-left. Where the text runs over the drawn figure (the
     image's opaque pixels, not its transparent margin or the band around it), the figure fades out softly behind
     that part of the name, like the portrait's own edges; elsewhere nothing changes. Each portrait's leftmost
     opaque pixel per row is read once from the image. */
  const figureEdges = new Map();
  function figureEdge(img) {
    const src = img.currentSrc || img.src;
    if (figureEdges.has(src)) return figureEdges.get(src);
    if (!img.complete || !img.naturalWidth) { img.addEventListener('load', schedule, { once: true }); return null; }
    let figure = null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(img, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
      const edges = new Float32Array(height).fill(Infinity);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 40) { edges[y] = x; break; }
      }
      figure = { edges, height };
    } catch { figure = null; }
    figureEdges.set(src, figure);
    return figure;
  }
  const FADE_VARS = ['--m-fade-x', '--m-fade-y', '--m-fade-rx', '--m-fade-ry'];
  function shadeBoardNames() {
    if (!onSummary() || app.matches('.m-sort-mode,.multi-select-mode')) return;
    const range = document.createRange();
    app.querySelectorAll('.journals .journal-head').forEach(head => {
      const name = head.querySelector('h2'), img = head.querySelector('.journal-portrait img');
      if (!name || !img) return;
      const figure = figureEdge(img);
      let fade = null;
      if (figure) {
        const box = img.getBoundingClientRect();
        range.selectNodeContents(name);
        const text = range.getBoundingClientRect();
        const scale = figure.height / box.height;
        const top = Math.max(0, Math.floor((text.top - box.top) * scale)), bottom = Math.min(figure.height, Math.ceil((text.bottom - box.top) * scale));
        let edge = Infinity;
        for (let y = top; y < bottom; y++) edge = Math.min(edge, figure.edges[y]);
        const start = box.left + edge / scale;
        if (start < text.right - 2) {
          // An ellipse over the covered part of the text, wider and taller than it so the fade is gradual.
          const from = Math.max(text.left, start), rx = (text.right - from) / 2 + 18, ry = text.height / 2 + 12;
          fade = [(from + text.right) / 2 - box.left, (text.top + text.bottom) / 2 - box.top, rx, ry].map(v => `${Math.round(v)}px`);
        }
      }
      img.classList.toggle('m-name-fade', !!fade);
      FADE_VARS.forEach((property, index) => fade ? img.style.setProperty(property, fade[index]) : img.style.removeProperty(property));
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  // Leaving step 3 for the upgrade page replaces the board, so read its positions before the page changes.
  document.addEventListener('click', event => {
    if (!media.matches || !onSummary() || !event.target.closest?.('#app')) return;
    rememberBoard();
  }, true);
  /* ---------- Step 3: a card's side strip ----------
     Its three cells act on their own and never reach the card's 已跳过/已升级 cycle (or, in 编辑, the record
     editor): rating flips the rating, class opens the class list (or, with !, the better choices), mount opens
     the mount list. Captured on #app, so app.js's card handlers never see these taps. */
  // A marked card's mask covers the strip (as it covers the rating on wide screens): taps there mark the card.
  const sideCell = event => media.matches && onSummary() ? event.target.closest?.('.record-chip:not(.skipped,.upgraded) .m-card-side [data-m-side]') : null;
  function runSideCell(cell) {
    const kind = cell.dataset.mSide;
    if (kind === 'rating') toggleCardRating(cell);
    else if (kind === 'better') openBetterChoices(cell);
    else if (kind === 'profession' || kind === 'ride') openCardClass(cell, kind);
  }
  app.addEventListener('click', event => {
    const masked = media.matches && onSummary() && event.target.closest?.('.record-chip:is(.skipped,.upgraded) .m-card-side');
    if (masked) {
      // Under the mask the strip is part of the card: the tap goes to the card itself (its mark cycle).
      event.preventDefault(); event.stopPropagation();
      masked.closest('.record-chip').click();
      return;
    }
    const cell = sideCell(event) || (media.matches && event.target.closest?.('.record-chip .m-card-side'));
    if (!cell) return;
    event.preventDefault(); event.stopPropagation();
    if (cell.dataset?.mSide) runSideCell(cell);
  }, true);
  app.addEventListener('keydown', event => {
    const cell = sideCell(event);
    if (!cell || !['Enter', ' '].includes(event.key) || cell.dataset.mSide === 'none') return;
    event.preventDefault(); event.stopImmediatePropagation();
    runSideCell(cell);
  }, true);
  // The press shows on the cell, not on the whole card (app.js presses the card button on pointerdown).
  let pressedCell = null;
  app.addEventListener('pointerdown', event => {
    pressedCell?.classList.remove('m-pressed'); pressedCell = null;
    const cell = event.pointerType !== 'mouse' && sideCell(event);
    if (!cell || cell.dataset.mSide === 'none') { event.target.closest?.('.m-card-side')?.closest('.record-chip')?.classList.remove('touch-pressed'); return; }
    cell.closest('.record-chip')?.classList.remove('touch-pressed');
    pressedCell = cell; cell.classList.add('m-pressed');
  });
  const releaseCell = () => { pressedCell?.classList.remove('m-pressed'); pressedCell = null; };
  document.addEventListener('pointerup', releaseCell, true);
  document.addEventListener('pointercancel', releaseCell, true);
  new MutationObserver(schedule).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden'] });
  // Search history on touch: WebKit never focuses a tapped button, so the search box's focusout (app.js) sees no
  // relatedTarget and hides the list before the tap's click lands. Keeping focus in the field lets the click through.
  const keepSearchFocus = event => {
    if (media.matches && event.target.closest?.('#search-history button')) event.preventDefault();
  };
  app.addEventListener('pointerdown', keepSearchFocus);
  app.addEventListener('mousedown', keepSearchFocus);
  app.addEventListener('scroll', onBoardScroll, true);
  /* A mouse wheel over the column heads (portrait, name, buttons) moves the board sideways; the column snap
     points turn each notch into the next column. Over a column's cards it still scrolls that column, and a
     trackpad keeps its own sideways swipe (wheelKind, ui/summary-rails.js).
     Notches in quick succession add up: each one moves the target a further column on from the last target,
     not from wherever the running animation has got to, so a fast spin travels as many columns as notches. */
  let wheelTarget = null, wheelUntil = 0;
  app.addEventListener('wheel', event => {
    const host = board();
    if (!host || event.ctrlKey || !host.contains(event.target) || event.target.closest('.journal .records')) return;
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || wheelKind(event) !== 'mouse') return;
    event.preventDefault();
    const columns = host.querySelectorAll(':scope>.journal');
    if (columns.length < 2) return;
    const step = columns[1].offsetLeft - columns[0].offsetLeft, end = host.scrollWidth - host.clientWidth;
    const now = performance.now(), from = now < wheelUntil && wheelTarget !== null ? wheelTarget : host.scrollLeft;
    wheelTarget = Math.max(0, Math.min(end, (Math.round(from / step) + Math.sign(event.deltaY)) * step));
    wheelUntil = now + 400;
    host.scrollTo({ left: wheelTarget, behavior: 'smooth' });
  }, { passive: false });
  window.addEventListener('scroll', () => { if (nav) updateCollapse(); }, { passive: true });
  window.addEventListener('resize', schedule);
  // Safari's toolbars and rotation change the visible height without always firing a window resize.
  window.visualViewport?.addEventListener('resize', schedule);
  shortScreen.addEventListener('change', schedule);
  // The title is measured in the UI font; measure again once the custom fonts arrive.
  document.fonts?.ready.then(() => { layoutTitle(); alignListNames(); shadeBoardNames(); });
  media.addEventListener('change', () => {
    // Step 3 card markup differs between the shells (summaryClassMarkup and friends).
    if (page === 'summary') renderSummary();
    update();
  });
  update();
})();
