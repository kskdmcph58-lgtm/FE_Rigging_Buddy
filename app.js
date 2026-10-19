const STATS = ['HP', '力量', '魔力', '速度', '技巧', '防守', '魔防', '幸运', '魅力'];
const app = document.querySelector('#app');
const characters = window.CHARACTERS;
const M = window.RiggingModel;
const LOCAL_STATE_KEY = `rigging-buddy:save:${new URL('.', location.href).pathname}`;
const LOCAL_PAGE_KEY = `${LOCAL_STATE_KEY}:page`;
const trackedObjects = new WeakMap();
let localSaveTimer, storageReady = false, storageBlocked = false, storageWarning = false, lastLocalSave = null;
function trackState(value) {
  if (!value || typeof value !== 'object') return value;
  if (trackedObjects.has(value)) return trackedObjects.get(value);
  const proxy = new Proxy(value, {
    get(target,key,receiver) { return trackState(Reflect.get(target,key,receiver)); },
    set(target,key,value,receiver) { const changed=target[key]!==value; const result=Reflect.set(target,key,value,receiver); if(changed)scheduleLocalSave(); return result; },
    deleteProperty(target,key) { const result=Reflect.deleteProperty(target,key);scheduleLocalSave();return result; }
  });
  trackedObjects.set(value,proxy);trackedObjects.set(proxy,proxy);return proxy;
}
function scheduleLocalSave() {
  if (!storageReady || storageBlocked) return;
  clearTimeout(localSaveTimer);localSaveTimer=setTimeout(saveLocalState,150);
}
function saveLocalState() {
  clearTimeout(localSaveTimer);
  if (!storageReady || storageBlocked) return;
  try {
    const serialized=JSON.stringify(state);
    if(serialized===lastLocalSave)return;
    // Do not silently overwrite work saved by another tab.
    if(localStorage.getItem(LOCAL_STATE_KEY)!==lastLocalSave) {
      storageBlocked=true;notify('其他页面已更新本地记录。请先导出当前备份，再刷新读取。');return;
    }
    localStorage.setItem(LOCAL_STATE_KEY,serialized);lastLocalSave=serialized;storageWarning=false;
  } catch {
    if(!storageWarning){storageWarning=true;notify('本地保存失败，请导出备份保留记录。');}
  }
}
function restoreLocalState() {
  try {
    lastLocalSave=localStorage.getItem(LOCAL_STATE_KEY);
    if(lastLocalSave) {
      state=trackState(validate(JSON.parse(lastLocalSave)));
      // Pending additions can coexist with an existing roster; they do not imply
      // the user was viewing the level setup page.
      page=visibleRoster().length?'summary':state.selection.length?'levels':'select';
      try {
        const savedPage=sessionStorage.getItem(LOCAL_PAGE_KEY);
        if(savedPage==='select'||savedPage==='summary'||(savedPage==='levels'&&state.selection.length))page=savedPage;
      } catch { /* Fall back to the data-derived page when session storage is unavailable. */ }
    }
  } catch {
    storageBlocked=true;
    setTimeout(()=>notify('本地记录暂时无法读取，原数据已保留，未覆盖。'),0);
  }
  storageReady=true;
}
let state = trackState({ version: 2, roster: [], selection: [], initialLevels: {} });
let activeRecord = null;
let page = 'select';
let query = '';
const SEARCH_HISTORY_KEY = 'rigging-buddy:character-search:v1';
let searchHistory = [];
try {
  const saved = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
  if (Array.isArray(saved)) searchHistory = saved.filter(s => typeof s === 'string' && s.length <= 80).slice(0, 8);
} catch { /* Search still works when storage is unavailable. */ }
function normalizeSearch(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s'’·-]/g, '');
}
function phonetic(text) {
  return normalizeSearch(window.pinyinPro.pinyin(text, { toneType: 'none', type: 'array' }).join(''));
}
const searchIndex = characters.map(c => ({
  character: c,
  keys: [normalizeSearch(c.name), normalizeSearch(c.englishName), phonetic(c.name),
    normalizeSearch(window.pinyinPro.pinyin(c.name, { pattern: 'first', toneType: 'none', type: 'array' }).join(''))]
}));
function searchCharacters(text) {
  const key = normalizeSearch(text.trim()), sound = phonetic(text.trim());
  return searchIndex.filter(entry => entry.keys.some(value => value.includes(key) || (sound && value.includes(sound)))).map(entry => entry.character);
}
function rememberSearch() {
  const value = query.trim().slice(0, 80);
  if (!value) return;
  searchHistory = [value, ...searchHistory.filter(s => s !== value)].slice(0, 8);
  try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory)); } catch { /* Optional storage. */ }
}
function showSearchHistory() {
  const history = app.querySelector('#search-history');
  if (!history) return;
  history.innerHTML = '<div class="search-history-title">本工具最近搜索</div>' + searchHistory.map(s => `<button type="button" data-search-history="${escapeValue(s)}">${escapeValue(s)}</button>`).join('') + '<button type="button" data-clear-search>清空搜索记录</button>';
  history.hidden = !searchHistory.length;
}
const editingCharacters = new Set();
function nextLevel(item) { return M.nextLevel(item); }
// A skipped attempt previews the level it attempted, but never advances it.
function recordDisplayLevel(item, record) { return M.level(item, record) + (record.skipped ? 1 : 0); }
function visibleRoster() { return state.roster.filter(item => !item.deleted); }
function validate(data) { return M.migrate(data, characters.map(c => c.id)); }
function levelLabel(item, level) { return item.initialLevel === null ? `LV +${level}` : `LV ${level}`; }
function escapeValue(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function validLevel(input) {
  const valid = input.value === '' || /^[1-9][0-9]?$/.test(input.value);
  clearLevelError(input);
  input.setAttribute('aria-invalid', String(!valid));
  if (!valid) {
    const error = document.createElement('span');
    error.className = 'level-error';
    error.id = `level-error-${input.dataset.level || input.closest('[data-initial-form]')?.dataset.initialForm || 'batch'}`;
    error.setAttribute('role', 'alert');
    error.textContent = '请输入 1–99，或留空';
    (input.closest('.level-row,.initial-level-form,.toolbar') || input.parentElement).append(error);
    input.setAttribute('aria-describedby', error.id);
    input.focus();
  }
  return valid;
}
function clearLevelError(input) {
  const id = input.getAttribute('aria-describedby');
  if (id?.startsWith('level-error-')) document.getElementById(id)?.remove();
  input.removeAttribute('aria-describedby');
  input.setCustomValidity('');
}
let noticeTimer;
function notify(text) { clearTimeout(noticeTimer); document.querySelector('#notice').textContent = text; noticeTimer = setTimeout(() => document.querySelector('#notice').textContent = '', 4000); }
function char(id) { return characters.find(c => c.id === id); }
function backupFilename() {
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const random = crypto.getRandomValues(new Uint32Array(1))[0];
  const suffix = ((now.getTime() + random) % (36 ** 5)).toString(36).padStart(5, '0');
  return `Rigging-Buddy-${date}_${time}_${suffix}.json`;
}
function ratingIcon(happy) {
  return `<svg class="rating-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r=".8" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r=".8" fill="currentColor" stroke="none"/><path d="${happy ? 'M8 14 Q12 19 16 14' : 'M8 17 Q12 12 16 17'}"/></svg>`;
}
function portrait(c) {
  const revision = document.querySelector('meta[name="app-version"]')?.content;
  const image = /^[a-f0-9]{40}$/i.test(revision || '') ? `${c.image}?v=${revision}` : c.image;
  return `<img draggable="false" src="${image}" alt="" loading="lazy">`;
}
function render() {
  try { sessionStorage.setItem(LOCAL_PAGE_KEY,page==='record'?'summary':page); } catch { /* Navigation memory is optional. */ }
  hideExpectationTip();
  app.classList.toggle('summary-page', page === 'summary');
  app.classList.toggle('select-page', page === 'select');
  app.classList.toggle('levels-page', page === 'levels');
  app.classList.toggle('has-bottom-bar', page === 'select' || page === 'levels');
  app.classList.toggle('record-page', page === 'record');
  if (page === 'select') renderSelect();
  if (page === 'levels') renderLevels();
  if (page === 'summary') renderSummary();
  if (page === 'record') renderRecord();
  refreshRowSelection();
  scheduleLocalSave();
}
function renderSelect() {
  app.innerHTML =
    `<div class="toolbar"><label class="search"><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="search" aria-label="搜索角色姓名"></label>${visibleRoster().length ? '<button data-action="summary">← 返回</button>' : '<button class="import-zone" data-action="import" title="拖入 JSON 备份，或点击选择文件">恢复备份</button>'}</div><div class="character-grid" id="character-grid"></div><div class="bottom-bar"><span id="selected-count"></span><button class="primary" id="choose-next" data-action="levels">下一步 · 设置等级 →</button></div>`;
  document.querySelector('#search').value = query;
  if (!visibleRoster().length && state.roster.some(item => item.deleted)) app.querySelector('.toolbar').insertAdjacentHTML('afterend', '<div class="selection-toolbar"><button data-action="undo-delete">撤回删除</button></div>');
  const searchInput = app.querySelector('#search');
  searchInput.name = 'rigging-buddy-character-search';
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('aria-label', '搜索角色姓名、拼音或首字母');
  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  const searchLabel = searchInput.parentElement;
  searchLabel.replaceWith(searchBox);
  searchBox.append(searchLabel);
  searchBox.insertAdjacentHTML('beforeend', '<div id="search-history" class="search-history" hidden></div>');
  renderCards();
}
function renderCards() {
  const list = searchCharacters(query);
  const grid = document.querySelector('#character-grid');
  if (!grid.children.length) grid.innerHTML = characters.map(c => {
    const existing = visibleRoster().some(r => r.id === c.id), selected = state.selection.includes(c.id);
    return `<button class="character ${selected ? 'selected' : ''}" data-character="${c.id}" aria-pressed="${selected}" ${existing ? 'disabled' : ''}>${portrait(c)}<span>${c.name}</span>${state.roster.some(item => item.id === c.id && item.deleted) ? '<i>可恢复</i>' : ''}</button>`;
  }).join('') + '<p class="empty" hidden>没有找到这个名字，换个关键词试试。</p>';
  const matches = new Set(list.map(c => c.id));
  grid.querySelectorAll('[data-character]').forEach(card => { card.hidden = !matches.has(card.dataset.character); });
  grid.querySelector('.empty').hidden = list.length > 0;
  updateSelectionCount();
}
function updateSelectionCount() {
  document.querySelector('#selected-count').textContent = `已选 ${state.selection.length} 位角色`;
  document.querySelector('#choose-next').disabled = !state.selection.length;
}
function renderLevels() {
  app.innerHTML =
    `<section class="panel levels"><div class="toolbar setup-toolbar"><label>统一设为 <input id="batch-level" type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="" data-level-input aria-label="统一初始等级"></label><button data-action="batch">应用到全部</button>${selectionToolbar()}</div><p class="expectation-default-note">${defaultRuleText}</p><div class="table-head"><span>角色</span><span>当前等级（可留空）</span><span>属性期望</span></div>${state.selection.map(id => { const c = char(id); return `<div class="level-row" draggable="false" data-sort-id="${id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span>${portrait(c)}<strong>${c.name}</strong><span class="level-value">LV <input type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="${escapeValue(state.initialLevels[id] ?? '')}" data-level-input data-level="${id}" aria-label="${c.name}初始等级"></span><button class="expectation-setting" data-expectation-edit="${id}" aria-label="设置${c.name}属性期望">${escapeValue(ruleSummary(state.draftExpectations?.[id]))}</button></div>`; }).join('')}</section><div class="bottom-bar"><button data-action="select">← 返回选择</button><button class="primary" data-action="create">开始记录 →</button></div>`;
}
function recordStats(stats) {
  const groups = [STATS.slice(0, 5), STATS.slice(5)].map(group => group.filter(stat => stats.includes(stat))).filter(group => group.length);
  return groups.length ? groups.map(group => `<span class="stat-line">${group.map(stat => stat === 'HP' ? '<span class="stat-hp" aria-label="HP"><span aria-hidden="true">H</span><span aria-hidden="true">P</span></span>' : stat).join(' · ')}</span>`).join('') : '<span class="stat-line">本次没有属性提升</span>';
}
function pencilIcon(className) {
  return `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.5 2.5 3 3M2.5 13.5l3.5-.8 7.5-7.5a2.1 2.1 0 0 0-3-3L3 9.7z"/></svg>`;
}
function renderSummary() {
  const total = visibleRoster().reduce((n, r) => n + M.live(r).length, 0);
  const happy = visibleRoster().reduce((n, r) => n + M.live(r).filter(x => x.happy && !x.skipped && !x.ratingPending).length, 0);
  const markup =
    `<div class="summary-top"><div class="metrics"><div><b>${visibleRoster().length}</b><span>小队成员</span></div><div><b>${total}</b><span>升级记录</span></div><div><b>${happy}</b><span>满意升级</span></div></div><div class="summary-controls">${selectionToolbar()}<div class="actions summary-actions"><button class="primary" data-action="select"><svg class="add-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>添加角色</span></button><details class="action-menu" name="summary-tools"><summary>备份 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="export">导出备份</button><button class="import-zone" data-action="import">恢复备份</button></div></details><details class="action-menu" name="summary-tools"><summary>更多 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="undo-delete">撤回上次删除</button><button class="menu-danger" data-action="clear-skipped">清空已跳过</button><button class="menu-danger" data-action="reset-list">清空升级记录</button><button class="menu-danger" data-action="reset">清空全部</button></div></details></div></div></div><div class="journals">${visibleRoster().map(item => {
      const c = char(item.id);
      const editing = editingCharacters.has(c.id);
      return `<article class="journal panel" draggable="false" data-sort-id="${c.id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
        <div class="journal-head"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span>${portrait(c)}<div class="journal-info"><h2>${c.name}</h2><p class="initial-level ${editing ? 'can-edit' : ''}" data-initial-level="${c.id}" tabindex="0" role="button">初始等级 ${item.initialLevel === null ? '暂无' : `LV ${item.initialLevel}`}${pencilIcon('initial-pencil')}</p>${expectationLink(item, editing)}</div></div>
        <div class="journal-actions"><button class="primary" data-start="${c.id}">记录升级</button><button data-toggle-edit="${c.id}" aria-pressed="${editing}">${editing ? '完成编辑' : '编辑'}</button><button class="danger" data-delete-character="${c.id}">删除</button></div>
        <div class="records">${M.live(item).length ? item.records.map((r, recordIndex) => r.deleted ? '' : `<button data-edit="${c.id}" data-index="${recordIndex}" data-growth="+${r.stats.length}" aria-label="${editing ? '编辑' : r.skipped ? '标记已升级' : r.upgraded ? '恢复原样' : '标记已跳过'}${c.name} ${levelLabel(item, recordDisplayLevel(item, r))}" class="record-chip ${r.ratingPending ? 'rating-pending' : r.happy ? 'happy' : 'angry'} ${r.skipped ? 'skipped' : r.upgraded ? 'upgraded' : ''} ${editing ? 'editable' : ''}">${editing ? pencilIcon('edit-pencil') : ''}<div><b>${levelLabel(item, recordDisplayLevel(item, r))}</b><span>${r.ratingPending ? '待评价' : ratingIcon(r.happy) + (r.happy ? '满意' : '不满意')}</span></div><strong>+${r.stats.length} <small>点</small></strong><p>${recordStats(r.stats)}</p>${r.skipped || r.upgraded ? `<span class="record-overlay ${r.skipped ? 'skip-overlay' : 'upgrade-overlay'}">${r.skipped ? '已跳过' : '已升级'}</span>` : ''}</button>`).join('') : '<p class="empty">暂无记录</p>'}</div></article>`;
    }).join('') || '<div class="panel empty">添加角色</div>'}</div>`;
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
    for (const attribute of ['data-sort-id', 'data-start', 'data-toggle-edit', 'data-delete-character', 'data-edit']) {
      if (node.hasAttribute(attribute)) return `${attribute}:${node.getAttribute(attribute)}:${node.getAttribute('data-index') || ''}`;
    }
    return null;
  };
  const keyed = new Map([...current.childNodes].filter(key).map(node => [key(node), node]));
  let cursor = current.firstChild;
  for (const next of [...desired.childNodes]) {
    const id = key(next);
    let node = id ? keyed.get(id) : cursor;
    if (!node || node.nodeType !== next.nodeType || node.nodeName !== next.nodeName || key(node) !== id) {
      node = next.cloneNode(true);
      current.insertBefore(node, cursor);
    } else {
      if (node !== cursor) current.insertBefore(node, cursor);
      if (node.nodeType === 1) {
        for (const attribute of [...node.attributes]) {
          if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
        }
        for (const attribute of [...next.attributes]) {
          if (node.getAttribute(attribute.name) !== attribute.value) node.setAttribute(attribute.name, attribute.value);
        }
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
function start(id) {
  activeRecord = newRecordDraft(id);
   page = 'record'; render(); window.scrollTo(0, 0);
}
function rememberListPosition() {
  state.summaryScroll = window.scrollY;

  notify('');
}
function returnToSummary() {
  page = 'summary'; render();
  window.scrollTo(0, Number(state.summaryScroll) || 0);
}
function renderRecord() {
  const d = activeRecord, c = char(d.id), item = state.roster.find(r => r.id === d.id);
  const editing = d.editIndex !== undefined;
  const next = editing ? recordDisplayLevel(item, item.records[d.editIndex]) : nextLevel(item);
  app.innerHTML = `<button class="back" data-action="leave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m10 5-7 7 7 7M3 12h18"/></svg><span>返回</span></button>` +
    `<div class="record-layout"><aside class="hero panel">${portrait(c)}<div><div class="eyebrow">LEVEL UP</div><h2>${c.name}</h2><div class="big-level">${levelLabel(item, next)}</div><p>${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</p></div></aside><section class="panel stat-panel"><div class="stat-heading"><h2 class="desktop-stat-title">本次属性提升</h2><div class="record-character">${portrait(c)}<div><h2>${c.name}</h2><p class="record-level">${levelLabel(item, next)}</p></div></div><span class="growth-total" aria-live="polite"><strong>+${d.stats.length}</strong><small> 点</small></span></div><div class="stats">${STATS.map((s, i) => `<button class="stat ${d.stats.includes(s) ? 'active' : ''}" style="--row:${i < 5 ? i + 1 : i - 3};--col:${i < 5 ? 1 : 2}" data-stat="${s}" aria-pressed="${d.stats.includes(s)}"><span>${s}</span><b>${d.stats.includes(s) ? '+1' : '—'}</b></button>`).join('')}</div><div class="rating-rule-note"><button class="expectation-link" data-expectation-detail="${d.id}" data-record-expectation>属性期望</button></div><div class="ratings"><button class="happy ${d.happy === true ? 'chosen' : ''}" data-rating="happy" aria-pressed="${d.happy === true}">${ratingIcon(true)} 满意</button><button class="angry ${d.happy === false ? 'chosen' : ''}" data-rating="angry" aria-pressed="${d.happy === false}">${ratingIcon(false)} 不满意</button></div><div class="record-actions"><button data-action="finish" ${d.happy === null && d.stats.length ? 'disabled' : ''}>${editing ? '保存修改并返回' : '保存并结束'}</button>${editing ? '' : `<button class="primary" data-action="next" ${d.happy === null || !d.stats.length ? 'disabled' : ''}>保存 · 下一级 →</button>`}</div></section></div>`;
  if (editing) app.querySelector('.record-actions').insertAdjacentHTML('beforeend', '<button class="danger" data-action="delete-record">删除记录</button>');
  updateRecordControls();
}
// Keep portraits and focused buttons mounted during record interactions.
function updateRecordControls() {
  const d = activeRecord;
  app.querySelectorAll('[data-stat]').forEach(button => {
    const selected = d.stats.includes(button.dataset.stat);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('b').textContent = selected ? '+1' : '—';
  });
  app.querySelector('.growth-total strong').textContent = `+${d.stats.length}`;
  app.querySelectorAll('[data-rating]').forEach(button => {
    const selected = d.happy === (button.dataset.rating === 'happy');
    button.classList.toggle('chosen', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  app.querySelector('[data-action="finish"]').disabled = d.happy === null && d.stats.length > 0;
  const next = app.querySelector('[data-action="next"]');
  if (next) next.disabled = d.happy === null || (!d.stats.length && d.ratingSource !== 'manual' && !draftRule(d));
}
function confirmRecordDeletion(question = '是否删除这条记录？', actionLabel = '删除') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog confirm-dialog';
    dialog.setAttribute('aria-labelledby', 'delete-confirm-title');
    dialog.innerHTML = '<h2 id="delete-confirm-title">是否删除这条记录？</h2><form method="dialog"><button value="cancel" autofocus>返回</button><button class="danger" value="delete">删除</button></form>';
    dialog.querySelector('h2').textContent = question;
    dialog.querySelector('.danger').textContent = actionLabel;
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'delete';
      dialog.remove();
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
  returnToSummary();
}
function saveRecord(next) {
  const d = activeRecord;
  if (!d || (d.stats.length && d.happy === null)) return;
  const item = state.roster.find(r => r.id === d.id);
  if (!d.stats.length && d.editIndex === undefined && d.ratingSource !== 'manual' && !draftRule(d)) {
    if (next) return;
    activeRecord = null;  notify(''); returnToSummary(); return;
  }
  if (d.editIndex !== undefined) {
    item.records[d.editIndex] = { ...item.records[d.editIndex], stats: [...d.stats], happy: d.happy, ratingSource: d.ratingSource || 'auto', ratingPending: false, updatedAt: new Date().toISOString() };
  } else {
    item.records.push({ id: M.uid(), seq: M.nextSeq(item), stats: [...d.stats], happy: d.happy, ratingSource: d.ratingSource || 'auto', createdAt: new Date().toISOString() });
  }
  const id = d.id;
  activeRecord = null;

  if (next) {
    activeRecord = newRecordDraft(id);
    const level = nextLevel(item);
    app.querySelector('.big-level').textContent = levelLabel(item, level);
    app.querySelector('.hero p').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
    app.querySelector('.record-level').textContent = levelLabel(item, level);
    hideExpectationTip();
    updateRecordControls();
  } else returnToSummary();

}
app.addEventListener('input', e => {
  if (e.target.matches('[data-level-input]')) { clearLevelError(e.target); e.target.removeAttribute('aria-invalid'); }
  if (e.target.id === 'search') { query = e.target.value; renderCards(); app.querySelector('#search-history').hidden = true; }
  if (e.target.dataset.level) { state.initialLevels[e.target.dataset.level] = e.target.value;  }
});
app.addEventListener('focusin', e => { if (e.target.matches('input[data-level-input]')) e.target.select(); });
app.addEventListener('focusin', e => { if (e.target.id === 'search') showSearchHistory(); });
app.addEventListener('focusout', e => {
  if (e.target.closest('.search-box') && !e.relatedTarget?.closest('.search-box')) {
    rememberSearch();
    app.querySelector('#search-history').hidden = true;
  }
});
function editInitialLevel(label) {
  if (label.querySelector('input')) return;
  const item = state.roster.find(r => r.id === label.dataset.initialLevel);
  label.removeAttribute('role');
  label.removeAttribute('tabindex');
  label.innerHTML = `<form novalidate class="initial-level-form" data-initial-form="${item.id}"><label>初始等级 <input data-level-input type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="${item.initialLevel ?? ''}" aria-label="初始等级，留空删除" placeholder="暂无"></label><button type="submit">保存</button><button type="button" data-cancel-initial>取消</button></form>`;
  label.querySelector('input').focus();
}
app.addEventListener('dblclick', e => {
  const label = e.target.closest('[data-initial-level]');
  if (label && editingCharacters.has(label.dataset.initialLevel)) editInitialLevel(label);
});
app.addEventListener('submit', e => {
  const form = e.target.closest('[data-initial-form]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  if (!validLevel(input)) return;
  const item = state.roster.find(r => r.id === form.dataset.initialForm);
  item.initialLevel = input.value === '' ? null : Number(input.value);
  rememberListPosition(); returnToSummary();
});
let swipeGesture = null;
let touchSort = null;
let mouseSort = null;
function sortTarget(x, y, source) {
  const selector = source.matches('.level-row') ? '.level-row' : '.journal';
  const container = source.parentElement.getBoundingClientRect();
  if (x < container.left || x > container.right) return null;
  let best = null, distance = Infinity;
  app.querySelectorAll(selector).forEach(card => {
    if (movingIds(source.dataset.sortId).includes(card.dataset.sortId)) return;
    const rect = card.getBoundingClientRect();
    const gap = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (gap < distance) { distance = gap; best = card; }
  });
  return best;
}
function updateSortMarker(gesture) {
  positionDragPreview(gesture.x, gesture.y);
  const target = sortTarget(gesture.x, gesture.y, gesture.card);
  app.querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
  gesture.target = target;
  if (target) {
    gesture.after = gesture.y >= target.getBoundingClientRect().top + target.getBoundingClientRect().height / 2;
    target.classList.add(gesture.after ? 'drop-after' : 'drop-before');
  }
}
function startSortScroll(gesture) {
  let last = 0;
  const frame = now => {
    if (touchSort !== gesture && mouseSort !== gesture) return;
    if (now - last > 16) {
      const delta = gesture.y < 60 ? -8 : gesture.y > window.innerHeight - 60 ? 8 : 0;
      if (delta && !gesture.scrollFinger) window.scrollBy(0, delta);
      updateSortMarker(gesture);
      last = now;
    }
    gesture.frame = requestAnimationFrame(frame);
  };
  gesture.frame = requestAnimationFrame(frame);
}
function finishTouchSort(commit = false) {
  if (!touchSort) return;
  const { card, target, after } = touchSort;
  cancelAnimationFrame(touchSort.frame);
  if (commit && target) moveCard(card.dataset.sortId, target.dataset.sortId, after);
  clearMoving();
  app.querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
  touchSort = null;
  suppressSwipeClickUntil = Date.now() + 400;
}
let suppressSwipeClickUntil = 0;
function closeSwipeCards(except = null) {
  app.querySelectorAll('.journal.swipe-open').forEach(card => {
    if (card !== except) card.classList.remove('swipe-open');
  });
}
app.addEventListener('touchstart', e => {
  if (touchSort) {
    const extra = [...e.touches].find(touch => touch.identifier !== touchSort.identifier);
    if (extra) touchSort.scrollFinger = { identifier: extra.identifier, y: extra.clientY };
    e.preventDefault();
    return;
  }
  swipeGesture = null;
  finishTouchSort();
  if (e.touches.length !== 1) {
    swipeGesture = null;
    return;
  }
  const card = e.target.closest('.journal,.level-row');
  closeSwipeCards(card);
  if (card && e.target.closest('.drag-grip')) {
    closeSwipeCards();
    touchSort = { card, target: null, after: false, identifier: e.touches[0].identifier, x: e.touches[0].clientX, y: e.touches[0].clientY };
    markMoving(card.dataset.sortId);
    positionDragPreview(touchSort.x, touchSort.y);
    startSortScroll(touchSort);
    e.preventDefault();
    return;
  }
  if (!matchMedia('(max-width:600px)').matches || multiSelectMode || !card?.matches('.journal') || e.target.closest('button,input,[data-delete-character]')) return;
  swipeGesture = { card, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, horizontal: false };
}, { passive: false });
app.addEventListener('touchmove', e => {
  if (touchSort) {
    e.preventDefault();
    const primary = [...e.touches].find(touch => touch.identifier === touchSort.identifier);
    if (!primary) { finishTouchSort(); return; }
    touchSort.x = primary.clientX; touchSort.y = primary.clientY;
    const extra = [...e.touches].find(touch => touch.identifier !== touchSort.identifier);
    if (extra) {
      if (touchSort.scrollFinger?.identifier === extra.identifier) window.scrollBy(0, touchSort.scrollFinger.y - extra.clientY);
      touchSort.scrollFinger = { identifier: extra.identifier, y: extra.clientY };
    } else touchSort.scrollFinger = null;
    updateSortMarker(touchSort);
    return;
  }
  if (!swipeGesture) return;
  if (e.touches.length !== 1) { swipeGesture = null; return; }
  const dx = e.touches[0].clientX - swipeGesture.x;
  const dy = e.touches[0].clientY - swipeGesture.y;
  if (!swipeGesture.horizontal) {
    if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { swipeGesture = null; return; }
    if (Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy) * 1.4) return;
    swipeGesture.horizontal = true;
  }
  swipeGesture.dx = dx;
  e.preventDefault();
}, { passive: false });
app.addEventListener('touchend', e => {
  if (touchSort) {
    if ([...(e.touches || [])].some(touch => touch.identifier === touchSort.identifier)) { touchSort.scrollFinger = null; return; }
    finishTouchSort(true); return;
  }
  if (swipeGesture?.horizontal) {
    suppressSwipeClickUntil = Date.now() + 400;
    if (Math.abs(swipeGesture.dx) >= 40) swipeGesture.card.classList.toggle('swipe-open', swipeGesture.dx < 0);
  }
  swipeGesture = null;
});
app.addEventListener('touchcancel', () => { swipeGesture = null; finishTouchSort(); });
app.addEventListener('click', e => {
  if (Date.now() < suppressSwipeClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  const open = e.target.closest('.journal.swipe-open');
  if (open && !e.target.closest('[data-delete-character]')) {
    open.classList.remove('swipe-open');
    e.preventDefault(); e.stopImmediatePropagation();
  } else closeSwipeCards(open);
}, true);
app.addEventListener('click', e => {
  const row = e.target.closest('[data-sort-id]');
  if (!row || e.target.closest('button,input,select,summary,a,[role="button"],.drag-grip')) return;
  if (matchMedia('(pointer:coarse)').matches && !multiSelectMode) return;
  selectRow(row.dataset.sortId, e);
});
app.addEventListener('keydown', e => {
  if (!window.matchMedia('(max-width:600px)').matches) return;
  const card = e.target.closest('.journal');
  if (card && e.key === 'ArrowLeft' && !e.altKey && !e.target.matches('input')) {
    closeSwipeCards(card); card.classList.add('swipe-open'); e.preventDefault();
  }
  if (e.key === 'Escape') closeSwipeCards();
});
app.addEventListener('click', e => {
  const level = e.target.closest('[data-initial-level]');
  if (level && !level.querySelector('input') && editingCharacters.has(level.dataset.initialLevel)) editInitialLevel(level);
});
// Native touch :active can outlive the gesture; own the visual press lifecycle.
let touchPressedButton = null;
document.documentElement.dataset.inputMode = matchMedia('(pointer:coarse)').matches ? 'touch' : 'mouse';
document.addEventListener('keydown', e => {
  if (!e.metaKey && !e.ctrlKey && !e.altKey) document.documentElement.dataset.inputMode = 'keyboard';
}, true);
function clearTouchPress() {
  touchPressedButton?.classList.remove('touch-pressed');
  touchPressedButton = null;
}
document.addEventListener('pointerdown', e => {
  document.documentElement.dataset.inputMode = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  clearTouchPress();
  if (e.pointerType === 'mouse') return;
  const button = e.target.closest('button:not(:disabled)');
  if (button?.matches('.expectation-link') || (matchMedia('(max-width:600px)').matches && button?.matches('.expectation-setting'))) return;
  if (button) { touchPressedButton = button; button.classList.add('touch-pressed'); }
}, true);
document.addEventListener('pointerup', clearTouchPress, true);
document.addEventListener('pointercancel', clearTouchPress, true);
document.addEventListener('click', clearTouchPress, true);
document.addEventListener('touchmove', clearTouchPress, { passive: true, capture: true });
window.addEventListener('blur', clearTouchPress);
document.addEventListener('click', e => {
  if (page !== 'summary' || !e.target.closest('button,summary,a,[role="button"]')) return;
  const rowId = e.target.closest('.journal')?.dataset.sortId;
  let changed = false;
  for (const id of editingCharacters) {
    if (id !== rowId) { editingCharacters.delete(id); changed = true; }
  }
  if (changed) queueMicrotask(() => {
    if (page !== 'summary') return;
    const openMenus = [...app.querySelectorAll('.action-menu')].map(menu => menu.open);
    renderSummary();
    app.querySelectorAll('.action-menu').forEach((menu, index) => { menu.open = openMenus[index] || false; });
  });
}, true);
document.addEventListener('click', e => {
  document.querySelectorAll('.action-menu[open]').forEach(menu => {
    if (!menu.contains(e.target) || e.target.closest('button')) menu.open = false;
  });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.action-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
});
app.addEventListener('click', async e => {
  if (e.target.matches('input[data-level-input]')) e.target.select();
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.rowSelect) { selectRow(b.dataset.rowSelect, { toggle: true, shiftKey:e.shiftKey, ctrlKey:e.ctrlKey, metaKey:e.metaKey }); return; }
  if (b.dataset.expectationEdit) { openExpectationEditor([b.dataset.expectationEdit]); return; }
  if (b.dataset.expectationDetail) { if(b.hasAttribute('data-record-expectation'))openRecordExpectationDetails();else openExpectationDetails(b.dataset.expectationDetail); return; }
  if (b.dataset.action === 'multi-select') { multiSelectMode = !multiSelectMode; if (!multiSelectMode) rowSelection.clear(); refreshRowSelection(); return; }
  if (b.dataset.action === 'select-all-rows') { rowIds().forEach(id => rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'clear-row-selection') { rowSelection.clear(); selectionAnchor = null; refreshRowSelection(); return; }
  if (b.dataset.action === 'invert-rows') { rowIds().forEach(id => rowSelection.has(id) ? rowSelection.delete(id) : rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'batch-expectation') { if (rowSelection.size) openExpectationEditor(rowIds().filter(id => rowSelection.has(id))); return; }
  if (b.dataset.action === 'undo-delete') { undoDelete(); return; }
  if (b.hasAttribute('data-search-history')) {
    query = b.dataset.searchHistory;
    app.querySelector('#search').value = query;
    renderCards(); rememberSearch();
    app.querySelector('#search').focus();
    app.querySelector('#search-history').hidden = true;
    return;
  }
  if (b.hasAttribute('data-clear-search')) {
    searchHistory = [];
    try { localStorage.removeItem(SEARCH_HISTORY_KEY); } catch { /* Optional storage. */ }
    query = '';
    app.querySelector('#search').value = '';
    renderCards();
    app.querySelector('#search').focus();
    app.querySelector('#search-history').hidden = true;
    return;
  }
  if (b.hasAttribute('data-cancel-initial')) { rememberListPosition(); returnToSummary(); return; }
  if (b.dataset.edit) {
    rememberListPosition();
    const index = Number(b.dataset.index);
    const item = state.roster.find(r => r.id === b.dataset.edit);
    const record = item.records[index];
    if (!editingCharacters.has(item.id)) {
      if (record.skipped) {
        record.skipped = false;
        record.upgraded = true;
      } else if (record.upgraded) {
        record.upgraded = false;
      } else {
        record.skipped = true;
      }
      returnToSummary();
      return;
    }
    activeRecord = { id: b.dataset.edit, editIndex: index, stats: [...record.stats], happy: record.ratingPending ? null : record.happy, ratingSource: record.ratingSource || 'legacy' };
     page = 'record'; render(); window.scrollTo(0, 0);
  }
  if (b.dataset.toggleEdit) {
    const id = b.dataset.toggleEdit;
    editingCharacters.has(id) ? editingCharacters.delete(id) : editingCharacters.add(id);
    rememberListPosition(); returnToSummary();
  }
  if (b.dataset.deleteCharacter) {
    const id = b.dataset.deleteCharacter;
    if (!await confirmRecordDeletion(`是否删除${char(id).name}？`)) return;
    softDelete([state.roster.find(item => item.id === id)]);
    state.selection = state.selection.filter(selected => selected !== id);
    delete state.initialLevels[id];
    editingCharacters.delete(id);
    rememberListPosition(); returnToSummary();
  }
  if (b.dataset.character) {
    const id = b.dataset.character;
    state.selection = state.selection.includes(id) ? state.selection.filter(x => x !== id) : [...state.selection, id];
    const selected = state.selection.includes(id);
    const archived = state.roster.find(item => item.id === id && item.deleted);
    if (selected && archived) {
      if (!Object.hasOwn(state.initialLevels,id)) state.initialLevels[id] = archived.initialLevel ?? '';
      state.draftExpectations ||= {};
      if (!Object.hasOwn(state.draftExpectations,id)) state.draftExpectations[id] = M.copy(M.ruleAt(archived, M.nextSeq(archived)));
    }
    b.classList.toggle('selected', selected);
    b.setAttribute('aria-pressed', String(selected));
    updateSelectionCount();
    rememberSearch();
  }
  if (b.dataset.start) {
    rememberListPosition();
    start(b.dataset.start);
  }
  if (b.dataset.stat) {
    const d = activeRecord, s = b.dataset.stat;
    d.stats = d.stats.includes(s) ? d.stats.filter(x => x !== s) : [...d.stats, s];
    applyDraftRating(d);
    updateRecordControls();
  }
  if (b.dataset.rating) { activeRecord.happy = b.dataset.rating === 'happy'; activeRecord.ratingSource = 'manual'; updateRecordControls(); }
  const action = b.dataset.action;
  if (action === 'clear-skipped') {
    if (!visibleRoster().some(item => M.live(item).some(record => record.skipped))) { notify('暂无已跳过记录'); return; }
    if (!await confirmRecordDeletion('是否清空所有已跳过记录？', '清空')) return;
    softDelete(visibleRoster().flatMap(item => M.live(item).filter(record => record.skipped)));
    rememberListPosition(); returnToSummary(); return;
  }
  if (['reset', 'reset-list'].includes(action) && !await confirmRecordDeletion(action === 'reset' ? '是否清空全部角色和记录？' : '是否清空所有升级记录？自定义属性期望将保留。', '清空')) return;
  if (action === 'delete-record') { deleteRecord(); return; }
  if (['select', 'levels', 'summary'].includes(action)) { page = action; render(); }
  if (action === 'leave') { activeRecord = null; returnToSummary(); }
  if (action === 'reset') { softDelete(visibleRoster()); state.selection = []; state.initialLevels = {}; state.draftExpectations = {}; editingCharacters.clear(); activeRecord = null; query = ''; clearDrag(); notify(''); page = 'select'; render(); window.scrollTo(0, 0); }
  if (action === 'reset-list') {
    softDelete(visibleRoster().flatMap(item => M.live(item)));
    editingCharacters.clear(); activeRecord = null;
    rememberListPosition(); returnToSummary();
  }
  if (action === 'batch') {
    const input = document.querySelector('#batch-level');
    if (!validLevel(input)) return;
    state.selection.forEach(id => state.initialLevels[id] = input.value);
    app.querySelectorAll('[data-level]').forEach(field => {
      field.value = input.value;
      clearLevelError(field);
      field.removeAttribute('aria-invalid');
    });
  }
  if (action === 'create') {
    const inputs = [...document.querySelectorAll('[data-level]')];
    if (inputs.some(i => !validLevel(i))) return;
    inputs.forEach(i => {
      const id = i.dataset.level, existing = state.roster.find(item => item.id === id);
      const item = existing || { id, records: [] };
      item.initialLevel = i.value === '' ? null : Number(i.value);
      delete item.deleted; delete item.deletedAt; delete item.deletionBatch;
      if (state.draftExpectations && Object.hasOwn(state.draftExpectations, id)) M.setRule(item, M.nextSeq(item), state.draftExpectations[id], false);
      if (!existing) state.roster.push(item);
    });
    state.draftExpectations = {};
    state.selection = []; state.initialLevels = {};  page = 'summary'; render();
  }
  if (action === 'next' || action === 'finish') saveRecord(action === 'next');
  if (action === 'export') {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = backupFilename(); a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (action === 'import') document.querySelector('#import-file').click();
});
async function importFile(file) {
  if (!file) return;
  try {
    const data = validate(JSON.parse(await file.text()));
    state = trackState(data);
    clearRowSelection();
    editingCharacters.clear();
    activeRecord = null;
    page = visibleRoster().length ? 'summary' : state.selection.length ? 'levels' : 'select';
    render(); window.scrollTo(0, 0); notify('');
  } catch { notify('无法导入：文件不是有效的 Rigging Buddy 备份。当前数据未修改。'); }
  document.querySelector('#import-file').value = '';
}
document.querySelector('#import-file').addEventListener('change', e => importFile(e.target.files[0]));
function finishMouseSort(commit = false) {
  if (!mouseSort) return;
  const gesture = mouseSort;
  cancelAnimationFrame(gesture.frame);
  if (gesture.started && commit && gesture.target) moveCard(gesture.card.dataset.sortId, gesture.target.dataset.sortId, gesture.after);
  clearMoving();
  app.querySelectorAll('.drop-before,.drop-after').forEach(node => node.classList.remove('drop-before', 'drop-after'));
  if (app.hasPointerCapture(gesture.pointerId)) app.releasePointerCapture(gesture.pointerId);
  if (gesture.started) suppressSwipeClickUntil = Date.now() + 400;
  mouseSort = null;
}
function mouseSortTarget(target) {
  if (target.closest('button,input,select,textarea,a,label,summary,[role="button"],[contenteditable],.record-chip')) return null;
  const card = target.closest('[data-sort-id]');
  return card && (card.matches('.journal') || target.closest('.drag-grip')) ? card : null;
}
app.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const card = mouseSortTarget(e.target);
  if (!card) return;
  mouseSort = { card, pointerId: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, started: false };
  app.setPointerCapture(e.pointerId);
  e.preventDefault();
});
app.addEventListener('pointermove', e => {
  if (!mouseSort || mouseSort.pointerId !== e.pointerId) return;
  mouseSort.x = e.clientX; mouseSort.y = e.clientY;
  if (!mouseSort.started && Math.hypot(e.clientX - mouseSort.startX, e.clientY - mouseSort.startY) >= 5) {
    mouseSort.started = true;
    markMoving(mouseSort.card.dataset.sortId);
    startSortScroll(mouseSort);
  }
  if (mouseSort.started) { e.preventDefault(); updateSortMarker(mouseSort); }
});
app.addEventListener('pointerup', e => { if (mouseSort?.pointerId === e.pointerId) finishMouseSort(true); });
app.addEventListener('pointercancel', () => finishMouseSort());
window.addEventListener('blur', () => { finishMouseSort(); finishTouchSort(); });
function clearDrag() {
  finishMouseSort(); finishTouchSort();
  clearMoving();
  document.querySelectorAll('.dragging,.drop-before,.drop-after,.drag-over').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after', 'drag-over'));
}
function moveCard(id, targetId, after = false) {
  const list = page === 'levels' ? state.selection : state.roster;
  const getId = x => typeof x === 'string' ? x : x.id;
  const ids = movingIds(id);
  if (ids.includes(targetId) || !list.some(x => getId(x) === targetId)) return;
  const moved = list.filter(x => ids.includes(getId(x))), remaining = list.filter(x => !ids.includes(getId(x)));
  const targetIndex = remaining.findIndex(x => getId(x) === targetId);
  remaining.splice(targetIndex + (after ? 1 : 0), 0, ...moved);
  list.splice(0, list.length, ...remaining);
  const targetCard = app.querySelector(`[data-sort-id="${targetId}"]`);
  const anchor = after ? targetCard.nextSibling : targetCard;
  moved.forEach(item => targetCard.parentNode.insertBefore(app.querySelector(`[data-sort-id="${getId(item)}"]`), anchor));
  refreshRowSelection();
}
// Sorting uses pointer/touch gestures only. Native DnD remains for backup files.
app.addEventListener('dragstart', e => { e.preventDefault(); });
document.addEventListener('dragover', e => {
  if (!Array.from(e.dataTransfer.types).includes('Files')) return;
  e.preventDefault();
  const zone = e.target.closest('.import-zone');
  if (zone) { e.dataTransfer.dropEffect = 'copy'; zone.classList.add('drag-over'); }
});
document.addEventListener('dragleave', e => {
  const zone = e.target.closest('.import-zone');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
});
document.addEventListener('drop', e => {
  e.preventDefault();
  const zone = e.target.closest('.import-zone');
  if (zone && e.dataTransfer.files.length) importFile(e.dataTransfer.files[0]);
  document.querySelectorAll('.import-zone.drag-over').forEach(el => el.classList.remove('drag-over'));
});
document.addEventListener('dragend', () => {
  document.querySelectorAll('.import-zone.drag-over').forEach(el => el.classList.remove('drag-over'));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (mouseSort || touchSort)) {
    finishMouseSort(); finishTouchSort(); e.preventDefault();
  }
});
app.addEventListener('keydown', e => {
  if (e.target.id === 'search' && ['Enter', 'Escape'].includes(e.key) && !e.isComposing) {
    e.preventDefault();
    if (e.key === 'Enter') rememberSearch();
    app.querySelector('#search-history').hidden = true;
    return;
  }
  if (e.key === 'Enter' && e.target.matches('[data-initial-level]') && editingCharacters.has(e.target.dataset.initialLevel)) {
    e.preventDefault(); editInitialLevel(e.target); return;
  }
  if (e.key === 'Escape' && e.target.closest('[data-initial-form]')) {
    e.preventDefault(); rememberListPosition(); returnToSummary(); return;
  }
  if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key) || !e.target.matches('[data-sort-id]')) return;
  e.preventDefault();
  const ids = movingIds(e.target.dataset.sortId);
  const cards = [...app.querySelectorAll('[data-sort-id]')];
  const selectedIndices = cards.map((c,i) => ids.includes(c.dataset.sortId) ? i : -1).filter(i => i >= 0);
  const index = e.key === 'ArrowUp' ? Math.min(...selectedIndices) : Math.max(...selectedIndices);
  const target = cards[index + (e.key === 'ArrowUp' ? -1 : 1)];
  if (!target) return;
  const id = e.target.dataset.sortId; moveCard(id, target.dataset.sortId, e.key === 'ArrowDown');
  app.querySelector(`[data-sort-id="${id}"]`).focus({ preventScroll: true });
});
// Only used for a same-tab deployment update; existing localStorage is untouched.
function updateSessionKey() {
  return `rigging-buddy:update-session:v1:${new URL('.', window.location.href).pathname}`;
}
window.prepareForAppUpdate = revision => {
  if (mouseSort || touchSort || document.activeElement?.matches('input') || app.querySelector('[data-initial-form]') || app.querySelector('#batch-level')?.value || document.querySelector('dialog[open]')) return false;
  try {
    const snapshot = { schema: 1, revision, savedAt: Date.now(), state, page, query, activeRecord,
      editingCharacters: [...editingCharacters], scrollY: window.scrollY };
    const serialized = JSON.stringify(snapshot);
    sessionStorage.setItem(updateSessionKey(), serialized);
    return sessionStorage.getItem(updateSessionKey()) === serialized;
  } catch {
    // Never discard work if Safari denies storage or the storage quota is full.
    return false;
  }
};
function restoreAfterAppUpdate() {
  try {
    const key = updateSessionKey();
    const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!saved || saved.schema !== 1 || Date.now() - saved.savedAt > 24 * 60 * 60 * 1000) return;
    // A versioned update navigation must be present; ordinary visits start normally.
    if (new URL(window.location.href).searchParams.get('v') !== saved.revision) return;
    saved.state = validate(saved.state);
    if (!['select', 'levels', 'summary', 'record'].includes(saved.page) || typeof saved.query !== 'string' || !Array.isArray(saved.editingCharacters)) return;
    const d = saved.activeRecord;
    if (saved.page === 'record') {
      const item = saved.state.roster.find(r => r.id === d?.id);
      if (!item || !Array.isArray(d.stats) || d.stats.some(s => !STATS.includes(s)) || ![true, false, null].includes(d.happy)) return;
      if (d.editIndex !== undefined && (!Number.isInteger(d.editIndex) || !item.records[d.editIndex])) return;
      d.ratingSource ||= d.editIndex !== undefined ? item.records[d.editIndex].ratingSource : 'legacy';
    }
    state = trackState(saved.state);
    page = saved.page;
    query = saved.query;
    activeRecord = saved.page === 'record' ? d : null;
    saved.editingCharacters.filter(id => state.roster.some(r => r.id === id)).forEach(id => editingCharacters.add(id));
    sessionStorage.removeItem(key);
    setTimeout(() => window.scrollTo(0, Number(saved.scrollY) || 0), 0);
  } catch { /* Leave an unreadable snapshot untouched; do not modify user storage. */ }
}
restoreLocalState();
restoreAfterAppUpdate();
render();
window.addEventListener('pagehide',saveLocalState);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveLocalState();});
