const STATS = ['HP', '力量', '魔力', '速度', '技巧', '防守', '魔防', '幸运', '魅力'];
const app = document.querySelector('#app');
const characters = window.CHARACTERS;
let state = { version: 1, roster: [], selection: [], initialLevels: {} };
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
function nextLevel(item) { return (item.initialLevel ?? 0) + item.records.filter(r => !r.skipped).length + 1; }
function renumberRecords(item) {
  let level = (item.initialLevel ?? 0) + 1;
  item.records.forEach(record => { record.level = level; if (!record.skipped) level++; });
}
function validate(data) {
  if (data.version !== 1 || !Array.isArray(data.roster)) throw Error('备份格式不正确');
  const ids = new Set();
  for (const item of data.roster) {
    if (!characters.some(c => c.id === item.id) || ids.has(item.id) || (item.initialLevel !== null && (!Number.isInteger(item.initialLevel) || item.initialLevel < 1)) || !Array.isArray(item.records)) throw Error('角色数据不正确');
    ids.add(item.id);
    let level = (item.initialLevel ?? 0) + 1;
    item.records.forEach(r => {
      if (r.level !== level || (r.skipped !== undefined && typeof r.skipped !== 'boolean') || !Array.isArray(r.stats) || new Set(r.stats).size !== r.stats.length || r.stats.some(s => !STATS.includes(s)) || typeof r.happy !== 'boolean') throw Error('升级记录不正确');
      if (!r.skipped) level++;
    });
  }
  if (data.selection && (!Array.isArray(data.selection) || data.selection.some(id => !characters.some(c => c.id === id)))) throw Error('角色选择不正确');
  if (data.initialLevels && (typeof data.initialLevels !== 'object' || data.initialLevels === null)) throw Error('初始等级不正确');
}
function levelLabel(item, level) { return item.initialLevel === null ? `LV +${level}` : `LV ${level}`; }
function escapeValue(value) { return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
function validLevel(input) {
  const valid = input.value === '' || /^[1-9][0-9]?$/.test(input.value);
  input.setCustomValidity(valid ? '' : '请输入一至两位整数（1–99），或留空');
  input.setAttribute('aria-invalid', String(!valid));
  if (!valid) input.reportValidity();
  return valid;
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
  app.classList.toggle('has-bottom-bar', page === 'select' || page === 'levels');
  app.classList.toggle('record-page', page === 'record');
  if (page === 'select') renderSelect();
  if (page === 'levels') renderLevels();
  if (page === 'summary') renderSummary();
  if (page === 'record') renderRecord();
}
function renderSelect() {
  app.innerHTML =
    `<div class="toolbar"><label class="search"><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="search" aria-label="搜索角色姓名"></label>${state.roster.length ? '<button data-action="summary">← 返回</button>' : '<button class="import-zone" data-action="import" title="拖入 JSON 备份，或点击选择文件">恢复备份</button>'}</div><div class="character-grid" id="character-grid"></div><div class="bottom-bar"><span id="selected-count"></span><button class="primary" id="choose-next" data-action="levels">下一步 · 设置等级 →</button></div>`;
  document.querySelector('#search').value = query;
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
    const existing = state.roster.some(r => r.id === c.id), selected = state.selection.includes(c.id);
    return `<button class="character ${selected ? 'selected' : ''}" data-character="${c.id}" aria-pressed="${selected}" ${existing ? 'disabled' : ''}>${portrait(c)}<span>${c.name}</span></button>`;
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
    `<section class="panel levels"><div class="toolbar"><label>统一设为 <input id="batch-level" type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="" data-level-input aria-label="统一初始等级"></label><button data-action="batch">应用到全部</button></div><div class="table-head"><span>角色</span><span>当前等级</span></div>${state.selection.map((id, index) => { const c = char(id); return `<div class="level-row" draggable="true" data-sort-id="${id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键"><span class="drag-grip" aria-hidden="true">⠿</span>${portrait(c)}<strong>${c.name}</strong><span class="level-value">LV <input type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="${escapeValue(state.initialLevels[id] ?? '')}" data-level-input data-level="${id}" aria-label="${c.name}初始等级"></span></div>`; }).join('')}</section><div class="bottom-bar"><button data-action="select">← 返回选择</button><button class="primary" data-action="create">开始记录 →</button></div>`;
}
function renderSummary() {
  const total = state.roster.reduce((n, r) => n + r.records.length, 0);
  const happy = state.roster.reduce((n, r) => n + r.records.filter(x => x.happy && !x.skipped).length, 0);
  const markup =
    `<div class="summary-top"><div class="metrics"><div><b>${state.roster.length}</b><span>小队成员</span></div><div><b>${total}</b><span>升级记录</span></div><div><b>${happy}</b><span>满意升级</span></div></div><div class="actions"><button data-action="reset">重置</button><button data-action="reset-list">为当前列表重置</button><button data-action="export">导出</button><button class="import-zone" data-action="import" title="拖入 JSON 备份，或点击选择文件">恢复备份</button><button class="primary" data-action="select">＋ 添加角色</button></div></div><div class="journals">${state.roster.map(item => {
      const c = char(item.id);
      const editing = editingCharacters.has(c.id);
      return `<article class="journal panel" draggable="true" data-sort-id="${c.id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
        <div class="journal-head"><span class="drag-grip" aria-hidden="true">⠿</span>${portrait(c)}<div class="journal-info"><h2>${c.name}</h2><p class="initial-level" data-initial-level="${c.id}" tabindex="0" role="button" title="双击修改初始等级，也可按 Enter">初始等级 ${item.initialLevel === null ? '暂无' : `LV ${item.initialLevel}`}</p></div></div>
        <div class="journal-actions"><button class="primary" data-start="${c.id}">记录升级</button>${item.records.length ? `<button data-toggle-edit="${c.id}" aria-pressed="${editing}">${editing ? '完成编辑' : '编辑'}</button>` : ''}<button class="danger" data-delete-character="${c.id}">删除</button></div>
        <div class="records">${item.records.length ? item.records.map((r, recordIndex) => `<button data-edit="${c.id}" data-index="${recordIndex}" aria-label="${editing ? '编辑' : r.skipped ? '取消跳过' : '跳过'}${c.name} ${levelLabel(item, r.level)}" class="record-chip ${r.happy ? 'happy' : 'angry'} ${r.skipped ? 'skipped' : ''} ${editing ? 'editable' : ''}">${editing ? '<span class="edit-pencil" aria-hidden="true">✎</span>' : ''}<div><b>${levelLabel(item, r.level)}</b><span>${ratingIcon(r.happy)}${r.happy ? '满意' : '不满意'}</span></div><strong>+${r.stats.length} <small>点</small></strong><p>${r.stats.join(' · ') || '本次没有属性提升'}</p>${r.skipped ? '<span class="skip-overlay">已跳过</span>' : ''}</button>`).join('') : '<p class="empty">暂无记录</p>'}</div></article>`;
    }).join('') || '<div class="panel empty">添加角色</div>'}</div>`;
  if (app.querySelector('.summary-top')) {
    const template = document.createElement('template');
    template.innerHTML = markup;
    syncChildren(app, template.content);
  } else app.innerHTML = markup;
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
  activeRecord = { id, stats: [], happy: false };
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
  const next = editing ? item.records[d.editIndex].level : nextLevel(item);
  app.innerHTML = `<button class="back" data-action="leave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m10 5-7 7 7 7M3 12h18"/></svg><span>返回</span></button>` +
    `<div class="record-layout"><aside class="hero panel">${portrait(c)}<div><div class="eyebrow">LEVEL UP</div><h2>${c.name}</h2><div class="big-level">${levelLabel(item, next)}</div><p>${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</p></div></aside><section class="panel stat-panel"><div class="stat-heading"><h2 class="desktop-stat-title">本次属性提升</h2><div class="record-character">${portrait(c)}<h2>${c.name}</h2></div><span>${levelLabel(item, next)}</span></div><div class="stats">${STATS.map((s, i) => `<button class="stat ${d.stats.includes(s) ? 'active' : ''}" style="--row:${i < 5 ? i + 1 : i - 3};--col:${i < 5 ? 1 : 2}" data-stat="${s}" aria-pressed="${d.stats.includes(s)}"><span>${s}</span><b>${d.stats.includes(s) ? '+1 ▲' : '—'}</b></button>`).join('')}</div><div class="total"><span>本次成长</span><strong>+${d.stats.length}<small> 点</small></strong></div><div class="ratings"><button class="happy ${d.happy === true ? 'chosen' : ''}" data-rating="happy" aria-pressed="${d.happy === true}">${ratingIcon(true)} 满意</button><button class="angry ${d.happy === false ? 'chosen' : ''}" data-rating="angry" aria-pressed="${d.happy === false}">${ratingIcon(false)} 不满意</button></div><div class="record-actions"><button data-action="finish" ${d.happy === null && d.stats.length ? 'disabled' : ''}>${editing ? '保存修改并返回' : '保存并结束'}</button>${editing ? '' : `<button class="primary" data-action="next" ${d.happy === null || !d.stats.length ? 'disabled' : ''}>保存 · 下一级 →</button>`}</div></section></div>`;
  if (editing) app.querySelector('.record-actions').insertAdjacentHTML('beforeend', '<button class="danger" data-action="delete-record">删除记录</button>');
}
// Keep portraits and focused buttons mounted during record interactions.
function updateRecordControls() {
  const d = activeRecord;
  app.querySelectorAll('[data-stat]').forEach(button => {
    const selected = d.stats.includes(button.dataset.stat);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('b').textContent = selected ? '+1 ▲' : '—';
  });
  app.querySelector('.total strong').firstChild.nodeValue = `+${d.stats.length}`;
  app.querySelectorAll('[data-rating]').forEach(button => {
    const selected = d.happy === (button.dataset.rating === 'happy');
    button.classList.toggle('chosen', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  app.querySelector('[data-action="finish"]').disabled = d.happy === null && d.stats.length > 0;
  const next = app.querySelector('[data-action="next"]');
  if (next) next.disabled = d.happy === null || !d.stats.length;
}
function deleteRecord() {
  const d = activeRecord;
  if (!d || d.editIndex === undefined) return;
  const item = state.roster.find(r => r.id === d.id);
  if (!item || !item.records[d.editIndex]) return;
  if (d.editIndex !== item.records.length - 1 && !window.confirm('这不是该角色的最后一条记录。删除后，后续记录的等级将重新计算。确定删除这条记录吗？')) return;
  item.records.splice(d.editIndex, 1);
  renumberRecords(item);
  if (!item.records.length) editingCharacters.delete(item.id);
  activeRecord = null;
  returnToSummary();
}
function saveRecord(next) {
  const d = activeRecord;
  if (!d || (d.stats.length && d.happy === null)) return;
  const item = state.roster.find(r => r.id === d.id);
  if (!d.stats.length) {
    if (next) return;
    activeRecord = null;  notify(''); returnToSummary(); return;
  }
  if (d.editIndex !== undefined) {
    item.records[d.editIndex] = { ...item.records[d.editIndex], stats: [...d.stats], happy: d.happy, updatedAt: new Date().toISOString() };
  } else {
    item.records.push({ level: nextLevel(item), stats: [...d.stats], happy: d.happy, createdAt: new Date().toISOString() });
  }
  const id = d.id;
  activeRecord = null;

  if (next) {
    activeRecord = { id, stats: [], happy: false };
    const level = nextLevel(item);
    app.querySelector('.big-level').textContent = levelLabel(item, level);
    app.querySelector('.hero p').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
    app.querySelector('.stat-heading>span').textContent = levelLabel(item, level);
    updateRecordControls();
  } else returnToSummary();

}
app.addEventListener('input', e => {
  if (e.target.matches('[data-level-input]')) { e.target.setCustomValidity(''); e.target.removeAttribute('aria-invalid'); }
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
  label.innerHTML = `<form class="initial-level-form" data-initial-form="${item.id}"><label>初始等级 <input data-level-input type="text" inputmode="numeric" pattern="[1-9][0-9]?" value="${item.initialLevel ?? ''}" aria-label="初始等级，留空删除" placeholder="暂无"></label><button type="submit">保存</button><button type="button" data-cancel-initial>取消</button></form>`;
  label.querySelector('input').focus();
}
app.addEventListener('dblclick', e => {
  const label = e.target.closest('[data-initial-level]');
  if (label) editInitialLevel(label);
});
app.addEventListener('submit', e => {
  const form = e.target.closest('[data-initial-form]');
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  if (!validLevel(input)) return;
  const item = state.roster.find(r => r.id === form.dataset.initialForm);
  item.initialLevel = input.value === '' ? null : Number(input.value);
  renumberRecords(item);
  rememberListPosition(); returnToSummary();
});
app.addEventListener('click', e => {
  if (e.target.matches('input[data-level-input]')) e.target.select();
  const b = e.target.closest('button'); if (!b || b.disabled) return;
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
      record.skipped = !record.skipped;
      renumberRecords(item);
      returnToSummary();
      return;
    }
    activeRecord = { id: b.dataset.edit, editIndex: index, stats: [...record.stats], happy: record.happy };
     page = 'record'; render(); window.scrollTo(0, 0);
  }
  if (b.dataset.toggleEdit) {
    const id = b.dataset.toggleEdit;
    editingCharacters.has(id) ? editingCharacters.delete(id) : editingCharacters.add(id);
    rememberListPosition(); returnToSummary();
  }
  if (b.dataset.deleteCharacter) {
    const id = b.dataset.deleteCharacter;
    state.roster = state.roster.filter(item => item.id !== id);
    state.selection = state.selection.filter(selected => selected !== id);
    delete state.initialLevels[id];
    editingCharacters.delete(id);
    rememberListPosition(); returnToSummary();
  }
  if (b.dataset.character) {
    const id = b.dataset.character;
    state.selection = state.selection.includes(id) ? state.selection.filter(x => x !== id) : [...state.selection, id];
    const selected = state.selection.includes(id);
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
    d.happy = d.stats.length === 4 ? null : d.stats.length >= 5;
    updateRecordControls();
  }
  if (b.dataset.rating) { activeRecord.happy = b.dataset.rating === 'happy'; updateRecordControls(); }
  const action = b.dataset.action;
  if (action === 'delete-record') { deleteRecord(); return; }
  if (['select', 'levels', 'summary'].includes(action)) { page = action; render(); }
  if (action === 'leave') { activeRecord = null; returnToSummary(); }
  if (action === 'reset') { state = { version: 1, roster: [], selection: [], initialLevels: {} }; editingCharacters.clear(); activeRecord = null; query = ''; clearDrag(); notify(''); page = 'select'; render(); window.scrollTo(0, 0); }
  if (action === 'reset-list') {
    state.roster.forEach(item => { item.records = []; });
    editingCharacters.clear(); activeRecord = null;
    rememberListPosition(); returnToSummary();
  }
  if (action === 'batch') {
    const input = document.querySelector('#batch-level');
    if (!validLevel(input)) return;
    state.selection.forEach(id => state.initialLevels[id] = input.value);
    app.querySelectorAll('[data-level]').forEach(field => {
      field.value = input.value;
      field.setCustomValidity('');
      field.removeAttribute('aria-invalid');
    });
  }
  if (action === 'create') {
    const inputs = [...document.querySelectorAll('[data-level]')];
    if (inputs.some(i => !validLevel(i))) return;
    inputs.forEach(i => state.roster.push({ id: i.dataset.level, initialLevel: i.value === '' ? null : Number(i.value), records: [] }));
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
    const data = JSON.parse(await file.text()); validate(data);
    state = { version: 1, roster: data.roster, selection: data.selection || [], initialLevels: data.initialLevels || {} };
    editingCharacters.clear();
    activeRecord = null;
    page = state.roster.length ? 'summary' : state.selection.length ? 'levels' : 'select';
    render(); window.scrollTo(0, 0); notify('');
  } catch { notify('无法导入：文件不是有效的 Rigging Buddy 备份。当前数据未修改。'); }
  document.querySelector('#import-file').value = '';
}
document.querySelector('#import-file').addEventListener('change', e => importFile(e.target.files[0]));
let dragId = null;
function isAfter(event, card) { const rect = card.getBoundingClientRect(); return event.clientY >= rect.top + rect.height / 2; }
function clearDrag() {
  dragId = null;
  document.querySelectorAll('.dragging,.drop-before,.drop-after,.drag-over').forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after', 'drag-over'));
}
function moveCard(id, targetId, after = false) {
  const list = page === 'levels' ? state.selection : state.roster;
  const getId = x => typeof x === 'string' ? x : x.id;
  const from = list.findIndex(x => getId(x) === id), to = list.findIndex(x => getId(x) === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [moved] = list.splice(from, 1);
  const targetIndex = list.findIndex(x => getId(x) === targetId);
  list.splice(targetIndex + (after ? 1 : 0), 0, moved);
  const movedCard = app.querySelector(`[data-sort-id="${id}"]`);
  const targetCard = app.querySelector(`[data-sort-id="${targetId}"]`);
  targetCard.parentNode.insertBefore(movedCard, after ? targetCard.nextSibling : targetCard);
}
app.addEventListener('dragstart', e => {
  const card = e.target.closest('[data-sort-id]');
  if (!card || e.target.closest('button,input,[data-initial-level]')) { e.preventDefault(); return; }
  dragId = card.dataset.sortId;
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  card.classList.add('dragging');
});
document.addEventListener('dragover', e => {
  const zone = e.target.closest('.import-zone');
  const card = e.target.closest('[data-sort-id]');
  if (zone && Array.from(e.dataTransfer.types).includes('Files')) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; zone.classList.add('drag-over');
  } else if (dragId && card) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));
    if (card.dataset.sortId !== dragId) card.classList.add(isAfter(e, card) ? 'drop-after' : 'drop-before');
    if (e.clientY < 70) window.scrollBy(0, -20);
    else if (e.clientY > innerHeight - 70) window.scrollBy(0, 20);
  } else if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault();
});
document.addEventListener('dragleave', e => {
  const zone = e.target.closest('.import-zone');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
});
document.addEventListener('drop', e => {
  e.preventDefault();
  const zone = e.target.closest('.import-zone'), card = e.target.closest('[data-sort-id]');
  if (zone && e.dataTransfer.files.length) importFile(e.dataTransfer.files[0]);
  else if (dragId && card) moveCard(dragId, card.dataset.sortId, isAfter(e, card));
  clearDrag();
});
document.addEventListener('dragend', clearDrag);
app.addEventListener('keydown', e => {
  if (e.target.id === 'search' && ['Enter', 'Escape'].includes(e.key) && !e.isComposing) {
    e.preventDefault();
    if (e.key === 'Enter') rememberSearch();
    app.querySelector('#search-history').hidden = true;
    return;
  }
  if (e.key === 'Enter' && e.target.matches('[data-initial-level]')) {
    e.preventDefault(); editInitialLevel(e.target); return;
  }
  if (e.key === 'Escape' && e.target.closest('[data-initial-form]')) {
    e.preventDefault(); rememberListPosition(); returnToSummary(); return;
  }
  if (!e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key) || !e.target.matches('[data-sort-id]')) return;
  e.preventDefault();
  const cards = [...app.querySelectorAll('[data-sort-id]')], index = cards.indexOf(e.target);
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
  if (dragId || document.activeElement?.matches('input') || app.querySelector('[data-initial-form]') || app.querySelector('#batch-level')?.value) return false;
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
    validate(saved.state);
    if (!['select', 'levels', 'summary', 'record'].includes(saved.page) || typeof saved.query !== 'string' || !Array.isArray(saved.editingCharacters)) return;
    const d = saved.activeRecord;
    if (saved.page === 'record') {
      const item = saved.state.roster.find(r => r.id === d?.id);
      if (!item || !Array.isArray(d.stats) || d.stats.some(s => !STATS.includes(s)) || ![true, false, null].includes(d.happy)) return;
      if (d.editIndex !== undefined && (!Number.isInteger(d.editIndex) || !item.records[d.editIndex])) return;
    }
    state = saved.state;
    page = saved.page;
    query = saved.query;
    activeRecord = saved.page === 'record' ? d : null;
    saved.editingCharacters.filter(id => state.roster.some(r => r.id === id)).forEach(id => editingCharacters.add(id));
    sessionStorage.removeItem(key);
    setTimeout(() => window.scrollTo(0, Number(saved.scrollY) || 0), 0);
  } catch { /* Leave an unreadable snapshot untouched; do not modify user storage. */ }
}
restoreAfterAppUpdate();
render();
