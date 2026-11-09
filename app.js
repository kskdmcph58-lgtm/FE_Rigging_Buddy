const STATS = window.RiggingModel.stats;
const app = document.querySelector('#app');
const characters = window.CHARACTERS;
const M = window.RiggingModel;
const LOCAL_STATE_KEY = `rigging-buddy:save:${new URL('.', location.href).pathname}`;
const LOCAL_PAGE_KEY = `${LOCAL_STATE_KEY}:page`;
const RECORD_DRAFT_KEY = `${LOCAL_STATE_KEY}:record-draft`;
const trackedObjects = new WeakMap();
let localSaveTimer, storageReady = false, storageBlocked = false, storageWarning = false, lastLocalSave = null;
let storageIssue = '';
function setStorageIssue(issue = '') {
  const previousIssue = storageIssue;
  storageIssue = issue;
  storageBlocked = issue === 'read';
  storageWarning = issue === 'write';
  window.RiggingStorageStatus.render(issue, previousIssue, lastLocalSave);
}
// Adapter preserves the existing global bindings used by import rollback and tests.
// Persistence owns scheduling/conflict policy; the app owns navigation and feedback.
const persistence = window.RiggingPersistence.create({
  runtime: {
    get ready() { return storageReady; }, set ready(value) { storageReady = value; },
    get blocked() { return storageBlocked; },
    get issue() { return storageIssue; },
    get lastSave() { return lastLocalSave; }, set lastSave(value) { lastLocalSave = value; },
    get timer() { return localSaveTimer; }, set timer(value) { localSaveTimer = value; }
  },
  key: LOCAL_STATE_KEY,
  getStorage: () => localStorage,
  serialize: () => JSON.stringify(M.normalize(state)),
  onIssue: setStorageIssue,
  onRestore(data, followed = false) {
    state=trackState(validate(data));
    if (followed) { settleFollowedPage(); return; }
    // Pending additions can coexist with an existing roster; they do not imply
    // the user was viewing the level setup page.
    page=visibleRoster().length?'summary':state.selection.length?'levels':'select';
    try {
      const savedPage=sessionStorage.getItem(LOCAL_PAGE_KEY);
      if(savedPage==='select'||savedPage==='summary'||(savedPage==='levels'&&state.selection.length))page=savedPage;
    } catch { /* Fall back to the data-derived page when session storage is unavailable. */ }
  }
});
function trackState(value) { return window.RiggingPersistence.track(value, trackedObjects, scheduleLocalSave); }
function scheduleLocalSave() { persistence.schedule(); }
function saveLocalState(replace = false) { return persistence.save(replace); }
function restoreLocalState() { persistence.restore(); }

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
let searchIndex = [];
// Catalog rows hold the default look; a row's `part3` values apply only while the
// Part 3 switch is on, so names and portraits never reveal Part 3 by default.
characters.forEach(c => { c.defaultLook = { name: c.name, englishName: c.englishName, image: c.image }; });
let appliedPart3 = null;
// People outside the current phase, and people removed from the roster, are never
// shown. Their saved data stays untouched, so old saves and backups keep loading.
function inStory(c) { return !c.removed && (state.part3 === true || !c.part3Only); }
function storyCharacters() { return characters.filter(inStory); }
// Going back to 第1-2部 would empty a list of Part 3 people, so it waits for the pages that add people.
function part3Locked() {
  const people = state.roster.filter(item => !item.deleted && !char(item.id).removed);
  return page === 'summary' && state.part3 === true && people.length > 0 && people.every(item => char(item.id).part3Only);
}
function part3Switch() {
  const on = state.part3 === true, locked = part3Locked();
  return `<div class="part3-segment" role="radiogroup" aria-label="剧情范围"><label title="${locked ? '列表里都是第3部人物，添加人物时才能切换' : '不显示第3部的人物和兵种'}"><input id="part3-off" type="radio" name="part3" value="off" ${on ? '' : 'checked'} ${locked ? 'disabled' : ''}><span>第1-2部</span></label><label title="显示第3部的人物和兵种"><input id="part3-on" type="radio" name="part3" value="on" ${on ? 'checked' : ''}><span>第3部</span></label></div>`;
}
/* 第1-2部 only. On 凯伊's route mounted classes have rides; on the others they have none, so no ride is asked
   for or counted (core/actions.js rideKind). */
function routeSwitch() {
  if (state.part3 === true) return '';
  const other = state.route === 'other';
  return `<div class="route-segment" role="radiogroup" aria-label="路线"><label title="骑兵单位可以选配属"><input type="radio" name="route" value="kai" ${other ? '' : 'checked'}><span>凯伊线</span></label><label title="骑兵单位都没有配属，不用选也不计算"><input type="radio" name="route" value="other" ${other ? 'checked' : ''}><span>其他线</span></label></div>`;
}
/* 推荐: a stepped slider capping the class tier the summary recommends (the better-choice mark, and where
   其他选择 starts filtering). Picking a class is never limited by it. */
function recommendText(cap, top) { return cap >= top ? '全部职业' : `${TIER_LABELS[cap]}及以下职业`; }
function recommendFilter() {
  const part3 = state.part3 === true, top = part3 ? 5 : 3, cap = window.RiggingSeed.recommendCap(state, part3);
  return `<div class="recommend-filter" title="只决定标出哪些更好的职业，以及其他选择默认筛到哪一级；选职业不受限制"><span class="recommend-caption" id="recommend-caption">兵种推荐范围</span><div class="recommend-slider" role="slider" tabindex="0" aria-labelledby="recommend-caption" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${cap}" aria-valuetext="${recommendText(cap, top)}" style="--stops:${top + 1};--at:${cap}"><span class="recommend-track"><span class="recommend-fill"></span></span>${TIER_LABELS.slice(0, top + 1).map((label, tier) => `<span class="recommend-stop${tier <= cap ? ' in' : ''}"><i></i><small>${label}</small></span>`).join('')}<span class="recommend-thumb"></span></div></div>`;
}
function showRecommend(track, cap) {
  const top = Number(track.getAttribute('aria-valuemax'));
  track.style.setProperty('--at', String(cap));
  track.setAttribute('aria-valuenow', String(cap));
  track.setAttribute('aria-valuetext', recommendText(cap, top));
  track.querySelectorAll('.recommend-stop').forEach((stop, tier) => stop.classList.toggle('in', tier <= cap));
}
function commitRecommend(cap) {
  const part3 = state.part3 === true, top = part3 ? 5 : 3, key = part3 ? 'part3' : 'pre';
  if (window.RiggingSeed.recommendCap(state, part3) === cap) return;
  const next = { ...state.recommendTier };
  if (cap >= top) delete next[key]; else next[key] = cap;
  if (Object.keys(next).length) state.recommendTier = next; else delete state.recommendTier;
  const focused = document.activeElement?.matches('.recommend-slider');
  render();
  if (focused) app.querySelector('.recommend-slider')?.focus({ preventScroll: true });
}
// Dragging moves only the thumb; the marks are worked out once it is let go.
let recommendDrag = null;
const recommendStopAt = (track, x) => {
  const box = track.getBoundingClientRect(), count = Number(track.getAttribute('aria-valuemax')) + 1;
  return Math.max(0, Math.min(count - 1, Math.floor((x - box.left) / box.width * count)));
};
app.addEventListener('pointerdown', e => {
  const track = e.target.closest?.('.recommend-slider');
  if (!track || e.button !== 0) return;
  e.preventDefault(); track.focus({ preventScroll: true });
  track.setPointerCapture(e.pointerId); track.classList.add('recommend-dragging');
  recommendDrag = { track, cap: recommendStopAt(track, e.clientX) };
  showRecommend(track, recommendDrag.cap);
});
app.addEventListener('pointermove', e => {
  if (!recommendDrag) return;
  const cap = recommendStopAt(recommendDrag.track, e.clientX);
  if (cap !== recommendDrag.cap) { recommendDrag.cap = cap; showRecommend(recommendDrag.track, cap); }
});
const releaseRecommend = () => {
  if (!recommendDrag) return;
  const { track, cap } = recommendDrag;
  recommendDrag = null; track.classList.remove('recommend-dragging');
  commitRecommend(cap);
};
app.addEventListener('pointerup', releaseRecommend);
app.addEventListener('pointercancel', releaseRecommend);
app.addEventListener('keydown', e => {
  const track = e.target.closest?.('.recommend-slider');
  if (!track) return;
  const cap = Number(track.getAttribute('aria-valuenow')), top = Number(track.getAttribute('aria-valuemax'));
  const next = { ArrowRight: cap + 1, ArrowUp: cap + 1, ArrowLeft: cap - 1, ArrowDown: cap - 1, Home: 0, End: top, PageUp: top, PageDown: 0 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  commitRecommend(Math.max(0, Math.min(top, next)));
});
function applyStoryPhase() {
  const part3 = state.part3 === true, phaseChanged = part3 !== appliedPart3;
  if (phaseChanged) {
    appliedPart3 = part3;
    characters.forEach(c => Object.assign(c, c.defaultLook, part3 ? c.part3 : null));
    searchIndex = storyCharacters().map(c => ({
      character: c,
      keys: [normalizeSearch(c.name), normalizeSearch(c.englishName), phonetic(c.name),
        normalizeSearch(window.pinyinPro.pinyin(c.name, { pattern: 'first', toneType: 'none', type: 'array' }).join(''))]
    }));
  }
  // A pending pick is not saved data, so it can simply be dropped.
  if (state.selection.some(id => !inStory(char(id)))) {
    state.selection = state.selection.filter(id => inStory(char(id)));
    if (page === 'levels' && !state.selection.length) page = 'select';
  }
  restoreStoryClasses();
  if (phaseChanged) {
    if (page === 'record' && !inStory(char(activeRecord.id))) { activeRecord = null; page = 'summary'; }
    if (page === 'summary' && !visibleRoster().length) page = state.selection.length ? 'levels' : 'select';
  }
}
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
function recordDisplayLevel(item, record) { return M.level(item, record) + (record.status === 'skipped' ? 1 : 0); }
function storyRoster() { return state.roster.filter(item => inStory(char(item.id))); }
function visibleRoster() { return storyRoster().filter(item => !item.deleted); }
function validate(data) { return M.migrate(data, characters.map(c => c.id)); }
function levelLabel(item, level) { return item.initialLevel === null ? `LV +${level}` : `LV ${level}`; }
function upgradeLevelLabel(item, level) { return item.initialLevel === null ? `+${level}` : String(level); }
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
    // On a person's card the message is a speech bubble over the portrait, like the seed hint.
    (input.closest('.journal')?.querySelector('.journal-portrait') || input.closest('.level-row,.initial-level-form,.toolbar') || input.parentElement).append(error);
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
  const notice = document.querySelector('#notice');
  notice.classList.remove('is-leaving');
  notice.textContent = text;
  if (text) dismissNoticeAfter(4000);
}
function dismissNoticeAfter(delay) {
  const notice = document.querySelector('#notice');
  noticeTimer = setTimeout(() => {
    if (!motionAllowed()) { notice.replaceChildren(); return; }
    notice.classList.add('is-leaving');
    noticeTimer = setTimeout(() => { notice.classList.remove('is-leaving'); notice.replaceChildren(); }, MOTION.medium);
  }, delay);
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
function exportBackup(text = JSON.stringify(M.normalize(state), null, 2)) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = backupFilename(); a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.querySelector('#storage-status').addEventListener('click', e => {
  const action = e.target.closest('[data-storage-action]')?.dataset.storageAction;
  if (action === 'save') saveLocalState();
  if (action === 'import') document.querySelector('#import-file').click();
  if (action === 'export') exportBackup(storageIssue === 'read' && typeof lastLocalSave === 'string' ? lastLocalSave : undefined);
});
function ratingIcon(happy) {
  return `<svg class="rating-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9" r=".8" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r=".8" fill="currentColor" stroke="none"/><path d="${happy ? 'M8 14 Q12 19 16 14' : 'M8 17 Q12 12 16 17'}"/></svg>`;
}
function portrait(c, kind = 'small', sizes = kind === 'narrow' ? '116px' : '56px') {
  const revision = document.querySelector('meta[name="app-version"]')?.content;
  const versioned = path => /^[a-f0-9]{40}$/i.test(revision || '') ? `${path}?v=${revision}` : path;
  if (kind === 'narrow') {
    const path = c.image.replace('/grid/', '/troop/');
    // The files are 116, 232 and 348px wide. Listed by width, so a portrait shown larger than 116px on a
    // 1x screen (the phone layout's column head) still gets a sharp file.
    const variants = c.image.includes('/grid/')
      ? ` srcset="${[1, 2, 3].map(scale => `${versioned(scale === 1 ? path : path.replace('/troop/', `/troop/${scale}x/`))} ${116 * scale}w`).join(', ')}" sizes="${sizes}"` : '';
    return `<img draggable="false" src="${versioned(path)}"${variants} alt="" loading="lazy" decoding="async">`;
  }
  if (kind === 'small' && c.image.includes('/grid/')) {
    const variant = size => versioned(c.image.replace('/grid/', `/small/${size}/`));
    return `<img draggable="false" src="${variant(56)}" srcset="${[56, 112, 168].map(size => `${variant(size)} ${size}w`).join(', ')}" sizes="${sizes}" alt="" loading="lazy" decoding="async">`;
  }
  return `<img draggable="false" src="${versioned(c.image)}" alt="" loading="lazy" decoding="async">`;
}
let renderedPage = null;
function fadeInPage() {
  // The phone layout swaps pages at once, as iOS does: a fade from blank read as a flash on the way back to step 3.
  if (!motionAllowed() || UI_MEDIA.mobileShell.matches) return;
  app.getAnimations().forEach(animation => { if (animation.id === 'page-in') animation.cancel(); });
  // Opacity only: a transform on #app would re-anchor the floating selection bar.
  app.animate({ opacity: [0, 1] }, { id: 'page-in', duration: MOTION.medium, easing: 'ease-out' });
}
function render() {
  const pageChanged = renderedPage !== null && renderedPage !== page;
  renderedPage = page;
  applyStoryPhase();
  try { sessionStorage.setItem(LOCAL_PAGE_KEY,page==='record'?'summary':page); } catch { /* Navigation memory is optional. */ }
  rememberRecordDraft();
  if (page === 'record' || (page === 'summary' && state.roster.some(item => item.seed))) loadSeedEngine();
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
  // The summary reconciles in place, where a checked attribute alone would not move a used checkbox.
  app.querySelectorAll('[name="part3"]').forEach(input => { input.checked = (input.value === 'on') === (state.part3 === true); input.disabled = input.value === 'off' && part3Locked(); });
  app.querySelectorAll('[name="route"]').forEach(input => { input.checked = (input.value === 'other') === (state.route === 'other'); });
  refreshRowSelection();
  scheduleLocalSave();
  if (pageChanged) fadeInPage();
}
function renderSelect() {
  app.innerHTML =
    `<div class="toolbar"><label class="search"><svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4 4"></path></svg><input id="search" aria-label="搜索人物名字"></label>${part3Switch()}${routeSwitch()}${visibleRoster().length ? '<button data-action="summary">返回</button>' : `${storyRoster().some(item => item.deleted) ? '<button data-action="undo-delete">撤回删除</button>' : ''}<button class="import-zone" data-action="import">恢复备份</button>`}</div><div class="character-grid" id="character-grid"></div><div class="bottom-bar"><span id="selected-count"></span><button class="primary" id="choose-next" data-action="levels">下一步 · 设置等级</button></div>`;
  document.querySelector('#search').value = query;
  const searchInput = app.querySelector('#search');
  searchInput.name = 'rigging-buddy-character-search';
  searchInput.type = 'search';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;
  searchInput.setAttribute('aria-label', '搜索人物名字、拼音或首字母');
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
  if (!grid.children.length) grid.innerHTML = storyCharacters().map(c => {
    const existing = visibleRoster().some(r => r.id === c.id), selected = state.selection.includes(c.id);
    return `<button class="character ${selected ? 'selected' : ''}" data-character="${c.id}" aria-pressed="${selected}" ${existing ? 'disabled' : ''}><span class="portrait-frame">${portrait(c, 'grid')}<span class="character-name">${c.name}</span><span class="character-quill" aria-hidden="true"></span></span>${existing ? '<i>已添加</i>' : state.roster.some(item => item.id === c.id && item.deleted) ? '<i>可恢复</i>' : ''}</button>`;
  }).join('') + '<p class="empty" hidden>没有找到这个名字，换个关键词试试。</p>';
  const matches = new Set(list.map(c => c.id));
  grid.querySelectorAll('[data-character]').forEach(card => { card.hidden = !matches.has(card.dataset.character); });
  grid.querySelector('.empty').hidden = list.length > 0;
  updateSelectionCount();
}
function updateSelectionCount() {
  document.querySelector('#selected-count').textContent = `已选 ${state.selection.length} 位人物`;
  document.querySelector('#choose-next').disabled = !state.selection.length;
}

let setupLevelEdit = null;
let setupToggleAfterCommit = null;
function setupLevelText(id) {
  const value = String(state.initialLevels[id] ?? '');
  return value ? escapeValue(value) : '<span class="setup-level-empty">暂无</span>';
}
function paintSetupLevel(cell) {
  cell.setAttribute('role','button');cell.tabIndex=0;
  cell.innerHTML=setupLevelText(cell.dataset.setupLevel);
  cell.setAttribute('aria-label',`${char(cell.dataset.setupLevel).name}当前等级，${state.initialLevels[cell.dataset.setupLevel] || '暂无'}，点击编辑`);
}
function finishSetupLevel(cancel=false) {
  const edit=setupLevelEdit;if(!edit)return true;
  if(!cancel&&!validLevel(edit.input))return false;
  setupLevelEdit=null;
  clearLevelError(edit.input);
  if(!cancel)edit.ids.forEach(id=>{if(state.selection.includes(id))state.initialLevels[id]=edit.input.value;});
  for(const id of edit.ids){const cell=app.querySelector(`[data-setup-level="${id}"]`);if(cell)paintSetupLevel(cell);}
  if(!cancel&&edit.batch){clearRowSelection();refreshRowSelection();}
  scheduleLocalSave();return true;
}
function editSetupLevel(cell) {
  if(setupLevelEdit?.cell===cell)return;
  if(!finishSetupLevel())return;
  const id=cell.dataset.setupLevel,batch=multiSelectMode&&rowSelection.has(id);
  const ids=batch?state.selection.filter(value=>rowSelection.has(value)):[id];
  cell.removeAttribute('role');cell.removeAttribute('tabindex');
  cell.innerHTML=`<input type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" value="${escapeValue(state.initialLevels[id] ?? '')}" data-level-input data-level="${id}" aria-label="${char(id).name}当前等级">`;
  const input=cell.querySelector('input');setupLevelEdit={cell,input,ids,batch};input.focus();input.select();
}
/* Asks for the starting levels still missing before the records are made. 确定 keeps what was typed (a box
   left empty stays 暂无), 跳过 goes on without them; resolves false when closed with Escape. */
// Each value the user enters goes through apply: step 2 keeps it as a draft, the list writes it to the person.
function setupLevelDraft(id, value) {
  state.initialLevels[id] = value;
  const cell = app.querySelector(`[data-setup-level="${id}"]`); if (cell) paintSetupLevel(cell);
}
function askMissingLevels(ids, apply = setupLevelDraft) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog setup-level-dialog missing-level-dialog';
    dialog.setAttribute('aria-labelledby', 'missing-level-title');
    // One person: the name goes in the title and the field stands alone, with no help text.
    if (ids.length === 1) {
      const id = ids[0];
      dialog.classList.add('missing-level-single');
      dialog.innerHTML = `<header><h2 id="missing-level-title">请为<span class="missing-level-who">${portrait(char(id))}<span class="game-text">${escapeValue(char(id).name)}</span></span>填写初始等级</h2></header><form novalidate><div class="setup-level-dialog-body"><div class="missing-level-field"><input id="missing-level-${id}" data-level="${id}" type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" data-level-input aria-labelledby="missing-level-title"></div></div><footer><button type="button" data-skip>跳过</button><button type="submit" class="primary">确定</button></footer></form>`;
    } else {
      dialog.setAttribute('aria-describedby', 'missing-level-help');
      dialog.innerHTML = `<header><h2 id="missing-level-title">请填写初始等级</h2></header><form novalidate><div class="setup-level-dialog-body"><p id="missing-level-help">没有初始等级就无法反推种子，范围为 1–99。</p>${ids.map(id => `<div class="missing-level-row"><label for="missing-level-${id}">${portrait(char(id))}<span>${escapeValue(char(id).name)}</span></label><div class="missing-level-field"><input id="missing-level-${id}" data-level="${id}" type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" data-level-input placeholder="暂无"></div></div>`).join('')}</div><footer><button type="button" data-skip>跳过</button><button type="submit" class="primary">确定</button></footer></form>`;
    }
    let result = false;
    dialog.querySelector('[data-skip]').onclick = () => { result = true; dialog.close(); };
    dialog.addEventListener('input', e => { if (e.target.matches('input')) { clearLevelError(e.target); e.target.removeAttribute('aria-invalid'); } });
    dialog.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const inputs = [...dialog.querySelectorAll('input')];
      if (!inputs.every(validLevel)) { inputs.find(input => input.getAttribute('aria-invalid') === 'true')?.focus(); return; }
      inputs.forEach(input => { if (input.value) apply(input.dataset.level, input.value); });
      scheduleLocalSave(); result = true; dialog.close();
    };
    dialog.addEventListener('close', () => { retireDialog(dialog); resolve(result); }, { once: true });
    document.body.append(dialog); dialog.showModal(); dialog.querySelector('input').focus();
  });
}
function openSetupLevelDialog() {
  if(!finishSetupLevel()||document.querySelector('.setup-level-dialog[open]'))return;
  const ids=[...state.selection];if(!ids.length)return;
  const values=ids.map(id=>String(state.initialLevels[id]??''));
  const shared=values.every(value=>value===values[0])?values[0]:'';
  const dialog=document.createElement('dialog');dialog.className='app-dialog setup-level-dialog';
  dialog.setAttribute('aria-labelledby','setup-level-dialog-title');
  dialog.innerHTML=`<header><h2 id="setup-level-dialog-title">全部设置等级</h2></header><form novalidate><div class="setup-level-dialog-body"><input id="batch-level" type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" data-level-input value="${escapeValue(shared)}" placeholder="暂无" aria-label="当前等级" aria-describedby="setup-level-dialog-help"><p id="setup-level-dialog-help">范围为 1–99</p></div><footer><button type="button" data-cancel>取消</button><button type="submit" class="primary">确定</button></footer></form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('input').addEventListener('input',e=>{
    clearLevelError(e.target);e.target.removeAttribute('aria-invalid');
    e.target.setAttribute('aria-describedby','setup-level-dialog-help');
  });
  dialog.querySelector('form').onsubmit=e=>{
    e.preventDefault();const input=dialog.querySelector('input');if(!validLevel(input))return;
    ids.filter(id=>state.selection.includes(id)).forEach(id=>{state.initialLevels[id]=input.value;const cell=app.querySelector(`[data-setup-level="${id}"]`);if(cell)paintSetupLevel(cell);});
    clearRowSelection();refreshRowSelection();scheduleLocalSave();dialog.close();
  };
  dialog.addEventListener('close',()=>{retireDialog(dialog);app.querySelector('[data-action="batch"]')?.focus({preventScroll:true});},{once:true});
  document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();dialog.querySelector('input').select();
}
function setupExpectationRule(id) { return state.draftExpectations?.[id] || null; }
function setupRuleText(rule) {
  if(!rule)return '属性期望未设置';
  if(rule.type==='stat')return `${rule.stat}提升`;
  if(rule.type==='total')return `总点数 ${{gt:'>',gte:'≥',lt:'<',lte:'≤'}[rule.op]} ${rule.value}`;
  if(rule.type==='not')return `不满足（${setupRuleText(rule.child)}）`;
  if(rule.children.length===1)return setupRuleText(rule.children[0]);
  return `（${rule.children.map(setupRuleText).join(rule.type==='all'?' 且 ':' 或 ')}）`;
}
function setupExpectationButton(id) {
  const full=setupRuleText(setupExpectationRule(id));
  return `<button class="expectation-setting${setupExpectationRule(id) ? '' : ' is-unset'}" data-expectation-edit="${id}" data-setup-expectation="${id}" aria-label="${char(id).name}属性期望：${escapeValue(full)}"><span class="setup-rule-summary">${escapeValue(full)}</span></button>`;
}
function setupConditionCount(rule) {
  if(!rule)return 0;
  if(rule.type==='not')return setupConditionCount(rule.child);
  return rule.children?rule.children.reduce((sum,child)=>sum+setupConditionCount(child),0):1;
}
let setupSummaryCanvas=null,setupSummaryFrame=0;
const setupSummaryObserver=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
  cancelAnimationFrame(setupSummaryFrame);setupSummaryFrame=requestAnimationFrame(refreshSetupExpectationSummaries);
}):null;
function refreshSetupHeadingAlignment(context) {
  app.querySelectorAll('.table-head>span').forEach(heading=>{
    if(!heading.textContent)return;
    const style=getComputedStyle(heading),size=parseFloat(style.fontSize);
    context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics=context.measureText(heading.textContent);
    // CSS uses this webfont's hhea ascent/descent (1000 / -200).
    // Canvas fontBoundingBox* can instead expose the larger Windows metrics.
    const offset=(size*.8-metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent)/2;
    heading.style.setProperty('--setup-heading-offset',`${Math.max(0,offset)}px`);
  });
}
function refreshSetupExpectationSummaries() {
  if(page!=='levels')return;
  setupSummaryCanvas ||= document.createElement('canvas');
  const context=setupSummaryCanvas.getContext('2d');
  refreshSetupHeadingAlignment(context);
  app.querySelectorAll('[data-setup-expectation]').forEach(button=>{
    const span=button.querySelector('.setup-rule-summary'),rule=setupExpectationRule(button.dataset.setupExpectation);
    const style=getComputedStyle(span);
    context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const available=Math.max(0,span.getBoundingClientRect().width-4);
    const width=text=>context.measureText(text).width+(parseFloat(style.letterSpacing)||0)*text.length;
    const full=setupRuleText(rule);
    const draw=(content,count='')=>{
      let text=span.querySelector('.setup-rule-content');
      if(!text){span.textContent='';text=document.createElement('span');text.className='setup-rule-content';span.append(text);}
      if(text.textContent!==content)text.textContent=content;
      let suffix=span.querySelector('.setup-rule-count');
      if(count){if(!suffix){suffix=document.createElement('span');suffix.className='setup-rule-count';span.append(suffix);}if(suffix.textContent!==count)suffix.textContent=count;}
      else suffix?.remove();
    };
    if(!rule||width(full)<=available){draw(full);return;}
    let group=rule;while(group.children?.length===1)group=group.children[0];
    const total=setupConditionCount(group);
    if(total<2){draw(full);return;}
    const parts=group.children?group.children.map(setupRuleText):[setupRuleText(group)];
    const prefix=group.children?(group.type==='all'?'全部：':'任一：'):'';
    const suffix=`等 ${total} 项条件`,budget=Math.max(0,available-width(suffix)-3);
    for(let count=parts.length-1;count>=1;count--){const content=prefix+parts.slice(0,count).join('、');if(width(content)<=budget){draw(content,suffix);return;}}
    let first=parts[0];
    while(first.length>1&&width(prefix+first+'…')>budget)first=first.slice(0,-1);
    draw(prefix+first+'…',suffix);
  });
}
app.addEventListener('click',e=>{
  const cell=e.target.closest('[data-setup-level]');
  if(cell&&!cell.querySelector('input')){editSetupLevel(cell);e.stopImmediatePropagation();}
});
app.addEventListener('pointerdown',e=>{
  setupToggleAfterCommit=setupLevelEdit?.batch&&e.target.closest('[data-action="multi-select"]')?false:null;
},true);
app.addEventListener('keydown',e=>{
  if(e.isComposing)return;
  if(e.target.matches('[data-level]')&&e.target.closest('[data-setup-level]')){
    if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const cell=setupLevelEdit?.cell;if(finishSetupLevel(e.key==='Escape'))cell?.focus({preventScroll:true});}
  } else if(e.target.matches('[data-setup-level]')&&['Enter',' '].includes(e.key)){
    e.preventDefault();e.stopImmediatePropagation();editSetupLevel(e.target);
  }
});
app.addEventListener('focusout',e=>{if(e.target===setupLevelEdit?.input)finishSetupLevel();});
window.addEventListener('resize',refreshSetupExpectationSummaries);
function renderLevels() {
  setupLevelEdit=null;
  app.innerHTML=`<section class="levels">
    <div class="toolbar setup-toolbar">${part3Switch()}${routeSwitch()}<button data-action="batch" aria-haspopup="dialog">全部设置等级</button><button data-profession data-setup-profession="" aria-haspopup="dialog">全部设置兵种</button>${selectionToolbar()}</div>
    <div class="table-head"><span class="setup-name-heading">人物</span><span class="setup-profession-heading">兵种</span><span class="setup-level-heading">当前等级</span><span class="setup-expectation-heading">属性期望</span></div>
    ${state.selection.map(id=>{const c=char(id);return `<div class="level-row" draggable="false" data-sort-id="${id}" tabindex="0" aria-label="${c.name}，拖动排序，或按 Alt 加上下方向键">
      <span class="drag-grip" aria-hidden="true">${dragGrip()}</span>
      <div class="setup-character">${portrait(c,'narrow','(max-width:1419px) 84px, 116px')}<strong>${c.name}</strong></div>
      <div class="level-value setup-level-cell" data-setup-level="${id}" role="button" tabindex="0" aria-label="${c.name}当前等级，${state.initialLevels[id]||'暂无'}，点击编辑">${setupLevelText(id)}</div>
      <div class="setup-profession-cell">${setupProfessionButton(id)}${setupRideButton(id)}</div>${setupExpectationButton(id)}</div>`;}).join('')}
    </section><div class="bottom-bar"><button data-action="select">返回选择</button><button class="primary" data-action="create">开始记录</button></div>`;
  setupSummaryObserver?.disconnect();
  app.querySelectorAll('[data-setup-expectation]').forEach(button=>setupSummaryObserver?.observe(button));
  document.fonts?.ready.then(()=>{if(page==='levels')refreshSetupExpectationSummaries();});
}
function recordStats(stats) {
  // HP closes the first line, left-aligned in its cell so it sits right after the dot like the names before it.
  const groups = [[...STATS.slice(1, 5), 'HP'], STATS.slice(5)].map(group => group.filter(stat => stats.includes(stat))).filter(group => group.length);
  return groups.length ? groups.map(group => `<span class="stat-line">${group.map(stat => `<span class="stat-name${stat === 'HP' ? ' stat-name-hp' : ''}">${stat}</span>`).join('<span class="stat-separator" aria-hidden="true"></span>')}</span>`).join('') : '<span class="stat-line">本次没有属性提升</span>';
}
function pencilIcon(className) {
  return `<svg class="${className}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m10.5 2.5 3 3M2.5 13.5l3.5-.8 7.5-7.5a2.1 2.1 0 0 0-3-3L3 9.7z"/></svg>`;
}
app.addEventListener('pointerout', onRecordRailPointerOut);
app.addEventListener('wheel', onRecordRailWheel, { passive: false });
app.addEventListener('scroll', onRecordRailScroll, true);
app.addEventListener('pointerdown', onRecordRailPointerDown);
document.addEventListener('click', onSummaryOutsideClick, true);
window.addEventListener('resize', refreshRecordRails);
app.addEventListener('input', e => {
  if (e.target.matches('[data-level-input]')) { clearLevelError(e.target); e.target.removeAttribute('aria-invalid'); }
  if (e.target.id === 'search') { query = e.target.value; renderCards(); app.querySelector('#search-history').hidden = true; }
});
app.addEventListener('focusin', e => { if (e.target.matches('input[data-level-input]')) e.target.select(); });
app.addEventListener('focusin', e => { if (e.target.id === 'search') showSearchHistory(); });
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  if (e.clientX >= document.documentElement.clientWidth || e.clientY >= document.documentElement.clientHeight) return;
  const field = document.activeElement;
  if (!field?.matches('input,textarea,[contenteditable="true"]')) return;
  if (e.target.closest('button,input,textarea,select,a,label,summary,[role="button"],[contenteditable]')) return;
  // Marquee selection and row dragging prevent the browser's normal blur.
  field.blur();
}, true);
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
  // macOS-style inline edit: Return or clicking away saves, Escape cancels, no extra buttons.
  label.innerHTML = `<form novalidate class="initial-level-form" data-initial-form="${item.id}"><label><span class="initial-level-caption">初始等级</span><span class="level-field"><input data-level-input type="text" inputmode="numeric" pattern="[1-9][0-9]?" maxlength="80" value="${item.initialLevel ?? ''}" aria-label="初始等级，留空删除" placeholder="暂无" autocomplete="off" enterkeyhint="done"></span></label></form>`;
  label.querySelector('input').focus();
}
function stepInitialLevel(input, delta) {
  const current = /^[1-9][0-9]?$/.test(input.value) ? Number(input.value) : null;
  const next = current === null ? (delta > 0 ? 1 : 99) : Math.min(99, Math.max(1, current + delta));
  input.value = String(next);
  clearLevelError(input); input.removeAttribute('aria-invalid');
  input.select();
}
function closeInitialLevel(form, save) {
  if (!form.isConnected || form.dataset.closing) return;
  const input = form.querySelector('input');
  if (save) {
    if (!validLevel(input)) return;
    const item = state.roster.find(r => r.id === form.dataset.initialForm);
    item.initialLevel = input.value === '' ? null : Number(input.value);
    // The forecast needs a level, so without one this person goes back to plain records.
    if (item.initialLevel === null) delete item.seed;
  }
  form.dataset.closing = '1';
  rememberListPosition();
  // A click elsewhere blurs the field on pointerdown; redraw after that click lands so it is not lost.
  if (initialPointerDown) {
    const redraw = () => { document.removeEventListener('click', redraw, true); document.removeEventListener('pointercancel', redraw, true); setTimeout(returnToSummary); };
    document.addEventListener('click', redraw, true);
    document.addEventListener('pointercancel', redraw, true);
    setTimeout(() => { if (!initialPointerDown) redraw(); }, 400);
  } else returnToSummary();
}
let initialPointerDown = false;
document.addEventListener('pointerdown', () => { initialPointerDown = true; }, true);
document.addEventListener('pointerup', () => setTimeout(() => { initialPointerDown = false; }), true);
app.addEventListener('pointerdown', e => {
  const form = e.target.closest('[data-initial-form]');
  if (!form || e.target.matches('input')) return;
  // Clicking the caption or border keeps the edit open instead of blurring the field.
  e.preventDefault();
  form.querySelector('input').focus();
});
app.addEventListener('focusout', e => {
  const form = e.target.closest?.('[data-initial-form]');
  if (!form || form.contains(e.relatedTarget) || !document.hasFocus()) return;
  closeInitialLevel(form, true);
});
app.addEventListener('dblclick', e => {
  const label = e.target.closest('[data-initial-level]');
  if (label && editingCharacters.has(label.dataset.initialLevel)) editInitialLevel(label);
});
app.addEventListener('submit', e => {
  const form = e.target.closest('[data-initial-form]');
  if (!form) return;
  e.preventDefault();
  closeInitialLevel(form, true);
});
let touchSort = null;
let mouseSort = null;
function sortTarget(x, y, source) {
  const selector = source.matches('.level-row') ? '.level-row' : '.journal';
  const container = source.parentElement.getBoundingClientRect();
  const grip = source.querySelector('.drag-grip')?.getBoundingClientRect();
  const left = Math.min(container.left, grip?.left ?? container.left);
  if (x < left || x > container.right) return null;
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
  if (card && e.target.closest('.drag-grip') && sortDragAllowed(e.target)) {
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
document.documentElement.dataset.inputMode = UI_MEDIA.coarseInput.matches ? 'touch' : 'mouse';
/* Only moving focus with the keyboard turns on the focus ring. Shortcut keys (digits, Return, Escape) leave a
   mouse session without one, as on macOS, where the ring follows Tab navigation. */
const FOCUS_NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
document.addEventListener('keydown', e => {
  if (!e.metaKey && !e.ctrlKey && !e.altKey && FOCUS_NAVIGATION_KEYS.has(e.key)) document.documentElement.dataset.inputMode = 'keyboard';
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
  if (button?.matches('.expectation-link') || (UI_MEDIA.narrowLayout.matches && button?.matches('.expectation-setting'))) return;
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
/* Speech bubbles over a person's portrait close when pressed. This runs first (window, capture): the page
   otherwise blurs an open level field on pointerdown, which redraws the error bubble under the pointer.
   Focus stays where it is. */
const PORTRAIT_BUBBLE = '.journal-portrait :is(.seed-status,.level-error)';
window.addEventListener('pointerdown', e => {
  const bubble = e.target.closest?.(PORTRAIT_BUBBLE);
  if (!bubble || e.button !== 0) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (bubble.matches('.level-error')) {
    bubble.closest('.journal').querySelector('[data-initial-form] input')?.removeAttribute('aria-describedby');
    bubble.remove();
  } else dismissSeedMessage(bubble.dataset.seedStatus);
}, true);
app.addEventListener('click', async e => {
  const cardOptions = e.target.closest('[data-card-options]');
  if (cardOptions) { e.preventDefault(); e.stopPropagation(); openCardOptions(cardOptions); return; }
  const moreForecast = e.target.closest('[data-more-forecast]');
  if (moreForecast) { showMoreForecast(moreForecast.dataset.moreForecast); return; }
  // With a better choice marked, clicking anywhere on the class name opens the choices; changing the class
  // is the class row in its hover tip. The keyboard keeps both: Enter on the field changes the class,
  // Enter on the mark opens the choices.
  const better = e.target.closest('[data-better]') || e.target.closest('[data-profession][data-character]')?.querySelector('[data-better]');
  if (better) { e.preventDefault(); e.stopPropagation(); openBetterChoices(better); return; }
  const rating = e.target.closest('[data-card-rating]');
  if (rating) { e.preventDefault(); e.stopPropagation(); toggleCardRating(rating); return; }
  const profession = e.target.closest('[data-profession]');
  if (profession) { e.preventDefault(); e.stopPropagation(); openProfessionPicker(profession); return; }
  const mount = e.target.closest('[data-ride],[data-setup-ride]');
  if (mount) { e.preventDefault(); e.stopPropagation(); openRidePicker(mount); return; }
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
  if (b.dataset.action === 'multi-select') { multiSelectMode = setupToggleAfterCommit ?? !multiSelectMode; setupToggleAfterCommit=null; if (!multiSelectMode) rowSelection.clear(); refreshRowSelection(); return; }
  if (b.dataset.action === 'select-all-rows') { rowIds().forEach(id => rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'clear-row-selection') { rowSelection.clear(); selectionAnchor = null; refreshRowSelection(); return; }
  if (b.dataset.action === 'invert-rows') { rowIds().forEach(id => rowSelection.has(id) ? rowSelection.delete(id) : rowSelection.add(id)); refreshRowSelection(); return; }
  if (b.dataset.action === 'delete-selected-characters') {
    if (page === 'levels') {
      const ids = state.selection.filter(id => rowSelection.has(id));
      if (!ids.length || !await confirmRecordDeletion(`是否从待添加列表中删除选中的 ${ids.length} 位人物？`)) return;
      const removed = new Set(ids);
      state.selection = state.selection.filter(id => !removed.has(id));
      ids.forEach(id => {
        delete state.initialLevels[id];
        if (state.draftProfessions) delete state.draftProfessions[id];
        if (state.draftRides) delete state.draftRides[id];
        if (state.draftStoryClasses) delete state.draftStoryClasses[id];
        if (state.draftExpectations) delete state.draftExpectations[id];
      });
      rowSelection.clear(); selectionAnchor = null;
      if (!state.selection.length) page = 'select';
      animateListChange(render); return;
    }
    const items = visibleRoster().filter(item => rowSelection.has(item.id));
    if (!items.length || !await confirmRecordDeletion(`是否删除选中的 ${items.length} 位人物？`)) return;
    softDelete(items);
    const ids = new Set(items.map(item => item.id));
    state.selection = state.selection.filter(id => !ids.has(id));
    ids.forEach(id => { delete state.initialLevels[id]; editingCharacters.delete(id); expandedJournals.delete(id); });
    rowSelection.clear(); selectionAnchor = null;
    rememberListPosition(); animateListChange(returnToSummary); return;
  }
  if (b.dataset.action === 'batch-profession') { openProfessionPicker(b); return; }
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
  if (b.dataset.edit && openSummaryRecord(b)) return;
  if (b.dataset.queue && openQueueRow(b)) return;
  if (b.dataset.reseed) { runSeedSearch(b.dataset.reseed); return; }
  if (b.dataset.exam) { openExamRecommend(b.dataset.exam); return; }
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
    const id = b.dataset.start, item = state.roster.find(r => r.id === id);
    // No starting level means no seed. Asked on every press; 跳过 records without one, Esc does nothing.
    if (item && (item.initialLevel === null || item.initialLevel === undefined)) {
      if (!await askMissingLevels([id], (key, value) => { item.initialLevel = Number(value); }) || page !== 'summary') return;
      render();
    }
    start(id);
  }
  updateRecordFromButton(b);
  const action = b.dataset.action;
  if (action === 'clear-skipped') {
    if (!visibleRoster().some(item => M.live(item).some(record => record.status === 'skipped'))) return;
    if (!await confirmRecordDeletion('是否清空所有已跳过记录？', '清空')) return;
    softDelete(visibleRoster().flatMap(item => M.live(item).filter(record => record.status === 'skipped')));
    rememberListPosition(); animateListChange(returnToSummary); return;
  }
  if (['reset', 'reset-list'].includes(action) && !await confirmRecordDeletion(action === 'reset' ? '是否清空全部人物和记录？' : '是否清空所有升级记录？', '清空', action === 'reset-list' ? '自定义属性期望将保留。' : '')) return;
  if (action === 'delete-record') { deleteRecord(); return; }
  if (['select', 'levels', 'summary'].includes(action)) { page = action; render(); }
  if (action === 'leave') { activeRecord = null; returnToSummary(); }
  if (['reset', 'reset-list'].includes(action)) { clearRecordDraft(); seedMessages.clear(); visibleRoster().forEach(item => { delete item.seed; }); }
  if (action === 'reset') { softDelete(visibleRoster()); state.selection = []; state.initialLevels = {}; state.draftExpectations = {}; state.draftProfessions = {}; state.draftRides = {}; state.draftStoryClasses = {}; state.rideMemory = {}; editingCharacters.clear(); activeRecord = null; query = ''; clearDrag(); notify(''); page = 'select'; render(); window.scrollTo(0, 0); }
  if (action === 'reset-list') {
    softDelete(visibleRoster().flatMap(item => M.live(item)));
    editingCharacters.clear(); activeRecord = null;
    rememberListPosition(); animateListChange(returnToSummary);
  }
  if (action === 'batch') { openSetupLevelDialog(); return; }
  if (action === 'create') {
    if (!finishSetupLevel()) return;
    const invalid = state.selection.find(id => !/^(?:[1-9][0-9]?)?$/.test(String(state.initialLevels[id] ?? '')));
    if (invalid) { editSetupLevel(app.querySelector(`[data-setup-level="${invalid}"]`)); validLevel(setupLevelEdit.input); return; }
    // Without a starting level the seed cannot be worked out: say who, and let the user go on or go back.
    // Without a starting level the seed cannot be worked out: ask for the missing ones, or let them be skipped.
    const empty = state.selection.filter(id => String(state.initialLevels[id] ?? '') === '');
    if (empty.length && (!await askMissingLevels(empty) || page !== 'levels')) return;
    state.selection.forEach(id => {
      const value = String(state.initialLevels[id] ?? ''), existing = state.roster.find(item => item.id === id);
      const item = existing || { id, deleted: false, initialProfession: null, expectations: [], records: [] };
      item.initialLevel = value === '' ? null : Number(value);
      // A hidden Part 3 starting class waits for the switch, unless another class was chosen.
      if (!existing || classAvailable(item.initialProfession) || Object.hasOwn(state.draftProfessions || {}, id)) item.initialProfession = setupProfession(id);
      rememberRides(id, state.draftRides?.[id]);
      if (existing && Object.hasOwn(state.draftProfessions || {}, id)) item.pendingProfession = item.initialProfession;
      item.deleted = false; delete item.deletedAt; delete item.deletionBatch;
      if (state.draftExpectations && Object.hasOwn(state.draftExpectations, id)) M.setRule(item, M.nextSeq(item), state.draftExpectations[id], false);
      if (!existing) state.roster.push(item);
    });
    state.draftExpectations = {};
    state.draftProfessions = {};
    state.draftRides = {};
    state.draftStoryClasses = {};
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
    applyStoryPhase();
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
  clearRecordDraft();
  seedMessages.clear();
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
/* Desktop sorts by dragging a card or its grip. The phone layout (any pointer, below 1420px) has no direct
   dragging on step 3: it sorts only in its 排序 list, by the grip. */
function sortDragAllowed(target) {
  if (!UI_MEDIA.mobileShell.matches || page !== 'summary') return true;
  return app.classList.contains('m-sort-mode') && Boolean(target.closest('.drag-grip'));
}
function mouseSortTarget(target) {
  if (!sortDragAllowed(target)) return null;
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
  const move = window.RiggingActions.planMove(list, ids, targetId, after);
  if (!move) return;
  const { moved, remaining } = move;
  const before = captureList(false), dropped = mouseSort || touchSort ? ids : [];
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
  playListChange(before, { chips: false, settleIds: dropped });
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
    e.preventDefault(); closeInitialLevel(e.target.closest('[data-initial-form]'), false); return;
  }
  if (['ArrowUp', 'ArrowDown'].includes(e.key) && e.target.closest('[data-initial-form]')) {
    e.preventDefault(); stepInitialLevel(e.target, e.key === 'ArrowUp' ? 1 : -1); return;
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
function checkRecordDraft(d, data) {
  const item = data.roster.find(r => r.id === d?.id);
  if (!item || !Array.isArray(d.stats) || d.stats.some(s => !STATS.includes(s)) || ![true, false, null].includes(d.happy)) return false;
  if (d.editIndex !== undefined && (!Number.isInteger(d.editIndex) || !item.records[d.editIndex])) return false;
  if (d.queueIndex !== undefined && (!Number.isInteger(d.queueIndex) || d.queueIndex < 0 || !item.seed)) return false;
  d.ratingSource ||= d.editIndex !== undefined ? item.records[d.editIndex].ratingSource : 'legacy';
  M.renameClass(d, 'profession'); M.renameClass(d, 'storyClass');
  // Snapshots from before mounts existed have neither field.
  d.ride ??= null; d.rides ??= {};
  if (d.ride !== null) M.validRide(d.ride, window.PROFESSIONS.mountOf[d.profession] || null);
  return true;
}
// One unsaved upgrade input, outside the save and backups. `open` means the page was
// still showing it, so a reload returns there; otherwise it waits for that row to reopen.
let heldRecordDraft = null;
try { heldRecordDraft = JSON.parse(localStorage.getItem(RECORD_DRAFT_KEY) || 'null'); } catch { /* Optional storage. */ }
function writeRecordDraft() {
  try {
    if (heldRecordDraft) localStorage.setItem(RECORD_DRAFT_KEY, JSON.stringify(heldRecordDraft));
    else localStorage.removeItem(RECORD_DRAFT_KEY);
  } catch { /* The input still lives in this page. */ }
}
function rememberRecordDraft() {
  if (page === 'record' && activeRecord) {
    const item = state.roster.find(r => r.id === activeRecord.id);
    heldRecordDraft = { open: true, draft: activeRecord, base: window.RiggingActions.currentProfession(state, item) };
  } else if (heldRecordDraft?.open) heldRecordDraft = { ...heldRecordDraft, open: false };
  else return;
  writeRecordDraft();
}
function clearRecordDraft() { heldRecordDraft = null; writeRecordDraft(); }
function takeRecordDraft(id, editIndex, queueIndex) {
  const held = heldRecordDraft;
  if (held?.draft?.id !== id || held.draft.editIndex !== editIndex || held.draft.queueIndex !== queueIndex) return null;
  try {
    const draft = M.copy(held.draft), item = state.roster.find(r => r.id === id);
    if (!checkRecordDraft(draft, state) || item.deleted || !inStory(char(id)) || item.records[editIndex]?.deleted) return null;
    if (editIndex === undefined && queueIndex === undefined) {
      // Changes made on the list while this waited win over what it remembered.
      if (window.RiggingActions.currentProfession(state, item) !== held.base) {
        const fresh = newRecordDraft(id);
        draft.profession = fresh.profession; draft.ride = fresh.ride; delete draft.storyClass;
      }
      if (draft.ratingSource === 'auto') applyDraftRating(draft);
    }
    return draft;
  } catch { return null; }
}
function restoreRecordPage() {
  if (activeRecord || !heldRecordDraft?.open) return;
  const draft = takeRecordDraft(heldRecordDraft.draft?.id, heldRecordDraft.draft?.editIndex, heldRecordDraft.draft?.queueIndex);
  if (draft) { activeRecord = draft; page = 'record'; }
}
// Only used for a same-tab deployment update; existing localStorage is untouched.
function updateSessionKey() {
  return `rigging-buddy:update-session:v1:${new URL('.', window.location.href).pathname}`;
}
window.prepareForAppUpdate = revision => {
  if (mouseSort || touchSort || document.activeElement?.matches('input:not([name="part3"]):not([name="route"])') || app.querySelector('[data-initial-form]') || app.querySelector('#batch-level')?.value || document.querySelector('dialog[open]')) return false;
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
    if (saved.page === 'record' && !checkRecordDraft(d, saved.state)) return;
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
restoreRecordPage();
render();
app.addEventListener('change', e => {
  if (e.target.name !== 'route') return;
  const other = e.target.value === 'other';
  state.route = other ? 'other' : 'kai';
  render();
  const segment = app.querySelector('.route-segment');
  if (!segment) return;
  segment.querySelector('input:checked').focus({ preventScroll: true });
  if (!motionAllowed()) return;
  segment.animate({ transform: other ? ['translateX(0)', 'translateX(100%)'] : ['translateX(100%)', 'translateX(0)'] },
    { duration: MOTION.large, easing: MOTION.ease, pseudoElement: '::before' });
});
app.addEventListener('change', e => {
  if (e.target.name !== 'part3') return;
  const on = e.target.value === 'on';
  state.part3 = on;
  render();
  const segment = app.querySelector('.part3-segment');
  if (!segment) return;
  // Most pages rebuild the control, so hand keyboard users back the new one.
  segment.querySelector('input:checked').focus({ preventScroll: true });
  // The rebuilt control starts at its final state, so a CSS transition would never run.
  if (!motionAllowed()) return;
  segment.animate({ transform: on ? ['translateX(0)', 'translateX(100%)'] : ['translateX(100%)', 'translateX(0)'] },
    { duration: MOTION.large, easing: MOTION.ease, pseudoElement: '::before' });
});
// Pages of this site follow each other: a save in one is taken up by the others. It waits while this page is
// mid-gesture, in a dialog or typing, so nothing it holds goes stale, and applies on the next calm moment.
let followedSave = null;
function followBusy() {
  return Boolean(mouseSort || touchSort || document.querySelector('dialog[open]') || document.activeElement?.matches('input,textarea,select,[contenteditable]'));
}
function applyFollowedSave() {
  if (followedSave === null || (!document.hidden && followBusy())) return;
  followedSave = null;
  // Take what is stored now: if this page wrote after the other one, its own save is already the latest.
  let serialized;
  try { serialized = localStorage.getItem(LOCAL_STATE_KEY); } catch { return; }
  if (serialized === null || serialized === lastLocalSave) return;
  const scrollY = window.scrollY;
  persistence.follow(serialized);
  render();
  window.scrollTo(0, scrollY);
}
function settleFollowedPage() {
  // Keep this page's place unless the other page removed what it showed.
  if (page === 'record' && !state.roster.some(item => item.id === activeRecord?.id && !item.deleted)) { activeRecord = null; page = 'summary'; }
  if (page === 'summary' && !visibleRoster().length) page = state.selection.length ? 'levels' : 'select';
  if (page === 'levels' && !state.selection.length) page = visibleRoster().length ? 'summary' : 'select';
}
window.addEventListener('storage', e => {
  if (e.key !== LOCAL_STATE_KEY || e.storageArea !== localStorage || e.newValue === null) return;
  followedSave = e.newValue;
  applyFollowedSave();
});
document.addEventListener('close', () => setTimeout(applyFollowedSave), true);
document.addEventListener('focusout', () => setTimeout(applyFollowedSave));
document.addEventListener('pointerup', () => setTimeout(applyFollowedSave));
document.addEventListener('visibilitychange', applyFollowedSave);
window.addEventListener('pagehide',saveLocalState);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveLocalState();});

// The mobile navigation bar (ui/mobile.js) replaced the swipe-to-hide page header; desktop never had one.
