/* Runs seed searches and shows their state. Rules live in core/seed.js. */
const seedMessages = new Map();
let seedSearches = Promise.resolve();
const seedPending = new Set();
function seedVersion() { return document.querySelector('meta[name="app-version"]')?.content || ''; }
// A hint closed by clicking its bubble stays closed until its text changes (this session only).
const dismissedSeedMessages = new Map();
function seedMessageText(item, c) {
  const text = seedMessages.get(item.id);
  if (text) return text;
  if (item.seed || !window.RiggingSeed.eligible(item, c)) return '';
  const missing = window.RiggingSeed.MIN_RECORDS - M.live(item).length;
  return missing > 0 ? `再记 ${missing} 条就能反推种子` : '';
}
function seedMessage(item, c) {
  const text = seedMessageText(item, c);
  return text && dismissedSeedMessages.get(item.id) === text ? '' : text;
}
function dismissSeedMessage(id) {
  const item = state.roster.find(r => r.id === id);
  if (item) dismissedSeedMessages.set(id, seedMessageText(item, char(id)));
  showSeedMessage(id, seedMessages.get(id) || '');
}
function seedStatusMarkup(item, c) {
  const text = seedMessage(item, c);
  return `<p class="seed-status" data-seed-status="${c.id}" aria-live="polite" ${text ? '' : 'hidden'}>${escapeValue(text)}</p>`;
}
function showSeedMessage(id, text = '') {
  if (text) seedMessages.set(id, text); else seedMessages.delete(id);
  const item = state.roster.find(r => r.id === id);
  const shown = item ? seedMessage(item, char(id)) : '';
  app.querySelectorAll(`[data-seed-status="${id}"]`).forEach(node => { node.textContent = shown; node.hidden = !shown; });
}
// The engine waits until someone can use it, and the page redraws once rows can be calculated.
function loadSeedEngine() {
  if (window.RiggingSeed.ready()) { recheckSavedSeeds(); return; }
  window.RiggingSeed.load(seedVersion()).then(() => { recheckSavedSeeds(); if (page === 'summary' || page === 'record') render(); }).catch(() => {});
}
/* Data saved before records became forecast rows still has its window marked 锚点 (now only read here). It is
   searched once per session as it is, after loading or importing; a later save then has the new shape. */
const recheckedSeeds = new Set();
function recheckSavedSeeds() {
  for (const item of state.roster) {
    const c = char(item.id);
    if (item.deleted || !item.seed || !M.live(item).some(record => record.anchor) || !window.RiggingSeed.eligible(item, c) || window.RiggingSeed.hasCorrection(item)) continue;
    const key = `${item.id}|${window.RiggingSeed.chainKey(state, item, c, null)}`;
    if (recheckedSeeds.has(key)) continue;
    recheckedSeeds.add(key);
    runSeedSearch(item.id);
  }
}
// The part that could not become forecast rows, and the levels the seed now comes from.
function partialSeedMessage(item, result) {
  const [from, to] = result.mismatch.levels.map(level => levelLabel(item, level));
  const where = result.mismatch.class ? `${from} 没有填兵种` : from === to ? `${from} 数据不匹配` : `${from}–${to} 中有数据不匹配`;
  const [first, latest] = result.levels;
  return first === undefined ? `${where}。` : `${where}，已使用 ${levelLabel(item, first)}–${levelLabel(item, latest)} 进行预测。`;
}
function runSeedSearch(id, opensRecord = false) {
  if (seedPending.has(id)) return;
  seedPending.add(id);
  loadSeedEngine();
  seedSearches = seedSearches.then(() => searchSeed(id, opensRecord)).finally(() => seedPending.delete(id));
}
async function searchSeed(id, opensRecord = false) {
  const item = state.roster.find(r => r.id === id), c = char(id);
  if (!item || item.deleted) return;
  const rework = Boolean(item.seed);
  const before = rework ? '原来的种子和队列没有变。' : '';
  showSeedMessage(id, '正在反推种子…');
  try {
    let result, applied = false;
    // Records saved during a search change the chain, so that answer is out of date.
    for (let tries = 0; tries < 3 && !applied; tries++) {
      result = await window.RiggingSeed.search(state, item, c, { onProgress: progress => showSeedMessage(id, `正在反推种子… ${Math.floor(progress.ratio * 100)}%`) });
      if (result.status !== 'found') break;
      const outcome = window.RiggingSeed.applyFound(state, item, c, result);
      applied = outcome.applied;
      if (outcome.reason === 'limit') { showSeedMessage(id, '记录已达上限，请导出备份。'); return; }
      if (outcome.reason === 'mismatch') { showSeedMessage(id, `算出的结果和记录对不上，没有改动。${before}`); return; }
    }
    if (result.status === 'found' && applied) {
      showSeedMessage(id, result.mismatch ? partialSeedMessage(item, result) : '');
      // That return aligns the newest card, which would skip past the rows that come next.
      if (recordReturnPosition?.id === id) recordReturnPosition = null;
      if (page === 'record' && activeRecord?.id === id) { activeRecord = null; clearRecordDraft(); returnToSummary(); }
      else if (page === 'summary') { rememberListPosition(); returnToSummary(); }
    }
    else if (result.status === 'short') showSeedMessage(id);
    else if (result.status === 'class') showSeedMessage(id, `${levelLabel(item, result.level)} 没有填兵种，填上才能反推。`);
    else if (result.status === 'none') showSeedMessage(id, `没有找到匹配的种子，从 ${levelLabel(item, result.level)} 开始对不上。${before}`);
    else if (result.status === 'ambiguous') showSeedMessage(id, rework ? `还有 ${result.count} 个候选种子，再修正一条通常就能确定。${before}` : `还有 ${result.count} 个候选种子，再记一条通常就能确定。`);
    else showSeedMessage(id);
    // These two need another level-up, unless the user has already moved on.
    if (opensRecord && page === 'summary' && (result.status === 'short' || result.status === 'ambiguous')) openNewRecord(id);
  } catch (error) {
    showSeedMessage(id, `反推失败：${error?.message || '未知错误'}。${before}`);
  }
}
function seedCanStart(item) {
  return !item.seed && window.RiggingSeed.eligible(item, char(item.id)) && M.live(item).length >= window.RiggingSeed.MIN_RECORDS;
}
function openQueueRow(b) {
  rememberListPosition();
  const index = Number(b.dataset.index), id = b.dataset.queue;
  const item = state.roster.find(r => r.id === id), c = char(id);
  if (!window.RiggingSeed.ready()) return true;
  if (!editingCharacters.has(id)) {
    const status = railState(b.closest('.records'));
    status.autoUntil = performance.now() + 1000;
    status.autoPending = true;
    status.signature = '';
    window.RiggingSeed.cycleRowStatus(state, item, c, index);
    returnToSummary();
    return true;
  }
  const draft = takeRecordDraft(id, undefined, index) || window.RiggingSeed.rowDraft(state, item, c, index);
  if (!draft) return true;
  activeRecord = draft;
  page = 'record'; render(); window.scrollTo(0, 0);
  return true;
}
