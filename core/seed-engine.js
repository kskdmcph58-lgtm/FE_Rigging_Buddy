/* Seed search, loaded on demand by core/seed.js. One file so a deployment's ?v= covers all of it. */

// Minimal WebAssembly assembler: just enough to emit the search kernels at runtime,
// so the static site needs no compiler toolchain and no prebuilt binaries.

export const I32 = 0x7f;
export const V128 = 0x7b;

const VOID_BLOCK = 0x40;

function uleb(value) {
  const out = [];
  do {
    let byte = value & 0x7f;
    value >>>= 7;
    if (value !== 0) byte |= 0x80;
    out.push(byte);
  } while (value !== 0);
  return out;
}

function sleb(value) {
  const out = [];
  for (;;) {
    const byte = value & 0x7f;
    value >>= 7;
    const done = (value === 0 && !(byte & 0x40)) || (value === -1 && byte & 0x40);
    out.push(done ? byte : byte | 0x80);
    if (done) return out;
  }
}

const text = value => {
  const bytes = [...new TextEncoder().encode(value)];
  return [...uleb(bytes.length), ...bytes];
};
const section = (id, body) => [id, ...uleb(body.length), ...body];
const vector = items => [...uleb(items.length), ...items.flat()];

// SIMD opcodes from the WebAssembly fixed-width SIMD and relaxed SIMD proposals.
const SIMD = {
  load: 0x00, load32Splat: 0x09, store: 0x0b, splat: 0x11,
  not: 0x4d, and: 0x4e, andnot: 0x4f, or: 0x50, xor: 0x51, anyTrue: 0x53, store32Lane: 0x5a,
  allTrue: 0xa3, bitmask: 0xa4, shl: 0xab, shrU: 0xad, add: 0xae, sub: 0xb1, mul: 0xb5,
  gtS: 0x3b, geU: 0x40, fMul: 0xe6, truncSat: 0xf8, convert: 0xfa, relaxedTrunc: 0x101,
};

export class Func {
  constructor(name, params = [], results = []) {
    Object.assign(this, {name, params, results});
    this.locals = [];
    this.code = [];
  }

  local(type) {
    this.locals.push(type);
    return this.params.length + this.locals.length - 1;
  }

  emit(...bytes) { this.code.push(...bytes); return this; }
  get(index) { return this.emit(0x20, ...uleb(index)); }
  set(index) { return this.emit(0x21, ...uleb(index)); }
  tee(index) { return this.emit(0x22, ...uleb(index)); }
  i32(value) { return this.emit(0x41, ...sleb(value | 0)); }
  add() { return this.emit(0x6a); }
  sub() { return this.emit(0x6b); }
  and() { return this.emit(0x71); }
  xor() { return this.emit(0x73); }
  shl() { return this.emit(0x74); }
  shrU() { return this.emit(0x76); }
  popcnt() { return this.emit(0x69); }
  eqz() { return this.emit(0x45); }
  geU() { return this.emit(0x4f); }
  gtU() { return this.emit(0x4b); }
  loadI32(address) { return this.i32(address).emit(0x28, 2, 0); }
  storeI32(address, push) { this.i32(address); push(); return this.emit(0x36, 2, 0); }
  call(index) { return this.emit(0x10, ...uleb(index)); }

  block(body) { this.emit(0x02, VOID_BLOCK); body(); return this.emit(0x0b); }
  loop(body) { this.emit(0x03, VOID_BLOCK); body(); return this.emit(0x0b); }
  when(body) { this.emit(0x04, VOID_BLOCK); body(); return this.emit(0x0b); }
  br(depth) { return this.emit(0x0c, ...uleb(depth)); }
  brIf(depth) { return this.emit(0x0d, ...uleb(depth)); }

  simd(name, ...immediates) { return this.emit(0xfd, ...uleb(SIMD[name]), ...immediates); }
  loadV(address) { return this.i32(address).simd('load', 4, 0); }
  loadSplat(address) { return this.i32(address).simd('load32Splat', 2, 0); }
  /** Loads a vector from [index + offset]; expects the i32 index to be pushed by `pushIndex`. */
  loadAt(pushIndex, offset) { pushIndex(); return this.simd('load', 2, ...uleb(offset)); }
  storeLane(offset, lane) { return this.simd('store32Lane', 2, ...uleb(offset), lane); }

  encode() {
    const runs = [];
    for (const type of this.locals) {
      if (runs.at(-1)?.type === type) runs.at(-1).count++;
      else runs.push({type, count: 1});
    }
    const body = [...vector(runs.map(run => [...uleb(run.count), run.type])), ...this.code, 0x0b];
    return [...uleb(body.length), ...body];
  }
}

export function buildModule({imports, funcs, memoryPages, exports}) {
  const types = [];
  const typeIndex = (params, results) => {
    const key = [params, results].join('|');
    let index = types.findIndex(type => type.key === key);
    if (index < 0) index = types.push({key, bytes: [0x60, ...vector(params.map(p => [p])), ...vector(results.map(r => [r]))]}) - 1;
    return index;
  };
  const importEntries = imports.map(item => [...text('env'), ...text(item.name), 0x00, ...uleb(typeIndex(item.params ?? [], item.results ?? []))]);
  const funcTypes = funcs.map(func => uleb(typeIndex(func.params, func.results)));
  const exportEntries = [
    [...text('memory'), 0x02, 0],
    ...exports.map(name => {
      const index = funcs.findIndex(func => func.name === name);
      if (index < 0) throw new Error(`Unknown export ${name}`);
      return [...text(name), 0x00, ...uleb(imports.length + index)];
    }),
  ];
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
    ...section(1, vector(types.map(type => type.bytes))),
    ...section(2, vector(importEntries)),
    ...section(3, vector(funcTypes)),
    ...section(5, [1, 0x00, ...uleb(memoryPages)]),
    ...section(7, vector(exportEntries)),
    ...section(10, vector(funcs.map(func => func.encode()))),
  ]);
}

const PROBE_SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
// Same shape, with i32x4.relaxed_trunc_f32x4_s applied to a splat.
const PROBE_RELAXED = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 11, 1, 9, 0, 65, 0, 253, 17, 253, 129, 2, 11]);

export const features = () => ({
  simd: WebAssembly.validate(PROBE_SIMD),
  relaxed: WebAssembly.validate(PROBE_RELAXED),
});

// Exact model of the native level-up and exam routines (main.text 0x8CE620, 0x6E2680, 0x6E2870).
// This is the reference every fast path is tested against, so it favours clarity over speed.

const MULTIPLIER = 1812433253;
export const SEED_MASK = 0x7fffffff;

export function initState(seed) {
  const x = Math.imul(MULTIPLIER, seed ^ (seed >>> 30)) | 0;
  const y = (Math.imul(MULTIPLIER, x ^ (x >>> 30)) + 1) | 0;
  const z = (Math.imul(MULTIPLIER, y ^ (y >>> 30)) + 2) | 0;
  const w = (Math.imul(MULTIPLIER, z ^ (z >>> 30)) + 3) | 0;
  return {x, y, z, w};
}

export function draw(state) {
  const t = state.x ^ (state.x << 11);
  state.x = state.y;
  state.y = state.z;
  state.z = state.w;
  state.w = state.w ^ (state.w >>> 19) ^ t ^ (t >>> 8);
  return state.w & SEED_MASK;
}

export const advance = seed => draw(initState(seed));

function chance(state, percent) {
  return draw(state) % 1000000 < percent * 10000;
}

export function simulateLevel(seed, event) {
  const state = initState(seed);
  const eligible = [];
  for (let i = 0; i < 9; i++) if (event.growth[i] > 0 && event.room[i] > 0) eligible.push(i);
  const guarantee = Math.min(event.guarantee, eligible.length);
  const target = Math.max(guarantee, 1);
  const points = new Array(9).fill(0);
  let count = 0;
  let rounds = 0;
  do {
    count = 0;
    rounds++;
    for (const i of eligible) {
      const growth = event.growth[i];
      const remainder = growth % 100;
      points[i] = Math.floor(growth / 100) + (remainder > 0 && chance(state, remainder) ? 1 : 0);
      if (points[i] !== 0) count++;
    }
  } while (count < target && rounds < 4);

  let fills = 0;
  while (count < guarantee) {
    const pool = eligible.filter(i => points[i] === 0);
    let pick = draw(state) % pool.reduce((sum, i) => sum + event.growth[i] * 100, 0);
    for (const i of pool) {
      pick -= event.growth[i] * 100;
      if (pick < 0) {
        points[i] = 1;
        count++;
        fills++;
        break;
      }
    }
  }
  return {gains: points.map((value, i) => Math.min(value, event.room[i])), rounds, fills, next: advance(seed)};
}

export function simulateExam(seed, probability) {
  const state = initState(seed);
  const next = draw(state);
  const roll = draw(state) % 1000000;
  return {
    passed: probability >= 1 && roll < probability * 10000,
    next,
    minimumProbability: Math.floor(roll / 10000) + 1,
  };
}

function skipAdvances(seed, event) {
  for (let i = 0; i < (event.advanceBefore ?? 0); i++) seed = advance(seed);
  return seed;
}

/** Returns the seed after the event, or -1 if this seed cannot produce the record. */
export function matchEvent(seed, event, skipped = false) {
  const current = skipped ? seed : skipAdvances(seed, event);
  if (event.kind === 'exam') {
    const result = simulateExam(current, event.probability);
    return result.passed === event.passed ? result.next : -1;
  }
  const result = simulateLevel(current, event);
  for (let i = 0; i < 9; i++) if (result.gains[i] !== event.gains[i]) return -1;
  return result.next;
}

/** Why a record can never occur, independent of the seed. Returns null when it is possible. */
export function impossibleReason(event) {
  if (event.kind !== 'level') {
    if (event.kind === 'exam' && event.passed && event.probability < 1) return '合格率为 0 却记录为合格';
    return null;
  }
  const eligible = [];
  for (let i = 0; i < 9; i++) {
    const growth = event.growth[i];
    const open = growth > 0 && event.room[i] > 0;
    if (open) eligible.push(i);
    if (!open && event.gains[i] !== 0) {
      return {stat: i, reason: event.room[i] === 0 ? '已封顶却记录为上涨' : '成长率为 0 却记录为上涨'};
    }
    if (!open) continue;
    const base = Math.floor(growth / 100);
    const low = Math.min(base, event.room[i]);
    const high = growth % 100 > 0 ? Math.min(base + 1, event.room[i]) : low;
    if (event.gains[i] !== low && event.gains[i] !== high) {
      return {stat: i, reason: `这项只可能涨 ${low === high ? low : `${low} 或 ${high}`} 点`};
    }
  }
  return null;
}

/** Probability that one random seed reproduces this record, ignoring retries. */
export function matchProbability(event) {
  if (event.kind === 'exam') {
    const pass = Math.min(Math.max(event.probability, 0), 100) / 100;
    return event.passed ? pass : 1 - pass;
  }
  let probability = 1;
  for (let i = 0; i < 9; i++) {
    const growth = event.growth[i];
    if (!(growth > 0 && event.room[i] > 0) || growth % 100 === 0) continue;
    const base = Math.floor(growth / 100);
    const low = Math.min(base, event.room[i]);
    const high = Math.min(base + 1, event.room[i]);
    if (low === high) continue;
    const hit = growth % 100 / 100;
    probability *= event.gains[i] === high ? hit : 1 - hit;
  }
  return probability;
}

// Generates a SIMD filter specialised for one set of records.
//
// Lanes move through a pipeline of stages instead of falling back to scalar code:
//   range or queue -> one round of one event -> next event | next round | dead
// Survivors are compacted into queues, so later stages only spend time on live lanes. That keeps
// low-growth characters fast, where a large share of seeds needs a second round.


const MILLION = 1000000;
const MAX_KERNEL_EVENTS = 4;
const QUEUE_LANES = 512;
const RESULT_LANES = 4096;
const FIELDS = 6; // seed, origin, x, y, z, w
// Biased high so the estimated quotient q' is never below the true one: q' is q or q+1. q+1 only
// happens when the true remainder is above 999000, checked exhaustively over all 2^31 values.
const INVERSE = Math.fround(1e-6 * (1 + 2 ** -22));

/** Describes how one record constrains each random draw. Returns null if the kernel cannot run it. */
export function planEvent(event) {
  if (event.kind === 'exam') return {kind: 'exam', skip: event.advanceBefore ?? 0, event};
  const stats = [];
  let fixed = 0;
  let nonZeroObserved = 0;
  let eligible = 0;
  for (let i = 0; i < 9; i++) {
    const growth = event.growth[i];
    if (event.gains[i] > 0) nonZeroObserved++;
    if (!(growth > 0 && event.room[i] > 0)) continue;
    eligible++;
    const base = Math.floor(growth / 100);
    const remainder = growth % 100;
    if (base >= 1) fixed++;
    if (remainder === 0) continue;
    const low = Math.min(base, event.room[i]);
    const high = Math.min(base + 1, event.room[i]);
    stats.push({
      threshold: remainder * 10000,
      counts: base === 0,
      killOnHit: event.gains[i] !== high,
      killOnMiss: event.gains[i] !== low,
    });
  }
  const guarantee = Math.min(event.guarantee, eligible);
  const need = Math.max(guarantee, 1) - fixed;
  const counted = stats.filter(stat => stat.counts).length;
  // A round that can never reach the target is left to the exact model.
  if (need > counted) return null;
  return {
    kind: 'level', skip: event.advanceBefore ?? 0, event, stats, guarantee,
    canRetry: need > 0,
    maxMisses: counted - need,
    // After four failed rounds the guarantee fill always ends with exactly G raised stats.
    fillPossible: guarantee > 0 && nonZeroObserved === guarantee,
    zeroPossible: guarantee === 0 && nonZeroObserved === 0,
  };
}

export function buildKernel(events, {relaxed = true} = {}) {
  const plans = [];
  for (const event of events.slice(0, MAX_KERNEL_EVENTS)) {
    const plan = planEvent(event);
    if (!plan) break;
    plans.push(plan);
  }
  if (plans.length === 0) return null;

  // Memory layout: counters, constants, then queues.
  let cursor = 16;
  const reserve = bytes => {
    const start = cursor;
    cursor += bytes;
    return start;
  };
  const addresses = {mask: reserve(16), inverse: reserve(16), million: reserve(16), multiplier: reserve(16), laneOffsets: reserve(16)};
  const passTotals = reserve(4 * plans.length);
  const resultCount = reserve(4);
  const slowCount = reserve(4);
  const queues = plans.map(plan => {
    const rounds = plan.kind === 'level' && plan.canRetry ? 4 : 1;
    return Array.from({length: rounds}, (_, round) => ({
      count: reserve(4),
      plan,
      round: round + 1,
      fields: Array.from({length: FIELDS}, () => reserve(QUEUE_LANES * 4)),
    }));
  });
  const results = {current: reserve(RESULT_LANES * 4), origin: reserve(RESULT_LANES * 4)};
  const slow = {seed: reserve(RESULT_LANES * 4), origin: reserve(RESULT_LANES * 4), event: reserve(RESULT_LANES * 4)};
  const constants = [];
  const constant = value => {
    let entry = constants.find(item => item.value === value);
    if (!entry) {
      entry = {value, address: reserve(4)};
      constants.push(entry);
    }
    return entry.address;
  };

  const imports = [{name: 'flush'}];
  const funcs = [];
  const stageName = (e, round) => `stage_${e}_${round}`;
  const stages = [];
  queues.forEach((rounds, e) => rounds.forEach(queue => {
    const func = new Func(stageName(e, queue.round));
    funcs.push(func);
    stages.push({func, e, queue, isRange: false});
  }));
  const scan = new Func('scan', [I32, I32]);
  funcs.push(scan);
  stages.push({func: scan, e: 0, queue: queues[0][0], isRange: true});
  const finish = new Func('finish');
  funcs.push(finish);
  const indexOf = name => imports.length + funcs.findIndex(func => func.name === name);

  const emitStage = ({func: f, e, queue, isRange}) => {
    const {plan, round} = queue;
    const paramBegin = 0;
    const paramBlocks = 1;
    const seed = f.local(V128);
    const origin = f.local(V128);
    const words = [f.local(V128), f.local(V128), f.local(V128), f.local(V128)];
    const scratch = [f.local(V128), f.local(V128), f.local(V128), f.local(V128)];
    const t = f.local(V128);
    const value = f.local(V128);
    const miss = f.local(V128);
    const bad = f.local(V128);
    const allMiss = f.local(V128);
    const misses = f.local(V128);
    const next = f.local(V128);
    const pass = f.local(V128);
    const accepted = f.local(V128);
    const eventId = f.local(V128);
    const mask = f.local(V128);
    const inverse = f.local(V128);
    const million = f.local(V128);
    const multiplier = f.local(V128);
    const index = f.local(I32);
    const count = f.local(I32);
    const outNext = f.local(I32);
    const outRetry = f.local(I32);
    const lanes = f.local(I32);

    const nextQueue = queues[e + 1]?.[0];
    const retryQueue = queues[e][round];
    const outNextAddress = nextQueue ? nextQueue.count : resultCount;
    const flushNext = nextQueue ? indexOf(stageName(e + 1, 1)) : 0;

    // A nested stage may append to the same downstream queues, so counters held in locals must be
    // written back before every call and read again after it.
    const callKeepingCounters = target => {
      f.storeI32(outNextAddress, () => f.get(outNext));
      if (retryQueue) f.storeI32(retryQueue.count, () => f.get(outRetry));
      f.call(target);
      f.loadI32(outNextAddress).set(outNext);
      if (retryQueue) f.loadI32(retryQueue.count).set(outRetry);
    };

    const emitInit = (from, [x, y, z, w]) => {
      f.get(from).get(from).i32(30).simd('shrU').simd('xor').get(multiplier).simd('mul').tee(x);
      f.get(x).i32(30).simd('shrU').simd('xor').get(multiplier).simd('mul').loadSplat(constant(1)).simd('add').tee(y);
      f.get(y).i32(30).simd('shrU').simd('xor').get(multiplier).simd('mul').loadSplat(constant(2)).simd('add').tee(z);
      f.get(z).i32(30).simd('shrU').simd('xor').get(multiplier).simd('mul').loadSplat(constant(3)).simd('add').set(w);
    };
    // One xorshift128 step. The local holding each state word rotates, so no moves are needed.
    const emitDraw = state => {
      const [x, , , w] = state;
      f.get(x).get(x).i32(11).simd('shl').simd('xor').set(t);
      f.get(w).get(w).i32(19).simd('shrU').simd('xor').get(t).simd('xor').get(t).i32(8).simd('shrU').simd('xor').set(x);
      state.push(state.shift());
      return state[3];
    };
    // `miss` becomes all ones where `output % 1000000 >= threshold`. r is the true remainder, or the
    // true remainder minus 1e6 when q' overshoots; that wraps to a huge unsigned value, which is
    // still a miss because such a remainder exceeds every threshold below 100%.
    const emitMiss = (output, thresholdAddress) => {
      f.get(output).get(mask).simd('and').tee(value);
      f.simd('convert').get(inverse).simd('fMul').simd(relaxed ? 'relaxedTrunc' : 'truncSat');
      f.get(million).simd('mul').set(t);
      f.get(value).get(t).simd('sub').loadSplat(thresholdAddress).simd('geU').set(miss);
    };
    const emitAdvancedSeed = () => {
      emitInit(seed, scratch);
      const [x, , , w] = scratch;
      f.get(x).get(x).i32(11).simd('shl').simd('xor').set(t);
      f.get(w).get(w).i32(19).simd('shrU').simd('xor').get(t).simd('xor').get(t).i32(8).simd('shrU').simd('xor');
      f.get(mask).simd('and');
    };
    // Branchless append: every lane is written, the counter only moves past lanes in the mask.
    const pushLanes = (offsets, counter, sources) => {
      for (let lane = 0; lane < 4; lane++) {
        sources.forEach((source, field) => {
          f.get(counter).i32(2).shl().get(source).storeLane(offsets[field], lane);
        });
        f.get(counter).get(lanes).i32(lane).shrU().i32(1).and().add().set(counter);
      }
    };
    const allOnes = local => f.i32(-1).simd('splat').set(local);
    const allZero = local => f.i32(0).simd('splat').set(local);

    f.loadV(addresses.mask).set(mask);
    f.loadV(addresses.inverse).set(inverse);
    f.loadV(addresses.million).set(million);
    f.loadV(addresses.multiplier).set(multiplier);
    f.loadI32(outNextAddress).set(outNext);
    if (retryQueue) f.loadI32(retryQueue.count).set(outRetry);
    if (!isRange) f.loadI32(queue.count).set(count);

    f.block(() => {
      f.loop(() => {
        if (isRange) {
          f.get(paramBlocks).eqz().brIf(1);
          f.get(paramBlocks).i32(1).sub().set(paramBlocks);
          f.get(paramBegin).simd('splat').loadV(addresses.laneOffsets).simd('add').tee(seed).set(origin);
          f.get(paramBegin).i32(4).add().set(paramBegin);
        } else {
          f.get(index).i32(4).add().get(count).gtU().brIf(1);
          const at = () => f.get(index).i32(2).shl();
          f.loadAt(at, queue.fields[0]).set(seed);
          f.loadAt(at, queue.fields[1]).set(origin);
          if (round > 1) words.forEach((word, i) => f.loadAt(at, queue.fields[2 + i]).set(word));
          f.get(index).i32(4).add().set(index);
        }

        if (round === 1) {
          for (let skip = 0; skip < plan.skip; skip++) {
            emitAdvancedSeed();
            f.set(seed);
          }
          emitInit(seed, words);
        }
        const state = [...words];

        if (plan.kind === 'exam') {
          const first = emitDraw(state);
          f.get(first).get(mask).simd('and').set(next);
          const probability = plan.event.probability;
          if (probability < 1 || probability >= 100) {
            if ((probability >= 100) === plan.event.passed) allOnes(pass);
            else allZero(pass);
          } else {
            const second = emitDraw(state);
            emitMiss(second, constant(probability * 10000));
            f.get(miss);
            if (plan.event.passed) f.simd('not');
            f.set(pass);
          }
        } else {
          allZero(bad);
          allOnes(allMiss);
          if (plan.canRetry) allZero(misses);
          if (plan.stats.length === 0) {
            const first = emitDraw(state);
            f.get(first).get(mask).simd('and').set(next);
          }
          plan.stats.forEach((stat, position) => {
            const output = emitDraw(state);
            if (position === 0 && round === 1) f.get(output).get(mask).simd('and').set(next);
            const counted = stat.counts && plan.canRetry;
            if (!stat.killOnHit && !stat.killOnMiss && !counted) return;
            emitMiss(output, constant(stat.threshold));
            if (counted) f.get(misses).get(miss).simd('add').set(misses);
            if (stat.killOnMiss) f.get(bad).get(miss).simd('or').set(bad);
            if (stat.killOnHit) f.get(allMiss).get(miss).simd('and').set(allMiss);
          });
          // `misses` holds minus the number of counted stats that missed.
          f.get(allMiss);
          if (plan.canRetry) {
            f.get(misses).loadSplat(constant(-plan.maxMisses - 1)).simd('gtS').tee(accepted).simd('and');
          }
          f.get(bad).simd('andnot').set(pass);
          if (plan.canRetry && round === 4 && plan.zeroPossible) {
            f.get(pass).get(accepted).simd('not').simd('or').set(pass);
          }
        }

        f.get(pass).simd('bitmask').tee(lanes);
        f.when(() => {
          if (round > 1) {
            emitAdvancedSeed();
            f.set(next);
          }
          f.i32(passTotals + 4 * e).i32(passTotals + 4 * e).emit(0x28, 2, 0).get(lanes).popcnt().add().emit(0x36, 2, 0);
          const targets = nextQueue ? [nextQueue.fields[0], nextQueue.fields[1]] : [results.current, results.origin];
          pushLanes(targets, outNext, [next, origin]);
          f.get(outNext).i32((nextQueue ? QUEUE_LANES : RESULT_LANES) - 4).geU();
          f.when(() => callKeepingCounters(flushNext));
        });

        if (plan.kind === 'level' && plan.canRetry) {
          if (retryQueue) {
            f.get(accepted).simd('bitmask').i32(15).xor().tee(lanes);
            f.when(() => {
              pushLanes(retryQueue.fields, outRetry, [seed, origin, ...state]);
              f.get(outRetry).i32(QUEUE_LANES - 4).geU();
              f.when(() => callKeepingCounters(indexOf(stageName(e, round + 1))));
            });
          } else if (plan.fillPossible) {
            // Failed all four rounds. The fill only adds points, so a stat that should not have
            // risen rules the lane out; the remaining ones finish in the exact model.
            f.get(allMiss).get(accepted).simd('andnot').simd('bitmask').tee(lanes);
            f.when(() => {
              f.i32(e).simd('splat').set(eventId);
              f.loadI32(slowCount).set(outRetry);
              pushLanes([slow.seed, slow.origin, slow.event], outRetry, [seed, origin, eventId]);
              f.storeI32(slowCount, () => f.get(outRetry));
              f.get(outRetry).i32(RESULT_LANES - 4).geU();
              f.when(() => callKeepingCounters(0));
            });
          }
        }
        f.br(0);
      });
    });

    f.storeI32(outNextAddress, () => f.get(outNext));
    if (retryQueue) f.storeI32(retryQueue.count, () => f.get(outRetry));
    if (!isRange) {
      // Keep a partial block for the next drain. `index` is always a multiple of 4.
      f.get(count).get(index).sub().set(count);
      for (const field of queue.fields) {
        f.i32(field).get(index).i32(2).shl().i32(field).add().get(count).i32(2).shl().emit(0xfc, 10, 0, 0);
      }
      f.storeI32(queue.count, () => f.get(count));
    }
  };
  stages.forEach(emitStage);
  stages.filter(stage => !stage.isRange).forEach(stage => finish.call(indexOf(stage.func.name)));

  const bytes = buildModule({
    imports, funcs, memoryPages: Math.ceil(cursor / 65536) + 1, exports: ['scan', 'finish'],
  });
  return {
    bytes,
    eventCount: plans.length,
    layout: {
      addresses, passTotals, resultCount, slowCount, results, slow, constants,
      queues: queues.map((rounds, e) => rounds.map(queue => ({e, round: queue.round, count: queue.count, fields: queue.fields}))),
    },
  };
}

export function prepareMemory(memory, layout) {
  const view = new DataView(memory.buffer);
  const {addresses} = layout;
  for (let i = 0; i < 4; i++) {
    view.setInt32(addresses.mask + i * 4, 0x7fffffff, true);
    view.setFloat32(addresses.inverse + i * 4, INVERSE, true);
    view.setInt32(addresses.million + i * 4, MILLION, true);
    view.setInt32(addresses.multiplier + i * 4, MULTIPLIER, true);
    view.setInt32(addresses.laneOffsets + i * 4, i, true);
  }
  for (const {value, address} of layout.constants) view.setInt32(address, value, true);
}

// Runs a generated kernel over seed ranges inside one thread and finishes survivors in exact code.


export function compileSearch(events) {
  const feature = features();
  if (!feature.simd) return null;
  return buildKernel(events, {relaxed: feature.relaxed});
}

export class Scanner {
  constructor(events, compiled, moduleObject) {
    this.events = events;
    this.compiled = compiled;
    this.prefix = new Array(events.length).fill(0);
    this.hits = [];
    this.lastTotals = compiled ? new Array(compiled.eventCount).fill(0) : [];
    if (compiled) {
      const flush = () => {
        this.drainResults();
        this.drainSlow();
      };
      const instance = new WebAssembly.Instance(moduleObject, {env: {flush}});
      this.exports = instance.exports;
      this.memory = instance.exports.memory;
      prepareMemory(this.memory, compiled.layout);
    }
  }

  /** Continues exact matching at event `from`, counting every event the lane passes. */
  finishLane(seed, origin, from, skipped = false) {
    let current = seed;
    for (let e = from; e < this.events.length; e++) {
      current = matchEvent(current, this.events[e], skipped && e === from);
      if (current < 0) return;
      this.prefix[e]++;
    }
    this.hits.push({origin: origin >>> 0, current: current >>> 0});
  }

  /** Lanes that failed four rounds and may still match through the guarantee fill. */
  drainSlow() {
    const {layout} = this.compiled;
    const words = new Int32Array(this.memory.buffer);
    const count = words[layout.slowCount >> 2];
    words[layout.slowCount >> 2] = 0;
    for (let i = 0; i < count; i++) {
      const seed = words[(layout.slow.seed >> 2) + i] >>> 0;
      const origin = words[(layout.slow.origin >> 2) + i] >>> 0;
      this.finishLane(seed, origin, words[(layout.slow.event >> 2) + i], true);
    }
  }

  drainResults() {
    const {layout, eventCount} = this.compiled;
    const words = new Int32Array(this.memory.buffer);
    const count = words[layout.resultCount >> 2];
    for (let i = 0; i < count; i++) {
      this.finishLane(words[(layout.results.current >> 2) + i] >>> 0, words[(layout.results.origin >> 2) + i] >>> 0, eventCount);
    }
    words[layout.resultCount >> 2] = 0;
  }

  scan(begin, size) {
    let cursor = begin;
    let remaining = size;
    if (this.compiled) {
      const blocks = Math.floor(remaining / 4);
      if (blocks > 0) {
        this.exports.scan(cursor | 0, blocks);
        this.exports.finish();
        this.drainSlow();
        this.drainTails();
        this.drainResults();
        cursor += blocks * 4;
        remaining -= blocks * 4;
        this.collectTotals();
      }
    }
    for (let i = 0; i < remaining; i++) this.finishLane((cursor + i) >>> 0, (cursor + i) >>> 0, 0);
  }

  drainTails() {
    const {layout} = this.compiled;
    const words = new Int32Array(this.memory.buffer);
    for (const rounds of layout.queues) {
      for (const queue of rounds) {
        const count = words[queue.count >> 2];
        for (let i = 0; i < count; i++) {
          const seed = words[(queue.fields[0] >> 2) + i] >>> 0;
          const origin = words[(queue.fields[1] >> 2) + i] >>> 0;
          this.finishLane(seed, origin, queue.e, queue.round > 1);
        }
        words[queue.count >> 2] = 0;
      }
    }
  }

  collectTotals() {
    const {layout, eventCount} = this.compiled;
    const words = new Int32Array(this.memory.buffer);
    for (let e = 0; e < eventCount; e++) {
      const total = words[(layout.passTotals >> 2) + e] >>> 0;
      this.prefix[e] += total;
      words[(layout.passTotals >> 2) + e] = 0;
    }
  }

  take() {
    const hits = this.hits;
    const prefix = this.prefix;
    this.hits = [];
    this.prefix = new Array(this.events.length).fill(0);
    return {hits, prefix};
  }
}

// Multi-thread seed search.
//
// Scheduling choices, each aimed at total search time:
// - Workers persist between searches, so only the first search pays thread start-up.
// - Every worker pulls its next chunk when free, so faster cores do more and nothing idles.
// - Chunk size adapts per worker to a target duration. Chunks start small so optimised code is
//   reached quickly, then grow until messaging cost is negligible.
// - Cancelling just ignores the chunk in flight, which is short, instead of killing threads.


const TARGET_CHUNK_MS = 25;
const MIN_CHUNK = 1 << 14;
const FIRST_CHUNK = 1 << 16;
const MAX_CHUNK = 1 << 24;
const MAX_TRACKED_CANDIDATES = 100000;
const alignChunk = size => Math.min(MAX_CHUNK, Math.max(MIN_CHUNK, size)) & ~3;

// One logical core is left free: measured total time is the same and the page stays smoother.
export const defaultThreads = () => Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1);

/* Different seeds before a window can meet in the same seed after it. The other origins are kept,
   because the seed at the window's first record is known only from the step where they all agree. */
function shareOrigin(shared, hit) {
  const list = shared.get(hit.current);
  if (list) list.push(hit.origin); else shared.set(hit.current, [hit.origin]);
}

/** Drops the first record's skip: the search already covers every seed that could follow it. */
export function normalizeEvents(events) {
  return events.map((event, index) => (index === 0 && event.advanceBefore ? {...event, advanceBefore: 0} : event));
}

export function findImpossibleEvent(events) {
  for (let index = 0; index < events.length; index++) {
    const reason = impossibleReason(events[index]);
    if (reason) return {index, reason};
  }
  return null;
}

/** Expected number of unrelated seeds that would match every record by chance. */
export function expectedChanceMatches(events, seedCount) {
  return events.reduce((value, event) => value * matchProbability(event), seedCount);
}

export class SearchPool {
  constructor({threads = defaultThreads(), workerFactory} = {}) {
    this.threadCount = threads;
    this.workerFactory = workerFactory ?? (() => new Worker(new URL(`./seed-worker.js${new URL(import.meta.url).search}`, import.meta.url), {type: 'module'}));
    this.workers = [];
    this.generation = 0;
    this.active = null;
  }

  ensureWorkers() {
    while (this.workers.length < this.threadCount) {
      const worker = this.workerFactory();
      worker.onmessage = event => this.active?.handle(worker, event.data);
      worker.onerror = event => this.active?.fail(new Error(event.message ?? 'Worker failed'));
      this.workers.push(worker);
    }
    return this.workers.slice(0, this.threadCount);
  }

  cancel() {
    this.active?.finish(false);
  }

  dispose() {
    this.cancel();
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
  }

  async search(rawEvents, {begin = 0, end = 2 ** 31, onProgress, onHit} = {}) {
    if (this.active) throw new Error('已有搜索在运行');
    const events = normalizeEvents(rawEvents);
    const started = performance.now();
    const compiled = compileSearch(events);
    const moduleObject = compiled ? await WebAssembly.compile(compiled.bytes) : null;
    const compileMs = performance.now() - started;
    const total = end - begin;
    const generation = ++this.generation;
    const workers = this.ensureWorkers();

    return new Promise((resolve, reject) => {
      const prefix = new Array(events.length).fill(0);
      const currents = new Map(), shared = new Map();
      const chunkSize = new Map();
      let cursor = begin;
      let processed = 0;
      let matches = 0;
      let inFlight = 0;
      let candidatesComplete = true;
      let firstHitMs = null;
      let lastProgress = 0;
      let done = false;

      const assign = worker => {
        if (done || cursor >= end) return;
        const size = Math.min(chunkSize.get(worker) ?? FIRST_CHUNK, end - cursor);
        worker.postMessage({type: 'scan', generation, begin: cursor, size});
        cursor += size;
        inFlight++;
      };

      const session = {
        finish: complete => {
          if (done) return;
          done = true;
          this.active = null;
          this.generation++;
          const list = [...currents.keys()];
          resolve({
            complete,
            candidates: list,
            origins: list.map(current => currents.get(current)),
            originLists: list.map(current => [currents.get(current), ...(shared.get(current) || [])]),
            candidatesComplete,
            matches,
            prefix,
            processed,
            elapsedMs: performance.now() - started,
            compileMs,
            firstHitMs,
            threads: workers.length,
            usedKernelEvents: compiled?.eventCount ?? 0,
            scope: {begin, end},
            expectedChance: expectedChanceMatches(events, total),
          });
        },
        fail: error => {
          if (done) return;
          done = true;
          this.active = null;
          this.generation++;
          reject(error);
        },
        handle: (worker, message) => {
          if (message.generation !== generation || done) return;
          if (message.type === 'error') {
            session.fail(new Error(message.message));
            return;
          }
          if (message.type === 'ready') {
            assign(worker);
            return;
          }
          inFlight--;
          processed += message.size;
          matches += message.hits.length;
          message.prefix.forEach((value, index) => { prefix[index] += value; });
          for (const hit of message.hits) {
            if (currents.has(hit.current)) { shareOrigin(shared, hit); continue; }
            if (currents.size >= MAX_TRACKED_CANDIDATES) {
              candidatesComplete = false;
              continue;
            }
            currents.set(hit.current, hit.origin);
            if (firstHitMs === null) firstHitMs = performance.now() - started;
            onHit?.({current: hit.current, origin: hit.origin, elapsedMs: performance.now() - started});
          }
          const previous = chunkSize.get(worker) ?? FIRST_CHUNK;
          const scaled = previous * TARGET_CHUNK_MS / Math.max(message.ms, 0.5);
          chunkSize.set(worker, alignChunk(Math.min(scaled, previous * 4)));
          const now = performance.now();
          if (onProgress && now - lastProgress >= 100) {
            lastProgress = now;
            onProgress({processed, total, ratio: processed / total, elapsedMs: now - started, candidates: currents.size});
          }
          assign(worker);
          if (inFlight === 0 && cursor >= end) session.finish(true);
        },
      };
      this.active = session;
      for (const worker of workers) worker.postMessage({type: 'configure', generation, events, compiled, module: moduleObject});
    });
  }
}

// WebGPU search engine. The shader runs the same exact integer logic as the kernel; lanes that
// reach the guarantee fill are handed back to the exact model, and every survivor is re-checked
// on the CPU, so a wrong GPU pass can only cost time, never produce a false match.


const MAX_SHADER_EVENTS = 8;
const CAPACITY = 1 << 18;
const WORKGROUP = 256;
const TARGET_DISPATCH_MS = 40;
const FIRST_DISPATCH = 1 << 24;
const MAX_DISPATCH = 1 << 30;
const EVENT_WORDS = 8 + 9 * 2;
const HEADER_WORDS = 4 + MAX_SHADER_EVENTS;

const SHADER = /* wgsl */`
struct Stat { threshold: u32, flags: u32 }
struct Event {
  kind: u32, statCount: u32, maxMisses: u32, skip: u32,
  retry: u32, fill: u32, zero: u32, pad: u32,
  stats: array<Stat, 9>,
}
struct Params { begin: u32, count: u32, rowSize: u32, eventCount: u32, capacity: u32, p0: u32, p1: u32, p2: u32 }
struct Output {
  found: atomic<u32>, p0: u32, p1: u32, p2: u32,
  prefix: array<atomic<u32>, ${MAX_SHADER_EVENTS}>,
  items: array<vec4<u32>>,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> events: array<Event>;
@group(0) @binding(2) var<storage, read_write> output: Output;

const MULTIPLIER = 1812433253u;
const MASK = 0x7fffffffu;

struct Rng { x: u32, y: u32, z: u32, w: u32 }

fn init(seed: u32) -> Rng {
  var r: Rng;
  r.x = MULTIPLIER * (seed ^ (seed >> 30u));
  r.y = MULTIPLIER * (r.x ^ (r.x >> 30u)) + 1u;
  r.z = MULTIPLIER * (r.y ^ (r.y >> 30u)) + 2u;
  r.w = MULTIPLIER * (r.z ^ (r.z >> 30u)) + 3u;
  return r;
}

fn draw(r: ptr<function, Rng>) -> u32 {
  let t = (*r).x ^ ((*r).x << 11u);
  (*r).x = (*r).y;
  (*r).y = (*r).z;
  (*r).z = (*r).w;
  (*r).w = (*r).w ^ ((*r).w >> 19u) ^ t ^ (t >> 8u);
  return (*r).w & MASK;
}

fn advance(seed: u32) -> u32 {
  var r = init(seed);
  return draw(&r);
}

fn emit(origin: u32, seed: u32, event: u32) {
  let index = atomicAdd(&output.found, 1u);
  if (index < params.capacity) { output.items[index] = vec4<u32>(origin, seed, event, 0u); }
}

@compute @workgroup_size(${WORKGROUP})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let offset = id.x + id.y * params.rowSize;
  if (offset >= params.count) { return; }
  let origin = params.begin + offset;
  var seed = origin;
  for (var e = 0u; e < params.eventCount; e++) {
    let kind = events[e].kind;
    for (var k = 0u; k < events[e].skip; k++) { seed = advance(seed); }
    var r = init(seed);
    let next = advance(seed);
    if (kind == 1u) {
      // Exam: the second output decides. stats[0].threshold is the probability threshold.
      let first = draw(&r);
      let roll = draw(&r) % 1000000u;
      let hit = roll < events[e].stats[0].threshold;
      if (hit != (events[e].stats[0].flags == 1u)) { return; }
    } else if (kind == 2u) {
      // Outcome known from the record alone, nothing to test.
    } else if (kind == 3u) {
      return;
    } else {
      var passed = false;
      let count = events[e].statCount;
      for (var round = 0u; round < 4u && !passed; round++) {
        var misses = 0u;
        var badMiss = false;
        var badHit = false;
        for (var j = 0u; j < count; j++) {
          let stat = events[e].stats[j];
          let miss = (draw(&r) % 1000000u) >= stat.threshold;
          if (miss) {
            if ((stat.flags & 1u) != 0u) { misses++; }
            if ((stat.flags & 4u) != 0u) { badMiss = true; }
          } else if ((stat.flags & 2u) != 0u) {
            badHit = true;
          }
        }
        let accepted = events[e].retry == 0u || misses <= events[e].maxMisses;
        if (accepted) {
          if (badMiss || badHit) { return; }
          passed = true;
        } else if (round == 3u) {
          if (events[e].zero != 0u) {
            passed = true;
          } else if (events[e].fill != 0u && !badHit) {
            emit(origin, seed, e);
            return;
          } else {
            return;
          }
        }
      }
    }
    atomicAdd(&output.prefix[e], 1u);
    seed = next;
  }
  emit(origin, seed, 0xffffffffu);
}
`;

function encodeEvents(plans) {
  const words = new Uint32Array(EVENT_WORDS * plans.length);
  plans.forEach((plan, index) => {
    const at = index * EVENT_WORDS;
    words[at + 3] = plan.skip;
    if (plan.kind === 'exam') {
      const probability = plan.event.probability;
      if (probability >= 100 || probability < 1) {
        words[at] = (probability >= 100) === plan.event.passed ? 2 : 3;
      } else {
        words[at] = 1;
        words[at + 8] = probability * 10000;
        words[at + 9] = plan.event.passed ? 1 : 0;
      }
      return;
    }
    words[at + 1] = plan.stats.length;
    words[at + 2] = plan.maxMisses;
    words[at + 4] = plan.canRetry ? 1 : 0;
    words[at + 5] = plan.fillPossible ? 1 : 0;
    words[at + 6] = plan.zeroPossible ? 1 : 0;
    plan.stats.forEach((stat, position) => {
      words[at + 8 + position * 2] = stat.threshold;
      words[at + 9 + position * 2] = (stat.counts && plan.canRetry ? 1 : 0) | (stat.killOnHit ? 2 : 0) | (stat.killOnMiss ? 4 : 0);
    });
  });
  return words;
}

/** Returns an engine, or null when no real GPU is available. */
export async function createGpuEngine() {
  if (!globalThis.navigator?.gpu) return null;
  const adapter = await navigator.gpu.requestAdapter({powerPreference: 'high-performance'});
  if (!adapter || adapter.info?.isFallbackAdapter) return null;
  const device = await adapter.requestDevice();
  const pipeline = await device.createComputePipelineAsync({
    layout: 'auto',
    compute: {module: device.createShaderModule({code: SHADER}), entryPoint: 'main'},
  });
  const outputBytes = HEADER_WORDS * 4 + CAPACITY * 16;
  const output = device.createBuffer({size: outputBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST});
  const headerRead = device.createBuffer({size: HEADER_WORDS * 4, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
  const itemsRead = device.createBuffer({size: CAPACITY * 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST});
  const paramsBuffer = device.createBuffer({size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
  let generation = 0;
  let cancelled = -1;

  const engine = {
    name: `WebGPU ${adapter.info?.description || adapter.info?.vendor || ''}`.trim(),
    cancel: () => { cancelled = generation; },
    dispose: () => device.destroy(),

    async search(rawEvents, {begin = 0, end = 2 ** 31, onProgress, onHit} = {}) {
      const mine = ++generation;
      const events = normalizeEvents(rawEvents);
      const started = performance.now();
      const plans = [];
      for (const event of events.slice(0, MAX_SHADER_EVENTS)) {
        const plan = planEvent(event);
        if (!plan) break;
        plans.push(plan);
      }
      if (plans.length === 0) return null;
      const encoded = encodeEvents(plans);
      const eventsBuffer = device.createBuffer({size: Math.max(encoded.byteLength, 64), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
      device.queue.writeBuffer(eventsBuffer, 0, encoded);
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [paramsBuffer, eventsBuffer, output].map((buffer, binding) => ({binding, resource: {buffer}})),
      });

      const scanner = new Scanner(events, null, null);
      const prefix = new Array(events.length).fill(0);
      const currents = new Map(), shared = new Map();
      const total = end - begin;
      let cursor = begin;
      let size = FIRST_DISPATCH;
      let firstHitMs = null;
      let matches = 0;
      let complete = true;

      while (cursor < end) {
        if (cancelled === mine) {
          complete = false;
          break;
        }
        const count = Math.min(size, end - cursor);
        const rowSize = WORKGROUP * 4096;
        const rows = Math.ceil(count / rowSize);
        device.queue.writeBuffer(paramsBuffer, 0, new Uint32Array([cursor >>> 0, count, rowSize, plans.length, CAPACITY, 0, 0, 0]));
        const dispatchStart = performance.now();
        const encoder = device.createCommandEncoder();
        encoder.clearBuffer(output, 0, HEADER_WORDS * 4);
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(4096, rows);
        pass.end();
        encoder.copyBufferToBuffer(output, 0, headerRead, 0, HEADER_WORDS * 4);
        device.queue.submit([encoder.finish()]);
        await headerRead.mapAsync(GPUMapMode.READ);
        const header = new Uint32Array(headerRead.getMappedRange().slice(0));
        headerRead.unmap();
        const found = header[0];
        if (found > CAPACITY) {
          // Too many survivors for this slice: retry a smaller one, or let the CPU engine take over.
          if (count <= 1 << 16) throw new Error('GPU output overflow');
          size = Math.max(1 << 16, Math.floor(count / 8));
          continue;
        }
        for (let e = 0; e < plans.length; e++) prefix[e] += header[4 + e];
        if (found > 0) {
          const copy = device.createCommandEncoder();
          copy.copyBufferToBuffer(output, HEADER_WORDS * 4, itemsRead, 0, found * 16);
          device.queue.submit([copy.finish()]);
          await itemsRead.mapAsync(GPUMapMode.READ, 0, found * 16);
          const items = new Uint32Array(itemsRead.getMappedRange(0, found * 16).slice(0));
          itemsRead.unmap();
          for (let i = 0; i < found; i++) {
            const [origin, seed, event] = [items[i * 4], items[i * 4 + 1], items[i * 4 + 2]];
            if (event === 0xffffffff) scanner.finishLane(seed, origin, plans.length);
            else scanner.finishLane(seed, origin, event, true);
          }
          const taken = scanner.take();
          taken.prefix.forEach((value, index) => { prefix[index] += value; });
          matches += taken.hits.length;
          for (const hit of taken.hits) {
            if (currents.has(hit.current)) { shareOrigin(shared, hit); continue; }
            currents.set(hit.current, hit.origin);
            if (firstHitMs === null) firstHitMs = performance.now() - started;
            onHit?.({current: hit.current, origin: hit.origin, elapsedMs: performance.now() - started});
          }
        }
        cursor += count;
        const elapsed = Math.max(performance.now() - dispatchStart, 1);
        size = Math.min(MAX_DISPATCH, Math.max(1 << 20, Math.floor(Math.min(size * 4, count * TARGET_DISPATCH_MS / elapsed))));
        onProgress?.({processed: cursor - begin, total, ratio: (cursor - begin) / total, elapsedMs: performance.now() - started, candidates: currents.size});
      }
      eventsBuffer.destroy();
      return {
        complete,
        candidates: [...currents.keys()],
        origins: [...currents.values()],
        originLists: [...currents].map(([current, origin]) => [origin, ...(shared.get(current) || [])]),
        candidatesComplete: true,
        matches,
        prefix,
        processed: cursor - begin,
        elapsedMs: performance.now() - started,
        compileMs: 0,
        firstHitMs,
        threads: 0,
        scope: {begin, end},
        expectedChance: expectedChanceMatches(events, total),
        impossible: findImpossibleEvent(events),
      };
    },
  };
  return engine;
}

// Picks an engine and runs the search: 31-bit first, the rest of the 32-bit range only if needed.


const SPACE_31 = 2 ** 31;
const SPACE_32 = 2 ** 32;

export class Solver {
  constructor({threads = defaultThreads()} = {}) {
    this.threads = threads;
    this.pool = null;
    this.gpu = null;
    this.gpuTried = false;
    this.running = null;
  }

  async prepareGpu() {
    if (!this.gpuTried) {
      this.gpuTried = true;
      try {
        this.gpu = await createGpuEngine();
      } catch {
        this.gpu = null;
      }
    }
    return this.gpu;
  }

  setThreads(threads) {
    if (threads === this.threads) return;
    this.threads = threads;
    this.pool?.dispose();
    this.pool = null;
  }

  cancel() {
    this.running?.cancel();
  }

  async runRange(events, range, preference, callbacks) {
    const gpu = preference === 'cpu' ? null : await this.prepareGpu();
    if (gpu) {
      try {
        this.running = gpu;
        const result = await gpu.search(events, {...range, ...callbacks});
        if (result) return {...result, engine: gpu.name};
      } catch {
        // Too many survivors for the output buffer, or a lost device: the CPU engine takes over.
      }
    }
    if (!this.pool) this.pool = new SearchPool({threads: this.threads});
    this.running = this.pool;
    const result = await this.pool.search(events, {...range, ...callbacks});
    return {...result, engine: `CPU ${result.threads} 线程`};
  }

  /** Full search. `preference` is 'auto' or 'cpu'. */
  async search(events, {preference = 'auto', onProgress, onHit} = {}) {
    const impossible = findImpossibleEvent(events);
    if (impossible) return {status: 'impossible', impossible};
    const callbacks = {onProgress, onHit};
    const result = await this.runRange(events, {begin: 0, end: SPACE_31}, preference, callbacks);
    result.seedBits = 31;
    result.outside31 = false;
    if (result.complete && result.candidates.length === 0) {
      // Every native write path masks to 31 bits, so a hit up here would disprove that finding.
      const upper = await this.runRange(events, {begin: SPACE_31, end: SPACE_32}, preference, callbacks);
      if (upper.complete && upper.candidates.length > 0) {
        return {...upper, status: 'searched', seedBits: 32, outside31: true, elapsedMs: result.elapsedMs + upper.elapsedMs};
      }
      result.elapsedMs += upper.elapsedMs;
      result.seedBits = 32;
    }
    return {...result, status: 'searched'};
  }

  dispose() {
    this.pool?.dispose();
    this.gpu?.dispose();
  }
}

/** Keeps the candidates that also reproduce one more record, returning the seeds after it. */
export function filterCandidates(candidates, event) {
  const next = new Set();
  const origins = new Map();
  for (const {current, origin} of candidates) {
    const after = matchEvent(current, event);
    if (after >= 0 && !next.has(after)) {
      next.add(after);
      origins.set(after, origin);
    }
  }
  return [...next].map(current => ({current, origin: origins.get(current)}));
}

/** Replays records from a known starting seed, for per-record rounds and fill counts. */
export function replay(origin, events) {
  let seed = origin;
  return events.map((event, index) => {
    if (index > 0) for (let i = 0; i < (event.advanceBefore ?? 0); i++) seed = advance(seed);
    if (event.kind === 'exam') {
      const result = simulateExam(seed, event.probability);
      seed = result.next;
      return {kind: 'exam', passed: result.passed, matched: result.passed === event.passed};
    }
    const result = simulateLevel(seed, event);
    seed = result.next;
    return {
      kind: 'level', rounds: result.rounds, fills: result.fills,
      matched: result.gains.every((gain, i) => gain === event.gains[i]),
    };
  });
}
