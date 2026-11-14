/* Seed recovery and forecasts on saved records. No DOM or navigation.
   The queue is fixed by the seed: marks are display data, and a class only changes a row's result. */
window.RiggingSeed = (() => {
  const model = window.RiggingModel;
  const actions = window.RiggingActions;
  const MIN_RECORDS = 4, QUEUE_SIZE = 10, MAX_LEVEL = 99, UNCAPPED = 32767;
  let engine = null, game = null, loading = null, solver = null, people = null, jobs = null;

  function load(version) {
    if (loading) return loading;
    const query = version ? `?v=${version}` : '';
    loading = Promise.all([
      import(`./seed-engine.js${query}`),
      fetch(`data/seed-game.json${query}`).then(response => {
        if (!response.ok) throw Error('数据读取失败');
        return response.json();
      })
    ]).then(([loadedEngine, loadedGame]) => {
      engine = loadedEngine; game = loadedGame;
      people = new Map();
      for (const [id, person] of Object.entries(game.persons)) for (const name of [person.names.pre, person.names.part3]) people.set(name, id);
      jobs = new Map();
      for (const name of Object.values(game.baseJobNames)) jobs.set(name, 'JID_無職');
      for (const [id, job] of Object.entries(game.jobs)) if (job.kind === 'class') jobs.set(job.name, id);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }
  const ready = () => Boolean(game);
  const eligible = (item, c) => item.initialLevel !== null && item.initialLevel !== undefined && !c.removed;
  const personId = c => people.get(c.defaultLook?.name ?? c.name) ?? (c.part3?.name ? people.get(c.part3.name) : undefined);

  function computeGrowth({ person, jobId, level, part3, ride }) {
    const job = game.jobs[jobId];
    const defaultRide = job.defaultRide ? game.rides[job.defaultRide] : null;
    const owned = ride ? game.rides[ride.id] : null;
    const rideBonus = job.allocationType === 2 && defaultRide && owned && owned.type === defaultRide.type
      ? owned.growth[ride.level - 1].map(value => value * job.rideMultiplier)
      : new Array(9).fill(0);
    let levelBonus = new Array(9).fill(0);
    for (const row of job.levelBonuses) if (level >= row.from) levelBonus = row.growth;
    return {
      growth: person.growth.map((value, i) => Math.max(0, (value || job.baseGrowth[i]) + job.growthBonus[i] + rideBonus[i] + levelBonus[i])),
      guarantee: part3 ? person.guarantee.part3 : person.guarantee.pre
    };
  }

  /* Every class and ride this row could have had, at the row's own seed. The seed, level and part fix
     the answer, so it is kept per row. Part 1-2 lets only 蕾达 (c017) become 舞者. */
  const choiceCache = new Map();
  function rowChoices(c, row) {
    const id = personId(c);
    if (!id) return [];
    const key = `${id}|${row.seed}|${row.level}|${row.part3 ? 1 : 0}|${state.part3 !== true && state.route === 'other' ? 1 : 0}`;
    let list = choiceCache.get(key);
    if (list) return list;
    const catalog = window.PROFESSIONS, person = game.persons[id];
    // No class counts too (a stat with no personal growth then falls back to the base 30%), but only as the
    // person's own base: 平民 or 贵族 by social status.
    const names = catalog.names.filter(name => actions.classAllowed(state, c.id, name, row.part3));
    list = [];
    for (const profession of names) {
      const jobId = jobs.get(profession);
      if (!jobId) continue;
      const kind = actions.rideKind(profession, c.id);
      const rides = [null, ...actions.rideOptions(kind, c.id, row.part3 === true).flatMap(ride => [1, 2, 3, 4, 5].map(level => ({ id: ride.id, level })))];
      for (const ride of rides) {
        const { growth, guarantee } = computeGrowth({ person, jobId, level: row.level, part3: row.part3, ride });
        const result = engine.simulateLevel(row.seed, { kind: 'level', growth, guarantee, room: new Array(9).fill(UNCAPPED), advanceBefore: 0 });
        list.push({ profession, ride, ...statsOf(result.gains) });
      }
    }
    if (choiceCache.size >= 600) choiceCache.delete(choiceCache.keys().next().value);
    choiceCache.set(key, list);
    return list;
  }
  /* Choices that beat what a forecast row shows now: more points, or 满意 where the row is not.
     Only rows we predicted count; a marked or corrected row is already settled. */
  function betterChoices(state, item, c, row) {
    if (!ready() || row.status !== 'normal' || row.corrected) return [];
    const rule = model.ruleAt(item, model.nextSeq(item) + row.index), points = r => r.stats.length + r.plus2.length, base = points(row);
    return rowChoices(c, row).map(choice => ({ ...choice, happy: model.evaluate(rule, choice.stats) === true }))
      .filter(choice => points(choice) > base || (row.happy !== true && choice.happy));
  }

  // Class tier: 0 for 平民/贵族, then 初级 1 up to 神将 5.
  function classTier(name) {
    const catalog = window.PROFESSIONS;
    return catalog.base.includes(name) ? 0 : 1 + catalog.rows.findIndex(row => row.flat().includes(name));
  }
  /* The toolbar's 推荐 cap for one story part (Part 1-2 tops out at 上级, Part 3 at 神将). It narrows what is
     recommended, never what can be picked. */
  function recommendCap(state, part3) {
    const top = part3 ? 5 : 3, cap = state.recommendTier?.[part3 ? 'part3' : 'pre'];
    return Number.isInteger(cap) && cap >= 0 && cap < top ? cap : top;
  }
  // The better choices within that cap: these decide whether a row is marked.
  function recommendedChoices(state, item, c, row) {
    const cap = recommendCap(state, row.part3 === true);
    return betterChoices(state, item, c, row).filter(choice => classTier(choice.profession) <= cap);
  }

  /* 考试推荐: which classes beat the forecast most, to take their exam first. The rows are those after the
     newest 已升级 (or all of them) up to the level cap, skipped rows left out; the user may narrow them to a
     level range within that. An option is a class with one ride at one friendship level. Its points are the
     rows where it beats the row's class (betterChoices); on those rows only, what each stat gains over the
     row and what it loses are summed apart, a +2 counting 2. A row's 强烈推荐 are its better choices with
     the most points; strong counts those rows. Within one class an option goes when another is at least as
     good everywhere (every gain as high, every loss as low, as many rows and strong rows) and better
     somewhere; options that come out the same share one entry.
     examStats runs the slow part once, a slice at a time so the page can show progress: every level's better
     choices and their differences. examEntries then sums any level range of it at once. */
  async function examStats(state, item, c, { onProgress } = {}) {
    if (!ready() || !item.seed || !eligible(item, c) || hasCorrection(item)) return null;
    const all = queueRows(state, item, c, 0, Infinity);
    const start = all.findLastIndex(row => row.status === 'upgraded') + 1;
    const rows = all.slice(start).filter(row => row.status === 'normal');
    const amount = (r, stat) => r.plus2.includes(stat) ? 2 : r.stats.includes(stat) ? 1 : 0;
    const points = r => r.stats.length + r.plus2.length;
    const levels = [];
    let slice = Date.now();
    for (const [n, row] of rows.entries()) {
      const choices = betterChoices(state, item, c, row);
      // 强烈推荐: the choices that raise the most points on this level, one or several.
      const most = Math.max(...choices.map(points));
      levels.push({ level: row.displayLevel, options: choices.map(choice => {
        const diff = model.stats.map(stat => amount(choice, stat) - amount(row, stat));
        return { key: `${choice.profession}|${choice.ride?.id ?? ''}|${choice.ride?.level ?? 0}`, profession: choice.profession, ride: choice.ride, strong: points(choice) === most,
          gain: diff.map(d => Math.max(0, d)), loss: diff.map(d => Math.max(0, -d)) };
      }) });
      if (Date.now() - slice > 12) {
        onProgress?.({ ratio: (n + 1) / rows.length });
        await new Promise(resolve => setTimeout(resolve));
        slice = Date.now();
      }
    }
    return { levels, min: levels[0]?.level ?? null, max: levels.at(-1)?.level ?? null, part3: rows.some(row => row.part3) };
  }
  // The user's level range for a person, kept inside what examStats found; null ends mean the full range.
  function examRange(item, stats) {
    const saved = item.examRange || {}, clamp = value => Math.max(stats.min, Math.min(stats.max, value));
    const from = clamp(saved.from ?? stats.min), to = clamp(saved.to ?? stats.max);
    return from <= to ? { from, to } : { from: stats.min, to: stats.max };
  }
  function examEntries(stats, from, to) {
    const options = new Map();
    let rows = 0;
    for (const { level, options: list } of stats.levels) {
      if (level < from || level > to) continue;
      rows++;
      for (const choice of list) {
        if (!options.has(choice.key)) options.set(choice.key, { profession: choice.profession, ride: choice.ride, count: 0, strong: 0, gain: model.stats.map(() => 0), loss: model.stats.map(() => 0) });
        const option = options.get(choice.key);
        option.count++;
        if (choice.strong) option.strong++;
        choice.gain.forEach((v, i) => { option.gain[i] += v; });
        choice.loss.forEach((v, i) => { option.loss[i] += v; });
      }
    }
    const atLeast = (a, b) => a.count >= b.count && a.strong >= b.strong && a.gain.every((v, i) => v >= b.gain[i]) && a.loss.every((v, i) => v <= b.loss[i]);
    const sameAs = (a, b) => atLeast(a, b) && atLeast(b, a);
    const byClass = new Map();
    for (const option of options.values()) {
      if (!byClass.has(option.profession)) byClass.set(option.profession, []);
      byClass.get(option.profession).push(option);
    }
    const sum = list => list.reduce((a, b) => a + b, 0);
    const entries = [];
    for (const list of byClass.values()) {
      const kept = list.filter(option => !list.some(other => other !== option && atLeast(other, option) && !sameAs(other, option)));
      const merged = [];
      for (const option of kept) {
        const twin = merged.find(entry => sameAs(entry, option));
        if (twin) twin.rides.push(option.ride);
        else merged.push({ ...option, rides: [option.ride] });
      }
      for (const entry of merged) {
        const { ride, ...rest } = entry;
        entries.push({ ...rest, tier: classTier(entry.profession), gainTotal: sum(entry.gain), lossTotal: sum(entry.loss),
          gain: Object.fromEntries(model.stats.map((stat, i) => [stat, entry.gain[i]])), loss: Object.fromEntries(model.stats.map((stat, i) => [stat, entry.loss[i]])) });
      }
    }
    entries.sort((a, b) => b.gainTotal - a.gainTotal || a.lossTotal - b.lossTotal || b.count - a.count);
    return { rows, entries };
  }

  // Null when the class is unknown, so nothing can be calculated for this row.
  function eventOf(c, row) {
    const id = personId(c), jobId = jobs.get(row.profession);
    if (!id || !jobId) return null;
    const { growth, guarantee } = computeGrowth({ person: game.persons[id], jobId, level: row.level, part3: row.part3, ride: row.ride });
    const event = { kind: 'level', growth, guarantee, room: new Array(9).fill(UNCAPPED), advanceBefore: 0 };
    if (row.stats) event.gains = game.stats.map(stat => row.plus2?.includes(stat) ? 2 : row.stats.includes(stat) ? 1 : 0);
    return event;
  }
  function statsOf(gains) {
    const raised = name => gains[game.stats.indexOf(name)];
    const stats = model.stats.filter(name => raised(name) > 0);
    const plus2 = model.stats.filter(name => raised(name) > 1);
    return { stats, plus2 };
  }

  const liveCount = item => model.live(item).length;
  // The level shown on a queue row: a skipped row previews its target without advancing.
  function rowDisplayLevel(item, index) {
    let current = model.nextLevel(item) - 1;
    for (let n = 0; n <= index; n++) {
      if (n === index) return current + 1;
      if (item.seed?.rows?.[n]?.status !== 'skipped') current++;
    }
    return current + 1;
  }
  const rowCount = item => {
    const marked = Object.keys(item.seed?.rows || {}).map(Number);
    return (marked.length ? Math.max(...marked) + 1 : 0) + QUEUE_SIZE;
  };

  // minRows lets a view ask for more of the fixed sequence; nothing about it is stored. limit stops early.
  function queueRows(state, item, c, minRows = 0, limit) {
    if (!ready() || !item.seed || !eligible(item, c)) return [];
    const live = model.live(item), part3Only = window.PROFESSIONS.part3Only;
    let seed = item.seed.value;
    let profession = actions.currentProfession(state, item);
    let ride = actions.rememberedRide(state, item.id, actions.rideKind(profession, item.id));
    // The 第1-2部 class a row falls back to when it inherits a Part 3 class.
    let story = actions.currentProfession({ ...state, part3: false }, item);
    const rows = [], first = item.initialLevel + live.length;
    // Skipped rows use a seed step without gaining a level, so the cap follows the displayed level.
    for (let n = 0, total = limit ?? Math.max(rowCount(item), minRows); n < total && rowDisplayLevel(item, n) <= MAX_LEVEL; n++) {
      const saved = item.seed.rows?.[n] || {};
      // A row nobody marked follows the switch, even after a Part 3 已升级: on 第1-2部 the person is not really
      // back in Part 1-2 (the game does not allow it), the switch only shows the 第1-2部 growth.
      const part3 = saved.part3 ?? (c.part3Only === true || state.part3 === true);
      // A Part 3 class saved while the switch was on waits in the data: a 第1-2部 row keeps the class it
      // inherits, as saved records do (restoreStoryClasses), and gets it back once the switch is on again.
      const usable = Object.hasOwn(saved, 'profession') && (part3 || !window.PROFESSIONS.part3Only.has(saved.profession));
      if (usable) {
        profession = saved.profession;
        ride = actions.rememberedRide(state, item.id, actions.rideKind(profession, item.id));
      }
      if (Object.hasOwn(saved, 'ride') && (usable || !Object.hasOwn(saved, 'profession'))) ride = actions.usableRide(saved.ride, actions.rideKind(profession, item.id), item.id, part3);
      let rowClass = profession, rowRide = ride;
      if (!part3 && part3Only.has(rowClass)) { rowClass = story; rowRide = actions.rememberedRide(state, item.id, actions.rideKind(story, item.id)); }
      else if (!part3Only.has(rowClass)) story = rowClass;
      const row = { level: first + n, part3, profession: rowClass, ride: rowRide };
      const event = eventOf(c, row);
      if (!event) return rows;
      const result = engine.simulateLevel(seed, event), predicted = statsOf(result.gains);
      const stats = saved.stats ?? predicted.stats, plus2 = saved.stats ? saved.plus2 || [] : predicted.plus2;
      const rule = model.ruleAt(item, model.nextSeq(item) + n);
      const happy = saved.happy ?? model.evaluate(rule, stats);
      rows.push({ ...row, index: n, seed, stats, plus2, predicted: predicted.stats, corrected: saved.stats !== undefined, status: saved.status || 'normal',
        happy, displayLevel: rowDisplayLevel(item, n), examMinimum: engine.simulateExam(seed, 100).minimumProbability, ratingSource: saved.happy === undefined ? 'auto' : 'manual' });
      seed = result.next;
    }
    return rows;
  }

  function prune(item, index) {
    const rows = item.seed.rows;
    if (rows?.[index] && !Object.keys(rows[index]).length) delete rows[index];
    if (rows && !Object.keys(rows).length) delete item.seed.rows;
  }
  function savedRow(item, index) {
    item.seed.rows ||= {};
    return item.seed.rows[index] ||= {};
  }
  // A forecast row's rating, flipped from its card. Flipping back to what the rule says stores nothing.
  function toggleRowHappy(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index];
    if (!row) return false;
    const next = row.happy !== true;
    delete savedRow(item, index).happy;
    prune(item, index);
    if (queueRows(state, item, c, index + 1)[index].happy !== next) savedRow(item, index).happy = next;
    return true;
  }
  // Same order as saved records. A mark holds the part it was made in, so the switch cannot move it.
  function cycleRowStatus(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index], saved = savedRow(item, index);
    if (saved.status === 'skipped') {
      saved.status = 'upgraded'; saved.part3 = row.part3;
    } else if (saved.status === 'upgraded') {
      delete saved.status; delete saved.part3;
    } else {
      saved.status = 'skipped'; saved.part3 = row.part3;
    }
    prune(item, index);
  }

  function rowDraft(state, item, c, index) {
    const row = queueRows(state, item, c, index + 1)[index];
    if (!row) return null;
    const kind = actions.rideKind(row.profession, item.id);
    return { id: item.id, queueIndex: index, profession: row.profession, ride: row.ride, rides: kind ? { [kind]: row.ride } : {}, stats: [...row.stats], ...(row.plus2.length ? { plus2: [...row.plus2] } : {}), happy: row.happy, ratingSource: row.ratingSource };
  }
  // What this row gives with the draft's class, for the stats shown while it is uncorrected.
  function draftPrediction(state, item, c, draft) {
    const rows = queueRows(state, item, c, draft.queueIndex + 1), row = rows[draft.queueIndex];
    if (!row) return null;
    const event = eventOf(c, { ...row, profession: draft.profession, ride: draft.ride });
    return event ? statsOf(engine.simulateLevel(row.seed, event).gains) : null;
  }
  function saveRow(state, item, c, draft) {
    const index = draft.queueIndex, rows = queueRows(state, item, c, index + 1), row = rows[index];
    if (!row) return false;
    const before = index ? rows[index - 1] : { profession: actions.currentProfession(state, item), ride: actions.rememberedRide(state, item.id, actions.rideKind(actions.currentProfession(state, item), item.id)) };
    const saved = savedRow(item, index), same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const kind = actions.rideKind(draft.profession, item.id), ride = kind && draft.ride ? { ...draft.ride } : null;
    if (same(draft.profession, before.profession)) delete saved.profession; else saved.profession = draft.profession;
    const inherited = same(draft.profession, before.profession) ? before.ride : actions.rememberedRide(state, item.id, kind);
    if (same(ride, inherited)) delete saved.ride; else saved.ride = ride;
    const predicted = draftPrediction(state, item, c, draft);
    const plus2 = (draft.plus2 || []).filter(stat => draft.stats.includes(stat));
    const matches = predicted && same([...draft.stats].sort(), [...predicted.stats].sort()) && same([...plus2].sort(), [...predicted.plus2].sort());
    if (matches) { delete saved.stats; delete saved.plus2; } else {
      saved.stats = [...draft.stats];
      if (plus2.length) saved.plus2 = plus2; else delete saved.plus2;
    }
    if (draft.ratingSource === 'manual' && draft.happy !== null) saved.happy = draft.happy; else delete saved.happy;
    prune(item, index);
    return true;
  }

  /* Changes a forecast row's class from its card. Later rows inherit it, up to their own change;
     "once" gives the next row back the class it had. Results follow, and it is not a correction. */
  function applyRowClass(state, item, c, index, choice, scope) {
    const rows = queueRows(state, item, c, index + 2), row = rows[index], next = rows[index + 1];
    if (!row) return false;
    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
    const write = (at, profession, ride, before) => {
      const saved = savedRow(item, at), kind = actions.rideKind(profession, item.id);
      const inherited = same(profession, before.profession) ? before.ride : actions.rememberedRide(state, item.id, kind);
      if (same(profession, before.profession)) delete saved.profession; else saved.profession = profession;
      if (same(ride, inherited)) delete saved.ride; else saved.ride = ride;
      prune(item, at);
    };
    const first = actions.currentProfession(state, item);
    const before = index ? rows[index - 1] : { profession: first, ride: actions.rememberedRide(state, item.id, actions.rideKind(first, item.id)) };
    const kind = actions.rideKind(choice.profession, item.id), ride = kind && choice.ride ? { ...choice.ride } : null;
    write(index, choice.profession, ride, before);
    if (scope === 'once' && next) write(index + 1, next.profession, next.ride, { profession: choice.profession, ride });
    if (scope === 'later' && kind) actions.rememberRides(state, item.id, { [kind]: ride });
    return true;
  }

  // The newest row the user changed; only a change to what rose can contradict the seed.
  function correctionTarget(item) {
    const rows = Object.entries(item.seed?.rows || {}).filter(([, row]) => row.stats !== undefined).map(([index]) => Number(index));
    if (rows.length) return { row: Math.max(...rows) };
    const record = model.live(item).findLast(r => r.corrected);
    return record ? { record } : null;
  }
  const hasCorrection = item => correctionTarget(item) !== null;

  /* What a search reads: every saved record, then the forecast rows up to the newest corrected one. A corrected
     record ends it there instead; the records after it then follow whatever seed is found. */
  function chainEntries(state, item, c, target) {
    const chain = model.seedChain(item, c.part3Only === true) || [];
    let entries = chain.map(({ record, level, part3 }) => ({ level, part3, profession: record.profession, ride: record.ride || null, stats: record.stats, plus2: record.plus2, record }));
    if (target?.record) entries = entries.slice(0, entries.findIndex(entry => entry.record === target.record) + 1);
    if (target?.row !== undefined) entries = entries.concat(queueRows(state, item, c).slice(0, target.row + 1));
    return entries;
  }
  const chainKey = (state, item, c, target) => JSON.stringify(chainEntries(state, item, c, target).map(e => [e.level, e.part3, e.profession, e.ride, e.stats, e.plus2]));

  /* Different seeds before a window can meet in the same seed after it. A level's seed is known from the step
     where they all agree, so the levels before that step stay as they are. */
  function settle(origins, from) {
    let seeds = [...new Set(origins)], step = 0;
    while (seeds.length > 1) { seeds = [...new Set(seeds.map(engine.advance))]; step++; }
    return { start: from + step, seed: seeds[0] };
  }

  /* From the first entry: the shortest window that leaves one seed, then the rest replayed on it. Every entry
     has to match; otherwise it says where matching stopped, as entry indexes. */
  async function searchHead(events, end, onProgress) {
    let list = null;
    for (let size = 1; size <= events.length; size++) {
      const at = size - 1, event = events[at];
      if (!event) return { status: 'mismatch', mismatch: { from: at, to: at, class: true } };
      if (size < MIN_RECORDS) continue;
      if (!list) {
        const result = await solver.search(events.slice(0, size), { onProgress });
        if (result.status === 'impossible') return { status: 'mismatch', mismatch: { from: result.impossible.index, to: result.impossible.index } };
        if (!result.complete) return { status: 'cancelled' };
        if (!result.candidates.length) return { status: 'mismatch', mismatch: { from: 0, to: at } };
        // Too many to follow one by one: a longer window narrows them down.
        if (!result.candidatesComplete) {
          if (size === events.length) return { status: 'ambiguous', count: result.candidates.length };
          continue;
        }
        list = result.candidates.map((current, i) => ({ current, origins: result.originLists[i] }));
      } else {
        const next = new Map();
        for (const { current, origins } of list) {
          const after = engine.matchEvent(current, event);
          if (after < 0) continue;
          const kept = next.get(after);
          if (kept) kept.push(...origins); else next.set(after, [...origins]);
        }
        // Even one seed left can be a chance fit of a wrong entry earlier on, so only the range is known.
        if (!next.size) return { status: 'mismatch', mismatch: { from: 0, to: at } };
        list = [...next].map(([current, origins]) => ({ current, origins }));
      }
    }
    if (list.length > 1) return { status: 'ambiguous', count: list.length };
    if (end !== null && list[0].current !== end) return { status: 'mismatch', mismatch: { from: 0, to: events.length - 1 } };
    return { status: 'found', ...settle(list[0].origins, 0) };
  }

  /* First from the oldest entry, so every record can become a forecast row. If something there does not match,
     the shortest window from the newest entry back, as before, and the result says where matching stopped.
     Nothing is written here. */
  async function search(state, item, c, { onProgress } = {}) {
    await load();
    solver ||= new engine.Solver();
    const target = item.seed ? correctionTarget(item) : null;
    const entries = chainEntries(state, item, c, target);
    // Taken before searching, so applyFound can tell if the records moved on meanwhile.
    const key = chainKey(state, item, c, target);
    if (entries.length < MIN_RECORDS) return { status: 'short', missing: MIN_RECORDS - entries.length };
    const events = entries.map(entry => eventOf(c, entry));
    const shown = model.displayLevels(item);
    const levels = entries.map(entry => entry.record ? shown[item.records.indexOf(entry.record)] : entry.displayLevel);
    // Without a correction the saved seed still follows the last record, so a new answer has to arrive there.
    const end = item.seed && !target ? item.seed.value : null;
    // Messages name levels, not positions in the chain: each row index also comes back as the level it shows.
    const found = (settled, mismatch) => ({ status: 'found', ...settled, target, key, ...(mismatch ? { mismatch: { ...mismatch, levels: [levels[mismatch.from], levels[mismatch.to]] }, levels: [levels[settled.start], levels.at(-1)] } : {}) });
    const none = row => ({ status: 'none', row, level: levels[row], target });

    const head = await searchHead(events, end, onProgress);
    if (head.status === 'cancelled') return head;
    if (head.status === 'ambiguous') return { ...head, target };
    if (head.status === 'found') return found(head);

    const tail = size => {
      const from = entries.length - size, list = events.slice(from), missing = list.findIndex(event => !event);
      return missing < 0 ? solver.search(list, { onProgress }) : Promise.resolve({ status: 'class', row: from + missing, level: levels[from + missing] });
    };
    for (let size = MIN_RECORDS; size <= entries.length; size++) {
      const from = entries.length - size, result = await tail(size);
      if (result.status === 'class') return result;
      if (result.status === 'impossible') return none(from + result.impossible.index);
      if (!result.complete) return { status: 'cancelled' };
      if (result.candidates.length === 1) {
        if (end !== null && result.candidates[0] !== end) return none(from);
        return found(settle(result.originLists[0], from), head.mismatch);
      }
      if (!result.candidates.length) {
        let shortest = size;
        for (let smaller = size - 1; smaller >= 2 && size === MIN_RECORDS; smaller--) {
          const shorter = await tail(smaller);
          if (shorter.status !== 'searched' || !shorter.complete || shorter.candidates.length) break;
          shortest = smaller;
        }
        return none(entries.length - shortest);
      }
      if (size === entries.length) return { status: 'ambiguous', count: result.candidates.length, target };
    }
    return { status: 'ambiguous', count: 0, target };
  }

  const sameList = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());
  /* Records from the found seed on become forecast rows, and the seed moves to the first of them. Each row keeps
     its record's class, ride, part, mark and rating, so it shows what the record did. A window that starts
     inside the forecast turns the rows before it into records, as before. */
  function applyFound(state, item, c, found) {
    if (chainKey(state, item, c, found.target) !== found.key) return { applied: false };
    const target = found.target, chain = model.seedChain(item, c.part3Only === true);
    const last = target?.row ?? -1, searched = target?.record ? chain.findIndex(entry => entry.record === target.record) : chain.length - 1;
    const old = item.seed ? queueRows(state, item, c) : [];
    const lift = Math.max(0, found.start - chain.length), kept = Math.min(found.start, chain.length), convert = chain.slice(kept);
    // What the first level after them had, before anything moves: it may come from a "this one only" choice.
    const firstClass = actions.currentProfession(state, item);
    const carried = old[lift] ?? { profession: firstClass, ride: actions.rememberedRide(state, item.id, actions.rideKind(firstClass, item.id)) };
    const backup = { records: item.records, seed: item.seed, pending: Object.hasOwn(item, 'pendingProfession'), pendingProfession: item.pendingProfession };

    let records = item.records;
    if (lift) {
      const total = state.roster.reduce((n, entry) => n + entry.records.length, 0);
      if (total + lift > model.limits.records) return { applied: false, reason: 'limit' };
      const now = new Date().toISOString();
      let seq = model.nextSeq(item);
      records = [...records];
      for (const row of old.slice(0, lift)) {
        records.push({ id: model.uid(), seq: seq++, profession: row.profession, ride: row.ride ? { ...row.ride } : null, stats: [...row.stats], ...(row.plus2.length ? { plus2: [...row.plus2] } : {}),
          part3: row.part3 === true || window.PROFESSIONS.part3Only.has(row.profession), status: row.status, deleted: false, happy: row.happy === true, ...(row.happy === null ? { ratingPending: true } : {}),
          ratingSource: row.ratingSource, ...(row.corrected ? {} : { calculated: true }), createdAt: now });
      }
    }
    // Deleted records after the first converted one go too: restoring one would put a record after the forecast.
    if (convert.length) records = records.filter(record => record.seq < convert[0].record.seq);

    const rows = {};
    convert.forEach(({ record, part3 }, n) => {
      rows[n] = { profession: record.profession ?? null, ride: record.ride ? { ...record.ride } : null, part3,
        ...(record.status !== 'normal' ? { status: record.status } : {}), ...(record.ratingSource === 'manual' ? { happy: record.happy } : {}) };
    });
    const shift = convert.length - lift;
    for (const [index, row] of Object.entries(item.seed?.rows || {})) {
      const n = Number(index);
      if (n < lift) continue;
      const copy = model.copy(row);
      // Rows the search read now match the seed, so they are no longer corrections.
      if (n <= last) { delete copy.stats; delete copy.plus2; }
      rows[n + shift] = copy;
    }
    const carry = convert.length;
    if (convert.length || lift) {
      rows[carry] ||= {};
      if (!Object.hasOwn(rows[carry], 'profession')) rows[carry].profession = carried.profession ?? null;
      if (!Object.hasOwn(rows[carry], 'ride')) rows[carry].ride = carried.ride ? { ...carried.ride } : null;
    }
    item.records = records;
    if (convert.length) delete item.pendingProfession;
    item.seed = { value: found.seed, ...(Object.keys(rows).length ? { rows } : {}) };

    // Classes were written on every moved row; drop the ones the rows would inherit anyway.
    // Later rows only inherit from the row after the moved ones, so checking up to it is enough.
    const classes = () => JSON.stringify(queueRows(state, item, c, 0, carry + 2).map(row => [row.profession, row.ride, row.part3]));
    const wanted = classes();
    for (let n = 0; n <= carry; n++) {
      const saved = item.seed.rows?.[n];
      if (!saved) continue;
      for (const keys of [['profession', 'ride'], ['ride'], ['profession']]) {
        if (!keys.every(key => Object.hasOwn(saved, key))) continue;
        const taken = keys.map(key => [key, saved[key]]);
        keys.forEach(key => delete saved[key]);
        if (classes() === wanted) break;
        taken.forEach(([key, value]) => { saved[key] = value; });
      }
    }

    // Records after a corrected one were not searched: a typed one stays as a correction if the seed differs.
    const unsearched = n => kept + n > searched;
    let shownRows = queueRows(state, item, c);
    convert.forEach(({ record }, n) => {
      const row = shownRows[n];
      if (!row || !unsearched(n) || record.calculated) return;
      if (sameList(row.stats, record.stats) && sameList(row.plus2, record.plus2)) return;
      item.seed.rows[n].stats = [...record.stats];
      if (record.plus2?.length) item.seed.rows[n].plus2 = [...record.plus2];
    });
    shownRows = queueRows(state, item, c);
    // A calculated record nobody searched follows the seed; every other one has to come out exactly as it was.
    const moved = convert.every(({ record }, n) => {
      const row = shownRows[n], saved = item.seed.rows[n];
      if (!row) return false;
      if (record.calculated && unsearched(n)) return true;
      if (!sameList(row.stats, record.stats) || !sameList(row.plus2, record.plus2)) return false;
      if (saved.happy === undefined && row.happy !== record.happy) saved.happy = record.happy;
      return true;
    });
    if (!moved) {
      item.records = backup.records; item.seed = backup.seed;
      if (backup.pending) item.pendingProfession = backup.pendingProfession;
      return { applied: false, reason: 'mismatch' };
    }
    for (const n of Object.keys(item.seed.rows || {})) prune(item, Number(n));
    for (const record of item.records) { delete record.corrected; delete record.seedInput; delete record.anchor; }
    /* 锚点 is not shown for now: the window's records become forecast rows. Kept for when it comes back.
    const live = model.live(item), end = target?.record ? live.indexOf(target.record) : live.length - 1;
    if (found.size && end >= 0) for (const record of live.slice(Math.max(0, end - found.size + 1), end + 1)) record.anchor = true; */
    return { applied: true };
  }

  function draftLevel(item, draft) {
    if (draft.queueIndex !== undefined) return item.initialLevel + liveCount(item) + draft.queueIndex;
    if (draft.editIndex === undefined) return item.initialLevel + liveCount(item);
    return item.initialLevel + model.live(item).indexOf(item.records[draft.editIndex]);
  }
  // Only a rate above 100 can give two points, so everyone else keeps the two-state button.
  function canPlus2(state, item, c, draft, stat) {
    if (!ready() || !eligible(item, c)) return false;
    const event = eventOf(c, { level: draftLevel(item, draft), part3: state.part3 === true || c.part3Only === true, profession: draft.profession, ride: draft.ride });
    return Boolean(event) && event.growth[game.stats.indexOf(stat)] > 100;
  }

  return { MIN_RECORDS, load, ready, eligible, queueRows, rowDisplayLevel, cycleRowStatus, rowDraft, draftPrediction, saveRow, applyRowClass, toggleRowHappy, betterChoices, recommendedChoices, classTier, recommendCap, examStats, examRange, examEntries, hasCorrection, search, applyFound, chainKey, correctionTarget, canPlus2,
    internals: { personId: c => personId(c), jobOf: name => jobs.get(name), eventOf, get game() { return game; } } };
})();
