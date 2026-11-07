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
  const result = window.RiggingActions.saveRecord(state, d);
  if (!result.saved) {
    if (result.reason === 'limit') {
      notify('记录已达上限，请导出备份');
    }
    return;
  }
  const item = result.item, id = d.id;
  activeRecord = null;

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
function updateRecordFromButton(b) {
  if (b.dataset.stat) {
    const d = activeRecord, s = b.dataset.stat;
    d.stats = d.stats.includes(s) ? d.stats.filter(x => x !== s) : [...d.stats, s];
    applyDraftRating(d);
    updateRecordControls();
  }
  if (b.dataset.rating) { activeRecord.happy = b.dataset.rating === 'happy'; activeRecord.ratingSource = 'manual'; updateRecordControls(); }
}
