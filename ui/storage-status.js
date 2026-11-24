/* Storage feedback only. State/conflict policy belongs to the persistence service. */
window.RiggingStorageStatus = (() => {
  let shownIssue = '', hintText = '';
  function draw(issue, previousIssue, lastLocalSave) {
    const banner = document.querySelector('#storage-status');
    shownIssue = issue;
    // A save problem always comes first; the storage hint shows only while there is none.
    if (!issue && hintText) {
      banner.hidden = false;
      if (banner.dataset.hint === hintText && banner.querySelector('[data-storage-action="dismiss"]')) return;
      banner.dataset.hint = hintText;
      banner.innerHTML = `<span>${escapeValue(hintText)}</span><div><button data-storage-action="slots">管理存档</button><button data-storage-action="dismiss">知道了</button></div>`;
      return;
    }
    delete banner.dataset.hint;
    banner.hidden = !issue;
    if (!issue) { banner.replaceChildren(); return; }
    if (previousIssue === issue && banner.childNodes.length && !banner.querySelector('[data-storage-action="dismiss"]')) return;
    const message = issue === 'read' ? '本地记录无法读取，原文件已保留。' : '此页更改尚未保存。';
    const action = issue === 'read' ? '恢复备份' : '重试保存';
    const exportLabel = issue === 'read' && typeof lastLocalSave === 'string' ? '导出原文件' : '导出备份';
    banner.innerHTML = `<span>${message}</span><div><button data-storage-action="${issue === 'read' ? 'import' : 'save'}">${action}</button><button data-storage-action="export">${exportLabel}</button></div>`;
  }
  return {
    render: draw,
    // The 80% storage hint (app.js checkStorageUsage); an empty text takes it away.
    hint(text) {
      hintText = text;
      if (!shownIssue) draw('', '', null);
    }
  };
})();
