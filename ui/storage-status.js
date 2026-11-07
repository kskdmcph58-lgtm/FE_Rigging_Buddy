/* Storage feedback only. State/conflict policy belongs to the persistence service. */
window.RiggingStorageStatus = {
  render(issue, previousIssue, lastLocalSave) {
    const banner = document.querySelector('#storage-status');
    banner.hidden = !issue;
    if (!issue) { banner.replaceChildren(); return; }
    if (previousIssue === issue && banner.childNodes.length) return;
    const message = issue === 'read' ? '本地记录无法读取，原文件已保留。' : issue === 'conflict' ? '另一页已保存，此页更改尚未保存。' : '此页更改尚未保存。';
    const action = issue === 'read' ? '恢复备份' : issue === 'conflict' ? '保存此页' : '重试保存';
    const exportLabel = issue === 'read' && typeof lastLocalSave === 'string' ? '导出原文件' : '导出备份';
    banner.innerHTML = `<span>${message}</span><div><button data-storage-action="${issue === 'read' ? 'import' : 'save'}">${action}</button><button data-storage-action="export">${exportLabel}</button></div>`;
  }
};
