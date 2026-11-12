/* Shared summary renderer. Rail gestures remain installed once by app.js. */
// A saved record's class as the switch shows it (core/actions.js shownClass).
const shownClass = (item, record) => window.RiggingActions.shownClass(state, item, record);
/* Not shown for now: the records a seed is found from become forecast rows, which show their pass rate there.
   Kept for when 锚点 comes back; the card template used ${r.anchor ? ANCHOR_MARK : ''} after the stats, the
   class ${r.anchor ? 'anchor' : ''} and the label ${r.anchor ? '锚点，' : ''}.
// The records the seed was found from, marked where a forecast shows its pass rate.
const ANCHOR_MARK = '<span class="anchor-mark" aria-hidden="true"><span>锚点</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 11h8M5 14a7 7 0 0 0 14 0"/></svg></span>'; */
// Narrow cards keep one generous touch target for class, ride and rating actions.
function summaryClassMarkup(value, id, index, queue, better = false) {
  if (UI_MEDIA.wideRecordRow.matches) return professionMarkup(value, true, id, index, queue, better, '暂无兵种');
  return `<span class="card-options-field ${better ? 'has-better' : ''}" role="button" tabindex="0" data-card-options="${id}" data-character="${id}" ${queue ? 'data-queue-index' : 'data-record-index'}="${index}" aria-haspopup="dialog" aria-label="${value || '暂无兵种'}，兵种、配属与评价${better ? '，有更好的选择' : ''}"><span class="game-text">${value || '暂无兵种'}</span><span class="card-options-icon" aria-hidden="true">${better ? BETTER_ICON : '···'}</span></span>`;
}
// Phone column cards: a side strip of three cells with taps of their own, never the card's 已跳过/已升级 cycle
// (ui/mobile.js routes them): rating face (flips it, as on wide screens) · class icon (changes the class; with
// the ! mark it opens the better choices) · mount (changes it; empty, and inert, when the class takes none).
function mobileCardSide(profession, ride, happy, id, index, queue, better) {
  const name = window.PROFESSIONS.names.includes(profession) ? profession : null;
  const kind = name && rideKind(name, id);
  const card = `data-character="${id}" ${queue ? 'data-queue-index' : 'data-record-index'}="${index}"`;
  const rating = `<span class="m-side-cell m-side-rating ${happy === null ? 'pending' : ''}" role="button" tabindex="0" data-m-side="rating" data-card-rating="${id}" ${card} aria-label="${happy === null ? '待评价，设为满意' : happy ? '满意，改为不满意' : '不满意，改为满意'}">${happy === null ? '<span>待</span>' : ratingIcon(happy)}</span>`;
  const icon = name ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png${ICON_QUERY}" alt="" draggable="false">` : '<span class="m-side-empty">兵种</span>';
  const klass = better
    ? `<span class="m-side-cell m-side-class better" role="button" tabindex="0" data-m-side="better" data-better="${id}" data-better-index="${index}" ${card} aria-label="${name || '暂无兵种'}，有更好的兵种或配属">${icon}<span class="m-better">${BETTER_ICON}</span></span>`
    : `<span class="m-side-cell m-side-class" role="button" tabindex="0" data-m-side="profession" ${card} aria-haspopup="dialog" aria-label="兵种，${name || '暂无'}，更换">${icon}</span>`;
  const mount = kind
    ? `<span class="m-side-cell m-side-ride" role="button" tabindex="0" data-m-side="ride" ${card} aria-haspopup="dialog" aria-label="配属，${rideText(ride)}，更换">${rideIcon(kind, ride)}${ride ? `<img class="ride-level" src="assets/rides/heart-${ride.level}.png" alt="" draggable="false">` : ''}</span>`
    : '<span class="m-side-cell m-side-ride" data-m-side="none" aria-hidden="true"></span>';
  return `<span class="m-card-side">${rating}${klass}${mount}</span>`;
}
function mobileCardHead(level, profession) {
  return `<div><b>${level}</b><span class="m-card-class game-text">${profession || '暂无兵种'}</span></div>`;
}
function forecastMoreMarkup(item, queue) {
  // Phones load more as a column is scrolled (ui/mobile.js), so they never show the button.
  if (UI_MEDIA.wideRecordRow.matches || UI_MEDIA.mobileShell.matches || !queue.length || window.RiggingSeed.rowDisplayLevel(item, queue.length) > 99) return '';
  const requested = forecastLengths.get(item.id);
  if (requested && queue.length < requested) return '';
  return `<button class="forecast-more" data-more-forecast="${item.id}">查看更多预测<span>再显示 ${FORECAST_BATCH} 条</span></button>`;
}
// On wide screens a card's rating flips in place, like the class field beside it.
function cardRatingMarkup(happy, id, index, queue) {
  const text = happy === null ? '待评价' : ratingIcon(happy) + (happy ? '满意' : '不满意');
  if (!UI_MEDIA.wideRecordRow.matches) return `<span>${text}</span>`;
  // The word always takes the room of the longer one, so flipping it never moves the class field.
  const word = happy === null ? '待评价' : happy ? '满意' : '不满意';
  return `<span class="rating-toggle" role="button" tabindex="0" data-card-rating="${id}" ${queue ? 'data-queue-index' : 'data-record-index'}="${index}" aria-label="${happy ? '改为不满意' : '改为满意'}"><span class="rating-word"><span><span class="rating-text">${word}</span>${happy === null ? '' : ratingIcon(happy)}</span></span></span>`;
}
/* A class name (or the 暂无兵种 placeholder) that would be cut short (or pushed off centre by its ⓘ mark) takes the room of the rating
   word: that card shows only the face. Measured with the word in place, so a wider card gets it back. */
function fitCardClasses(root = app) {
  for (const chip of root.querySelectorAll('.record-chip')) {
    const field = chip.querySelector(':scope>div>.profession-field'), text = field?.querySelector('.game-text, .profession-placeholder');
    const face = chip.querySelector('.rating-word .rating-icon');
    chip.classList.remove('rating-face-only');
    if (!text || !face || !field.getBoundingClientRect().width) continue;
    const before = getComputedStyle(field, '::before'), shrunk = field.classList.contains('better') && parseFloat(before.width) < parseFloat(before.flexBasis) - 0.5;
    if (text.scrollWidth > text.clientWidth + 0.5 || shrunk) chip.classList.add('rating-face-only');
  }
}
if (document.fonts?.ready) document.fonts.ready.then(() => fitCardClasses());
function toggleCardRating(anchor) {
  const item = state.roster.find(i => i.id === (anchor.dataset.cardRating || anchor.dataset.cardOptions));
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
  if (e.target.matches?.('[data-card-rating]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); toggleCardRating(e.target);
  }
}, true);
function renderSummary() {
  const total = visibleRoster().reduce((n, r) => n + M.live(r).length, 0);
  const happy = visibleRoster().reduce((n, r) => n + M.live(r).filter(x => x.happy && x.status !== 'skipped' && !x.ratingPending).length, 0);
  const canUndo = storyRoster().some(item => item.deleted || item.records.some(record => record.deleted));
  const hasSkipped = visibleRoster().some(item => M.live(item).some(record => record.status === 'skipped'));
  const markup =
    `<div class="summary-top"><div class="metrics"><div><b>${visibleRoster().length}</b><span>人物</span></div><div><b>${total}</b><span>升级记录</span></div><div><b>${happy}</b><span>满意升级</span></div></div>${UI_MEDIA.mobileShell.matches ? `<div class="m-settings">${part3Switch()}${routeSwitch()}${recommendFilter()}</div>` : `${part3Switch()}${routeSwitch()}${recommendFilter()}`}<div class="summary-controls">${selectionToolbar()}<div class="actions summary-actions"><button class="primary" data-action="select"><svg class="add-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>添加人物</span></button><details class="action-menu" name="summary-tools"><summary>备份 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="export">导出备份</button><button class="import-zone" data-action="import">恢复备份</button></div></details><details class="action-menu" name="summary-tools"><summary>更多 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="undo-delete" ${canUndo ? '' : 'disabled'}>撤回上次删除</button><button class="menu-danger" data-action="clear-skipped" ${hasSkipped ? '' : 'disabled'}>清空已跳过</button><button class="menu-danger" data-action="reset-list" ${total ? '' : 'disabled'}>清空升级记录</button><button class="menu-danger" data-action="reset">清空全部</button></div></details></div></div></div><div class="journals">${visibleRoster().map(item => {
      const c = char(item.id);
      const phone = UI_MEDIA.mobileShell.matches;
      const editing = editingCharacters.has(c.id);
      const displayLevels = M.displayLevels(item);
      const previousRail = app.querySelector(`.journal[data-sort-id="${c.id}"] .records`);
      const compact = compactRecords(item) || (desktopRecords.matches && previousRail && railState(previousRail).retiring);
      const queue = window.RiggingSeed.queueRows(state, item, c, forecastLengths.get(c.id));
      const canSeed = window.RiggingSeed.eligible(item, c);
      const startLabel = !canSeed ? '记录升级' : M.live(item).length ? '继续反推' : '开始反推';
      const mainAction = item.seed ? (window.RiggingSeed.hasCorrection(item) ? `<button class="primary" data-reseed="${c.id}">重新反推</button>` : `<button class="primary" data-exam="${c.id}">考试推荐</button>`) : `<button class="primary" data-start="${c.id}">${startLabel}</button>`;
      return `<article class="journal panel ${compact ? 'has-record-rail' : ''} ${expandedJournals.has(c.id) ? 'records-expanded' : ''}" draggable="false" data-sort-id="${c.id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
        <div class="journal-head"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span><span class="journal-portrait">${(!phone && portrait(c, 'list')) || portrait(c, 'narrow', '(max-width:1749px) 178px, 116px')}${seedStatusMarkup(item, c)}</span><div class="journal-info"><h2>${c.name}</h2><p class="initial-level ${editing ? 'can-edit' : ''}" data-initial-level="${c.id}" ${editing ? 'tabindex="0" role="button"' : ''}>初始等级 ${item.initialLevel === null ? '暂无' : `LV ${item.initialLevel}`}${pencilIcon('initial-pencil')}</p>${expectationLink(item, editing)}</div></div>
        <div class="journal-actions">${mainAction}<button data-toggle-edit="${c.id}" aria-pressed="${editing}">${editing ? '完成编辑' : '编辑'}</button>${compact ? `<button class="expand-records" data-expand-records="${c.id}" aria-expanded="${expandedJournals.has(c.id)}">${expandedJournals.has(c.id) ? '收起' : '展开'}</button>` : ''}</div>
        <div class="records">${M.live(item).length || queue.length ? item.records.map((r, recordIndex) => r.deleted ? '' : `<button data-edit="${c.id}" data-index="${recordIndex}" data-growth="+${r.stats.length}" aria-label="${c.name} ${levelLabel(item, displayLevels[recordIndex])}，${r.status === 'skipped' ? '已跳过，' : r.status === 'upgraded' ? '已升级，' : ''}${r.ratingPending ? '待评价' : r.happy ? '满意' : '不满意'}，提升 ${r.stats.length} 点：${r.stats.join('、') || '无'}。${editing ? '编辑记录' : r.status === 'skipped' ? '标记已升级' : r.status === 'upgraded' ? '恢复原样' : '标记已跳过'}" class="record-chip ${r.ratingPending ? 'rating-pending' : r.happy ? 'happy' : 'angry'} ${r.status === 'skipped' ? 'skipped' : r.status === 'upgraded' ? 'upgraded' : ''} ${editing ? 'editable' : ''}">${editing ? pencilIcon('edit-pencil') : ''}${phone ? mobileCardHead(levelLabel(item, displayLevels[recordIndex]), shownClass(item, r).profession) : `<div><b>${levelLabel(item, displayLevels[recordIndex])}</b>${summaryClassMarkup(shownClass(item, r).profession, c.id, recordIndex, false)}${cardRatingMarkup(r.ratingPending ? null : r.happy, c.id, recordIndex, false)}</div>`}<strong>+${r.stats.length}</strong><p>${recordStats(r.stats)}</p>${phone ? mobileCardSide(shownClass(item, r).profession, shownClass(item, r).ride, r.ratingPending ? null : r.happy, c.id, recordIndex, false, false) : ''}${r.status !== 'normal' ? `<span class="record-overlay ${r.status === 'skipped' ? 'skip-overlay' : 'upgrade-overlay'}">${r.status === 'skipped' ? '已跳过' : '已升级'}</span>` : ''}</button>`).join('') + queue.map(row => `<button data-queue="${c.id}" data-index="${row.index}" data-growth="+${row.stats.length + row.plus2.length}" aria-label="${c.name} ${row.corrected ? '已修正' : '预测'} ${levelLabel(item, row.displayLevel)}，${row.status === 'skipped' ? '已跳过，' : row.status === 'upgraded' ? '已升级，' : ''}提升 ${row.stats.length} 点：${row.stats.join('、') || '无'}。考试至少 ${row.examMinimum}% 才能合格。${editing ? '修正这一条' : row.status === 'skipped' ? '标记已升级' : row.status === 'upgraded' ? '恢复原样' : '标记已跳过'}" class="record-chip queue-row ${row.happy === null ? 'rating-pending' : row.happy ? 'happy' : 'angry'} ${row.status === 'skipped' ? 'skipped' : row.status === 'upgraded' ? 'upgraded' : ''} ${row.corrected ? 'corrected' : ''} ${editing ? 'editable' : ''}">${editing ? pencilIcon('edit-pencil') : ''}${phone ? mobileCardHead(levelLabel(item, row.displayLevel), row.profession) : `<div><b>${levelLabel(item, row.displayLevel)}</b>${summaryClassMarkup(row.profession, c.id, row.index, true, window.RiggingSeed.recommendedChoices(state, item, c, row).length > 0)}${cardRatingMarkup(row.happy, c.id, row.index, true)}</div>`}<strong>+${row.stats.length + row.plus2.length}</strong><p>${recordStats(row.stats)}</p><span class="queue-exam"><span class="queue-exam-compact">${row.corrected ? '已修正 · ' : '预测 · '}考试 ≥${row.examMinimum}%</span><span class="queue-exam-rate"><span class="queue-exam-label">及格率</span><span class="queue-exam-ge" aria-hidden="true"></span><b>${row.examMinimum}</b><span class="queue-exam-percent">%</span></span></span>${phone ? mobileCardSide(row.profession, row.ride, row.happy, c.id, row.index, true, window.RiggingSeed.recommendedChoices(state, item, c, row).length > 0) : ''}${row.status !== 'normal' ? `<span class="record-overlay ${row.status === 'skipped' ? 'skip-overlay' : 'upgrade-overlay'}">${row.status === 'skipped' ? '已跳过' : '已升级'}</span>` : ''}</button>`).join('') : '<p class="empty">暂无记录</p>'}</div>${forecastMoreMarkup(item, queue)}</article>`;
    }).join('') || '<div class="panel empty">添加人物</div>'}</div>`;
  if (app.querySelector('.summary-top')) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    syncChildren(app, template.content);
  } else app.innerHTML = markup;
  refreshRowSelection();
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
  for (const next of [...desired.childNodes]) {
    const id = key(next);
    let node = id ? keyed.get(id) : cursor;
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
        syncChildren(node, next);
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
