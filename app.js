const STATS = window.RiggingModel.stats;
const app = document.querySelector('#app');
const characters = window.CHARACTERS;
const M = window.RiggingModel;
const LOCAL_STATE_KEY = `rigging-buddy:save:${new URL('.', location.href).pathname}`;
const LOCAL_PAGE_KEY = `${LOCAL_STATE_KEY}:page`;
const trackedObjects = new WeakMap();
let localSaveTimer, storageReady = false, storageBlocked = false, storageWarning = false, lastLocalSave = null;
let storageIssue = '';
function setStorageIssue(issue = '') {
  const previousIssue = storageIssue;
  storageIssue = issue;
  storageBlocked = issue === 'read' || issue === 'conflict';
  storageWarning = issue === 'write';
  const banner = document.querySelector('#storage-status');
  banner.hidden = !issue;
  if (!issue) { banner.replaceChildren(); return; }
  if (previousIssue === issue && banner.childNodes.length) return;
  const message = issue === 'read' ? '本地记录无法读取，原文件已保留。' : issue === 'conflict' ? '另一页已保存，此页更改尚未保存。' : '此页更改尚未保存。';
  const action = issue === 'read' ? '恢复备份' : issue === 'conflict' ? '保存此页' : '重试保存';
  const exportLabel = issue === 'read' && typeof lastLocalSave === 'string' ? '导出原文件' : '导出备份';
  banner.innerHTML = `<span>${message}</span><div><button data-storage-action="${issue === 'read' ? 'import' : 'save'}">${action}</button><button data-storage-action="export">${exportLabel}</button></div>`;
}
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
function saveLocalState(replace = false) {
  clearTimeout(localSaveTimer);
  if (!storageReady || (storageBlocked && replace !== true)) return false;
  try {
    const serialized=JSON.stringify(state);
    if(serialized===lastLocalSave && !storageIssue && replace !== true)return true;
    // Do not silently overwrite work saved by another tab.
    if(replace !== true && localStorage.getItem(LOCAL_STATE_KEY)!==lastLocalSave) {
      setStorageIssue('conflict');return false;
    }
    localStorage.setItem(LOCAL_STATE_KEY,serialized);lastLocalSave=serialized;setStorageIssue();return true;
  } catch {
    setStorageIssue('write');return false;
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
    setStorageIssue('read');
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
function notify(text) {
  clearTimeout(noticeTimer);
  document.querySelector('#notice').textContent = text;
  if (text) noticeTimer = setTimeout(() => document.querySelector('#notice').textContent = '', 4000);
}
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
function exportBackup(text = JSON.stringify(state, null, 2)) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = backupFilename(); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector('#storage-status').addEventListener('click', e => {
  const action = e.target.closest('[data-storage-action]')?.dataset.storageAction;
  if (action === 'save') saveLocalState(storageIssue === 'conflict');
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'export') exportBackup(storageIssue === 'read' && typeof lastLocalSave === 'string' ? lastLocalSave : undefined);
});
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
    `<div class="toolbar"><label class="search"><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="search" aria-label="搜索角色姓名"></label>${visibleRoster().length ? '<button data-action="summary">← 返回</button>' : '<button class="import-zone" data-action="import">恢复备份</button>'}</div><div class="character-grid" id="character-grid"></div><div class="bottom-bar"><span id="selected-count"></span><button class="primary" id="choose-next" data-action="levels">下一步 · 设置等级 →</button></div>`;
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
    `<section class="panel levels"><div class="toolbar setup-toolbar"><label>统一设为 <input id="batch-level" type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" value="" data-level-input aria-label="统一初始等级"></label><button data-action="batch">应用到全部</button>${selectionToolbar()}</div><p class="expectation-default-note">${defaultRuleText}</p><div class="table-head"><span>角色</span><span>当前等级（可留空）</span><span>属性期望</span></div>${state.selection.map(id => { const c = char(id); return `<div class="level-row" draggable="false" data-sort-id="${id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span>${portrait(c)}<strong>${c.name}</strong><span class="level-value">LV <input type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" value="${escapeValue(state.initialLevels[id] ?? '')}" data-level-input data-level="${id}" aria-label="${c.name}初始等级"></span><button class="expectation-setting" data-expectation-edit="${id}" aria-label="设置${c.name}属性期望">${escapeValue(ruleSummary(state.draftExpectations?.[id]))}</button></div>`; }).join('')}</section><div class="bottom-bar"><button data-action="select">← 返回选择</button><button class="primary" data-action="create">开始记录 →</button></div>`;
}
function recordStats(stats) {
  const groups = [STATS.slice(0, 5), STATS.slice(5)].map(group => group.filter(stat => stats.includes(stat))).filter(group => group.length);
  return groups.length ? groups.map(group => `<span class="stat-line">${group.map(stat => `<span class="stat-name">${stat}</span>`).join('<span class="stat-separator" aria-hidden="true"> · </span>')}</span>`).join('') : '<span class="stat-line">本次没有属性提升</span>';
}
function pencilIcon(className) {
  return `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.5 2.5 3 3M2.5 13.5l3.5-.8 7.5-7.5a2.1 2.1 0 0 0-3-3L3 9.7z"/></svg>`;
}
const expandedJournals = new Set();
let recordReturnId = null;
const recordRails = new WeakMap();
const desktopRecords = matchMedia('(min-width:601px)');
function compactRecords(item) {
  const records = M.live(item);
  return records.length > 5 || records.filter(r => r.upgraded || r.skipped).length >= 2;
}
function railState(rail) {
  if (!recordRails.has(rail)) recordRails.set(rail, { frame: 0, timer: 0, signature: '', initialized: false, step: 0 });
  return recordRails.get(rail);
}
function stopRail(rail, keepWheel = false) {
  const status = railState(rail);
  cancelAnimationFrame(status.frame); clearTimeout(status.timer); status.frame = 0;
  clearTimeout(status.autoTimer); status.autoUntil = 0;
  status.edgeAnimations?.forEach(animation => animation.cancel());
  status.edgeAnimations = null;
  if (!keepWheel) status.wheelGesture = null;
}
function moveRail(rail, target, duration = 120) {
  stopRail(rail);
  target = Math.max(0, Math.min(target, rail.scrollWidth - rail.clientWidth));
  const from = rail.scrollLeft, status = railState(rail);
  if (!duration || Math.abs(target - from) < 1 || matchMedia('(prefers-reduced-motion:reduce)').matches) {
    rail.scrollLeft = target; return;
  }
  const start = performance.now();
  const tick = now => {
    const t = Math.min(1, (now - start) / duration);
    rail.scrollLeft = from + (target - from) * (1 - Math.pow(1 - t, 3));
    if (t < 1) status.frame = requestAnimationFrame(tick);
    else { status.frame = 0; clearTimeout(status.timer); }
  };
  status.frame = requestAnimationFrame(tick);
}
function defaultRailPosition(rail) {
  const chips = [...rail.querySelectorAll('.record-chip')];
  let processed = 0;
  while (processed < chips.length && chips[processed].matches('.upgraded,.skipped')) processed++;
  return Math.max(0, processed - 1) * (parseFloat(rail.style.getPropertyValue('--chip-width')) + 10);
}
function autoPositionRail(rail, duration = 120) {
  const status = railState(rail);
  clearTimeout(status.autoTimer);
  const deadline = Math.max(status.autoUntil || 0, status.returnUntil || 0);
  if (deadline > performance.now()) {
    status.autoTimer = setTimeout(() => {
      if (!rail.isConnected) return;
      autoPositionRail(rail, duration);
    }, deadline - performance.now());
    return;
  }
  status.autoPending = false;
  status.returnUntil = 0;
  clearTimeout(status.returnTimer);
  if (status.retiring) { finishRecordRail(rail, duration); return; }
  moveRail(rail, defaultRailPosition(rail), duration);
}
function scheduleRecordReturn(rail) {
  const status = railState(rail);
  clearTimeout(status.returnTimer);
  status.returnUntil = performance.now() + 5000;
  status.returnTimer = setTimeout(() => {
    if (!rail.isConnected) return;
    status.returnUntil = 0;
    status.autoUntil = 0;
    autoPositionRail(rail);
  }, 5000);
}
function finishRecordRail(rail, duration = 120) {
  const status = railState(rail);
  const chips = [...rail.querySelectorAll('.record-chip')];
  const before = chips.map(chip => chip.getBoundingClientRect());
  const height = rail.getBoundingClientRect().height;
  status.retiring = false;
  status.autoPending = false;
  stopRail(rail);
  expandedJournals.delete(rail.closest('.journal').dataset.sortId);
  renderSummary();
  if (!duration || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  // Leaving rail mode resets scrollLeft in layout. Animate from the old visual
  // positions so the return to the grid has the same motion as a normal scroll.
  chips.forEach((chip, index) => {
    const next = chip.getBoundingClientRect(), previous = before[index];
    const x = previous.left - next.left, y = previous.top - next.top;
    if (Math.abs(x) > 1 || Math.abs(y) > 1 || Math.abs(previous.width - next.width) > 1) {
      chip.animate([
        { transformOrigin: 'top left', transform: `translate(${x}px,${y}px) scaleX(${previous.width / next.width})` },
        { transformOrigin: 'top left', transform: 'none' }
      ], { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  });
  const nextHeight = rail.getBoundingClientRect().height;
  if (Math.abs(height - nextHeight) > 1) rail.animate([
    { height: `${height}px` }, { height: `${nextHeight}px` }
  ], { duration, easing: 'cubic-bezier(.16,1,.3,1)' });
}
app.addEventListener('pointerout', event => {
  if (event.pointerType !== 'mouse' || !desktopRecords.matches) return;
  const journal = event.target.closest('.journal');
  if (!journal?.matches('.has-record-rail:not(.records-expanded)') || journal.contains(event.relatedTarget)) return;
  const rail = journal.querySelector('.records'), status = railState(rail);
  if (!status.autoPending || status.returnUntil) return;
  status.autoUntil = 0;
  autoPositionRail(rail);
});
function setJournalExpanded(journal, expanded, animate = true) {
  const rail = journal.querySelector('.records');
  railState(rail).autoPending = false;
  railState(rail).returnUntil = 0;
  clearTimeout(railState(rail).returnTimer);
  if (railState(rail).retiring) { finishRecordRail(rail, animate ? 120 : 0); return; }
  const previousHeight = rail.getBoundingClientRect().height;
  const chips = [...rail.querySelectorAll('.record-chip')];
  const slideOpen = expanded && !journal.classList.contains('records-expanded') && chips.length <= 5;
  const previousPositions = slideOpen ? chips.map(chip => chip.getBoundingClientRect()) : [];
  stopRail(rail);
  rail.getAnimations().forEach(animation => animation.cancel());
  chips.forEach(chip => chip.getAnimations().forEach(animation => animation.cancel()));
  expanded ? expandedJournals.add(journal.dataset.sortId) : expandedJournals.delete(journal.dataset.sortId);
  journal.classList.toggle('records-expanded', expanded);
  const button = journal.querySelector('[data-expand-records]');
  if (button) { button.textContent = expanded ? '收起' : '展开'; button.setAttribute('aria-expanded', String(expanded)); }
  if (expanded) rail.scrollLeft = 0;
  else moveRail(rail, defaultRailPosition(rail));
  const nextHeight = rail.getBoundingClientRect().height;
  // Short lists keep the same height: animate the cards back from their
  // scrolled positions so revealing hidden history still has a visible motion.
  if (slideOpen && animate && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
    chips.forEach((chip, index) => {
      const next = chip.getBoundingClientRect(), previous = previousPositions[index];
      const x = previous.left - next.left, y = previous.top - next.top;
      if (Math.abs(x) > 1 || Math.abs(y) > 1) chip.animate([
        { transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }
      ], { duration: 120, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
  }
  if (animate && !matchMedia('(prefers-reduced-motion:reduce)').matches && Math.abs(nextHeight - previousHeight) > 1) {
    rail.animate([{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }], {
      duration: 130, easing: 'cubic-bezier(.16,1,.3,1)'
    });
  }
}
function refreshRecordRails() {
  app.querySelectorAll('.journal').forEach(journal => {
    const rail = journal.querySelector('.records');
    const status = railState(rail);
    const first = !status.initialized;
    status.initialized = true;
    if (!desktopRecords.matches || !journal.classList.contains('has-record-rail')) {
      status.autoPending = false;
      status.returnUntil = 0;
      clearTimeout(status.returnTimer);
      stopRail(rail); rail.scrollLeft = 0; status.signature = ''; return;
    }
    const width = rail.clientWidth;
    const columns = Math.max(1, Math.min(5, Math.floor((width + 10) / 190)));
    const step = (width - (columns - 1) * 10) / columns + 10;
    const previousPosition = status.step ? rail.scrollLeft / status.step : 0;
    rail.style.setProperty('--chip-width', `${step - 10}px`);
    rail.style.setProperty('--record-columns', columns);
    const signature = [...rail.querySelectorAll('.record-chip')].map(chip => `${chip.dataset.index}:${chip.matches('.upgraded,.skipped')}`).join('|');
    if (status.signature !== signature) {
      status.signature = signature;
      if (!journal.classList.contains('records-expanded')) autoPositionRail(rail, first ? 0 : 120);
    } else if (status.step !== step && !journal.classList.contains('records-expanded')) {
      // Selection adds a checkbox column. Keep the same reviewed card when
      // its width changes, instead of resetting the user's browsing position.
      moveRail(rail, previousPosition * step, 0);
    }
    status.step = step;
  });
}
function bounceRailEdge(rail, direction) {
  stopRail(rail);
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const status = railState(rail);
  const distance = -direction * parseFloat(rail.style.getPropertyValue('--chip-width')) / 2;
  status.edgeDirection = direction;
  status.edgeAnimations = [...rail.querySelectorAll('.record-chip')].map(chip => chip.animate([
    { transform: 'translateX(0)', offset: 0, easing: 'ease-out' },
    { transform: `translateX(${distance}px)`, offset: .4, easing: 'ease-in-out' },
    { transform: 'translateX(0)', offset: 1 }
  ], { duration: 320 }));
}
function scheduleRailSnap(rail) {
  const status = railState(rail);
  clearTimeout(status.timer);
  status.timer = setTimeout(() => {
    const step = parseFloat(rail.style.getPropertyValue('--chip-width')) + 10;
    let target = Math.round(rail.scrollLeft / step) * step;
    // Finish wheel gestures in their direction, including any partial card.
    const gesture = status.wheelGesture;
    if (gesture) {
      // scrollLeft is pixel-rounded while card widths can be fractional.
      const position = (rail.scrollLeft - gesture.direction * .5) / step;
      target = (gesture.direction > 0 ? Math.ceil(position) : Math.floor(position)) * step;
      const minimum = (Math.round(gesture.start / step) + gesture.direction) * step;
      target = gesture.direction > 0 ? Math.max(target, minimum) : Math.min(target, minimum);
    }
    moveRail(rail, target, 80);
  }, 70);
}
app.addEventListener('wheel', event => {
  const rail = event.target.closest('.has-record-rail:not(.records-expanded) .records');
  if (!desktopRecords.matches || !rail || event.ctrlKey) return;
  event.preventDefault();
  const delta = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? rail.clientWidth : 1);
  if (!delta) return;
  const status = railState(rail), direction = Math.sign(delta);
  if (status.returnUntil) scheduleRecordReturn(rail);
  // Let one edge bounce finish during a wheel burst; reversing cancels it.
  if (status.edgeDirection === direction && status.edgeAnimations?.some(animation => animation.playState === 'running')) return;
  stopRail(rail, true);
  const target = Math.max(0, Math.min(rail.scrollLeft + delta, rail.scrollWidth - rail.clientWidth));
  if (target === rail.scrollLeft) { bounceRailEdge(rail, direction); return; }
  if (status.wheelGesture?.direction !== direction) status.wheelGesture = { start: rail.scrollLeft, direction };
  rail.scrollLeft = target;
  scheduleRailSnap(rail);
}, { passive: false });
app.addEventListener('scroll', event => {
  const rail = event.target;
  if (!desktopRecords.matches || !rail.matches?.('.has-record-rail:not(.records-expanded) .records')) return;
  const status = railState(rail);
  if (status.frame || status.autoUntil > performance.now()) return;
  scheduleRailSnap(rail);
}, true);
app.addEventListener('pointerdown', event => {
  const rail = event.target.closest('.records');
  if (rail) stopRail(rail);
});
document.addEventListener('click', event => {
  if (page !== 'summary' || !desktopRecords.matches || Date.now() < suppressGestureClickUntil) return;
  app.querySelectorAll('.has-record-rail').forEach(journal => {
    if (!journal.contains(event.target)) setJournalExpanded(journal, false);
  });
}, true);
window.addEventListener('resize', refreshRecordRails);
function renderSummary() {
  const total = visibleRoster().reduce((n, r) => n + M.live(r).length, 0);
  const happy = visibleRoster().reduce((n, r) => n + M.live(r).filter(x => x.happy && !x.skipped && !x.ratingPending).length, 0);
  const canUndo = state.roster.some(item => item.deleted || item.records.some(record => record.deleted));
  const hasSkipped = visibleRoster().some(item => M.live(item).some(record => record.skipped));
  const markup =
    `<div class="summary-top"><div class="metrics"><div><b>${visibleRoster().length}</b><span>小队成员</span></div><div><b>${total}</b><span>升级记录</span></div><div><b>${happy}</b><span>满意升级</span></div></div><div class="summary-controls">${selectionToolbar()}<div class="actions summary-actions"><button class="primary" data-action="select"><svg class="add-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg><span>添加角色</span></button><details class="action-menu" name="summary-tools"><summary>备份 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="export">导出备份</button><button class="import-zone" data-action="import">恢复备份</button></div></details><details class="action-menu" name="summary-tools"><summary>更多 <svg class="menu-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="menu-panel"><button data-action="undo-delete" ${canUndo ? '' : 'disabled'}>撤回上次删除</button><button class="menu-danger" data-action="clear-skipped" ${hasSkipped ? '' : 'disabled'}>清空已跳过</button><button class="menu-danger" data-action="reset-list" ${total ? '' : 'disabled'}>清空升级记录</button><button class="menu-danger" data-action="reset">清空全部</button></div></details></div></div></div><div class="journals">${visibleRoster().map(item => {
      const c = char(item.id);
      const editing = editingCharacters.has(c.id);
      const displayLevels = M.displayLevels(item);
      const previousRail = app.querySelector(`.journal[data-sort-id="${c.id}"] .records`);
      const compact = compactRecords(item) || (desktopRecords.matches && previousRail && railState(previousRail).retiring);
      return `<article class="journal panel ${compact ? 'has-record-rail' : ''} ${expandedJournals.has(c.id) ? 'records-expanded' : ''}" draggable="false" data-sort-id="${c.id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
        <div class="journal-head"><span class="drag-grip" aria-hidden="true">${dragGrip()}</span>${portrait(c)}<div class="journal-info"><h2>${c.name}</h2><p class="initial-level ${editing ? 'can-edit' : ''}" data-initial-level="${c.id}" ${editing ? 'tabindex="0" role="button"' : ''}>初始等级 ${item.initialLevel === null ? '暂无' : `LV ${item.initialLevel}`}${pencilIcon('initial-pencil')}</p>${expectationLink(item, editing)}</div></div>
        <div class="journal-actions"><button class="primary" data-start="${c.id}">记录升级</button><button data-toggle-edit="${c.id}" aria-pressed="${editing}">${editing ? '完成编辑' : '编辑'}</button>${compact ? `<button class="expand-records" data-expand-records="${c.id}" aria-expanded="${expandedJournals.has(c.id)}">${expandedJournals.has(c.id) ? '收起' : '展开'}</button>` : ''}</div>
        <div class="records">${M.live(item).length ? item.records.map((r, recordIndex) => r.deleted ? '' : `<button data-edit="${c.id}" data-index="${recordIndex}" data-growth="+${r.stats.length}" aria-label="${c.name} ${levelLabel(item, displayLevels[recordIndex])}，${r.skipped ? '已跳过，' : r.upgraded ? '已升级，' : ''}${r.ratingPending ? '待评价' : r.happy ? '满意' : '不满意'}，提升 ${r.stats.length} 点：${r.stats.join('、') || '无'}。${editing ? '编辑记录' : r.skipped ? '标记已升级' : r.upgraded ? '恢复原样' : '标记已跳过'}" class="record-chip ${r.ratingPending ? 'rating-pending' : r.happy ? 'happy' : 'angry'} ${r.skipped ? 'skipped' : r.upgraded ? 'upgraded' : ''} ${editing ? 'editable' : ''}">${editing ? pencilIcon('edit-pencil') : ''}<div><b>${levelLabel(item, displayLevels[recordIndex])}</b>${professionMarkup(r.profession, editing, c.id, recordIndex)}<span>${r.ratingPending ? '待评价' : ratingIcon(r.happy) + (r.happy ? '满意' : '不满意')}</span></div><strong>+${r.stats.length} <small>点</small></strong><p>${recordStats(r.stats)}</p>${r.skipped || r.upgraded ? `<span class="record-overlay ${r.skipped ? 'skip-overlay' : 'upgrade-overlay'}">${r.skipped ? '已跳过' : '已升级'}</span>` : ''}</button>`).join('') : '<p class="empty">暂无记录</p>'}</div></article>`;
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
    for (const attribute of ['data-sort-id', 'data-start', 'data-toggle-edit', 'data-edit']) {
      if (node.hasAttribute(attribute)) return `${attribute}:${node.getAttribute(attribute)}:${node.getAttribute('data-index') || ''}`;
    }
    return null;
  };
  const keyed = new Map([...current.childNodes].filter(key).map(node => [key(node), node]));
  let cursor = current.firstChild;
  // Selection owns this leading checkbox; it is absent from the render template.
  // Keep it out of reconciliation so updates retain the journal's record rail.
  if (current.matches?.('.journal') && cursor?.nodeType === 1 && cursor.matches('.row-select')) cursor = cursor.nextSibling;
  for (const next of [...desired.childNodes]) {
    const id = key(next);
    let node = id ? keyed.get(id) : cursor;
    if (!node || node.nodeType !== next.nodeType || node.nodeName !== next.nodeName || key(node) !== id) {
      node = next.cloneNode(true);
      current.insertBefore(node, cursor);
    } else {
      if (node !== cursor) current.insertBefore(node, cursor);
      if (node.nodeType === 1) {
        const chipWidth = node.matches('.records') ? node.style.getPropertyValue('--chip-width') : '';
        const recordColumns = node.matches('.records') ? node.style.getPropertyValue('--record-columns') : '';
        for (const attribute of [...node.attributes]) {
          if (!next.hasAttribute(attribute.name)) node.removeAttribute(attribute.name);
        }
        for (const attribute of [...next.attributes]) {
          if (node.getAttribute(attribute.name) !== attribute.value) node.setAttribute(attribute.name, attribute.value);
        }
        // Rail sizing is measured at runtime; retain it through record updates.
        if (chipWidth) node.style.setProperty('--chip-width', chipWidth);
        if (recordColumns) node.style.setProperty('--record-columns', recordColumns);
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
  recordReturnId = desktopRecords.matches ? id : null;
  activeRecord = newRecordDraft(id);
   page = 'record'; render(); window.scrollTo(0, 0);
}
function rememberListPosition() {
  state.summaryScroll = Math.max(0, window.scrollY);

  notify('');
}
function returnToSummary() {
  const returnId = recordReturnId;
  recordReturnId = null;
  page = 'summary'; render();
  window.scrollTo(0, Number(state.summaryScroll) || 0);
  const rail = returnId && desktopRecords.matches
    ? app.querySelector(`.journal.has-record-rail:not(.records-expanded)[data-sort-id="${returnId}"] .records`)
    : null;
  if (rail && rail.scrollWidth > rail.clientWidth) {
    // Align the latest card with the right edge, excluding the rail's trailing spacer.
    const latest = rail.querySelector('.record-chip:last-child');
    const target = rail.scrollLeft + latest.getBoundingClientRect().right
      - rail.getBoundingClientRect().left - rail.clientWidth;
    moveRail(rail, target, 0);
    const status = railState(rail);
    status.autoPending = true;
    scheduleRecordReturn(rail);
  }
}
function renderRecord() {
  const d = activeRecord, c = char(d.id), item = state.roster.find(r => r.id === d.id);
  const editing = d.editIndex !== undefined;
  const next = editing ? recordDisplayLevel(item, item.records[d.editIndex]) : nextLevel(item);
  app.innerHTML = `<button class="back" data-action="leave"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m10 5-7 7 7 7M3 12h18"/></svg><span>返回</span></button>` +
    `<div class="record-layout"><aside class="hero panel">${portrait(c)}<div><div class="eyebrow">LEVEL UP</div><h2>${c.name}</h2><div class="big-level">${levelLabel(item, next)}</div><p>${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</p></div></aside><section class="panel stat-panel"><div class="stat-heading"><h2 class="desktop-stat-title">本次属性提升</h2><div class="record-character">${portrait(c)}<div><h2>${c.name}</h2><p class="record-level"><span class="record-level-current">${levelLabel(item, next)}</span><span class="record-level-transition">${levelLabel(item, next - 1)} → ${levelLabel(item, next)}</span></p></div></div><span class="record-target-level">${levelLabel(item, next)}</span><span class="growth-total heading-growth" aria-live="polite"><strong>+${d.stats.length}</strong><small> 点</small></span>${professionMarkup(d.profession, true)}</div><div class="stats"><span class="growth-total stats-growth" aria-live="polite"><strong>+${d.stats.length}</strong><small> 点</small></span>${STATS.map((s, i) => `<button class="stat ${d.stats.includes(s) ? 'active' : ''}" style="--row:${i < 5 ? i + 1 : i - 3};--col:${i < 5 ? 1 : 2}" data-stat="${s}" aria-pressed="${d.stats.includes(s)}"><span>${s}</span><b>${d.stats.includes(s) ? '+1' : '—'}</b></button>`).join('')}</div><div class="rating-rule-note"><button class="expectation-link" data-expectation-detail="${d.id}" data-record-expectation>属性期望</button></div><div class="ratings"><button class="happy ${d.happy === true ? 'chosen' : ''}" data-rating="happy" aria-pressed="${d.happy === true}">${ratingIcon(true)} 满意</button><button class="angry ${d.happy === false ? 'chosen' : ''}" data-rating="angry" aria-pressed="${d.happy === false}">${ratingIcon(false)} 不满意</button></div><div class="record-actions"><button data-action="finish" ${d.happy === null ? 'disabled' : ''}>${editing ? '保存修改并返回' : '保存并结束'}</button>${editing ? '' : `<button class="primary" data-action="next" ${d.happy === null ? 'disabled' : ''}>保存 · 下一级 →</button>`}</div></section></div>`;
  if (editing) app.querySelector('.record-actions').insertAdjacentHTML('beforeend', '<button class="danger" data-action="delete-record">删除记录</button>');
  updateRecordControls();
}
// Keep portraits and focused buttons mounted during record interactions.
function updateRecordControls() {
  const d = activeRecord;
  const profession = app.querySelector('.stat-heading .profession-field');
  if (profession) profession.outerHTML = professionMarkup(d.profession, true);
  app.querySelectorAll('[data-stat]').forEach(button => {
    const selected = d.stats.includes(button.dataset.stat);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('b').textContent = selected ? '+1' : '—';
  });
  app.querySelectorAll('.growth-total strong').forEach(total => { total.textContent = `+${d.stats.length}`; });
  app.querySelectorAll('[data-rating]').forEach(button => {
    const selected = d.happy === (button.dataset.rating === 'happy');
    button.classList.toggle('chosen', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  app.querySelector('[data-action="finish"]').disabled = d.happy === null;
  const next = app.querySelector('[data-action="next"]');
  if (next) next.disabled = d.happy === null;
}
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
  if (!d || d.happy === null) return;
  const item = state.roster.find(r => r.id === d.id);
  if (d.editIndex === undefined && (M.nextSeq(item) > M.limits.seq || state.roster.reduce((n, r) => n + r.records.length, 0) >= M.limits.records)) {
    notify('记录已达上限，请导出备份'); return;
  }
  if (d.editIndex !== undefined) {
    item.records[d.editIndex] = { ...item.records[d.editIndex], profession: d.profession || null, stats: [...d.stats], happy: d.happy, ratingSource: d.ratingSource || 'auto', ratingPending: false, updatedAt: new Date().toISOString() };
  } else {
    item.records.push({ id: M.uid(), seq: M.nextSeq(item), profession: d.profession || null, stats: [...d.stats], happy: d.happy, ratingSource: d.ratingSource || 'auto', createdAt: new Date().toISOString() });
  }
  const id = d.id;
  activeRecord = null;

  if (next) {
    activeRecord = newRecordDraft(id);
    const level = nextLevel(item);
    app.querySelector('.big-level').textContent = levelLabel(item, level);
    app.querySelector('.hero p').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
    app.querySelector('.record-level-current').textContent = levelLabel(item, level);
    app.querySelector('.record-level-transition').textContent = `${levelLabel(item, level - 1)} → ${levelLabel(item, level)}`;
    app.querySelector('.record-target-level').textContent = levelLabel(item, level);
    hideExpectationTip();
    updateRecordControls();
  } else {
    returnToSummary();
  }

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
  label.innerHTML = `<form novalidate class="initial-level-form" data-initial-form="${item.id}"><label>初始等级 <input data-level-input type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" value="${item.initialLevel ?? ''}" aria-label="初始等级，留空删除" placeholder="暂无"></label><button type="submit">保存</button><button type="button" data-cancel-initial>取消</button></form>`;
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
    const rect = target.getBoundingClientRect();
    gesture.after = gesture.y >= rect.top + rect.height / 2;
    const rows = [...target.parentElement.children].filter(node => node.matches('[data-sort-id]'));
    const index = rows.indexOf(target);
    const neighbor = rows[index + (gesture.after ? 1 : -1)] || rows[index + (gesture.after ? -1 : 1)];
    const neighborRect = neighbor?.getBoundingClientRect();
    const gap = neighborRect ? Math.max(0, neighborRect.top >= rect.bottom ? neighborRect.top - rect.bottom : rect.top - neighborRect.bottom) : 0;
    const border = parseFloat(getComputedStyle(target)[gesture.after ? 'borderBottomWidth' : 'borderTopWidth']) || 0;
    // Both sides of the same insertion gap must draw at its exact midpoint.
    target.style.setProperty('--sort-marker-offset', `${-gap / 2 - 1.5 - border}px`);
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
  suppressGestureClickUntil = Date.now() + 400;
}
let suppressGestureClickUntil = 0;
app.addEventListener('touchstart', e => {
  if (touchSort) {
    const extra = [...e.touches].find(touch => touch.identifier !== touchSort.identifier);
    if (extra) touchSort.scrollFinger = { identifier: extra.identifier, y: extra.clientY };
    e.preventDefault();
    return;
  }
  finishTouchSort();
  if (e.touches.length !== 1) return;
  const card = e.target.closest('.journal,.level-row');
  if (card && e.target.closest('.drag-grip')) {
    touchSort = { card, target: null, after: false, identifier: e.touches[0].identifier, x: e.touches[0].clientX, y: e.touches[0].clientY };
    markMoving(card.dataset.sortId);
    positionDragPreview(touchSort.x, touchSort.y);
    startSortScroll(touchSort);
    e.preventDefault();
    return;
  }
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
}, { passive: false });
app.addEventListener('touchend', e => {
  if (touchSort) {
    if ([...(e.touches || [])].some(touch => touch.identifier === touchSort.identifier)) { touchSort.scrollFinger = null; return; }
    finishTouchSort(true); return;
  }
});
app.addEventListener('touchcancel', () => finishTouchSort());
app.addEventListener('click', e => {
  if (Date.now() < suppressGestureClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); return; }
}, true);
app.addEventListener('click', e => {
  if (!multiSelectMode) return;
  const row = e.target.closest('[data-sort-id]');
  if (!row || e.target.closest('button,input,select,textarea,summary,a,label,[role="button"],.drag-grip')) return;
  if (editingCharacters.has(row.dataset.sortId) && e.target.closest('[data-initial-level]')) return;
  selectRow(row.dataset.sortId, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey });
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
  // A new gesture is intentional; only suppress the click generated by the
  // completed drag, never the user's next button press.
  suppressGestureClickUntil = 0;
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
  if (page !== 'summary' || Date.now() < suppressGestureClickUntil || e.target.closest('.profession-picker')) return;
  const control = e.target.closest('button,input,select,textarea,label,summary,a,[role="button"],[contenteditable]');
  const rowId = control ? e.target.closest('.journal')?.dataset.sortId : null;
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
  const profession = e.target.closest('[data-profession]');
  if (profession) { e.preventDefault(); e.stopPropagation(); openProfessionPicker(profession); return; }
  if (e.target.matches('input[data-level-input]')) e.target.select();
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (b.dataset.expandRecords) {
    const journal = b.closest('.journal');
    setJournalExpanded(journal, !journal.classList.contains('records-expanded'));
    return;
  }
  if (b.dataset.rowSelect) { selectRow(b.dataset.rowSelect, { shiftKey:e.shiftKey, ctrlKey:e.ctrlKey, metaKey:e.metaKey }); return; }
  if (b.dataset.expectationEdit) { openExpectationEditor([b.dataset.expectationEdit]); return; }
  if (b.dataset.expectationDetail) { if(b.hasAttribute('data-record-expectation'))openRecordExpectationDetails();else openExpectationDetails(b.dataset.expectationDetail); return; }
  if (b.dataset.action === 'multi-select') { multiSelectMode = !multiSelectMode; if (!multiSelectMode) rowSelection.clear(); refreshRowSelection(); return; }
  if (b.dataset.action === 'select-all-rows') { rowIds().forEach(id => rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'clear-row-selection') { rowSelection.clear(); selectionAnchor = null; refreshRowSelection(); return; }
  if (b.dataset.action === 'invert-rows') { rowIds().forEach(id => rowSelection.has(id) ? rowSelection.delete(id) : rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'delete-selected-characters') {
    const items = visibleRoster().filter(item => rowSelection.has(item.id));
    if (!items.length || !await confirmRecordDeletion(`是否删除选中的 ${items.length} 位角色？`)) return;
    softDelete(items);
    const ids = new Set(items.map(item => item.id));
    state.selection = state.selection.filter(id => !ids.has(id));
    ids.forEach(id => { delete state.initialLevels[id]; editingCharacters.delete(id); expandedJournals.delete(id); });
    rowSelection.clear(); selectionAnchor = null;
    rememberListPosition(); returnToSummary(); return;
  }
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
      const status = railState(b.closest('.records'));
      status.autoUntil = performance.now() + 1000;
      // Manual browsing cancels the timer, but row exit still settles this change.
      status.autoPending = true;
      // Every status click renews this row's countdown, including skipped -> upgraded.
      status.signature = '';
      if (record.skipped) {
        record.skipped = false;
        record.upgraded = true;
      } else if (record.upgraded) {
        record.upgraded = false;
      } else {
        record.skipped = true;
      }
      status.retiring = desktopRecords.matches && !compactRecords(item) && b.closest('.journal').matches('.has-record-rail:not(.records-expanded)');
      returnToSummary();
      return;
    }
    activeRecord = { id: b.dataset.edit, editIndex: index, profession: record.profession || null, stats: [...record.stats], happy: record.ratingPending ? null : record.happy, ratingSource: record.ratingSource || 'legacy' };
     page = 'record'; render(); window.scrollTo(0, 0);
  }
  if (b.dataset.toggleEdit) {
    const id = b.dataset.toggleEdit;
    editingCharacters.has(id) ? editingCharacters.delete(id) : editingCharacters.add(id);
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
    if (!visibleRoster().some(item => M.live(item).some(record => record.skipped))) return;
    if (!await confirmRecordDeletion('是否清空所有已跳过记录？', '清空')) return;
    softDelete(visibleRoster().flatMap(item => M.live(item).filter(record => record.skipped)));
    rememberListPosition(); returnToSummary(); return;
  }
  if (['reset', 'reset-list'].includes(action) && !await confirmRecordDeletion(action === 'reset' ? '是否清空全部角色和记录？' : '是否清空所有升级记录？', '清空', action === 'reset-list' ? '自定义属性期望将保留。' : '')) return;
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
  if (action === 'export') exportBackup();
  if (action === 'import') document.querySelector('#import-file').click();
});
let importRequest = 0;
async function importFile(file) {
  if (!file) return;
  const request = ++importRequest;
  let data;
  try {
    if (file.size > M.limits.fileBytes) { notify('备份超过 10 MB，请选择较小文件'); return; }
    data = validate(JSON.parse(await file.text()));
  } catch {
    if (request === importRequest) notify('备份无效，原记录未改动');
    return;
  } finally {
    document.querySelector('#import-file').value = '';
  }
  if (request !== importRequest) return;
  // Retain the original nodes as well as data, including unfinished form input.
  const previous = { state, page, activeRecord, query, editing: [...editingCharacters],
    selected: [...rowSelection], selectionAnchor, selectionPage, multiSelectMode,
    className: app.className, nodes: [...app.childNodes], ready: storageReady, scrollY,
    focused: document.activeElement };
  clearTimeout(localSaveTimer);
  storageReady = false;
  try {
    app.replaceChildren();
    state = trackState(data);
    clearRowSelection(); editingCharacters.clear(); activeRecord = null; query = '';
    page = visibleRoster().length ? 'summary' : state.selection.length ? 'levels' : 'select';
    render();
  } catch {
    ({ state, page, activeRecord, query, selectionAnchor, selectionPage, multiSelectMode } = previous);
    editingCharacters.clear(); previous.editing.forEach(id => editingCharacters.add(id));
    rowSelection.clear(); previous.selected.forEach(id => rowSelection.add(id));
    app.replaceChildren(...previous.nodes); app.className = previous.className;
    if (previous.focused?.isConnected) previous.focused.focus({ preventScroll: true });
    storageReady = previous.ready;
    try { sessionStorage.setItem(LOCAL_PAGE_KEY, page === 'record' ? 'summary' : page); } catch { /* Optional navigation memory. */ }
    window.scrollTo(0, previous.scrollY);
    scheduleLocalSave(); notify('恢复失败，原记录未改动'); return;
  }
  storageReady = previous.ready;
  clearDrag();
  // Choosing a backup explicitly replaces this site's saved state, including a
  // corrupt save or a prior tab conflict. A write failure stays visible.
  saveLocalState(true);
  window.scrollTo(0, 0); notify('');
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
  if (gesture.started) suppressGestureClickUntil = Date.now() + 400;
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
  // Capture only after movement: a click must still reach its original row.
  e.preventDefault();
});
app.addEventListener('pointermove', e => {
  if (!mouseSort || mouseSort.pointerId !== e.pointerId) return;
  mouseSort.x = e.clientX; mouseSort.y = e.clientY;
  if (!mouseSort.started && Math.hypot(e.clientX - mouseSort.startX, e.clientY - mouseSort.startY) >= 5) {
    mouseSort.started = true;
    app.setPointerCapture(e.pointerId);
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
  if (remaining.every((item, index) => getId(item) === getId(list[index]))) return;
  list.splice(0, list.length, ...remaining);
  const targetCard = app.querySelector(`[data-sort-id="${targetId}"]`);
  const anchor = after ? targetCard.nextSibling : targetCard;
  moved.forEach(item => {
    const card = app.querySelector(`[data-sort-id="${getId(item)}"]`);
    const rail = card.querySelector('.records');
    // Reparenting a journal can reset its descendant scroll offsets in browsers.
    // Restore the current review position, rather than recomputing the default.
    const scrollLeft = rail?.scrollLeft;
    targetCard.parentNode.insertBefore(card, anchor);
    if (rail) rail.scrollLeft = scrollLeft;
  });
  if (multiSelectMode) clearRowSelection();
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
  if (['Enter', ' '].includes(e.key) && e.target.matches('[data-initial-level]') && editingCharacters.has(e.target.dataset.initialLevel)) {
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
