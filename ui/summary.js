/* Shared summary renderer. Rail gestures remain installed once by app.js. */
// A saved record's class as the switch shows it (core/actions.js shownClass).
const shownClass = (item, record) => window.RiggingActions.shownClass(state, item, record);
/* Not shown for now: the records a seed is found from become forecast rows, which show their pass rate there.
   Kept for when 锚点 comes back; the card template used ${r.anchor ? ANCHOR_MARK : ''} after the stats, the
   class ${r.anchor ? 'anchor' : ''} and the label ${r.anchor ? '锚点，' : ''}.
// The records the seed was found from, marked where a forecast shows its pass rate.
const ANCHOR_MARK = '<span class="anchor-mark" aria-hidden="true"><span>锚点</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M5 14a7 7 0 0 0 14 0"/></svg></span>'; */
// The class field in a desktop card's head. renderSummary() calls it only outside the phone shell
// ((width < 1750px)), that is from 1750px up; the shell's cards use mobileCardHead()/mobileCardSide().
function summaryClassMarkup(value, id, index, queue, better = false) {
  return professionMarkup(value, true, id, index, queue, better, '暂无兵种');
}
// Phone column cards: a side strip of three cells with taps of their own, never the card's 已跳过/已升级 cycle
// (ui/mobile.js routes them): rating face (flips it, as on wide screens) · class icon (changes the class; with
// the ! mark it opens the better choices) · mount (changes it; empty, and inert, when the class takes none).
function mobileCardSide(profession, ride, happy, id, index, queue, better) {
  const name = window.PROFESSIONS.names.includes(profession) ? profession : null;
  const kind = name && rideKind(name, id);
  const card = `data-character="${id}" ${queue ? 'data-queue-index' : 'data-record-index'}="${index}"`;
  const rating = `<span class="m-side-cell m-side-rating ${happy === null ? 'pending' : ''}" role="button" tabindex="0" data-m-side="rating" data-card-rating="${id}" ${card} aria-label="${happy === null ? '待评价，设为满意' : happy ? '满意，改为不满意' : '不满意，改为满意'}">${happy === null ? '<span>待</span>' : ratingIcon(happy)}</span>`;
  const icon = name ? `<img src="${imageSrc(`assets/classes/${window.PROFESSIONS.icons[name]}.webp`)}" alt="" draggable="false">` : '<span class="m-side-empty">兵种</span>';
  const klass = better
    ? `<span class="m-side-cell m-side-class better" role="button" tabindex="0" data-m-side="better" data-better="${id}" data-better-index="${index}" ${card} aria-label="${name || '暂无兵种'}，有更好的兵种或配属">${icon}<span class="m-better">${BETTER_ICON}</span></span>`
    : `<span class="m-side-cell m-side-class" role="button" tabindex="0" data-m-side="profession" ${card} aria-haspopup="dialog" aria-label="兵种，${name || '暂无'}，更换">${icon}</span>`;
  const mount = kind
    ? `<span class="m-side-cell m-side-ride" role="button" tabindex="0" data-m-side="ride" ${card} aria-haspopup="dialog" aria-label="配属，${rideText(ride)}，更换">${rideIcon(kind, ride)}${ride ? `<img class="ride-level" src="${imageSrc(`assets/rides/heart-${ride.level}.webp`)}" alt="" draggable="false">` : ''}</span>`
    : '<span class="m-side-cell m-side-ride" data-m-side="none" aria-hidden="true"></span>';
  return `<span class="m-card-side">${rating}${klass}${mount}</span>`;
}
function mobileCardHead(level, profession) {
  return `<div><b>${level}</b><span class="m-card-class game-text">${profession || '暂无兵种'}</span></div>`;
}
// On wide screens a card's rating flips in place, like the class field beside it. Called only for desktop
// cards (outside the shell), so wideRecordRow always matches here.
function cardRatingMarkup(happy, id, index, queue) {
  // The word always takes the room of the longer one, so flipping it never moves the class field.
  const word = happy === null ? '待评价' : happy ? '满意' : '不满意';
  return `<span class="rating-toggle" role="button" tabindex="0" data-card-rating="${id}" ${queue ? 'data-queue-index' : 'data-record-index'}="${index}" aria-label="${happy ? '改为不满意' : '改为满意'}"><span class="rating-word"><span><span class="rating-text">${word}</span>${happy === null ? '' : ratingIcon(happy)}</span></span></span>`;
}
/* A class name (or the 暂无兵种 placeholder) that would be cut short (or pushed off centre by its ⓘ mark) takes the room of the rating
   word: that card shows only the face. Measured with the word in place, so a wider card gets it back.
   Only what changes is written: a write marks the person's column as changed for the next redraw (takeJournalChanges). */
function fitCardClasses(chips = app.querySelectorAll('.record-chip')) {
  for (const chip of chips) {
    const field = chip.querySelector(':scope>div>.profession-field'), text = field?.querySelector('.game-text, .profession-placeholder');
    const face = chip.querySelector('.rating-word .rating-icon');
    if (chip.classList.contains('rating-face-only')) chip.classList.remove('rating-face-only');
    if (!text || !face || !field.getBoundingClientRect().width) continue;
    const before = getComputedStyle(field, '::before'), shrunk = field.classList.contains('better') && parseFloat(before.width) < parseFloat(before.flexBasis) - 0.5;
    chip.classList.toggle('rating-face-only', text.scrollWidth > text.clientWidth + 0.5 || shrunk);
  }
  const marks = [...chips].flatMap(chip => [...chip.querySelectorAll('.hand-drawn-mark')]);
  const paths = marks.map(handDrawnMarkPath);
  marks.forEach((mark, index) => { if (mark.firstElementChild.getAttribute('d') !== paths[index]) mark.firstElementChild.setAttribute('d', paths[index]); });
}

const HAND_DRAWN_MARK = '<svg class="hand-drawn-mark" aria-hidden="true"><path/></svg>';

function queueExamMarkup(row) {
  const toggle = row.status === 'normal'
    ? ` role="button" tabindex="0" aria-pressed="${Boolean(row.handDrawnMark)}" aria-label="及格率至少 ${row.examMinimum}%"`
    : '';
  return `<span class="queue-exam"${toggle}><span class="queue-exam-compact">${row.corrected ? '已修正 · ' : '预测 · '}考试 ≥${row.examMinimum}%</span><span class="queue-exam-rate"><span class="queue-exam-label">及格率</span><span class="queue-exam-ge" aria-hidden="true"></span><b>${row.examMinimum}</b><span class="queue-exam-percent">%</span></span></span>`;
}

function handDrawnMarkPath(svg) {
  const chip = svg.parentElement, bounds = svg.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return '';
  const name = chip.querySelector('.m-card-class, .profession-field > :is(.game-text,.profession-placeholder)');
  const range = document.createRange();
  range.selectNodeContents(name);
  const text = range.getBoundingClientRect(), field = name.getBoundingClientRect();
  const rate = chip.querySelector('.queue-exam-rate').getBoundingClientRect();
  const left = Math.max(2, rate.left - bounds.left - 8), right = Math.min(bounds.width - 2, rate.right - bounds.left + 7);
  const top = rate.top - bounds.top - 4, bottom = Math.min(bounds.height - 2, rate.bottom - bounds.top + 5);
  const center = (left + right) / 2, middle = (top + bottom) / 2;
  const start = Math.max(2, Math.max(text.left, field.left) - bounds.left - 2);
  const end = Math.min(bounds.width - 2, Math.min(text.right, field.right) - bounds.left + 2);
  const underline = field.bottom - bounds.top + 1, tip = (start + end) / 2;
  const arrow = underline + 8;
  return `M${center + 3} ${bottom} C${left + 12} ${bottom + 1} ${left - 3} ${middle + 13} ${left} ${middle + 2}
    C${left + 1} ${top + 3} ${center - 12} ${top - 2} ${center + 1} ${top}
    C${right - 9} ${top - 1} ${right + 1} ${middle - 11} ${right} ${middle + 1}
    C${right - 1} ${bottom - 6} ${center + 15} ${bottom + 1} ${center - 4} ${bottom - 1}
    M${start} ${underline} Q${tip - 4} ${underline + 1.5} ${end} ${underline - 1}
    M${start + 2} ${underline + 4} Q${tip + 3} ${underline + 3} ${end - 1} ${underline + 3}
    M${left} ${middle + 2} C${left - 19} ${middle - 1} ${tip + 8} ${middle - 14} ${tip + 2} ${arrow + 13}
    Q${tip + 0.5} ${arrow + 6} ${tip} ${arrow}
    M${tip - 6} ${arrow + 10} Q${tip - 3} ${arrow + 4} ${tip} ${arrow} Q${tip + 3} ${arrow + 4} ${tip + 7} ${arrow + 9}`;
}

function toggleCardHandDrawnMark(rate) {
  if (!rate.hasAttribute('aria-pressed')) return;
  const chip = rate.closest('.queue-row');
  const item = state.roster.find(entry => entry.id === chip.dataset.queue);
  if (!item?.seed) return;
  const marked = window.RiggingSeed.toggleHandDrawnMark(item, Number(chip.dataset.index));
  rate.setAttribute('aria-pressed', String(marked));
  if (marked) {
    chip.insertAdjacentHTML('beforeend', HAND_DRAWN_MARK);
    const svg = chip.lastElementChild;
    svg.firstElementChild.setAttribute('d', handDrawnMarkPath(svg));
  } else chip.querySelector('.hand-drawn-mark')?.remove();
}
if (document.fonts?.ready) document.fonts.ready.then(() => fitCardClasses());
function toggleCardRating(anchor) {
  const item = state.roster.find(i => i.id === anchor.dataset.cardRating);
  if (!item) return;
  const queued = anchor.dataset.queueIndex !== undefined, index = queued ? anchor.dataset.queueIndex : anchor.dataset.recordIndex;
  if (queued) {
    if (!window.RiggingSeed.ready() || !window.RiggingSeed.toggleRowHappy(state, item, char(item.id), Number(index))) return;
  } else {
    const record = item.records[Number(index)];
    if (!record) return;
    record.happy = record.happy !== true || !!record.ratingPending;
    delete record.ratingPending;
    record.ratingSource = 'manual';
    record.updatedAt = new Date().toISOString();
  }
  const rail = anchor.closest('.records');
  if (rail) railState(rail).extending = true;
  renderSummary();
  refreshRecordRails();
  app.querySelector(`[data-card-rating="${item.id}"][${queued ? 'data-queue-index' : 'data-record-index'}="${index}"]`)?.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  if (e.target.matches?.('.queue-exam[aria-pressed]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) toggleCardHandDrawnMark(e.target);
    return;
  }
  if (e.target.matches?.('[data-card-rating]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); toggleCardRating(e.target);
  }
}, true);
/* 存档 menu (was 备份): the slots, checkmark on this page's, then 管理存档 and the backup commands. With several
   slots the label names the active one, cut to six characters (the full name is its tooltip). In the shell this
   menu feeds the 更多 action sheet (ui/mobile.js), which shows 管理存档 as 存档 and leaves the slot rows out. */
function slotLabel(name) {
  const chars = Array.from(name);
  return chars.length > 6 ? `${chars.slice(0, 5).join('')}…` : name;
}
function slotMenu() {
  const list = slotList(), active = activeSlotEntry(), many = list.length > 1;
  const check = '<svg class="menu-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';
  const label = many ? `存档 · ${escapeValue(slotLabel(active.name))}` : '存档';
  return `<details class="action-menu" name="summary-tools"><summary${many ? ` title="${escapeValue(active.name)}"` : ''}>${label} <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel slot-menu">${list.map(slot => `<button class="menu-slot" data-slot-switch="${slot.id}" aria-current="${slot.id === active.id}">${check}<span>${escapeValue(slot.name)}</span></button>`).join('')}<button data-action="slots" data-sheet-label="存档" aria-haspopup="dialog">管理存档</button><hr class="menu-separator"><button data-action="export">${many ? '导出当前存档' : '导出备份'}</button><button class="import-zone" data-action="import">${many ? '恢复为当前存档' : '恢复备份'}</button><button data-action="import-slot">恢复为新存档</button></div></details>`;
}
// Shell 显示设置: the active slot's name at the top, only once there are several.
function slotSettingsName() {
  return multipleSlots() ? `<p class="m-settings-slot"><span>存档</span>${escapeValue(activeSlotEntry().name)}</p>` : '';
}
/* A step 3 card, drawn or as the empty stand-in a card away from the screen gets (see CARD_WINDOW). The stand-in keeps
   the card's data attributes and classes: the rails and the board read marks and positions from them.
   view: what all of a person's cards share (cardView). */
const recordChipClass = (r, editing) => `record-chip ${r.ratingPending ? 'rating-pending' : r.happy ? 'happy' : 'angry'} ${r.status === 'skipped' ? 'skipped' : r.status === 'upgraded' ? 'upgraded' : ''} ${editing ? 'editable' : ''} `;
const queueChipClass = (row, editing) => `record-chip queue-row ${row.happy === null ? 'rating-pending' : row.happy ? 'happy' : 'angry'} ${row.status === 'skipped' ? 'skipped' : row.status === 'upgraded' ? 'upgraded' : ''} ${row.corrected ? 'corrected' : ''} ${editing ? 'editable' : ''} `;
const statusWord = status => status === 'skipped' ? '已跳过，' : status === 'upgraded' ? '已升级，' : '';
const cardAction = (status, editing, edit) => editing ? edit : status === 'skipped' ? '标记已升级' : status === 'upgraded' ? '恢复原样' : '标记已跳过';
const statusOverlay = status => status === 'normal' ? '' : `<span class="record-overlay ${status === 'skipped' ? 'skip-overlay' : 'upgrade-overlay'}">${status === 'skipped' ? '已跳过' : '已升级'}</span>`;
function cardView(item, c) {
  return { item, c, editing: editingCharacters.has(c.id), phone: UI_MEDIA.mobileShell.matches, levels: M.displayLevels(item) };
}
function recordCard(view, r, index, drawn) {
  const { item, c, editing, phone } = view;
  const open = `<button data-edit="${c.id}" data-index="${index}" data-growth="+${r.stats.length}"`;
  if (!drawn) return `${open} class="${recordChipClass(r, editing)}card-pending" inert></button>`;
  const level = levelLabel(item, view.levels[index]), shown = shownClass(item, r), happy = r.ratingPending ? null : r.happy;
  const label = `${c.name} ${level}，${statusWord(r.status)}${r.ratingPending ? '待评价' : r.happy ? '满意' : '不满意'}，提升 ${r.stats.length} 点：${r.stats.join('、') || '无'}。${cardAction(r.status, editing, '编辑记录')}`;
  const head = phone ? mobileCardHead(level, shown.profession) : `<div><b>${level}</b>${summaryClassMarkup(shown.profession, c.id, index, false)}${cardRatingMarkup(happy, c.id, index, false)}</div>`;
  return `${open} aria-label="${label}" class="${recordChipClass(r, editing)}">${editing ? pencilIcon('edit-pencil') : ''}${head}<strong>+${r.stats.length}</strong><p>${recordStats(r.stats)}</p>${phone ? mobileCardSide(shown.profession, shown.ride, happy, c.id, index, false, false) : ''}${statusOverlay(r.status)}</button>`;
}
function queueCard(view, row, drawn) {
  const { item, c, editing, phone } = view;
  const growth = row.stats.length + row.plus2.length;
  const open = `<button data-queue="${c.id}" data-index="${row.index}" data-growth="+${growth}"`;
  if (!drawn) return `${open} class="${queueChipClass(row, editing)}card-pending" inert></button>`;
  const level = levelLabel(item, row.displayLevel), better = window.RiggingSeed.hasRecommendation(state, item, c, row);
  const label = `${c.name} ${row.corrected ? '已修正' : '预测'} ${level}，${statusWord(row.status)}提升 ${row.stats.length} 点：${row.stats.join('、') || '无'}。考试至少 ${row.examMinimum}% 才能合格。${cardAction(row.status, editing, '修正这一条')}`;
  const head = phone ? mobileCardHead(level, row.profession) : `<div><b>${level}</b>${summaryClassMarkup(row.profession, c.id, row.index, true, better)}${cardRatingMarkup(row.happy, c.id, row.index, true)}</div>`;
  return `${open} aria-label="${label}" class="${queueChipClass(row, editing)}">${editing ? pencilIcon('edit-pencil') : ''}${head}<strong>+${growth}</strong><p>${recordStats(row.stats)}</p>${queueExamMarkup(row)}${phone ? mobileCardSide(row.profession, row.ride, row.happy, c.id, row.index, true, better) : ''}${row.handDrawnMark && row.status !== 'upgraded' ? HAND_DRAWN_MARK : ''}${statusOverlay(row.status)}</button>`;
}
function renderSummary() {
  // The cards drawn now stay drawn; the card window (below) draws and drops cards as the screen moves.
  const drawn = cardWindowOn() ? new Set([...app.querySelectorAll(':scope>.journals .record-chip:not(.card-pending)')].map(chipKey)) : null;
  const total = visibleRoster().reduce((n, r) => n + M.live(r).length, 0);
  // The two counters count what the board holds: live records plus the forecast rows loaded as cards (see setMetrics).
  let boardTotal = total;
  let boardHappy = visibleRoster().reduce((n, r) => n + M.live(r).filter(x => x.happy && x.status !== 'skipped' && !x.ratingPending).length, 0);
  const canUndo = window.RiggingActions.canUndoDelete(storyRoster());
  const hasSkipped = visibleRoster().some(item => M.live(item).some(record => record.status === 'skipped'));
  const top =
    `<div class="summary-top"><div class="metrics"><div><b></b><span>人物</span></div><div><b></b><span>升级记录</span></div><div><b></b><span>满意升级</span></div></div>${UI_MEDIA.mobileShell.matches ? `<div class="m-settings">${slotSettingsName()}${part3Switch()}${routeSwitch()}${recommendFilter()}</div>` : `${part3Switch()}${routeSwitch()}${recommendFilter()}`}<div class="summary-controls">${selectionToolbar()}<div class="actions summary-actions"><button class="primary" data-action="select"><svg class="add-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>添加人物</span></button>${slotMenu()}<details class="action-menu" name="summary-tools"><summary>更多 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="undo-delete" ${canUndo ? '' : 'disabled'}>撤回上次删除</button><button class="menu-danger" data-action="clear-skipped" ${hasSkipped ? '' : 'disabled'}>清空已跳过</button><button class="menu-danger" data-action="reset-list" ${total || visibleRoster().some(item => item.seed) ? '' : 'disabled'}>清空升级记录</button><button class="menu-danger" data-action="reset">清空全部</button></div></details></div></div></div>`;
  const journals = visibleRoster().map(item => {
      const c = char(item.id);
      const phone = UI_MEDIA.mobileShell.matches;
      const editing = editingCharacters.has(c.id);
      const view = cardView(item, c), drawnCard = (kind, index) => !drawn || drawn.has(cardKey(c.id, kind, index));
      const previousRail = app.querySelector(`.journal[data-sort-id="${c.id}"] .records`);
      const compact = compactRecords(item) || (desktopRecords.matches && previousRail && railState(previousRail).retiring);
      const queue = window.RiggingSeed.queueRows(state, item, c, forecastLengths.get(c.id));
      boardTotal += queue.length;
      for (const row of queue) if (row.happy && row.status !== 'skipped') boardHappy++;
      const canSeed = window.RiggingSeed.eligible(item, c);
      const startLabel = !canSeed ? '记录升级' : M.live(item).length ? '继续反推' : '开始反推';
      const mainAction = item.seed ? (window.RiggingSeed.hasCorrection(item) ? `<button class="primary" data-reseed="${c.id}">重新反推</button>` : `<button class="primary" data-exam="${c.id}">考试推荐</button>`) : `<button class="primary" data-start="${c.id}">${startLabel}</button>`;
      return { id: c.id, html: `<article class="journal panel ${compact ? 'has-record-rail' : ''} ${expandedJournals.has(c.id) ? 'records-expanded' : ''}" draggable="false" data-sort-id="${c.id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
        <div class="journal-head"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span><span class="journal-portrait">${(!phone && portrait(c, 'list')) || portrait(c, 'narrow', '(width < 1750px) 178px, 116px')}${seedStatusMarkup(item, c)}</span><div class="journal-info"><h2>${c.name}</h2><p class="initial-level ${editing ? 'can-edit' : ''}" data-initial-level="${c.id}" ${editing ? 'tabindex="0" role="button"' : ''}>初始等级 ${item.initialLevel === null ? '暂无' : `LV ${item.initialLevel}`}${pencilIcon('initial-pencil')}</p>${expectationLink(item, editing)}</div></div>
        <div class="journal-actions">${mainAction}<button data-toggle-edit="${c.id}" aria-pressed="${editing}">${editing ? '完成编辑' : '编辑'}</button>${compact ? `<button class="expand-records" data-expand-records="${c.id}" aria-expanded="${expandedJournals.has(c.id)}">${expandedJournals.has(c.id) ? '收起' : '展开'}</button>` : ''}</div>
        <div class="records">${M.live(item).length || queue.length ? item.records.map((r, index) => r.deleted ? '' : recordCard(view, r, index, drawnCard('r', index))).join('') + queue.map(row => queueCard(view, row, drawnCard('q', row.index))).join('') : '<p class="empty">暂无记录</p>'}</div></article>` };
    });
  const board = list => `<div class="journals">${list.join('') || '<div class="panel empty">添加人物</div>'}</div>`;
  if (app.querySelector('.summary-top')) {
    // A person whose markup is what their column already shows, untouched since, keeps their column as it is:
    // a stand-in tells syncChildren to only put it in place, so one changed card does not walk every column.
    // A column whose cards are as drawn, with only its head changed (a portrait for 第3部), keeps its cards the same way.
    const { shown, shownRails } = takeJournalChanges();
    const template = document.createElement('template');
    template.innerHTML = top + board(journals.map(({ id, html }) => {
      const before = journalMarkup.get(id);
      if (shown.has(id) && before === html) return `<article data-sort-id="${id}" data-same></article>`;
      if (shownRails.has(id) && before !== undefined && railMarkup(before) === railMarkup(html)) return `${html.slice(0, html.indexOf(RAIL_OPEN))}<div class="records" data-same></div></article>`;
      return html;
    }));
    syncChildren(app, template.content);
  } else app.innerHTML = top + board(journals.map(journal => journal.html));
  journalMarkup = new Map(journals.map(({ id, html }) => [id, html]));
  // While the font gate hides the page (startup) a change cannot be seen, so it swaps without rolling.
  setMetrics([visibleRoster().length, boardTotal, boardHappy], document.documentElement.classList.contains('fonts-loading'));
  refreshRowSelection();
  settleJournalChanges();
  if (drawn) { sizePendingCards(); checkCards(); }
}
/* Step 3 draws only the cards near the screen. Every person keeps their column or row, head and frame; a card away
   from the screen is an empty stand-in of the same size (.card-pending, inert), so the page measures and scrolls the
   same and nothing moves when the cards arrive. With dozens of people each holding dozens of cards the page held some
   50,000 elements, and every style and layout pass and every hit test walked them all.
   The phone shell always does this, the desktop from 26 people on. A card is near when it is within reach of the
   screen (sideways on the board, in columns; down the desktop page, in screens) and within reach of what its own rail
   shows (along the rail, in the rail's visible length). near: drawn ahead; keep: drawn cards further away are dropped;
   close: drawn at once, before the frame is painted. The rest is drawn while the screen moves, a few cards a frame
   within budgetMs, nearest first, like a native list preparing its cells ahead: no frame waits for a whole column.
   The card holding the focus stays drawn. */
const CARD_WINDOW = {
  desktopFrom: 26,
  board: { close: 0.5, near: 5, keep: 7 },
  page: { close: 0.25, near: 1.5, keep: 2.5 },
  rail: { close: 0.25, near: 1, keep: 2 },
  budgetMs: 4,
  batch: 4
};
const cardWindowOn = () => UI_MEDIA.mobileShell.matches || visibleRoster().length >= CARD_WINDOW.desktopFrom;
const cardKey = (id, kind, index) => `${id}:${kind}${index}`;
const chipKey = chip => chip.dataset.queue ? cardKey(chip.dataset.queue, 'q', chip.dataset.index) : cardKey(chip.dataset.edit, 'r', chip.dataset.index);
const meets = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
const grow = (box, x, y) => ({ left: box.left - x, right: box.right + x, top: box.top - y, bottom: box.bottom + y });
const clip = (a, b) => ({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) });
const gap = (a, b) => Math.max(0, b.left - a.right, a.left - b.right) + Math.max(0, b.top - a.bottom, a.top - b.bottom);
/* The stand-ins take a drawn card's height: a card's height comes from its content, which they do not have. Measured
   after each redraw, and by the shell once its board classes are on (ui/mobile.js update), before it places the
   columns: a fresh page is built before those classes, when a card still has another height. */
function sizePendingCards() {
  if (page !== 'summary' || !app.querySelector(':scope>.journals .card-pending')) return;
  const card = app.querySelector(':scope>.journals .record-chip:not(.card-pending)');
  if (!card) return;
  const height = `${card.getBoundingClientRect().height}px`;
  if (app.style.getPropertyValue('--pending-card-height') !== height) app.style.setProperty('--pending-card-height', height);
}
// A rail's cards inside a region with their boxes. They run in reading order, so the first one reaching into it is
// found by halving, and the rest follow until one starts past its end.
function chipsIn(rail, region) {
  const chips = rail.querySelectorAll(':scope>.record-chip'), found = [];
  if (!chips.length || region.right <= region.left || region.bottom <= region.top) return found;
  const down = chips[chips.length - 1].getBoundingClientRect().top >= chips[0].getBoundingClientRect().bottom;
  const [reach, begin, start, end] = down ? ['bottom', 'top', region.top, region.bottom] : ['right', 'left', region.left, region.right];
  let low = 0, high = chips.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (chips[middle].getBoundingClientRect()[reach] > start) high = middle; else low = middle + 1;
  }
  for (let index = low; index < chips.length; index++) {
    const box = chips[index].getBoundingClientRect();
    if (box[begin] >= end) break;
    if (meets(box, region)) found.push([chips[index], box]);
  }
  return found;
}
// Draws the cards close to the screen now and lines up the rest: cards to draw, nearest first, then cards to drop.
let cardQueue = [];
function scanCards() {
  cardQueue = [];
  const host = app.querySelector(':scope>.journals');
  if (page !== 'summary' || !host) return;
  if (!cardWindowOn()) { if (host.querySelector('.card-pending')) renderSummary(); return; }
  const shell = UI_MEDIA.mobileShell.matches;
  // The shell's board places the cards. Before it is up (a fresh page) and in the lists for sorting and multi-select,
  // which hide the cards, nothing is drawn or dropped: ui/mobile.js checks again once the board stands.
  if (shell && !app.classList.contains('m-board')) return;
  const journals = host.querySelectorAll(':scope>.journal');
  const pitch = shell && journals.length > 1 ? journals[1].getBoundingClientRect().left - journals[0].getBoundingClientRect().left : 0;
  const screen = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const levels = ['close', 'near', 'keep'];
  // Only along the board or the page: across it, the rails' own reach decides.
  const views = levels.map(level => shell ? grow(screen, CARD_WINDOW.board[level] * pitch, Infinity) : grow(screen, Infinity, CARD_WINDOW.page[level] * innerHeight));
  const keep = new Set(), now = [], ahead = [];
  for (const journal of journals) {
    if (!meets(journal.getBoundingClientRect(), views[2])) continue;
    const rail = journal.querySelector(':scope>.records'), box = rail.getBoundingClientRect();
    const down = rail.scrollHeight > rail.clientHeight + 1;
    const [soon, near, far] = levels.map((level, index) => clip(views[index], down ? grow(box, 0, CARD_WINDOW.rail[level] * rail.clientHeight) : grow(box, CARD_WINDOW.rail[level] * rail.clientWidth, 0)));
    for (const [chip, card] of chipsIn(rail, far)) {
      keep.add(chip);
      if (!chip.classList.contains('card-pending') || !meets(card, near)) continue;
      if (meets(card, soon)) now.push(chip); else ahead.push({ chip, distance: gap(card, screen) + gap(card, box) });
    }
  }
  const dropped = [...host.querySelectorAll(':scope>.journal>.records>.record-chip:not(.card-pending)')].filter(chip => !keep.has(chip) && !chip.contains(document.activeElement));
  setCards(now, true);
  cardQueue = [...ahead.sort((a, b) => a.distance - b.distance).map(({ chip }) => ({ chip, draw: true })), ...dropped.map(chip => ({ chip, draw: false }))];
}
/* Swaps cards between drawn and stand-in. The column's last drawn markup (journalMarkup) takes the same swap, so the next
   redraw still knows the column as it is; the swap is not a change made from outside (quietly). */
function setCards(chips, draw) {
  const people = new Map();
  for (const chip of chips) {
    const id = chip.dataset.queue || chip.dataset.edit;
    if (!people.has(id)) people.set(id, []);
    people.get(id).push(chip);
  }
  if (!people.size) return;
  const fresh = [];
  quietly(() => {
    for (const [id, list] of people) {
      const item = state.roster.find(entry => entry.id === id), view = cardView(item, char(id));
      const rows = list.some(chip => chip.dataset.queue) ? new Map(window.RiggingSeed.queueRows(state, item, view.c, forecastLengths.get(id)).map(row => [row.index, row])) : null;
      const swaps = list.map(chip => {
        const index = Number(chip.dataset.index), row = chip.dataset.queue ? rows.get(index) : null, record = row ? null : item.records[index];
        if (!row && (!record || record.deleted)) return null;
        const markup = drawn => row ? queueCard(view, row, drawn) : recordCard(view, record, index, drawn);
        return { chip, from: markup(!draw), to: markup(draw) };
      }).filter(Boolean);
      const template = document.createElement('template');
      template.innerHTML = swaps.map(swap => swap.to).join('');
      const nodes = [...template.content.children];
      let markup = journalMarkup.get(id);
      swaps.forEach((swap, index) => {
        swap.chip.replaceWith(nodes[index]);
        fresh.push(nodes[index]);
        markup = markup?.includes(swap.from) ? markup.replace(swap.from, () => swap.to) : undefined;
      });
      if (markup === undefined) { changedJournals.add(id); changedRails.add(id); } else journalMarkup.set(id, markup);
    }
    if (draw) fitCardClasses(fresh);
  });
}
// Runs DOM writes that the column records (takeJournalChanges) and the shell (ui/mobile.js) need not answer: what was
// written before is noted first, what run writes is dropped.
function quietly(run) {
  if (journalWatch) noteJournalChanges(journalWatch.takeRecords());
  // ui/mobile.js loads after app.js has drawn the first page.
  if (window.RiggingBoard) window.RiggingBoard.quiet(run); else run();
  journalWatch?.takeRecords();
}
// Scrolling and resizing scan again on the next frame; each frame works through the queue for budgetMs.
let cardFrame = 0, cardScan = false;
function runCards() {
  cardFrame = 0;
  const end = performance.now() + CARD_WINDOW.budgetMs;
  if (cardScan) { cardScan = false; scanCards(); }
  while (cardQueue.length && performance.now() < end) {
    const batch = cardQueue.splice(0, CARD_WINDOW.batch).filter(({ chip, draw }) => chip.isConnected && chip.classList.contains('card-pending') === draw);
    setCards(batch.filter(entry => entry.draw).map(entry => entry.chip), true);
    setCards(batch.filter(entry => !entry.draw).map(entry => entry.chip), false);
  }
  if (cardQueue.length) cardFrame = requestAnimationFrame(runCards);
}
function scheduleCards() {
  cardScan = true;
  if (!cardFrame) cardFrame = requestAnimationFrame(runCards);
}
// After a redraw and when the shell places its board: the cards close by are drawn before the frame is painted.
function checkCards() {
  cardScan = false;
  scanCards();
  if (cardQueue.length && !cardFrame) cardFrame = requestAnimationFrame(runCards);
}
document.addEventListener('scroll', event => {
  if (event.target === document || event.target.matches?.('#app>.journals, #app>.journals>.journal>.records')) scheduleCards();
}, { capture: true, passive: true });
window.addEventListener('resize', scheduleCards);
/* Which step 3 columns may be kept as they are on the next redraw: the markup each was last drawn from, and the
   columns something else has written to since (an inline edit, a selection mark, a fade, a rail size). Changes a
   redraw makes itself, and those of the decorations it runs right after (refreshRowSelection), are put again by
   every redraw, so settleJournalChanges drops them; anything later marks its column for a full sync, as before.
   The cards (the rail) are tracked apart from the rest of the column, which a fade on the portrait writes to. */
let journalMarkup = new Map();
const changedJournals = new Set(), changedRails = new Set();
let journalsUnknown = true;
const RAIL_OPEN = '<div class="records">';
const railMarkup = html => html.slice(html.indexOf(RAIL_OPEN));
function noteJournalChanges(records) {
  for (const record of records) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentNode;
    if (!target?.isConnected) { journalsUnknown = true; return; }
    const journal = target.closest('.journal');
    if (!journal) continue;
    changedJournals.add(journal.dataset.sortId);
    if (target.closest('.records')) changedRails.add(journal.dataset.sortId);
  }
}
// Started on the first redraw: #app is defined after this file runs.
let journalWatch = null;
// The columns on the page, and the rails, that can be kept: drawn from known markup and not written to since.
function takeJournalChanges() {
  if (!journalWatch) {
    journalWatch = new MutationObserver(noteJournalChanges);
    journalWatch.observe(app, { childList: true, subtree: true, attributes: true, characterData: true });
  }
  noteJournalChanges(journalWatch.takeRecords());
  const shown = new Set(), shownRails = new Set();
  if (!journalsUnknown) for (const journal of app.querySelectorAll(':scope>.journals>.journal[data-sort-id]')) {
    const id = journal.dataset.sortId;
    if (!changedJournals.has(id)) shown.add(id);
    if (!changedRails.has(id)) shownRails.add(id);
  }
  return { shown, shownRails };
}
function settleJournalChanges() {
  if (!journalWatch) takeJournalChanges();
  journalWatch.takeRecords();
  changedJournals.clear();
  changedRails.clear();
  journalsUnknown = false;
}
/* The step 3 counters. Each number is written in place (the summary is never redrawn for it) and, when it changes
   while the page is shown, its changed digits roll like Apple's numericText: an increase brings the new digit up
   from below and sends the old one up and out (a decrease is the reverse). The new digit and the leaving one are
   absolutely placed inside a column that is exactly one line tall, so the box keeps the static layout; at rest the
   <b> holds plain text again. Retargeting reads each moving digit's progress from its animation, never the layout. */
const metricStates = new WeakMap();
const ROLL = { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' };
function setMetrics(values, quiet) {
  app.querySelectorAll('.summary-top .metrics>div>b').forEach((b, index) => setMetric(b, values[index], quiet));
}
function setMetric(b, value, quiet) {
  const text = String(value);
  let state = metricStates.get(b);
  if (!state) { metricStates.set(b, { value: text, columns: null, running: new Set() }); b.textContent = text; return; }
  if (state.value === text) return;
  if (quiet || !motionAllowed() || document.hidden || !b.isConnected) { rollStop(b, state); state.value = text; b.textContent = text; return; }
  const up = Number(text) > Number(state.value), old = state.value;
  if (!state.columns) {
    b.textContent = '';
    state.real = document.createElement('roll-part');
    state.real.className = 'roll-real';
    b.append(state.real);
    state.columns = [...old].map(digit => rollColumn(digit));
    b.append(...state.columns.map(column => column.el));
  }
  state.real.textContent = text;
  state.value = text;
  const next = [];
  for (let k = 0; k < Math.max(old.length, text.length); k++) {
    const column = state.columns[state.columns.length - 1 - k], digit = text[text.length - 1 - k];
    if (digit === undefined) {
      // A leading digit that is gone: its column keeps no width and the digit rolls out where it stood.
      column.el.style.width = '0';
      rollOut(state, column.cur, up, true, column);
    } else if (!column) {
      const added = rollColumn(digit);
      b.insertBefore(added.el, next[0].el);
      rollIn(state, added.cur, up);
      next.unshift(added);
      continue;
    } else if (column.digit !== digit) {
      rollOut(state, column.cur, up, false, column);
      column.cur = rollDigit(digit); column.digit = digit;
      column.el.append(column.cur);
      rollIn(state, column.cur, up);
    }
    if (column && digit !== undefined) next.unshift(column);
  }
  state.columns = next;
}
function rollColumn(digit) {
  const el = document.createElement('roll-part');
  el.className = 'roll-col';
  el.setAttribute('aria-hidden', 'true');
  const cur = rollDigit(digit);
  el.append(cur);
  return { el, cur, digit };
}
function rollDigit(digit) {
  const el = document.createElement('roll-part');
  el.className = 'roll-digit';
  el.textContent = digit;
  return el;
}
// Where a digit's running animation stands, as a fraction of one line and an opacity.
function rollNow(el) {
  const progress = el.rollAnimation?.effect.getComputedTiming().progress;
  if (progress == null) return { y: 0, opacity: 1 };
  return { y: el.rollFrom * (1 - progress), opacity: el.rollOpacity + (1 - el.rollOpacity) * progress };
}
function rollTrack(state, animation, done) {
  state.running.add(animation);
  const end = () => { state.running.delete(animation); done?.(); if (!state.running.size) rollRest(state); };
  animation.onfinish = end;
  animation.oncancel = () => state.running.delete(animation);
}
function rollIn(state, el, up) {
  const from = up ? 1 : -1;
  el.rollFrom = from; el.rollOpacity = 0;
  el.rollAnimation = el.animate([
    { transform: `translateY(${from * 100}%)`, opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 }
  ], { duration: ROLL.duration, easing: ROLL.easing });
  rollTrack(state, el.rollAnimation);
}
function rollOut(state, el, up, remove, column) {
  const now = rollNow(el), to = up ? -1 : 1;
  el.rollAnimation?.cancel();
  el.rollAnimation = null;
  el.classList.add(remove ? 'roll-lost' : 'roll-leaving');
  const animation = el.animate([
    { transform: `translateY(${now.y * 100}%)`, opacity: now.opacity },
    { transform: `translateY(${to * 100}%)`, opacity: 0 }
  ], { duration: ROLL.duration, easing: ROLL.easing });
  rollTrack(state, animation, () => { el.remove(); if (remove) column.el.remove(); });
}
function rollRest(state) {
  const b = state.real?.parentElement;
  if (!b || state.running.size) return;
  b.textContent = state.value;
  state.columns = null; state.real = null;
}
function rollStop(b, state) {
  state.running.forEach(animation => { animation.onfinish = animation.oncancel = null; animation.cancel(); });
  state.running.clear(); state.columns = null; state.real = null;
}
// Reconcile summary changes in place, retaining keyed journals and their images.
function syncChildren(current, desired) {
  const key = node => {
    if (node.nodeType !== 1) return null;
    for (const attribute of ['data-sort-id', 'data-start', 'data-reseed', 'data-exam', 'data-toggle-edit', 'data-edit', 'data-queue']) {
      if (node.hasAttribute(attribute)) return `${attribute}:${node.getAttribute(attribute)}:${node.getAttribute('data-index') || ''}`;
    }
    return null;
  };
  const keyed = new Map([...current.childNodes].filter(key).map(node => [key(node), node]));
  let cursor = current.firstChild;
  // Selection owns this leading checkbox; it is absent from the render template.
  // Keep it out of reconciliation so updates retain the journal's record rail.
  if (current.matches?.('.journal') && cursor?.nodeType === 1 && cursor.matches('.row-select')) cursor = cursor.nextSibling;
  const same = (node, next) => node && node.nodeType === next.nodeType && node.nodeName === next.nodeName && key(node) === key(next);
  for (const next of [...desired.childNodes]) {
    const id = key(next);
    // A node dropped from the front (the edit pencil when 完成编辑) would misalign every later sibling and rebuild
    // the whole card; WebKit then loses the column's scroll position. Remove just that node instead.
    if (!id) while (cursor && !key(cursor) && !same(cursor, next) && same(cursor.nextSibling, next)) {
      const dropped = cursor;
      cursor = cursor.nextSibling;
      dropped.remove();
    }
    let node = id ? keyed.get(id) : cursor;
    // renderSummary's stand-in for a column, or a column's rail, left as it is (see takeJournalChanges).
    if (node && next.nodeType === 1 && next.hasAttribute('data-same')) {
      if (node !== cursor) current.insertBefore(node, cursor);
      cursor = node.nextSibling;
      continue;
    }
    if (!node || node.nodeType !== next.nodeType || node.nodeName !== next.nodeName || key(node) !== id) {
      node = next.cloneNode(true);
      current.insertBefore(node, cursor);
    } else {
      if (node !== cursor) current.insertBefore(node, cursor);
      if (node.nodeType === 1) {
        const chipWidth = node.matches('.records') ? node.style.getPropertyValue('--chip-width') : '';
        const recordColumns = node.matches('.records') ? node.style.getPropertyValue('--record-columns') : '';
        for (const attribute of [...node.attributes]) {
          if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
        }
        for (const attribute of [...next.attributes]) {
          if (node.getAttribute(attribute.name) !== attribute.value) node.setAttribute(attribute.name, attribute.value);
        }
        // Rail sizing is measured at runtime; retain it through record updates.
        if (chipWidth) node.style.setProperty('--chip-width', chipWidth);
        if (recordColumns) node.style.setProperty('--record-columns', recordColumns);
        // The counters keep their own digits (setMetric).
        if (!node.matches('.metrics>div>b')) syncChildren(node, next);
      } else if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
    }
    cursor = node.nextSibling;
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}
