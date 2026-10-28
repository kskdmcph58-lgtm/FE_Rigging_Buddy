/* Versioned, DOM-independent backup and expectation model. */
window.RiggingModel = (() => {
  const stats = Object.freeze(['HP', '力量', '魔力', '速度', '技巧', '防守', '魔防', '幸运', '魅力']);
  const limits = Object.freeze({ fileBytes: 10 * 1024 * 1024, records: 20000, ruleDepth: 16, ruleNodes: 256, seq: Number.MAX_SAFE_INTEGER - 1 });
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
  const live = item => item.records.filter(r => !r.deleted);
  const nextSeq = item => item.records.reduce((max, r) => Math.max(max, r.seq), 0) + 1;
  function level(item, record) {
    return (item.initialLevel ?? 0) + item.records.filter(r => r.seq <= record.seq && !r.deleted && !r.skipped).length;
  }
  // Compute every visible attempt's display level in one pass, including skips.
  function displayLevels(item) {
    let current = item.initialLevel ?? 0;
    return item.records.map(record => {
      if (record.deleted) return current;
      if (record.skipped) return current + 1;
      return ++current;
    });
  }
  const nextLevel = item => (item.initialLevel ?? 0) + live(item).filter(r => !r.skipped).length + 1;
  function ruleAt(item, seq) {
    let rule = null;
    for (const range of item.expectations || []) { if (range.from > seq) break; rule = range.rule; }
    return rule;
  }
  function validRule(rule) {
    let count = 0;
    function visit(node, depth) {
      if (!node || typeof node !== 'object' || ++count > limits.ruleNodes || depth > limits.ruleDepth) throw Error('条件过多或层级过深，请简化');
      if (node.type === 'stat') { if (!stats.includes(node.stat)) throw Error('未知属性'); }
      else if (node.type === 'total') {
        if (!['gt', 'gte', 'lt', 'lte'].includes(node.op) || !Number.isInteger(node.value) || node.value < (node.op === 'lt' ? 1 : 0) || node.value > (node.op === 'gt' ? 8 : 9)) throw Error('总点数条件不正确');
      } else if (node.type === 'not') visit(node.child, depth + 1);
      else if (['all', 'any'].includes(node.type)) {
        if (!Array.isArray(node.children) || !node.children.length) throw Error('条件组不能为空');
        node.children.forEach(child => visit(child, depth + 1));
      } else throw Error('未知条件');
    }
    if (rule !== null) visit(rule, 0);
    return true;
  }
  function ruleSize(rule) {
    let nodes = 0, depth = 0;
    function visit(node, level) {
      if (!node) return;
      nodes++; depth = Math.max(depth, level);
      if (node.type === 'not') visit(node.child, level + 1);
      else if (node.children) node.children.forEach(child => visit(child, level + 1));
    }
    visit(rule, 0);
    return { nodes, depth };
  }
  function evaluate(rule, raised) {
    if (!rule) return raised.length === 4 ? null : raised.length >= 5;
    if (rule.type === 'stat') return raised.includes(rule.stat);
    if (rule.type === 'not') return !evaluate(rule.child, raised);
    if (rule.type === 'all') return rule.children.every(n => evaluate(n, raised));
    if (rule.type === 'any') return rule.children.some(n => evaluate(n, raised));
    const n = raised.length, v = rule.value;
    return { gt: n > v, gte: n >= v, lt: n < v, lte: n <= v }[rule.op];
  }
  function setRule(item, from, rule, includeHistory) {
    if (includeHistory) item.expectations = rule ? [{ from: 1, rule: copy(rule) }] : [];
    else {
      const ranges = (item.expectations || []).filter(r => r.from < from);
      const previous = ranges.length ? ranges[ranges.length - 1].rule : null;
      if (JSON.stringify(previous) !== JSON.stringify(rule)) ranges.push({ from, rule: copy(rule) });
      item.expectations = ranges;
    }
    if (!item.expectations.length) delete item.expectations;
  }
  function rangesValid(ranges) {
    if (ranges === undefined) return;
    if (!Array.isArray(ranges)) throw Error('期望区间格式不正确');
    let last = 0;
    for (const range of ranges) {
      if (!Number.isSafeInteger(range.from) || range.from <= last) throw Error('期望区间必须递增');
      validRule(range.rule); last = range.from;
    }
  }
  function migrate(input, characterIds) {
    if (!input || ![1, 2].includes(input.version ?? 1) || !Array.isArray(input.roster)) throw Error('备份格式不正确');
    const data = copy(input), old = (data.version ?? 1) === 1;
    const ids = new Set(), recordIds = new Set();
    let recordCount = 0;
    function metadata(object) {
      for (const key of ['createdAt', 'updatedAt', 'deletedAt', 'deletionBatch']) {
        if (object[key] !== undefined && (typeof object[key] !== 'string' || object[key].length > 128)) throw Error('记录信息不正确');
      }
      if (object.deletionOrder !== undefined && (!Number.isSafeInteger(object.deletionOrder) || object.deletionOrder < 0)) throw Error('删除顺序不正确');
    }
    for (const item of data.roster) {
      if (!item || !characterIds.includes(item.id) || ids.has(item.id) || (item.initialLevel !== null && (!Number.isSafeInteger(item.initialLevel) || item.initialLevel < 1 || item.initialLevel > 99)) || !Array.isArray(item.records)) throw Error('角色数据不正确');
      metadata(item);
      recordCount += item.records.length;
      if (recordCount > limits.records) throw Error('备份记录过多，请分开保存');
      ids.add(item.id); rangesValid(item.expectations);
      if (item.deleted !== undefined && typeof item.deleted !== 'boolean') throw Error('删除标记不正确');
      let last = 0, legacyLevel = (item.initialLevel ?? 0) + 1;
      for (const r of item.records) {
        if (!r || !Array.isArray(r.stats) || new Set(r.stats).size !== r.stats.length || r.stats.some(s => !stats.includes(s)) || typeof r.happy !== 'boolean') throw Error('升级记录不正确');
        for (const key of ['skipped', 'upgraded', 'deleted']) if (r[key] !== undefined && typeof r[key] !== 'boolean') throw Error('记录标记不正确');
        if (r.skipped && r.upgraded) throw Error('记录状态冲突');
        if (old) {
          if (r.level !== legacyLevel) throw Error('旧记录等级不正确');
          if (!r.skipped) legacyLevel++;
          r.seq = last + 1; r.id = uid(); r.ratingSource = 'legacy';
        }
        if (!Number.isSafeInteger(r.seq) || r.seq <= last || r.seq > limits.seq || typeof r.id !== 'string' || !r.id || r.id.length > 128 || recordIds.has(r.id)) throw Error('记录序号或 ID 不正确');
        if (r.profession !== undefined && r.profession !== null && !window.PROFESSIONS.names.includes(r.profession)) throw Error('Invalid profession');
        metadata(r);
        if (r.ratingSource !== undefined && !['auto', 'manual', 'legacy'].includes(r.ratingSource)) throw Error('评价来源不正确');
        r.ratingSource ||= 'legacy';
        if (r.ratingPending !== undefined && typeof r.ratingPending !== 'boolean') throw Error('待评价标记不正确');
        delete r.level; last = r.seq; recordIds.add(r.id);
      }
    }
    if (data.selection !== undefined && (!Array.isArray(data.selection) || new Set(data.selection).size !== data.selection.length || data.selection.some(id => !characterIds.includes(id) || data.roster.some(r => r.id === id && !r.deleted)))) throw Error('角色选择不正确');
    if (data.initialLevels !== undefined && (!data.initialLevels || typeof data.initialLevels !== 'object' || Array.isArray(data.initialLevels))) throw Error('初始等级不正确');
    for (const [id, value] of Object.entries(data.initialLevels || {})) {
      // Incomplete text is a setup draft; keep it editable after reopening.
      if (!characterIds.includes(id) || !(typeof value === 'string' && value.length <= 80 || Number.isInteger(value) && value >= 1 && value <= 99)) throw Error('初始等级不正确');
    }
    if (data.summaryScroll !== undefined && (!Number.isFinite(data.summaryScroll) || data.summaryScroll < 0)) throw Error('页面位置不正确');
    if (data.deletionCounter !== undefined && (!Number.isSafeInteger(data.deletionCounter) || data.deletionCounter < 0)) throw Error('删除顺序不正确');
    if (data.draftExpectations !== undefined) {
      if (!data.draftExpectations || typeof data.draftExpectations !== 'object' || Array.isArray(data.draftExpectations)) throw Error('待设置期望不正确');
      for (const [id, rule] of Object.entries(data.draftExpectations)) { if (!characterIds.includes(id)) throw Error('未知角色'); validRule(rule); }
    }
    return { ...data, version: 2, selection: data.selection || [], initialLevels: data.initialLevels || {} };
  }
  return { stats, limits, copy, uid, live, nextSeq, level, displayLevels, nextLevel, ruleAt, validRule, ruleSize, evaluate, setRule, migrate };
})();
