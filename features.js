/* Selection, expectation editing and reversible deletion. Loaded before app.js. */
// Motion timings. styles.css mirrors them as --motion-* and --ease-standard.
const MOTION = { fast: 100, medium: 120, base: 160, large: 200, ease: 'cubic-bezier(.16,1,.3,1)' };
function motionAllowed() { return !UI_MEDIA.reducedMotion.matches; }
// The dialog's result is already delivered; it stays only for its CSS fade and ignores input.
function retireDialog(dialog) {
  if (motionAllowed()) setTimeout(() => dialog.remove(), MOTION.fast + 40);
  else dialog.remove();
}
// Keep mobile sheets (pickers, card options, expectations) in the top layer until their exit finishes,
// preserving their open layout.
// Every exit (including native Escape) uses the same path; close callbacks still run exactly once.
function animateMobilePickerClose(dialog) {
  const close = dialog.close.bind(dialog);
  let leaving = false;
  dialog.close = (...args) => {
    if (leaving) return;
    const group = dialog.pickerGroupExit;
    if (!dialog.open || (!UI_MEDIA.mobileShell.matches && !group) || !motionAllowed()) { close(...args); return; }
    leaving = true;
    const style = getComputedStyle(dialog);
    const from = { transform: style.transform, opacity: style.opacity };
    dialog.getAnimations().forEach(animation => animation.cancel());
    dialog.inert = true;
    const sheet = UI_MEDIA.narrowLayout.matches;
    const duration = group?.duration ?? (sheet ? 220 : MOTION.medium);
    dialog.style.setProperty('--m-picker-exit-duration', `${duration}ms`);
    dialog.classList.add('m-picker-leaving');
    const animation = dialog.animate([from, {
      transform: sheet ? `translateY(${group ? `${group.distance}px` : 'calc(100% + 24px)'})` : from.transform,
      opacity: sheet ? 1 : 0
    }], {
      id: 'mobile-picker-exit', duration,
      easing: sheet ? 'cubic-bezier(.4,0,1,1)' : MOTION.ease, fill: 'forwards'
    });
    if (group?.startTime != null) animation.startTime = group.startTime;
    const finish = () => close(...args);
    animation.finished.then(finish, finish);
  };
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    dialog.close();
  });
}
// Mobile only: a tap on the dimmed area outside the dialog acts like Esc (back one step). Under a stack only the
// top step is outside the inert part, so it alone hears the tap. A drag that starts inside never counts.
function closeOnOutsideTap(dialog, allowed = () => true) {
  let pressedOutside = false;
  const outside = event => {
    const box = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
  };
  dialog.addEventListener('pointerdown', event => { pressedOutside = UI_MEDIA.mobileShell.matches && outside(event); });
  dialog.addEventListener('click', event => {
    const close = pressedOutside && outside(event);
    pressedOutside = false;
    if (close && allowed() && dialog.open) dialog.close();
  });
}
// Each step remains mounted under the next modal. Only the root paints a dimmed backdrop.
function createPickerStack() {
  const dialogs = [];
  const stack = {
    closing: false,
    add(dialog) {
      dialogs.at(-1)?.classList.add('picker-stack-covered');
      dialog.classList.add(dialogs.length ? 'picker-stack-layer' : 'picker-stack-root');
      dialogs.push(dialog);
      closeOnOutsideTap(dialog, () => !stack.closing);
      dialog.addEventListener('close', () => {
        const index = dialogs.indexOf(dialog);
        if (index !== -1) dialogs.splice(index, 1);
        if (!stack.closing) {
          const parent = dialogs.at(-1);
          parent?.classList.remove('picker-stack-covered');
          const selected = parent?.querySelector('[aria-pressed="true"], .better-entry.selected .better-class-pick');
          (selected || parent?.querySelector('.profession-option, [data-dismiss], [data-back]'))?.focus({ preventScroll: true });
        }
      }, { once: true });
    },
    closeAll() {
      if (stack.closing) return stack.finished;
      stack.closing = true;
      const open = dialogs.filter(dialog => dialog.open);
      const group = { duration: 220, startTime: document.timeline.currentTime,
        distance: Math.max(0, ...open.map(dialog => dialog.getBoundingClientRect().height)) + 24 };
      stack.finished = Promise.all(open.map(dialog => new Promise(resolve => {
        dialog.pickerGroupExit = group;
        dialog.addEventListener('close', resolve, { once: true });
        dialog.close();
      })));
      return stack.finished;
    }
  };
  return stack;
}
function captureList(withChips = true) {
  const entries = new Map();
  app.querySelectorAll('[data-sort-id]').forEach(row => {
    const rowRect = row.getBoundingClientRect();
    entries.set(`row:${row.dataset.sortId}`, { node: row, rect: rowRect });
    if (withChips) row.querySelectorAll('.record-chip').forEach(chip => {
      entries.set(`chip:${chip.dataset.edit}:${chip.dataset.index}`, { node: chip, rect: chip.getBoundingClientRect(), rowRect, rowKey: `row:${row.dataset.sortId}`, railRect: chip.closest('.records').getBoundingClientRect() });
    });
    row.getAnimations().forEach(animation => { if (animation.id === 'list-change') animation.cancel(); });
    if (withChips) row.querySelectorAll('.record-chip').forEach(chip => chip.getAnimations().forEach(animation => { if (animation.id === 'list-change') animation.cancel(); }));
  });
  return entries;
}
function listRectVisible(rect) { return rect.bottom > 0 && rect.top < innerHeight; }
function fadeOutRemoved(entry, host) {
  const ghost = entry.node.cloneNode(true);
  // A plain visual copy: nothing in it can be found, focused or clicked.
  ['data-sort-id', 'data-edit', 'data-index', 'tabindex', 'aria-label'].forEach(name => ghost.removeAttribute(name));
  ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true; ghost.classList.add('list-ghost');
  ghost.style.left = `${entry.rect.left}px`; ghost.style.top = `${entry.rect.top}px`;
  ghost.style.width = `${entry.rect.width}px`; ghost.style.height = `${entry.rect.height}px`;
  host.append(ghost);
  ghost.animate({ opacity: [1, 0] }, { duration: MOTION.base, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ghost.remove();
}
// Rows and record cards glide from where they were; arrivals fade in and departures fade out.
function playListChange(before, { chips = true, settleIds = [] } = {}) {
  if (!motionAllowed()) return;
  const after = captureList(chips);
  const options = { id: 'list-change', duration: MOTION.base, easing: MOTION.ease };
  after.forEach((entry, key) => {
    const old = before.get(key);
    if (!old) {
      // A new card inside a new row arrives with that row.
      const arrivesAlone = !entry.rowKey || before.has(entry.rowKey);
      if (arrivesAlone && listRectVisible(entry.rect)) entry.node.animate({ opacity: [0, 1] }, options);
      return;
    }
    if (!entry.rowKey && settleIds.includes(key.slice(4))) {
      // The drag preview already showed the journey; the dropped row only settles in place.
      entry.node.animate({ opacity: [.35, 1] }, options);
      return;
    }
    // Card offsets are relative to the row, which carries its own glide.
    const x = old.rect.left - entry.rect.left - (entry.rowKey ? old.rowRect.left - entry.rowRect.left : 0);
    const y = old.rect.top - entry.rect.top - (entry.rowKey ? old.rowRect.top - entry.rowRect.top : 0);
    if ((Math.abs(x) > 1 || Math.abs(y) > 1) && (listRectVisible(old.rect) || listRectVisible(entry.rect))) {
      entry.node.animate({ transform: [`translate(${x}px,${y}px)`, 'none'] }, options);
    }
  });
  const host = app.querySelector('.journals') || after.values().next().value?.node.parentElement;
  if (!host) return;
  before.forEach((entry, key) => {
    if (after.has(key) || !listRectVisible(entry.rect)) return;
    // A departing row already carries its cards, and a card scrolled partly out of its rail would overflow.
    if (entry.rowKey) {
      const rail = entry.railRect;
      if (!after.has(entry.rowKey) || entry.rect.left < rail.left - 1 || entry.rect.right > rail.right + 1) return;
    }
    fadeOutRemoved(entry, host);
  });
}
function animateListChange(change) {
  if (!motionAllowed()) { change(); return; }
  const from = renderedPage, before = captureList();
  change();
  if (renderedPage === from) playListChange(before);
}
const rowSelection = new Set();
let selectionPage = '', selectionAnchor = null, multiSelectMode = false;
const compactSelectionToolbar = UI_MEDIA.compactSelection;
const defaultRuleText = '默认：0–3 点不满意，4–9 点满意。';
function clearRowSelection() { rowSelection.clear(); selectionAnchor = null; multiSelectMode = false; }
function rowIds() { return page === 'levels' ? state.selection : visibleRoster().map(item => item.id); }
function dragGrip() { return '<svg viewBox="0 0 16 24" width="16" height="24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="6" r="2"/><circle cx="11" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="11" cy="12" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="11" cy="18" r="2"/></svg>'; }
function selectionToolbar(withToggle = true) {
  return `<div class="selection-toolbar-anchor"><div class="selection-toolbar-backdrop" aria-hidden="true"></div><div class="selection-toolbar">${withToggle ? '<button data-action="multi-select" aria-pressed="false">多选</button>' : ''}<span class="selection-count" aria-live="polite"></span><button class="danger" data-action="delete-selected-characters" hidden>删除人物</button><div class="selection-actions" hidden><button data-action="select-all-rows">全选</button><button data-action="invert-rows">反选</button><button data-action="clear-row-selection">取消选择</button>${page === 'levels' ? '<button data-action="batch-profession" aria-haspopup="dialog">设置兵种</button>' : ''}<button data-action="batch-expectation">设置属性期望</button></div></div></div>`;
}
function layoutCompactSelectionToolbar(toolbar) {
  if (!compactSelectionToolbar.matches) { toolbar.classList.remove('selection-single-row'); return; }
  const toggle = toolbar.querySelector('[data-action="multi-select"]');
  const actions = toolbar.querySelector('.selection-actions');
  const count = toolbar.querySelector('.selection-count');
  const remove = toolbar.querySelector('[data-action="delete-selected-characters"]');
  if (!toggle || !actions || !count) return;
  const buttons = [...actions.querySelectorAll('button')];
  const text = document.createRange(); text.selectNodeContents(count);
  const actionWidth = buttons.reduce((width, button) => width + button.offsetWidth, 0)
    + Math.max(0, buttons.length - 1) * (parseFloat(getComputedStyle(actions).columnGap) || 0);
  const required = toggle.offsetWidth + actionWidth + text.getBoundingClientRect().width
    + (remove && !remove.hidden ? remove.offsetWidth + 8 : 0) + 16;
  const single = !actions.hidden && toolbar.clientWidth >= required + 2;
  toolbar.classList.toggle('selection-single-row', single);
  const order = single ? [toggle, actions, count, remove] : [toggle, count, remove, actions];
  order.filter(Boolean).forEach((node, index) => {
    if (toolbar.children[index] !== node) toolbar.insertBefore(node, toolbar.children[index] || null);
  });
}
function updateFloatingSelectionBar() {
  app.querySelectorAll('.selection-toolbar-anchor').forEach(anchor => {
    const toolbar = anchor.querySelector('.selection-toolbar');
    const rect = anchor.getBoundingClientRect();
    const floating = multiSelectMode && ['summary', 'levels'].includes(page) && rect.top < 8;
    const wasFloating = anchor.classList.contains('is-floating');
    if (floating) {
      // Keep the original slot in the layout and move the actual controls, so
      // their horizontal positions, focus and delegated actions stay intact.
      toolbar.style.setProperty('--selection-left', `${rect.left}px`);
      toolbar.style.setProperty('--selection-width', `${rect.width}px`);
      anchor.classList.add('is-floating');
      layoutCompactSelectionToolbar(toolbar);
      anchor.style.height = `${toolbar.offsetHeight}px`;
      anchor.style.setProperty('--selection-bar-height', `${toolbar.offsetHeight + 16}px`);
      if (!wasFloating && motionAllowed()) {
        toolbar.animate([{ transform: 'translateY(calc(-100% - 8px))' }, { transform: 'translateY(0)' }],
          { duration: MOTION.medium, easing: MOTION.ease });
        anchor.querySelector('.selection-toolbar-backdrop').animate(
          [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }],
          { duration: MOTION.medium, easing: MOTION.ease });
      }
    } else {
      anchor.classList.remove('is-floating'); anchor.style.height = '';
      toolbar.getAnimations().forEach(animation => animation.cancel());
      anchor.querySelector('.selection-toolbar-backdrop').getAnimations().forEach(animation => animation.cancel());
      toolbar.style.removeProperty('--selection-left'); toolbar.style.removeProperty('--selection-width');
      layoutCompactSelectionToolbar(toolbar);
    }
  });
}
let selectionBarFrame = 0;
window.addEventListener('scroll', () => {
  if (selectionBarFrame) return;
  selectionBarFrame = requestAnimationFrame(() => { selectionBarFrame = 0; updateFloatingSelectionBar(); });
}, { passive: true });
/* Entering or leaving multi-select swaps toolbar controls and adds the row checks. On desktop the ones that
   appear fade in; the ones that leave go at once. Returns the call that runs the fade after the change. */
const REVEAL_SCOPE = '.summary-top>*,.summary-top button,.toolbar>*,.toolbar button,.row-select';
function revealAfterChange() {
  if (!motionAllowed() || UI_MEDIA.mobileShell.matches) return null;
  const shown = el => el.getClientRects().length > 0;
  const before = new Set([...app.querySelectorAll(REVEAL_SCOPE)].filter(shown));
  return () => {
    const fresh = [...app.querySelectorAll(REVEAL_SCOPE)].filter(el => shown(el) && !before.has(el));
    for (const el of fresh) if (!fresh.some(other => other !== el && other.contains(el))) el.animate({ opacity: [0, 1] }, { duration: MOTION.medium, easing: 'ease-out' });
  };
}
function refreshRowSelection() {
  if (selectionPage !== page) { clearRowSelection(); selectionPage = page; }
  const ids = rowIds();
  for (const id of rowSelection) if (!ids.includes(id)) rowSelection.delete(id);
  if (rowSelection.size) multiSelectMode = true;
  const reveal = app.classList.contains('multi-select-mode') !== multiSelectMode ? revealAfterChange() : null;
  app.classList.toggle('multi-select-mode', multiSelectMode);
  app.querySelectorAll('[data-sort-id]').forEach(row => {
    const selected = rowSelection.has(row.dataset.sortId);
    row.classList.toggle('row-selected', selected);
    let check = row.querySelector('.row-select');
    if (!check) {
      check = document.createElement('button'); check.className = 'row-select';
      check.dataset.rowSelect = row.dataset.sortId;
      check.setAttribute('aria-label', `选择${char(row.dataset.sortId).name}`);
      row.prepend(check);
    }
    check.setAttribute('aria-pressed', String(selected));
    check.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>';
    const image = row.querySelector('img');
    const avatar = image?.getBoundingClientRect().width ? image : row.querySelector('strong');
    if (row.matches('.level-row') && UI_MEDIA.narrowLayout.matches) check.style.top = '48px';
    else if (row.matches('.journal') && UI_MEDIA.wideJournalSelection.matches) check.style.top = '';
    else if (avatar) check.style.top = `${avatar.getBoundingClientRect().top - row.getBoundingClientRect().top + avatar.offsetHeight / 2 - (UI_MEDIA.narrowLayout.matches ? 22 : 10)}px`;
  });
  app.querySelectorAll('[data-action="multi-select"]').forEach(b => {
    b.textContent = multiSelectMode ? '完成多选' : '多选'; b.setAttribute('aria-pressed', String(multiSelectMode));
  });
  app.querySelectorAll('.selection-count').forEach(el => el.textContent = multiSelectMode || rowSelection.size ? `已选 ${rowSelection.size} 位` : '');
  app.querySelectorAll('.selection-actions').forEach(el => el.hidden = !rowSelection.size && !multiSelectMode);
  app.querySelectorAll('[data-action="batch-expectation"],[data-action="batch-profession"]').forEach(b => b.disabled = !rowSelection.size);
  app.querySelectorAll('[data-action="delete-selected-characters"]').forEach(b => {
    b.disabled = !rowSelection.size; b.hidden = !multiSelectMode;
  });
  // Match visual and keyboard order while keeping the desktop toggle anchored.
  app.querySelectorAll('.selection-toolbar').forEach(toolbar => {
    const toggle = toolbar.querySelector('[data-action="multi-select"]');
    const actions = toolbar.querySelector('.selection-actions');
    const count = toolbar.querySelector('.selection-count');
    const remove = toolbar.querySelector('[data-action="delete-selected-characters"]');
    if (!toggle || !actions) return;
    if (!compactSelectionToolbar.matches) {
      toolbar.prepend(actions);
      if (remove) toolbar.insertBefore(remove, count);
      toolbar.append(toggle);
    } else {
      toolbar.prepend(toggle); toolbar.insertBefore(count, toggle.nextSibling);
      if (remove) toolbar.insertBefore(remove, count.nextSibling);
      toolbar.append(actions);
    }
  });
  updateFloatingSelectionBar();
  if (page === 'summary') refreshRecordRails();
  if (page === 'levels') refreshSetupExpectationSummaries();
  reveal?.();
}
function selectRow(id, event = {}) {
  const ids = rowIds(), additive = event.ctrlKey || event.metaKey;
  multiSelectMode = true;
  if (event.shiftKey && selectionAnchor && ids.includes(selectionAnchor)) {
    if (!additive) rowSelection.clear();
    const a = ids.indexOf(selectionAnchor), b = ids.indexOf(id);
    ids.slice(Math.min(a,b), Math.max(a,b) + 1).forEach(value => rowSelection.add(value));
  } else {
    rowSelection.has(id) ? rowSelection.delete(id) : rowSelection.add(id);
    selectionAnchor = id;
  }
  refreshRowSelection();
}
function movingIds(id) { return rowSelection.has(id) ? rowIds().filter(value => rowSelection.has(value)) : [id]; }
function markMoving(id) {
  const ids = movingIds(id);
  document.querySelector('#drag-preview')?.remove();
  const preview = document.createElement('div');
  preview.id = 'drag-preview'; preview.setAttribute('aria-hidden', 'true'); preview.inert = true;
  // Keep document order, with the first selected character in front.
  ids.slice(0, 4).forEach((value, index) => {
    const layer = document.createElement('div'); layer.className = 'drag-preview-card';
    layer.style.setProperty('--layer', index); layer.style.zIndex = 4 - index;
    const character = char(value);
    layer.innerHTML = `${portrait(character)}<strong>${escapeValue(character.name)}</strong>`;
    preview.append(layer);
  });
  document.body.append(preview);
  document.body.classList.add('sorting-cards');
  app.querySelectorAll('[data-sort-id]').forEach(row => row.classList.toggle('dragging', ids.includes(row.dataset.sortId)));
  let badge = document.querySelector('#drag-count');
  if (!badge) { badge = document.createElement('div'); badge.id = 'drag-count'; badge.setAttribute('role','status'); document.body.append(badge); }
  badge.textContent = `移动 ${ids.length} 位人物`;
}
function positionDragPreview(x, y) {
  const preview = document.querySelector('#drag-preview'); if (!preview) return;
  const width = preview.offsetWidth + (preview.children.length - 1) * 12;
  const height = 68 + (preview.children.length - 1) * 22;
  preview.style.left = `${Math.max(8, Math.min(x + 18, innerWidth - width - 8))}px`;
  preview.style.top = `${Math.max(8, Math.min(y + 18, innerHeight - height - 8))}px`;
}
function clearMoving() {
  document.querySelector('#drag-count')?.remove(); document.querySelector('#drag-preview')?.remove();
  document.body.classList.remove('sorting-cards');
  app.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
}

// Pointer selection excludes sorting targets and interactive controls.
let marquee = null;
function refreshCharacterSelection() {
  app.querySelectorAll('[data-character]').forEach(card=>{
    const id=card.dataset.character, selected=state.selection.includes(id);
    card.classList.toggle('selected',selected);card.setAttribute('aria-pressed',String(selected));
  });
  updateSelectionCount();
}
function finishMarquee(cancel = false) {
  const m = marquee; if (!m) return;
  marquee = null; cancelAnimationFrame(m.frame);
  m.box?.remove(); document.body.classList.remove('marquee-selecting');
  if (m.active) {
    if(m.characters) {
      if(cancel)state.selection=[...m.before];
      else {
        state.selection.forEach(id=>{
          const archived=state.roster.find(item=>item.id===id&&item.deleted);
          if(!archived)return;
          if(!Object.hasOwn(state.initialLevels,id))state.initialLevels[id]=archived.initialLevel??'';
          state.draftExpectations||={};
          if(!Object.hasOwn(state.draftExpectations,id))state.draftExpectations[id]=M.copy(M.ruleAt(archived,M.nextSeq(archived)));
        });
        rememberSearch();
      }
      refreshCharacterSelection();
    } else {
      rowSelection.clear();
      (cancel ? m.before : m.pending || m.before).forEach(id => rowSelection.add(id));
      multiSelectMode = cancel ? m.mode : m.mode || rowSelection.size > 0;
    }
    suppressGestureClickUntil = Date.now() + 400;
    if (app.hasPointerCapture(m.pointer)) app.releasePointerCapture(m.pointer);
    if(!m.characters)refreshRowSelection();
  }
}
function updateMarquee() {
  const m = marquee; if (!m?.active) return;
  const x = m.clientX + scrollX, y = m.clientY + scrollY;
  const left = Math.min(m.x, x), top = Math.min(m.y, y), right = Math.max(m.x,x), bottom = Math.max(m.y,y);
  Object.assign(m.box.style, {left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
  if(m.characters) {
    const selection=new Set(m.before);
    app.querySelectorAll('[data-character]:not(:disabled):not([hidden])').forEach(card=>{
      const r=card.getBoundingClientRect(),id=card.dataset.character;
      if(r.right+scrollX>left&&r.left+scrollX<right&&r.bottom+scrollY>top&&r.top+scrollY<bottom) {
        if(m.before.has(id))selection.delete(id);else selection.add(id);
      }
    });
    state.selection=[...selection];refreshCharacterSelection();return;
  }
  const selection = m.add || m.toggle ? new Set(m.before) : new Set();
  app.querySelectorAll('[data-sort-id]').forEach(row => {
    const r = row.getBoundingClientRect(), id = row.dataset.sortId;
    if (r.right+scrollX>left && r.left+scrollX<right && r.bottom+scrollY>top && r.top+scrollY<bottom) {
      if (m.toggle && m.before.has(id)) selection.delete(id); else selection.add(id);
    }
    row.classList.toggle('row-selected', selection.has(id));
  });
  // Preview the hit rows without changing layout or opening selection controls.
  // Commit only on release; an empty drag must not enter multi-select mode.
  m.pending = selection;
}
document.addEventListener('pointerdown', e => {
  if (e.defaultPrevented) return;
  if (e.pointerType !== 'mouse' || e.button !== 0 || !['select','levels','summary'].includes(page) || document.querySelector('dialog[open]')) return;
  // The phone layout selects by tapping; box selection is desktop only.
  if (UI_MEDIA.mobileShell.matches) return;
  if (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight) return;
  const character=page==='select'&&e.target.closest('[data-character]:not(:disabled)');
  if (!character&&e.target.closest('button,input,select,textarea,a,label,summary,[role="button"],[contenteditable],.drag-grip,.menu-panel,.select-options,.selection-toolbar-backdrop')) return;
  marquee = {characters:page==='select',pointer:e.pointerId,x:e.pageX,y:e.pageY,clientX:e.clientX,clientY:e.clientY,before:new Set(page==='select'?state.selection:rowSelection),mode:multiSelectMode,add:e.shiftKey,toggle:e.ctrlKey||e.metaKey};
  e.preventDefault();
});
document.addEventListener('pointermove', e => {
  const m=marquee; if (!m || e.pointerId!==m.pointer) return;
  m.clientX=e.clientX; m.clientY=e.clientY;
  if (!m.active && Math.hypot(e.pageX-m.x,e.pageY-m.y)<5) return;
  if (!m.active) {
    m.active=true; m.box=document.createElement('div'); m.box.className='selection-marquee';
    document.body.append(m.box); document.body.classList.add('marquee-selecting'); app.setPointerCapture(m.pointer);
    const tick=()=>{if(marquee!==m)return; const speed=m.clientY<48?-Math.ceil((48-m.clientY)/5):m.clientY>innerHeight-48?Math.ceil((m.clientY-innerHeight+48)/5):0;if(speed)scrollBy(0,speed);updateMarquee();m.frame=requestAnimationFrame(tick);};
    m.frame=requestAnimationFrame(tick);
  }
  updateMarquee(); e.preventDefault();
});
document.addEventListener('pointerup', e=>{if(marquee?.pointer===e.pointerId)finishMarquee();});
document.addEventListener('pointercancel', ()=>finishMarquee(true));
window.addEventListener('blur', ()=>finishMarquee(true));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&marquee){finishMarquee(true);e.stopImmediatePropagation();}},true);
window.addEventListener('resize',()=>{if(typeof page!=='undefined'&&['levels','summary'].includes(page))refreshRowSelection();});

function softDelete(objects) {
  window.RiggingActions.softDelete(state, objects);
  queueMicrotask(() => showUndoNotice(objects.length));
}
function showUndoNotice(count) {
  notify('');
  const notice = document.querySelector('#notice');
  notice.textContent = `已删除 ${count} 项 `;
  const button = document.createElement('button'); button.textContent = '撤回'; button.onclick = undoDelete;
  notice.append(button); dismissNoticeAfter(8000);
}
function undoDelete() {
  if (!window.RiggingActions.undoDelete(storyRoster())) return;
  state.selection = state.selection.filter(id => !visibleRoster().some(item => item.id === id));
  page = 'summary'; activeRecord = null; animateListChange(render); notify('');
}

function choiceDialog(question, choices, description = '') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog'); dialog.className = 'app-dialog choice-dialog';
    const titleId = `choice-${M.uid()}`;
    dialog.innerHTML = `<h2 id="${titleId}">${escapeValue(question)}</h2>${description ? `<p id="${titleId}-description" class="choice-description">${escapeValue(description)}</p>` : ''}<form method="dialog"><fieldset class="choice-list"><legend class="visually-hidden">${escapeValue(question)}</legend>${choices.map((c,i) => `<label class="choice-option"><input type="radio" name="choice" value="${escapeValue(c.value)}" ${i === 0 ? 'checked autofocus' : ''}><span><strong>${escapeValue(c.label)}</strong>${c.description ? `<span class="choice-detail">${escapeValue(c.description)}</span>` : ''}</span></label>`).join('')}</fieldset><div class="choice-actions"><button type="button" value="cancel">返回</button><button class="primary" value="apply">应用</button></div></form>`;
    dialog.querySelector('button[value="cancel"]').onclick = () => dialog.close('cancel');
    dialog.setAttribute('aria-labelledby',titleId);
    if (description) dialog.setAttribute('aria-describedby',`${titleId}-description`);
    dialog.addEventListener('close', () => {
      const value = dialog.returnValue === 'apply' ? dialog.querySelector('input[name="choice"]:checked')?.value : 'cancel';
      retireDialog(dialog); resolve(value || 'cancel');
    }, { once:true });
    document.body.append(dialog); dialog.showModal();
  });
}
function draftRule(d) { return window.RiggingActions.draftRule(state, d); }
function newRecordDraft(id) { return window.RiggingActions.newRecordDraft(state, id); }

function recordExpectationMarkup() {
  const rule = draftRule(activeRecord);
  return rule ? ruleMarkup(rule) : `<p class="rule-default">${defaultRuleText}</p>`;
}
function openRecordExpectationDetails() {
  hideExpectationTip();
  const dialog=document.createElement('dialog');dialog.className='app-dialog expectation-dialog';animateMobilePickerClose(dialog);closeOnOutsideTap(dialog);
  dialog.setAttribute('aria-labelledby','record-expectation-title');
  dialog.innerHTML=`<header><h2 id="record-expectation-title">属性期望</h2></header><div class="expectation-body">${recordExpectationMarkup()}</div><footer><button data-close autofocus>关闭</button><button class="primary" data-edit-expectation>编辑期望</button></footer>`;
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-edit-expectation]').onclick=()=>{const id=activeRecord.id;dialog.close();openExpectationEditor([id]);};
  dialog.addEventListener('close',()=>retireDialog(dialog),{once:true});
  document.body.append(dialog);dialog.showModal();
}
function applyDraftRating(d) {
  // Evaluate on stats/rule changes only; rendering and manual clicks never re-run it.
  window.RiggingActions.applyDraftRating(state, d);
}

function ruleMarkup(rule, depth = 0) {
  if (!rule) return '<p class="rule-default">使用默认判定</p>';
  if (rule.type === 'stat') return `<span>${escapeValue(rule.stat)}提升</span>`;
  if (rule.type === 'total') return `<span>总点数${{gt:'大于',gte:'至少',lt:'少于',lte:'至多'}[rule.op]} ${rule.value} 点</span>`;
  if (rule.type === 'not') return `<div class="rule-description depth-${depth % 3}"><b>不满足以下条件</b>${ruleMarkup(rule.child, depth+1)}</div>`;
  return `<div class="rule-description depth-${depth % 3}"><b>${rule.type === 'all' ? '全部满足' : '至少满足一项'}</b><ul>${rule.children.map(n => `<li>${ruleMarkup(n, depth+1)}</li>`).join('')}</ul></div>`;
}
function ruleSummary(rule) {
  if (!rule) return '未设置';
  if (rule.type === 'stat') return `${rule.stat}提升`;
  if (rule.type === 'total') return `总点数 ${{gt:'>',gte:'≥',lt:'<',lte:'≤'}[rule.op]} ${rule.value}`;
  if (rule.type === 'not') return '排除指定条件';
  return `${rule.type === 'all' ? '全部满足' : '任一满足'} · ${rule.children.length} 项条件`;
}
function expectationLink(item, editing) {
  const configured = item.expectations?.some(range => range.rule);
  return `<button class="expectation-link" ${!configured && !editing ? 'style="visibility:hidden" aria-hidden="true" tabindex="-1"' : ''} data-expectation-detail="${item.id}">${configured ? '属性期望' : '设置属性期望'}</button>`;
}
function expectationRanges(item) {
  const ranges = item.expectations || [];
  if (!ranges.length) return ruleMarkup(null);
  const hasInitial = Number.isInteger(item.initialLevel);
  // A skipped attempt shares the next effective level; deleted attempts do not advance it.
  const boundaryLevel = seq => item.initialLevel + item.records.filter(r => r.seq < seq && !r.deleted && r.status !== 'skipped').length + 1;
  return ranges.map((range,i) => {
    const end = ranges[i+1]?.from - 1;
    const startLabel = hasInitial ? `LV ${boundaryLevel(range.from)}` : `记录 +${range.from}`;
    const endLabel = hasInitial ? `LV ${boundaryLevel(end)}` : `+${end}`;
    return `<section class="expectation-range"><h3>${startLabel}${Number.isFinite(end) ? ` 至 ${endLabel}` : ' 起'}</h3>${ruleMarkup(range.rule)}</section>`;
  }).join('');
}
function openExpectationDetails(id) {
  hideExpectationTip();
  const item = state.roster.find(r => r.id === id);
  if (!item.expectations?.length) { openExpectationEditor([id]); return; }
  const dialog = document.createElement('dialog'); dialog.className = 'app-dialog expectation-dialog';animateMobilePickerClose(dialog);closeOnOutsideTap(dialog);
  dialog.innerHTML = `<header><h2 id="expectation-detail-title">${char(id).name} · 属性期望</h2></header><div class="expectation-body"><p class="muted">未覆盖区间使用默认判定。${Number.isInteger(item.initialLevel) ? '显示等级随初始等级、跳过和删除重新计算，规则仍对应原记录范围。' : '未填写初始等级，范围以记录序号显示。'}</p>${expectationRanges(item)}</div><footer><button data-close autofocus>关闭</button><button class="primary" data-edit-expectation>编辑期望</button></footer>`;
  dialog.setAttribute('aria-labelledby','expectation-detail-title');
  dialog.addEventListener('close',()=>retireDialog(dialog),{once:true});
  dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.querySelector('[data-edit-expectation]').onclick=()=>{dialog.close();openExpectationEditor([id]);};
  document.body.append(dialog);dialog.showModal();
}

async function saveExpectations(ids, rule) {
  const draft = page==='record' && activeRecord && ids.includes(activeRecord.id) ? activeRecord : null;
  const previousRule = draft ? JSON.stringify(draftRule(draft)) : null;
  if (page === 'levels') {
    state.draftExpectations ||= {};
    ids.forEach(id => state.draftExpectations[id] = M.copy(rule));
    return true;
  }
  const items = visibleRoster().filter(i => ids.includes(i.id));
  const history = items.flatMap(item => M.live(item).map(record => ({ item, record })));
  const ratingChanges = record => {
    const result = M.evaluate(rule, record.stats);
    return result === null ? !record.ratingPending : !!record.ratingPending || result !== record.happy;
  };
  const changesHistory = history.some(({ item, record }) =>
    JSON.stringify(M.ruleAt(item, record.seq)) !== JSON.stringify(rule) || record.ratingSource === 'auto' && ratingChanges(record));
  let scope = 'future';
  let overwrite = false;
  // No live history, or the same effective history: there is nothing to decide.
  if (changesHistory) {
    const records = history.map(({ record }) => record);
    const automatic = records.filter(record => record.ratingSource === 'auto');
    const protectedRecords = records.filter(record => record.ratingSource !== 'auto');
    const conflicts = protectedRecords.filter(ratingChanges);
    const sourceLabel = records => {
      const manual = records.some(record => record.ratingSource === 'manual');
      const legacy = records.some(record => record.ratingSource !== 'manual');
      return manual && legacy ? '手动及旧存档评价' : manual ? '手动评价' : '旧存档评价';
    };
    const protectedLabel = sourceLabel(protectedRecords);
    const historyDescription = '历史和今后记录均使用新规则。' +
      (automatic.length ? '历史自动评价重算。' : '') +
      (protectedRecords.length ? `${protectedLabel}保留。` : '');
    const answer = await choiceDialog('属性期望应用范围', [
      {value:'future',label:'仅今后的记录',description:'从下一条记录起使用新规则，历史规则和评价不变。'},
      {value:'history',label:protectedRecords.length ? `包含历史，保留${protectedLabel}` : '包含历史记录',description:historyDescription},
      ...(conflicts.length ? [{value:'replace',label:'包含历史，重算全部评价',description:`历史和今后记录均使用新规则；所有历史评价重算，其中 ${conflicts.length} 条${sourceLabel(conflicts)}将改变。`}] : [])
    ], '将保存当前属性期望。请选择是否将新规则同时用于已有记录。');
    if (!['future','history','replace'].includes(answer)) return false;
    scope = answer === 'future' ? 'future' : 'history';
    overwrite = answer === 'replace';
  }
  window.RiggingActions.setExpectations(items, rule, scope === 'history', overwrite);
  if(draft && activeRecord===draft && JSON.stringify(draftRule(draft))!==previousRule) {
    applyDraftRating(draft);
  }
  return true;
}

let styledSelect = null;
function closeStyledSelect(restore = false) {
  if (!styledSelect) return;
  const {button, list} = styledSelect;
  styledSelect = null; button.setAttribute('aria-expanded','false');
  // Desktop lists fade out like menus (motion.css); the phone shell and reduced motion close at once.
  if (motionAllowed() && !UI_MEDIA.mobileShell.matches && list.isConnected) {
    list.classList.add('is-leaving'); list.inert = true;
    setTimeout(() => list.remove(), MOTION.medium);
  } else list.remove();
  if (restore && button.isConnected) button.focus({preventScroll:true});
}
function enhanceSelects(root) {
  root.querySelectorAll('select:not(.styled-select-source)').forEach(select=>{
    select.classList.add('styled-select-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
    const button=document.createElement('button');button.type='button';button.className='select-trigger';
    button.setAttribute('aria-label',`${select.getAttribute('aria-label')}：${select.selectedOptions[0]?.textContent||''}`);
    button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');
    const label=document.createElement('span');label.textContent=select.selectedOptions[0]?.textContent||'';button.append(label);
    button.insertAdjacentHTML('beforeend','<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>');
    select.after(button);
    function open() {
      if(styledSelect?.button===button){closeStyledSelect(true);return;}
      closeStyledSelect();
      const list=document.createElement('div');list.className='select-options';list.setAttribute('role','listbox');
      list.id=`select-${M.uid()}`;list.setAttribute('aria-label',select.getAttribute('aria-label'));button.setAttribute('aria-controls',list.id);
      const opts=[...select.options].filter(o=>o.value!==''||!select.hasAttribute('data-add'));
      opts.forEach(option=>{
        const item=document.createElement('button');item.type='button';item.setAttribute('role','option');item.tabIndex=-1;
        item.textContent=option.textContent;item.disabled=option.disabled;item.setAttribute('aria-selected',String(option.selected));
        item.addEventListener('click',e=>{e.stopPropagation();select.value=option.value;closeStyledSelect(true);select.dispatchEvent(new Event('change',{bubbles:true}));});list.append(item);
      });
      (select.closest('dialog')||document.body).append(list);
      styledSelect={button,list};button.setAttribute('aria-expanded','true');
      const r=button.getBoundingClientRect(), availableBelow=innerHeight-r.bottom-12, availableAbove=r.top-12;
      list.style.width=`${Math.min(innerWidth-24,Math.max(r.width,list.scrollWidth+2))}px`;
      list.style.maxHeight=`${Math.max(availableBelow,availableAbove)}px`;
      const h=list.getBoundingClientRect().height,w=list.getBoundingClientRect().width;
      list.style.left=`${Math.max(12,Math.min(r.left,innerWidth-w-12))}px`;
      list.style.top=`${availableBelow>=h?r.bottom+6:Math.max(12,r.top-h-6)}px`;
      (list.querySelector('[aria-selected="true"]:not(:disabled)')||list.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
      list.addEventListener('keydown',e=>{
        const enabled=[...list.querySelectorAll('button:not(:disabled)')],i=enabled.indexOf(document.activeElement);
        if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();enabled[e.key==='Home'?0:e.key==='End'?enabled.length-1:(i+(e.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]?.focus();}
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeStyledSelect(true);}
        if(e.key==='Tab')closeStyledSelect(true);
      });
    }
    button.addEventListener('click',e=>{e.stopPropagation();open();});
    button.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open();}});
  });
}
document.addEventListener('pointerdown',e=>{if(styledSelect&&!styledSelect.list.contains(e.target)&&!styledSelect.button.contains(e.target))closeStyledSelect();},true);
document.addEventListener('scroll',e=>{if(styledSelect&&!styledSelect.list.contains(e.target))closeStyledSelect();},true);
window.addEventListener('resize',()=>closeStyledSelect());

function openExpectationEditor(ids) {
  let rule = null;
  const rules = ids.map(id => page === 'levels' ? state.draftExpectations?.[id] || null : page==='record' && activeRecord?.id===id ? draftRule(activeRecord) : M.ruleAt(state.roster.find(i => i.id === id), M.nextSeq(state.roster.find(i => i.id === id))));
  const mixed = rules.some(r => JSON.stringify(r) !== JSON.stringify(rules[0]));
  rule = M.copy(mixed ? null : rules[0]);
  const dialog = document.createElement('dialog'); dialog.className = 'app-dialog expectation-dialog editor-dialog';animateMobilePickerClose(dialog);
  dialog.setAttribute('aria-labelledby','expectation-editor-title');
  dialog.innerHTML = `<header><div><h2 id="expectation-editor-title">属性期望</h2><p>${ids.length === 1 ? char(ids[0]).name : `已选 ${ids.length} 位人物`}</p></div></header><div class="expectation-body"><p class="muted">${defaultRuleText} 自定义条件满足时判为满意，否则不满意。</p>${mixed ? '<p class="mixed-note">这些人物的设置不同，保存会统一替换。</p>' : ''}<div id="rule-editor"></div><p class="editor-error" role="alert"></p><details class="rule-preview"><summary>规则预览</summary><div></div></details></div><footer><button data-reset-rule>恢复默认</button><button data-close autofocus>返回</button><button class="primary" data-save-rule>保存期望</button></footer>`;
  function nodeAt(path) { return path ? path.split('.').reduce((n,key)=>n[key],rule) : rule; }
  function replace(path, value) {
    if (!path) { rule=value; return; }
    const parts=path.split('.'), key=parts.pop();nodeAt(parts.join('.'))[key]=value;
  }
  function removeNode(path) {
    if (!path) { rule=null; return; }
    if (path==='child' || path.endsWith('.child')) { removeNode(path==='child'?'':path.slice(0,-6)); return; }
    const parts=path.split('.'),index=Number(parts.pop());nodeAt(parts.join('.')).splice(index,1);
  }
  const options = (values, selected) => values.map(([v,label,disabled])=>`<option value="${v}" ${v===selected?'selected':''} ${disabled?'disabled':''}>${label}</option>`).join('');
  const directStat = node => node.type==='stat' ? node.stat : node.type==='not' ? directStat(node.child) : null;
  function usedStats(group, except) { return new Set(group.children?.filter(n=>n!==except).map(directStat).filter(Boolean)); }
  function unavailableStats(path) {
    const parts=path.split('.'), index=parts.lastIndexOf('children');
    if(index<0)return new Set();
    const group=nodeAt(parts.slice(0,index).join('.'));
    return usedStats(group,group.children[Number(parts[index+1])]);
  }
  function editor(node,path='',depth=0) {
    const action = `<button class="rule-remove" data-remove="${path}" aria-label="删除此条件">移除</button>`;
    if (node.type==='stat') return `<div class="rule-leaf" data-path="${path}"><select data-field="stat" aria-label="属性">${options(STATS.map(s=>[s,s,s!==node.stat&&unavailableStats(path).has(s)]),node.stat)}</select><span>提升</span><button data-negate="${path}">取反</button>${action}</div>`;
    if (node.type==='total') return `<div class="rule-leaf" data-path="${path}"><span>总点数</span><select data-field="op" aria-label="比较方式">${options([['gt','大于'],['gte','大于等于'],['lt','小于'],['lte','小于等于']],node.op)}</select><select data-field="value" aria-label="期望点数">${options(Array.from({length:10},(_,n)=>[String(n),String(n)]).filter(([v])=>!(node.op==='gt'&&v==='9')&&!(node.op==='lt'&&v==='0')),String(node.value))}</select><button data-negate="${path}">取反</button>${action}</div>`;
    if (node.type==='not') return `<div class="rule-group depth-${depth%3}" data-path="${path}"><div class="rule-group-head"><b>非 · 不满足</b><button data-unnegate="${path}">取消取反</button>${action}</div>${editor(node.child,path?`${path}.child`:'child',depth+1)}</div>`;
    return `<div class="rule-group depth-${depth%3}" data-path="${path}"><div class="rule-group-head"><select data-field="type" aria-label="组合方式">${options([['all','与 · 全部满足'],['any','或 · 任一满足']],node.type)}</select><button data-negate="${path}">取反</button>${action}</div>${node.children.map((n,i)=>editor(n,`${path?path+'.':''}children.${i}`,depth+1)).join('')}<div class="rule-add"><select data-add="${path}" aria-label="添加条件"><option value="">＋ 添加条件</option><option value="stat">属性提升</option><option value="total">总点数</option><option value="all">条件组</option></select></div></div>`;
  }
  function draw() {
    closeStyledSelect();
    const focused = document.activeElement;
    const focusPath = focused?.closest('[data-path]')?.dataset.path;
    const focusField = focused?.dataset.field || (focused?.classList.contains('select-trigger') ? focused.previousElementSibling?.dataset.field : undefined);
    const focusAdd = focused?.classList.contains('select-trigger') ? focused.previousElementSibling?.dataset.add : undefined;
    dialog.querySelector('#rule-editor').innerHTML = rule ? editor(rule) + '<button class="wrap-rule" data-wrap>将当前规则放入新条件组</button>' : '<div class="rule-empty"><p>未设置，使用默认判定</p><button data-enable class="primary">设置条件</button></div>';
    dialog.querySelector('.rule-preview div').innerHTML=ruleMarkup(rule);
    const size = M.ruleSize(rule);
    const wrap = dialog.querySelector('[data-wrap]');
    if (wrap) wrap.disabled = size.depth >= M.limits.ruleDepth || size.nodes >= M.limits.ruleNodes;
    dialog.querySelectorAll('select[data-add]').forEach(select=>{
      const depth = (select.dataset.add.match(/\b(children|child)\b/g) || []).length;
      const full = size.nodes >= M.limits.ruleNodes || depth >= M.limits.ruleDepth;
      select.querySelector('[value="stat"]').disabled = full || usedStats(nodeAt(select.dataset.add)).size >= STATS.length;
      select.querySelector('[value="total"]').disabled = full;
      select.querySelector('[value="all"]').disabled = size.nodes + 2 > M.limits.ruleNodes || depth + 2 > M.limits.ruleDepth;
    });
    enhanceSelects(dialog);
    if (focusField && focusPath !== undefined) dialog.querySelector(`[data-path="${focusPath}"] > select[data-field="${focusField}"], [data-path="${focusPath}"] > .rule-group-head > select[data-field="${focusField}"]`)?.nextElementSibling?.focus({preventScroll:true});
    if (focusAdd !== undefined) dialog.querySelector(`select[data-add="${focusAdd}"]`)?.nextElementSibling?.focus({preventScroll:true});
  }
  function acceptEdit(change) {
    const previous = M.copy(rule);
    change();
    const size = M.ruleSize(rule);
    if (size.nodes <= M.limits.ruleNodes && size.depth <= M.limits.ruleDepth) return true;
    rule = previous;
    dialog.querySelector('.editor-error').textContent = '条件过多或层级过深，请简化';
    return false;
  }
  dialog.addEventListener('change',e=>{
    if (e.target.hasAttribute('data-add')) {
      const node=nodeAt(e.target.dataset.add),type=e.target.value;
      const available=STATS.find(s=>!usedStats(node).has(s));
      if(type==='stat'&&!available)return;
      if(type && !acceptEdit(()=>node.children.push(type==='stat'?{type,stat:available}:type==='total'?{type,op:'gte',value:5}:{type:'all',children:[{type:'stat',stat:'速度'}]}))) { draw(); return; }
    } else if(e.target.dataset.field) {
      const node=nodeAt(e.target.closest('[data-path]').dataset.path),field=e.target.dataset.field;
      if(field==='stat'&&unavailableStats(e.target.closest('[data-path]').dataset.path).has(e.target.value)){draw();return;}
      node[field]=field==='value'?Number(e.target.value):e.target.value;
      if(node.type==='total')node.value=Math.max(node.op==='lt'?1:0,Math.min(node.op==='gt'?8:9,node.value));
    } else return;
    draw();
  });
  let saving=false;
  dialog.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b||saving)return;
    if(b.hasAttribute('data-close')){dialog.close();return;}
    if(b.hasAttribute('data-enable'))rule={type:'all',children:[{type:'stat',stat:'力量'}]};
    else if(b.hasAttribute('data-reset-rule'))rule=null;
    else if(b.hasAttribute('data-wrap')) { if(!acceptEdit(()=>rule={type:'all',children:[rule]}))return; }
    else if(b.hasAttribute('data-negate')) { if(!acceptEdit(()=>replace(b.dataset.negate,{type:'not',child:nodeAt(b.dataset.negate)})))return; }
    else if(b.hasAttribute('data-unnegate'))replace(b.dataset.unnegate,nodeAt(b.dataset.unnegate).child);
    else if(b.hasAttribute('data-remove')){
      removeNode(b.dataset.remove);
    } else if(b.hasAttribute('data-save-rule')) {
      function hasDuplicate(node) {
        if(!node)return false;
        if(node.type==='not')return hasDuplicate(node.child);
        if(!node.children)return false;
        const stats=node.children.map(directStat).filter(Boolean);
        return new Set(stats).size!==stats.length || node.children.some(hasDuplicate);
      }
      if(hasDuplicate(rule)){dialog.querySelector('.editor-error').textContent='同一条件组内，每种属性只能设置一次，请移除重复条件。';return;}
      try { M.validRule(rule); } catch(error) {dialog.querySelector('.editor-error').textContent=error.message;return;}
      saving=true;b.disabled=true;
      const ok=await saveExpectations(ids,rule);
      saving=false;b.disabled=false;
      if(ok){dialog.close();render();}return;
    } else return;
    dialog.querySelector('.editor-error').textContent='';draw();
  });
  dialog.addEventListener('close',()=>{closeStyledSelect();retireDialog(dialog);},{once:true});
  document.body.append(dialog);draw();dialog.showModal();
}

let expectationTip = null, expectationTipTimer, expectationTipOwner = null;
const TIP_OWNERS = '[data-expectation-detail],[data-setup-expectation],[data-setup-ride],.record-chip [data-profession]';
function hideExpectationTip() { clearTimeout(expectationTipTimer); expectationTip?.remove(); expectationTipOwner?.removeAttribute('aria-describedby'); expectationTipOwner=null; expectationTip=null; }
function showExpectationTip(b) {
  hideExpectationTip();
  const setup=b.dataset.setupExpectation, rideOwner=b.dataset.setupRide, classOwner=b.matches('.record-chip [data-profession]');
  const item=setup||rideOwner||classOwner?null:state.roster.find(i=>i.id===b.dataset.expectationDetail);if(!setup&&!rideOwner&&!classOwner&&!item)return;
  expectationTip=document.createElement('div');expectationTip.id='expectation-tooltip';expectationTip.className='expectation-tip';expectationTip.setAttribute('role','tooltip');
  expectationTip.innerHTML=classOwner ? cardClassTip(b) : rideOwner ? `<p class="rule-default">${rideText(setupRide(rideOwner))}</p>` : setup ? (setupExpectationRule(setup)?ruleMarkup(setupExpectationRule(setup)):`<p class="rule-default">${defaultRuleText}</p>`) : b.hasAttribute('data-record-expectation') ? recordExpectationMarkup() : expectationRanges(item);document.body.append(expectationTip);
  expectationTipOwner=b;b.setAttribute('aria-describedby',expectationTip.id);
  const r=b.getBoundingClientRect(),tip=expectationTip.getBoundingClientRect();
  expectationTip.style.left=`${Math.max(12,Math.min(innerWidth-tip.width-12,r.left))}px`;
  expectationTip.style.top=`${Math.max(12,Math.min(innerHeight-tip.height-12,r.bottom+8))}px`;
  expectationTip.addEventListener('pointerleave',hideExpectationTip);
  if(classOwner) expectationTip.addEventListener('click',e=>{
    const row=e.target.closest('[data-tip-step]');
    if(row?.dataset.tipStep==='better'){const mark=b.querySelector('[data-better]');if(mark)openBetterChoices(mark);}
    else if(row) openCardClass(b,row.dataset.tipStep);
  });
}
document.addEventListener('pointerover',e=>{
  const b=e.target.closest(TIP_OWNERS);
  if(!b||e.pointerType!=='mouse'||b.contains(e.relatedTarget))return;
  hideExpectationTip();
  expectationTipTimer=setTimeout(()=>showExpectationTip(b),250);
});
document.addEventListener('pointerout',e=>{
  const owner=e.target.closest(TIP_OWNERS);
  if(!owner||owner.contains(e.relatedTarget)||expectationTip?.contains(e.relatedTarget))return;
  clearTimeout(expectationTipTimer);
  expectationTipTimer=setTimeout(()=>{if(!expectationTip?.matches(':hover')&&!expectationTipOwner?.matches(':hover'))hideExpectationTip();},180);
});
document.addEventListener('scroll',e=>{if(!expectationTip?.contains(e.target))hideExpectationTip();},true);
window.addEventListener('resize',hideExpectationTip);
document.addEventListener('focusin',e=>{if(e.target.matches(TIP_OWNERS)&&document.documentElement.dataset.inputMode==='keyboard')showExpectationTip(e.target);});
// Focus moving into the tip (a click on one of its rows) keeps it until that click lands.
document.addEventListener('focusout',e=>{if(e.target===expectationTipOwner&&!expectationTip?.contains(e.relatedTarget))hideExpectationTip();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideExpectationTip();});

document.addEventListener('keydown',e=>{
  if(typeof page==='undefined'||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select'))return;
  if(e.key==='Escape'){clearRowSelection();refreshRowSelection();}
  if(e.key===' '&&e.target.matches('[data-sort-id]')){e.preventDefault();selectRow(e.target.dataset.sortId,{shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey});}
});
/* Common desktop shortcuts, with no on-screen hints: Ctrl/⌘+Z undoes the last deletion where the page offers
   that command, and Ctrl/⌘+A selects every row while multi-select is open. Text fields keep their own. */
document.addEventListener('keydown',e=>{
  if(!(e.ctrlKey||e.metaKey)||e.altKey||e.shiftKey||e.isComposing||typeof page==='undefined')return;
  if(document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,[contenteditable]'))return;
  const key=e.key.toLowerCase();
  if(key==='z'&&['summary','select'].includes(page)&&storyRoster().some(item=>item.deleted||item.records.some(record=>record.deleted))){e.preventDefault();undoDelete();}
  else if(key==='a'&&multiSelectMode&&['summary','levels'].includes(page)){e.preventDefault();rowIds().forEach(id=>rowSelection.add(id));refreshRowSelection();}
});
