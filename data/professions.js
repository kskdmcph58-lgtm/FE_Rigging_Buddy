/* Ordered as the in-game class screen; base classes have no family. */
window.PROFESSIONS = (() => {
  const families = ['斗士系', '猎兵系', '士兵系', '飞行系', '魔道系'];
  const tiers = ['初级职业', '中级职业', '上级职业', '最上级职业', '神将职业'];
  const base = ['平民', '贵族'];
  const rows = [
    [['斗士'], ['猎兵'], ['士兵'], ['飞鸵兵'], ['诅咒师']],
    [['剑客', '土匪', '斗拳手'], ['弓箭手', '恶棍'], ['重装步兵', '轻骑兵', '战车兵'], ['骑甲鸵兵', '天翼兵'], ['萨满巫师', '牧师']],
    [['侍道', '舞者', '勇士', '锻造师'], ['狙击手', '森林骑士', '游侠'], ['卫士', '巨型重甲兵', '荣光骑士', '神鸵兵', '铁甲骑兵', '战象兵'], ['驭龙兵'], ['游唱诗人', '先知', '主教']],
    [['刀剑将领', '高阶墓志铭', '战斗将领', '武僧'], ['宗师射手', '弓骑士', '探影者', '欺诈师'], ['圣枪师', '要塞', '奥利哈铁骑', '英勇骑士', '系尔'], ['巴伊波·卡哈', '圣天翼兵', '飞龙将领'], ['德鲁伊', '贤士', '觉者', '瓦尔基里姆']],
    [['刃辉神将', '神乐神将', '永霸神将', '破拳神将'], ['绝祸神将'], ['岚枪神将', '烈骏神将'], [], ['圣转神将']]
  ];
  const icons = {
    '平民':'commoner', '贵族':'noble', '斗士':'gladiator', '猎兵':'hunter',
    '士兵':'soldier', '飞鸵兵':'ornius-rider', '诅咒师':'diviner',
    '剑客':'myrmidon', '土匪':'brigand', '斗拳手':'pugilist', '弓箭手':'archer',
    '恶棍':'rogue', '重装步兵':'armored-knight', '轻骑兵':'light-cavalry',
    '战车兵':'charioteer', '骑甲鸵兵':'armored-ornius-rider', '天翼兵':'wing-soldier',
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
    '烈骏神将':'the-cavalier', '圣转神将':'the-avatar',
    '欺诈师':'trickster', '觉者':'enlightened', '系尔':'seere', '巴伊波·卡哈':'badb-catha'
  };
  // The two top tiers and the elephant rider open only in Part 3.
  const part3Only = new Set(['战象兵', ...rows[3].flat(), ...rows[4].flat()]);
  const mounts = {
    horse: ['轻骑兵', '战车兵', '森林骑士', '荣光骑士', '铁甲骑兵', '游唱诗人', '高阶墓志铭', '弓骑士', '奥利哈铁骑', '英勇骑士', '系尔', '瓦尔基里姆', '烈骏神将'],
    ornius: ['飞鸵兵', '骑甲鸵兵', '神鸵兵'],
    pegasus: ['天翼兵', '巴伊波·卡哈', '圣天翼兵'],
    bau: ['驭龙兵', '飞龙将领'],
    elephant: ['战象兵']
  };
  const mountOf = Object.fromEntries(Object.entries(mounts).flatMap(([kind, names]) => names.map(name => [name, kind])));
  return { families, tiers, base, rows, icons, part3Only, mountOf, names: [...new Set([...base, ...rows.flat(2)])] };
})();

/* The game's assignable mounts; each default mount is the "no assignment" state instead. */
window.RIDES = (() => {
  const list = [
    ['RID_馬', '野生马', 'horse'], ['RID_汗血馬', '汗血马', 'horse'], ['RID_黒馬', '黑马', 'horse'],
    ['RID_ユニコーン', '莫诺凯洛斯', 'horse'], ['RID_ロシナン', '罗西南', 'horse'], ['RID_ロシナンの仔', '罗西南的兄弟', 'horse'],
    ['RID_オルニウス', '野生欧鲁尼乌斯', 'ornius'], ['RID_白羽のオルニウス', '白羽欧鲁尼乌斯', 'ornius'], ['RID_メガニウス', '美加尼乌斯', 'ornius'],
    ['RID_赤羽のメガニウス', '红羽美加尼乌斯', 'ornius'], ['RID_マジニウス', '玛吉尼乌斯', 'ornius'], ['RID_黒羽のマジニウス', '黑羽玛吉尼乌斯', 'ornius'],
    ['RID_ペガサス', '野生飞马', 'pegasus'], ['RID_ダークペガサス', '暗飞马', 'pegasus'], ['RID_ファルコン', '圣飞马', 'pegasus'],
    ['RID_レッドファルコン', '红圣飞马', 'pegasus'], ['RID_ブーケパラス', '布克发拉斯', 'pegasus'], ['RID_ブーケパラスの仔', '布克发拉斯的孩子', 'pegasus'],
    ['RID_バウ', '野生巴乌', 'bau'], ['RID_レッドバウ', '红巴乌', 'bau'], ['RID_ブラックバウ', '黑巴乌', 'bau'],
    ['RID_ダグザンゾウ', '萨拉弥斯战象', 'elephant']
  ].map(([id, name, kind]) => ({ id, name, kind }));
  return { list, byId: Object.fromEntries(list.map(ride => [ride.id, ride])), kinds: [...new Set(list.map(ride => ride.kind))] };
})();

