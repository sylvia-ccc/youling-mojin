// 共享常量：人物、武器、道具、明器

export const CELL = 2;
export const MAP_W = 56;
export const MAP_H = 56;

// ========== 10 个原创角色 ==========
export const CHARS = {
  mofeng:   { key:'mofeng',   name:'墨锋',  gender:'M', hp:100, dmg:28, speed:1.0,  color:0xc8a44d, skill:'剑意', desc:'近战伤害+30%',          dmgMul:1.3 },
  shuangye: { key:'shuangye', name:'霜叶',  gender:'F', hp:80,  dmg:22, speed:1.15, color:0x6a8ec8, skill:'影遁', desc:'闪避25%',               dodge:0.25 },
  leizhen:  { key:'leizhen',  name:'雷震',  gender:'M', hp:140, dmg:30, speed:0.9,  color:0xb0623a, skill:'震击', desc:'近战附带范围伤害',       aoe:true },
  liuyan:   { key:'liuyan',   name:'柳烟',  gender:'F', hp:90,  dmg:18, speed:1.0,  color:0x4dc86e, skill:'回春', desc:'回血效果翻倍',           healMul:2.0 },
  tieshan:  { key:'tieshan',  name:'铁山',  gender:'M', hp:150, dmg:22, speed:0.85, color:0x6a6258, skill:'铁壁', desc:'受伤减免20%',            dmgReduce:0.2 },
  yueyao:   { key:'yueyao',   name:'月瑶',  gender:'F', hp:85,  dmg:20, speed:1.05, color:0x7a5fc0, skill:'寒霜', desc:'命中附带减速2秒',        slowOnHit:2000 },
  fengsun:  { key:'fengsun',  name:'风隼',  gender:'M', hp:90,  dmg:18, speed:1.1,  color:0x3f9e9e, skill:'鹰眼', desc:'远程伤害+50%',           rangedMul:1.5 },
  hongchen: { key:'hongchen', name:'红尘',  gender:'F', hp:85,  dmg:20, speed:1.1,  color:0xc86a4d, skill:'妙手', desc:'开棺速度翻倍',           openMul:0.5 },
  canglang: { key:'canglang', name:'苍狼',  gender:'M', hp:110, dmg:25, speed:1.0,  color:0x8a5a3a, skill:'狂战', desc:'血量<40%时攻击+50%',     frenzy:true },
  qingluan: { key:'qingluan', name:'青鸾',  gender:'F', hp:80,  dmg:18, speed:1.2,  color:0xc84d8a, skill:'灵巧', desc:'移速+20% 闪避15%',       dodge:0.15 },
};

// ========== 8 种武器 ==========
export const WEAPONS = {
  fist:     { key:'fist',     name:'拳脚',  dmg:12, range:2.0, cd:500,  type:'melee',  icon:'✊' },
  dagger:   { key:'dagger',   name:'匕首',  dmg:18, range:2.2, cd:320,  type:'melee',  icon:'刃' },
  sword:    { key:'sword',    name:'长剑',  dmg:28, range:2.8, cd:520,  type:'melee',  icon:'剑' },
  spear:    { key:'spear',    name:'长枪',  dmg:32, range:3.4, cd:620,  type:'melee',  icon:'枪' },
  hammer:   { key:'hammer',   name:'铁锤',  dmg:42, range:2.4, cd:850,  type:'melee',  icon:'锤', aoe:true },
  crossbow: { key:'crossbow', name:'连弩',  dmg:22, range:14,  cd:580,  type:'ranged', icon:'弩', ammo:3 },
  dart:     { key:'dart',     name:'飞镖',  dmg:16, range:11,  cd:340,  type:'ranged', icon:'镖', ammo:5 },
  firelock: { key:'firelock', name:'火铳',  dmg:50, range:9,   cd:1300, type:'ranged', icon:'铳', ammo:1 },
};

// ========== 商店武器（用金币购买）==========
export const SHOP_WEAPONS = {
  poison_cone:    { key:'poison_cone', name:'毒龙锥', dmg:35, range:2.6, cd:350, type:'melee', icon:'锥', cost:3000, desc:'攻速极快，适合新手近身突袭', rarity:'精良' },
  dragon_blade:   { key:'dragon_blade', name:'龙鳞刀', dmg:48, range:3.0, cd:480, type:'melee', icon:'鱗', cost:12000, desc:'攻守均衡的龙纹名兵', rarity:'稀有' },
  iron_greatsword:{ key:'iron_greatsword', name:'玄铁重剑', dmg:58, range:3.2, cd:700, type:'melee', icon:'鈍', cost:28000, desc:'势大力沉，可横扫多个目标', aoe:true, rarity:'史诗' },
  piercing_crossbow:{ key:'piercing_crossbow', name:'穿云弩', dmg:42, range:18, cd:700, type:'ranged', icon:'穿', cost:45000, desc:'超远距离精准狙击', ammo:6, rarity:'史诗' },
  rain_needles:   { key:'rain_needles', name:'暴雨梨花针', dmg:60, range:10, cd:900, type:'ranged', icon:'針', cost:68000, desc:'机关暗器，瞬发高伤', ammo:5, rarity:'传说' },
  thunder_talisman:{ key:'thunder_talisman', name:'九霄雷火符', dmg:88, range:13, cd:1450, type:'ranged', icon:'雷', cost:100000, desc:'镇库神兵，雷火范围爆破', ammo:4, aoe:true, rarity:'神话' },
};

// ========== 金币机制 ==========
export const STARTING_COINS = 200000;
export const COIN_REWARDS = {
  zombieKill: 15,
  playerKill: 30,
  chestOpen:  10,   // per item
  extract:    0.1,  // treasure value * 0.1
  pickup:     5,
};
export const ITEM_TYPES = {
  heal:  { key:'heal',  name:'回阳丹', color:0xd4453a, desc:'回血45点' },
  speed: { key:'speed', name:'神行符', color:0x4dc86e, desc:'移速+45%，持续8秒' },
  armor: { key:'armor', name:'护身符', color:0x4d8fc8, desc:'受伤-60%，持续10秒' },
};

// ========== 明器池 ==========
export const TREASURES = [
  { name:'青铜爵',     value:120,  w:2 },
  { name:'鎏金铜镜',   value:180,  w:2 },
  { name:'玉璧',       value:260,  w:3 },
  { name:'金钗',       value:300,  w:1 },
  { name:'唐三彩马',   value:340,  w:5 },
  { name:'青铜剑',     value:460,  w:6 },
  { name:'错金银鼎',   value:620,  w:8 },
  { name:'夜明珠',     value:780,  w:4 },
  { name:'金缕玉衣',   value:950,  w:8 },
];
export const BIG_TREASURE = { name:'传国玉玺', value:2400, w:14 };

// ========== 宝箱品级 ==========
export const CHEST_TIERS = {
  common:    { key:'common',    name:'普通', color:0x8a7434, glow:0x3a2e10, w:46, lootMin:1, lootMax:1, valueMul:0.6 },
  fine:      { key:'fine',      name:'精良', color:0x4dc86e, glow:0x16401e, w:30, lootMin:1, lootMax:2, valueMul:1.0 },
  epic:      { key:'epic',      name:'史诗', color:0x9b59b6, glow:0x3a1450, w:17, lootMin:2, lootMax:2, valueMul:1.8 },
  legendary: { key:'legendary', name:'传说', color:0xe0ad2f, glow:0x5a3c00, w:7,  lootMin:2, lootMax:3, valueMul:3.2 },
};

// ========== 尸煞变体 ==========
// 倍率相对基础 ZOMBIE；explode>0 表示死亡时对周围玩家造成范围伤害。
export const ZOMBIE_VARIANTS = {
  normal: { key:'normal', name:'尸煞',   hp:1.0,  dmg:1.0,  speed:1.0,  color:0x4a5a42, eye:0x8fff4d, scale:1.0,  explode:0 },
  swift:  { key:'swift',  name:'迅捷尸', hp:0.55, dmg:0.8,  speed:1.7,  color:0x6a8ec8, eye:0x7fd0ff, scale:0.92, explode:0 },
  brute:  { key:'brute',  name:'重装尸', hp:2.2,  dmg:1.6,  speed:0.62, color:0x8a5a3a, eye:0xff7a3c, scale:1.35, explode:0 },
  burst:  { key:'burst',  name:'爆裂尸', hp:0.8,  dmg:1.0,  speed:1.05, color:0x9a4d6a, eye:0xff5db0, scale:1.0,  explode:5.5 },
};

// ========== 陷阱与危害 ==========
export const TRAPS = {
  dart: { key:'dart', name:'飞镖机关', dmg:14, radius:1.7, cd:3000, kind:'hit', color:0xc8a44d },
  rock: { key:'rock', name:'落石机关', dmg:26, radius:2.0, cd:4200, kind:'hit', color:0x8a8276 },
  gas:  { key:'gas',  name:'毒气机关', dmg:9,  radius:2.4, cd:2600, kind:'dot', color:0x6abf4d },
};
export const HAZARD = { dmg:9, tick:1000, r:3.0 };

// ========== 游戏常量 ==========
export const BAG_LIMIT = 20;
export const MELEE_ARC = Math.PI * 0.45;
export const OPEN_TIME = 3000;
export const GRAB_TIME = 1200;
export const EXTRACT_TIME = 4000;
export const ROUND_TIME = 360000;
export const EXITS_OPEN_AT = 90000;
export const RESPAWN_TIME = 8000;
export const ZOMBIE = { hp:70, dmg:12, speed:2.3, aggro:9, atkCd:1200, respawn:30000 };

export const BOT_NAMES = ['阿木','小六','石头','阿翠','老姜','小桃','铁柱','阿月','大牛','小蝉'];

export function cellToWorld(i, j, w = MAP_W, h = MAP_H) {
  return [(i - w / 2 + 0.5) * CELL, (j - h / 2 + 0.5) * CELL];
}
export function worldToCell(x, z, w = MAP_W, h = MAP_H) {
  return [Math.floor(x / CELL + w / 2), Math.floor(z / CELL + h / 2)];
}
