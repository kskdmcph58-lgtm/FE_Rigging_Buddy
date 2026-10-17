const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const listeners = {};
const count = {}, next = {};
const app = { addEventListener: (type, fn) => (listeners[type] ||= []).push(fn) };
const store = new Map();
const context = vm.createContext({
  window: { pinyinPro: require('./vendor/pinyin-pro.js') },
  document: {
    querySelector: selector => selector === '#app' ? app : selector === '#selected-count' ? count : selector === '#choose-next' ? next : { addEventListener() {} },
    addEventListener() {}
  },
  localStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v) },
  console, setTimeout, clearTimeout
});
vm.runInContext(fs.readFileSync('characters.js','utf8'), context);
vm.runInContext(fs.readFileSync('app.js','utf8').replace(/render\(\);\s*$/, ''), context);
const run = code => vm.runInContext(code, context);
for (const term of ['嘉丝敏', 'jiasimin', 'JIA SI MIN', 'jsm', '加思民', '嘉si敏', 'jiā sī mǐn']) {
  assert.ok(run(`searchCharacters(${JSON.stringify(term)}).some(c => c.name === '嘉丝敏')`), term);
}
assert.equal(run('searchCharacters("").length'),70);
assert.equal(run('searchCharacters("xyznotfound").length'),0);
assert.equal(run('levelLabel({initialLevel:null},2)'), 'LV +2');
assert.equal(run('levelLabel({initialLevel:5},6)'), 'LV 6');
run('query = "jiasimin"; rememberSearch(); rememberSearch();');
assert.equal(run('searchHistory.length'), 1);
assert.ok(store.has('rigging-buddy:character-search:v1'));
let pressed;
const button = {dataset:{character:'c056'}, disabled:false, hasAttribute:()=>false, classList:{toggle:(name,value)=>assert.equal(name,'selected')}, setAttribute:(name,value)=>{pressed=value;}};
const event = { target:{matches:()=>false,closest:()=>button} };
listeners.click[0](event);
assert.equal(pressed,'true');
assert.equal(count.textContent,'已选 1 位角色');
assert.equal(next.disabled,false);
listeners.click[0](event);
assert.equal(pressed,'false');
assert.equal(next.disabled,true);
console.log('PASS: pinyin, initials, homophones, mixed input, labels, isolated history and selection without grid replacement');
run(`state.roster = [{id:'c056', initialLevel:null, records:[]}]; activeRecord = {id:'c056', stats:[], happy:null}; renderRecord();`);
assert.equal((app.innerHTML.match(/data-stat=/g) || []).length, 9);
assert.ok(app.innerHTML.includes('record-character'));
assert.ok(!app.innerHTML.includes('rating-title'));
assert.ok(!app.innerHTML.includes('class="hero'));
const clickRecord = dataset => listeners.click[0]({target:{matches:()=>false,closest:()=>({dataset,disabled:false,hasAttribute:()=>false})}});
clickRecord({rating:'happy'});
for (const stat of ['HP','力量','魔力','速度','技巧']) clickRecord({stat});
assert.equal(run('activeRecord.happy'), true);
clickRecord({rating:'angry'});
clickRecord({stat:'HP'});
assert.equal(run('activeRecord.stats.length'), 4);
assert.equal(run('activeRecord.happy'), null);
clickRecord({rating:'happy'});
assert.equal(run('activeRecord.happy'), true);
clickRecord({stat:'力量'});
assert.equal(run('activeRecord.stats.length'), 3);
assert.equal(run('activeRecord.happy'), false);
assert.ok(!app.innerHTML.includes('已按点数推荐'));
console.log('PASS: nine stat controls retained; compact header; automatic rating and manual override retained without explanatory text');
