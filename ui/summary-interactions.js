/* Summary navigation/history controls; mutations use shared actions. */
function start(id) {
  const rail = app.querySelector(`.journal[data-sort-id="${id}"] .records`);
  const step = rail && railState(rail).step;
  recordReturnPosition = desktopRecords.matches
    ? { id, position: step ? rail.scrollLeft / step : 0 }
    : null;
  activeRecord = newRecordDraft(id);
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
    window.RiggingActions.cycleRecordStatus(record);
    status.retiring = desktopRecords.matches && !compactRecords(item) && b.closest('.journal').matches('.has-record-rail:not(.records-expanded)');
    returnToSummary();
    const overlay = motionAllowed() && app.querySelector(`.record-chip[data-edit="${item.id}"][data-index="${index}"] .record-overlay`);
    if (overlay) overlay.animate({ opacity: [0, getComputedStyle(overlay).opacity] }, { duration: MOTION.fast, easing: 'ease-out' });
    return true;
  }
  const savedKind = rideKind(record.profession);
  const savedRide = savedKind && window.RIDES.byId[record.ride?.id]?.kind === savedKind ? { ...record.ride } : null;
  activeRecord = { id: b.dataset.edit, editIndex: index, profession: record.profession || null, ride: savedRide, rides: savedKind ? { [savedKind]: savedRide } : {}, stats: [...record.stats], happy: record.ratingPending ? null : record.happy, ratingSource: record.ratingSource || 'legacy' };
   page = 'record'; render(); window.scrollTo(0, 0);
}
