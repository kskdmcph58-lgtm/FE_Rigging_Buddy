/* Save slot manager (存档). Opened from the desktop 存档 menu's 管理存档 and the shell's 更多 → 存档. It is the
   属性期望模板 list (features.js openExpectationTemplates) for slots: the same dialog frame and bottom sheet, one
   raised group of rows with hairlines between them, each row the slot (checkmark on this page's, name, people
   and last saved time; tap to switch) and 编辑; 新建 in the header; swipe left to delete in the shell. Storage
   rules live in app.js and core/slots.js. Loaded after app.js. */
const SLOT_CHECK = '<svg class="slot-check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';

function slotTimeText(time) {
  if (!Number.isFinite(time)) return '';
  const date = new Date(time), now = new Date(), pad = value => String(value).padStart(2, '0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `今天 ${clock}`;
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`;
  const day = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === now.getFullYear() ? `${day} ${clock}` : `${date.getFullYear()}年${day}`;
}
function slotMetaText(slot) {
  const people = slot.id === activeSlot ? visibleRoster().length : slot.people;
  return [people === null ? '' : `${people} 人`, slotTimeText(slot.updatedAt)].filter(Boolean).join(' · ');
}

function openSlotManager(trigger) {
  if (document.querySelector('dialog.save-slots[open]')) return;
  closeTransientMenus();
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog expectation-dialog expectation-templates save-slots';
  dialog.setAttribute('aria-labelledby', 'save-slots-title');
  dialog.innerHTML = `<header class="expectation-header"><h2 id="save-slots-title">存档</h2><div class="expectation-tool-actions template-tool-actions"><button data-new-slot aria-haspopup="menu">新建</button></div></header>
    <div class="expectation-body"><div data-template-list></div></div><footer><button data-close autofocus>关闭</button></footer>`;
  animateMobilePickerClose(dialog);
  dialog.querySelector('[data-close]').onclick = () => dialog.close();
  const list = dialog.querySelector('[data-template-list]');
  const newSlot = dialog.querySelector('[data-new-slot]');
  const revealDelete = bindTemplateSwipe(list, () => UI_MEDIA.mobileShell.matches);

  async function confirmDelete(slot) {
    if (!canDeleteSlot(slot.id) || !await confirmRecordDeletion(`删除存档「${slot.name}」？`, '删除', '删除后不能撤回，可先导出备份。')) return false;
    return deleteSlot(slot.id);
  }
  function draw(focusId) {
    revealDelete(null);
    const mobile = UI_MEDIA.mobileShell.matches;
    const entries = document.createElement('ul');
    entries.className = 'expectation-template-list slot-list';
    slotList().forEach(slot => {
      const active = slot.id === activeSlot, deletable = canDeleteSlot(slot.id);
      const entry = document.createElement('li');
      entry.dataset.templateRow = slot.id;
      entry.innerHTML = `<div class="template-swipe-row">${mobile && deletable ? '<button class="danger template-swipe-delete" data-delete-template hidden>删除</button>' : ''}<div class="template-row-main"><button class="expectation-template-name slot-row-name" data-switch-slot${active ? ' aria-current="true"' : ''}>${SLOT_CHECK}<span class="slot-row-text"><span class="slot-row-title">${escapeValue(slot.name)}</span><span class="slot-row-meta">${escapeValue(slotMetaText(slot))}</span></span></button><button data-edit-slot>编辑</button></div></div>`;
      entry.querySelector('[data-switch-slot]').onclick = () => { if (!active) switchSlot(slot.id); };
      entry.querySelector('[data-edit-slot]').onclick = () => editSlot(slot);
      if (mobile && deletable) {
        entry.querySelector('[data-delete-template]').onclick = async () => {
          if (!await confirmDelete(slot)) return;
          draw();
          newSlot.focus({ preventScroll: true });
        };
        entry.addEventListener('keydown', event => {
          if (event.key !== 'Delete') return;
          revealDelete(entry);
          entry.querySelector('[data-delete-template]').focus();
        });
      }
      entries.append(entry);
    });
    list.replaceChildren(entries);
    if (focusId) {
      const row = [...list.querySelectorAll('[data-template-row]')].find(item => item.dataset.templateRow === focusId);
      row?.scrollIntoView({ block: 'nearest' });
      row?.querySelector('[data-switch-slot]').focus({ preventScroll: true });
    }
  }
  function editSlot(slot) {
    revealDelete(null);
    const deletable = canDeleteSlot(slot.id);
    const editor = document.createElement('dialog');
    editor.className = 'app-dialog expectation-dialog slot-editor';
    editor.setAttribute('aria-labelledby', 'slot-editor-title');
    const reason = deletable ? '' : slot.id === activeSlot ? '正在使用的存档不能删除。' : '只剩这一个存档时不能删除。';
    editor.innerHTML = `<header class="expectation-header"><h2 id="slot-editor-title">编辑存档</h2></header><div class="expectation-body"><label class="expectation-field">存档名称<input data-slot-name maxlength="${slots.NAME_LIMIT}" placeholder="${escapeValue(slots.freeName(slotList(), slot.id))}" value="${escapeValue(slot.name)}"></label>${reason ? `<p class="muted">${reason}</p>` : ''}</div><footer><button class="danger" data-delete-slot ${deletable ? '' : 'disabled'}>删除存档</button><button data-close>取消</button><button class="primary" data-save-slot>保存</button></footer>`;
    animateMobilePickerClose(editor);
    const input = editor.querySelector('[data-slot-name]');
    const save = () => { renameSlot(slot.id, input.value); closeExpectationThen(editor, () => draw(slot.id)); };
    editor.querySelector('[data-close]').onclick = () => editor.close();
    editor.querySelector('[data-save-slot]').onclick = save;
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); save(); } });
    editor.querySelector('[data-delete-slot]').onclick = async () => {
      if (await confirmDelete(slot)) closeExpectationThen(editor, () => { draw(); newSlot.focus({ preventScroll: true }); });
    };
    showExpectationDialog(editor, dialog);
    if (!UI_MEDIA.mobileShell.matches) { input.focus(); input.select(); }
  }
  function create(kind) {
    const slot = createSlot({ kind });
    if (slot) draw(slot.id);
  }
  // 新建: a pull-down list under the button (desktop) or an action sheet (shell), as the templates' 另存为 does.
  newSlot.onclick = () => {
    const choices = [{ label: '复制当前存档', run: () => create('copy') }, { label: '新建空存档', run: () => create('empty') }];
    if (UI_MEDIA.mobileShell.matches && window.openActionSheet) { window.openActionSheet([choices], { label: '新建存档', trigger: newSlot }); return; }
    if (styledSelect?.button === newSlot) { closeStyledSelect(true); return; }
    closeStyledSelect();
    const menu = document.createElement('div');
    menu.className = 'select-options';
    menu.id = `select-${M.uid()}`;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '新建存档');
    newSlot.setAttribute('aria-controls', menu.id);
    choices.forEach(choice => {
      const item = document.createElement('button');
      item.type = 'button';
      item.tabIndex = -1;
      item.setAttribute('role', 'menuitem');
      item.textContent = choice.label;
      item.addEventListener('click', event => { event.stopPropagation(); closeStyledSelect(true); choice.run(); });
      menu.append(item);
    });
    showStyledList(newSlot, menu);
    const box = newSlot.getBoundingClientRect();
    menu.style.left = `${Math.max(12, Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 12))}px`;
    if (document.documentElement.dataset.inputMode !== 'keyboard') { menu.tabIndex = -1; menu.focus({ preventScroll: true }); }
  };
  // Slots changed in this page or another one: the list follows at once.
  const follow = () => { if (dialog.open) draw(); };
  document.addEventListener('rigging-slots', follow);
  UI_MEDIA.mobileShell.addEventListener('change', follow);
  dialog.addEventListener('close', () => {
    document.removeEventListener('rigging-slots', follow);
    UI_MEDIA.mobileShell.removeEventListener('change', follow);
    // The menu label and the shell's display settings wait for the dialog to close (app.js refreshSlotLabels).
    setTimeout(refreshSlotLabels);
    if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({ preventScroll: true });
  }, { once: true });
  draw();
  showExpectationDialog(dialog);
}
// The 存档 menu or the 更多 sheet that opened the manager closes first.
function closeTransientMenus() {
  document.querySelectorAll('.action-menu[open]').forEach(menu => { menu.open = false; });
}
