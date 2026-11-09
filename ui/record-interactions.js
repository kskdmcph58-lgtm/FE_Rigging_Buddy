/* Upgrade controller: confirmation, navigation and DOM feedback. */
function confirmRecordDeletion(question = '是否删除这条记录？', actionLabel = '删除', description = '') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'delete-confirm-title');
    dialog.innerHTML = '<h2 id="delete-confirm-title">是否删除这条记录？</h2><form method="dialog"><button value="cancel" autofocus>返回</button><button class="danger" value="delete">删除</button></form>';
    dialog.querySelector('h2').textContent = question;
    if (description) {
      const detail = document.createElement('p');
      detail.id = 'delete-confirm-description'; detail.className = 'confirm-description';
      detail.textContent = description;
      dialog.querySelector('h2').after(detail);
      dialog.classList.add('has-description');
      dialog.setAttribute('aria-describedby', detail.id);
    }
    dialog.querySelector('.danger').textContent = actionLabel;
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'delete';
      retireDialog(dialog);
      resolve(confirmed);
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}
async function deleteRecord() {
  const d = activeRecord;
  if (!d || d.editIndex === undefined) return;
  const item = state.roster.find(r => r.id === d.id);
  if (!item || !item.records[d.editIndex]) return;
  if (!await confirmRecordDeletion() || activeRecord !== d) return;
  softDelete([item.records[d.editIndex]]);
  if (!M.live(item).length) editingCharacters.delete(item.id);
  activeRecord = null;
  clearRecordDraft();
  returnToSummary();
}
function saveRecord(next) {
  const d = activeRecord;
  if (!d || d.happy === null) return;
  if (d.queueIndex !== undefined) {
    const owner = state.roster.find(r => r.id === d.id);
    if (!window.RiggingSeed.ready() || !window.RiggingSeed.saveRow(state, owner, char(d.id), d)) return;
    activeRecord = null;
    clearRecordDraft();
    seedMessages.delete(d.id);
    returnToSummary();
    return;
  }
  const result = window.RiggingActions.saveRecord(state, d);
  if (!result.saved) {
    if (result.reason === 'limit') {
      notify('记录已达上限，请导出备份');
    }
    return;
  }
  const item = result.item, id = d.id;
  activeRecord = null;
  seedMessages.delete(id);
  if (seedCanStart(item)) runSeedSearch(id);

  if (next) {
    activeRecord = newRecordDraft(id);
    updateRecordLevel(item);
    hideExpectationTip();
    updateRecordControls();
  } else {
    clearRecordDraft();
    returnToSummary();
  }

}
/* Keyboard shortcuts for the upgrade page, with no on-screen hints. 1–9 toggle the stats in their listed
   order (HP first), Return saves and goes to the next level (or saves, when there is no next level), and
   Ctrl/⌘+Return saves and ends. Each one clicks the existing button, so disabled states and feedback are
   unchanged. Return on a focused control other than a stat keeps its native meaning. */
document.addEventListener('keydown', e => {
  if (typeof page === 'undefined' || page !== 'record' || !activeRecord || e.repeat || e.isComposing || e.altKey || e.shiftKey) return;
  if (document.querySelector('dialog[open]') || e.target.closest('input,textarea,select,[contenteditable]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (!mod && /^[1-9]$/.test(e.key)) {
    const stat = app.querySelectorAll('.record-page [data-stat]')[Number(e.key) - 1];
    if (stat) { e.preventDefault(); stat.click(); }
    return;
  }
  if (e.key !== 'Enter') return;
  const focused = e.target.closest?.('button,a,summary,[role="button"],[tabindex]');
  if (!mod && focused && !focused.matches('[data-stat]')) return;
  const target = app.querySelector(`.record-page [data-action="${mod ? 'finish' : 'next'}"]`) || app.querySelector('.record-page [data-action="finish"]');
  e.preventDefault();
  if (target && !target.disabled) target.click();
});
function updateRecordFromButton(b) {
  if (b.dataset.stat) {
    const d = activeRecord, s = b.dataset.stat;
    const item = state.roster.find(r => r.id === d.id);
    if (!d.stats.includes(s)) d.stats = [...d.stats, s];
    else if (!d.plus2?.includes(s) && window.RiggingSeed.canPlus2(state, item, char(d.id), d, s)) d.plus2 = [...(d.plus2 || []), s];
    else {
      d.stats = d.stats.filter(x => x !== s);
      if (d.plus2?.includes(s)) d.plus2 = d.plus2.filter(x => x !== s);
      if (!d.plus2?.length) delete d.plus2;
    }
    if (d.queueIndex !== undefined) d.statsEdited = true;
    applyDraftRating(d);
    updateRecordControls();
  }
  if (b.dataset.rating) { activeRecord.happy = b.dataset.rating === 'happy'; activeRecord.ratingSource = 'manual'; updateRecordControls(); }
}
