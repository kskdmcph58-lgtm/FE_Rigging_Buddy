/* Ordered as the in-game class screen; base classes have no family. */
window.PROFESSIONS = (() => {
  const families = ['斗士系', '猎兵系', '士兵系', '飞行系', '魔道系'];
  const tiers = ['初级职业', '中级职业', '上级职业', '最上级职业', '神将职业'];
  const base = ['平民', '贵族'];
  const rows = [
    [['斗士'], ['猎兵'], ['士兵'], ['飞鸵兵'], ['诅咒师']],
    [['剑客', '土匪', '斗拳手'], ['弓箭手', '恶棍'], ['重装步兵', '轻骑兵', '战车兵'], ['骑甲驼兵', '天翼兵'], ['萨满巫师', '牧师']],
    [['侍道', '舞者', '勇士', '锻造师'], ['狙击手', '森林骑士', '游侠'], ['卫士', '巨型重甲兵', '荣光骑士', '神鸵兵', '铁甲骑兵', '战象兵'], ['驭龙兵'], ['游唱诗人', '先知', '主教']],
    [['刀剑将领', '高阶墓志铭', '战斗将领', '武僧'], ['宗师射手', '弓骑士', '探影者'], ['圣枪师', '要塞', '奥利哈铁骑', '英勇骑士'], ['圣天翼兵', '飞龙将领'], ['德鲁伊', '贤士', '瓦尔基里姆']],
    [['刃辉神将', '神乐神将', '永霸神将', '破拳神将'], ['绝祸神将'], ['岚枪神将', '烈骏神将'], [], ['圣转神将']]
  ];
  const icons = {
    '平民':'commoner', '贵族':'noble', '斗士':'gladiator', '猎兵':'hunter',
    '士兵':'soldier', '飞鸵兵':'ornius-rider', '诅咒师':'diviner',
    '剑客':'myrmidon', '土匪':'brigand', '斗拳手':'pugilist', '弓箭手':'archer',
    '恶棍':'rogue', '重装步兵':'armored-knight', '轻骑兵':'light-cavalry',
    '战车兵':'charioteer', '骑甲驼兵':'armored-ornius-rider', '天翼兵':'wing-soldier',
    '萨满巫师':'shaman', '牧师':'priest', '侍道':'shido', '舞者':'dancer',
    '勇士':'warrior', '锻造师':'blacksmith', '狙击手':'sniper',
    '森林骑士':'forest-knight', '游侠':'ranger', '卫士':'guardian',
    '巨型重甲兵':'dreadnought', '荣光骑士':'bardinger', '神鸵兵':'caladrius',
    '铁甲骑兵':'cataphract', '战象兵':'elephant-rider', '驭龙兵':'dragoon',
    '游唱诗人':'troubadour', '先知':'ovate', '主教':'bishop', '刀剑将领':'swordmaster',
    '高阶墓志铭':'high-savant', '战斗将领':'battlemaster', '武僧':'war-monk',
    '宗师射手':'bow-adept', '弓骑士':'bow-knight', '探影者':'shadow-seeker',
    '圣枪师':'sentinel', '要塞':'castle-knight', '奥利哈铁骑':'orichaldia',
    '英勇骑士':'great-knight', '圣天翼兵':'celestial-trooper', '飞龙将领':'bau-lord',
    '德鲁伊':'druid', '贤士':'wiseman', '瓦尔基里姆':'valkyrium',
    '刃辉神将':'the-blade', '神乐神将':'the-apsara',
    '永霸神将':'the-eternal', '破拳神将':'the-godhand',
    '绝祸神将':'the-calamity', '岚枪神将':'the-trident',
    '烈骏神将':'the-cavalier', '圣转神将':'the-avatar'
  };
  return { families, tiers, base, rows, icons, names: [...new Set([...base, ...rows.flat(2)])] };
})();

function professionMarkup(value, editable, id = '', index = '') {
  const name = window.PROFESSIONS.names.includes(value) ? value : null;
  if (!name && !editable) return '';
  const content = `${name && !id ? `<img src="assets/classes/${window.PROFESSIONS.icons[name]}.png" alt="">` : ''}<span>${name || '选择职业'}</span>`;
  // Record cards are buttons: use a separate keyboard target without nesting buttons.
  return `<span class="profession-field ${editable ? 'can-edit' : ''}" ${editable ? `role="button" tabindex="0" data-profession data-character="${id}" data-record-index="${index}" aria-label="选择职业，${name || '暂无'}" aria-haspopup="dialog"` : ''}>${content}</span>`;
}

function openProfessionPicker(anchor) {
  if (document.querySelector('.profession-picker')) return;
  const id = anchor.dataset.character;
  const item = id ? state.roster.find(i => i.id === id) : null;
  const record = item ? item.records[Number(anchor.dataset.recordIndex)] : activeRecord;
  if (!record || (item && !editingCharacters.has(id))) return;
  const data = window.PROFESSIONS;
  const dialog = document.createElement('dialog');
  dialog.className = 'app-dialog profession-picker';
  dialog.setAttribute('aria-labelledby', 'profession-title');
  const option = name => `<button class="profession-option" data-class="${name}" aria-pressed="${record.profession === name}"><img src="assets/classes/${data.icons[name]}.png" alt="" loading="lazy"><span>${name}</span></button>`;
  const group = (title, cells, base = false) => `<section class="profession-tier ${base ? 'profession-base' : ''}"><h3>${title}</h3>${cells.map(names => `<div class="profession-options">${names.map(option).join('')}</div>`).join('')}</section>`;
  dialog.innerHTML = `<div class="profession-titlebar"><h2 id="profession-title">选择职业</h2></div><div class="profession-scroll"><div class="profession-table">${group('基础职业', [data.base], true)}${data.rows.map((row, t) => group(data.tiers[t], row)).join('')}</div></div><div class="profession-footer"><button data-class="">清除职业</button><button data-dismiss>关闭</button></div>`;
  dialog.addEventListener('click', e => {
    const choice = e.target.closest('[data-class]');
    if (choice) {
      record.profession = choice.dataset.class || null;
      if (item) { record.updatedAt = new Date().toISOString(); renderSummary(); }
      else updateRecordControls();
      dialog.close();
    } else if (e.target.closest('[data-dismiss]')) dialog.close();
    else if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const target = anchor.isConnected ? anchor : item ? app.querySelector(`[data-character="${id}"][data-record-index="${anchor.dataset.recordIndex}"]`) : app.querySelector('.stat-heading [data-profession]');
    target?.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  (dialog.querySelector('[data-class][aria-pressed="true"]') || dialog.querySelector('.profession-option'))?.focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if (e.target.matches('[data-profession]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault(); e.stopImmediatePropagation(); openProfessionPicker(e.target);
  }
}, true);
