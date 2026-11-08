/* Summary navigation/history controls; mutations use shared actions. */
async function openCardOptions(anchor) {
  const card = cardClass(anchor);
  if (!card || document.querySelector('dialog[open]')) return;
  const { item } = card, queued = card.queued;
  const index = queued ? card.index : Number(anchor.dataset.recordIndex);
  const row = queued ? window.RiggingSeed.queueRows(state, item, char(item.id), index + 1)[index] : card.record;
  if (!row) return;
  const level = queued ? row.displayLevel : recordDisplayLevel(item, row);
  const better = queued && window.RiggingSeed.recommendedChoices(state, item, char(item.id), row).length > 0;
  const action = await new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog card-options-dialog';
    dialog.setAttribute('aria-labelledby', 'card-options-title');
    dialog.innerHTML = `<header><h2 id="card-options-title">${char(item.id).name} · ${levelLabel(item, level)}</h2></header><div class="card-options-list"><p class="card-options-current">${escapeValue(card.profession || '暂无兵种')}${rideKind(card.profession, item.id) ? ` · ${escapeValue(rideText(card.ride))}` : ''}</p>${better ? '<button class="card-option-recommend" data-option="better">查看其他选择<span>有更好的兵种或配属</span></button>' : ''}<button data-option="profession">更换兵种<span>仅限本次 / 今后沿用</span></button>${rideKind(card.profession, item.id) ? '<button data-option="ride">更换配属<span>选择配属与友好LV</span></button>' : ''}<button data-option="rating">改为${row.happy === true ? '不满意' : '满意'}</button><button data-option="edit">${queued ? '修正属性' : '编辑这条记录'}</button></div><footer><button data-option="close">关闭</button></footer>`;
    let chosen = 'close';
    dialog.addEventListener('click', e => {
      const button = e.target.closest('[data-option]');
      if (button) { chosen = button.dataset.option; dialog.close(); }
    });
    dialog.addEventListener('close', () => { retireDialog(dialog); resolve(chosen); }, { once: true });
    document.body.append(dialog); dialog.showModal();
  });
  if (action === 'profession' || action === 'ride') await openCardClass(anchor, action);
  else if (action === 'better') await openBetterChoices(anchor);
  else if (action === 'rating') toggleCardRating(anchor);
  else if (action === 'edit') {
    editingCharacters.add(item.id);
    const chip = anchor.closest('.record-chip');
    if (queued) openQueueRow(chip); else openSummaryRecord(chip);
  }
  if (page === 'summary') app.querySelector(`[data-card-options="${item.id}"][${queued ? 'data-queue-index' : 'data-record-index'}="${index}"]`)?.focus({ preventScroll: true });
}
function showMoreForecast(id) {
  const item = state.roster.find(r => r.id === id);
  if (!item || !window.RiggingSeed.ready()) return;
  const count = window.RiggingSeed.queueRows(state, item, char(id), forecastLengths.get(id)).length;
  const scrollY = window.scrollY;
  forecastLengths.set(id, count + FORECAST_BATCH);
  const rail = app.querySelector(`.journal[data-sort-id="${id}"] .records`);
  if (rail) railState(rail).extending = true;
  renderSummary(); refreshRecordRails();
  window.scrollTo(0, scrollY);
  app.querySelector(`.queue-row[data-queue="${id}"][data-index="${count}"]`)?.focus({ preventScroll: true });
}
document.addEventListener('keydown', e => {
  if (e.target.matches?.('[data-card-options]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); openCardOptions(e.target);
  }
}, true);
function start(id) {
  // Records already on the list may be enough, so stay here unless the search needs another one.
  if (seedCanStart(state.roster.find(r => r.id === id))) runSeedSearch(id, true);
  else openNewRecord(id);
}
function openNewRecord(id) {
  const rail = app.querySelector(`.journal[data-sort-id="${id}"] .records`);
  const step = rail && railState(rail).step;
  recordReturnPosition = desktopRecords.matches
    ? { id, position: step ? rail.scrollLeft / step : 0 }
    : null;
  activeRecord = takeRecordDraft(id) || newRecordDraft(id);
   page = 'record'; render(); window.scrollTo(0, 0);
}
function rememberListPosition() {
  state.summaryScroll = Math.max(0, window.scrollY);

  notify('');
}
function returnToSummary() {
  const previous = recordReturnPosition;
  recordReturnPosition = null;
  page = 'summary'; render();
  window.scrollTo(0, Number(state.summaryScroll) || 0);
  const rail = previous && desktopRecords.matches
    ? app.querySelector(`.journal.has-record-rail:not(.records-expanded)[data-sort-id="${previous.id}"] .records`)
    : null;
  if (rail && rail.scrollWidth > rail.clientWidth) {
    // Align the latest card with the right edge, excluding the rail's trailing spacer.
    const latest = rail.querySelector('.record-chip:last-child');
    const target = rail.scrollLeft + latest.getBoundingClientRect().right
      - rail.getBoundingClientRect().left - rail.clientWidth;
    const previousLeft = previous.position * railState(rail).step;
    // Use existing empty slots before moving the row to reveal new records.
    if (target <= previousLeft + 1) {
      moveRail(rail, previousLeft, 0);
      return;
    }
    moveRail(rail, target, 0);
    const status = railState(rail);
    status.autoPending = true;
    scheduleRecordReturn(rail);
  }
}
function openSummaryRecord(b) {
  rememberListPosition();
  const index = Number(b.dataset.index);
  const item = state.roster.find(r => r.id === b.dataset.edit);
  const record = item.records[index];
  if (!editingCharacters.has(item.id)) {
    const status = railState(b.closest('.records'));
    status.autoUntil = performance.now() + 1000;
    // Manual browsing cancels the timer, but row exit still settles this change.
    status.autoPending = true;
    // Every status click renews this row's countdown, including skipped -> upgraded.
    status.signature = '';
    // 已跳过 -> 已升级 swaps one mask for the other: fade between their colours, never through an unmasked card.
    const previous = b.querySelector('.record-overlay');
    const previousBackground = previous && getComputedStyle(previous).backgroundColor;
    window.RiggingActions.cycleRecordStatus(record, item);
    status.retiring = desktopRecords.matches && !compactRecords(item) && b.closest('.journal').matches('.has-record-rail:not(.records-expanded)');
    returnToSummary();
    const overlay = motionAllowed() && app.querySelector(`.record-chip[data-edit="${item.id}"][data-index="${index}"] .record-overlay`);
    if (overlay) overlay.animate(previousBackground
      ? { backgroundColor: [previousBackground, getComputedStyle(overlay).backgroundColor] }
      : { opacity: [0, getComputedStyle(overlay).opacity] }, { duration: MOTION.fast, easing: 'ease-out' });
    return true;
  }
  const savedKind = rideKind(record.profession, item.id);
  const savedRide = savedKind ? window.RiggingActions.usableRide(record.ride && { ...record.ride }, savedKind, item.id) : null;
  activeRecord = takeRecordDraft(b.dataset.edit, index) || { id: b.dataset.edit, editIndex: index, profession: record.profession || null, ride: savedRide, rides: savedKind ? { [savedKind]: savedRide } : {}, stats: [...record.stats], happy: record.ratingPending ? null : record.happy, ratingSource: record.ratingSource || 'legacy' };
   page = 'record'; render(); window.scrollTo(0, 0);
}
