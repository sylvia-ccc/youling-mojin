// 房间/对局逻辑：战斗、武器、摸金、道具、尸煞、机器人、撤离结算
import {
  CHARS, WEAPONS, SHOP_WEAPONS, ITEM_TYPES, TREASURES, BIG_TREASURE, BAG_LIMIT,
  MELEE_ARC, OPEN_TIME, GRAB_TIME,
  EXTRACT_TIME, ROUND_TIME, EXITS_OPEN_AT, RESPAWN_TIME, ZOMBIE,
  BOT_NAMES, STARTING_COINS, COIN_REWARDS,
  CHEST_TIERS, ZOMBIE_VARIANTS, TRAPS, HAZARD, DANGER_BY_TIER, DANGER_MAX,
} from './shared.js';
import { generateMap, findPath } from './mapgen.js';

const BASE_SPEED = 4.2;
const TICK_MS = 50;
const SNAP_MS = 90;
const LOADOUT_TIME = 20000;
const DOOR_OPEN_TIME = 2500;
const ALL_WEAPONS = { ...WEAPONS, ...SHOP_WEAPONS };

let nextEntityId = 1;

function rollLoot(big, tier) {
  if (big) {
    const loot = [{ ...BIG_TREASURE }];
    const extra = [...TREASURES].sort(() => Math.random() - 0.5).slice(0, 2).map(t => ({ ...t }));
    return loot.concat(extra);
  }
  const t = CHEST_TIERS[tier] || CHEST_TIERS.common;
  const n = t.lootMin + Math.floor(Math.random() * (t.lootMax - t.lootMin + 1));
  const pool = [...TREASURES].sort(() => Math.random() - 0.5);
  const chosen = pool.slice(0, n).map(x => ({ ...x }));
  if (tier === 'legendary' && Math.random() < 0.25) chosen.push({ ...BIG_TREASURE });
  for (const it of chosen) it.value = Math.round(it.value * t.valueMul);
  return chosen;
}

export class Room {
  constructor(onEmpty) {
    this.id = 'room-' + Math.random().toString(36).slice(2, 8);
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.state = 'lobby';
    this.maxReal = 6;
    this.createdAt = Date.now();
    this.startTimer = null;
    this.lastThemeKey = null;
    this.danger = 0;
    this.openedChests = 0;
  }

  addPlayer(ws, name, charKey) {
    const id = 'p' + nextEntityId++;
    const p = {
      id, ws, name: (name || '无名氏').slice(0, 12), char: CHARS[charKey] ? charKey : 'mofeng',
      bot: false, ready: false,
      x: 0, z: 0, ry: 0, hp: 0, st: 'lobby',
      bag: [], banked: 0, kills: 0, hotbar: [], buffs: {},
      weapon: 'fist', ammo: 0, coins: STARTING_COINS, boughtWeapons: [],
      relations: {}, handWith: null,
      lastAtk: 0, openProg: 0, openTarget: null, openAt: 0,
      grabProg: 0, grabTarget: null, extractProg: 0,
      respawnAt: 0, anim: '',
    };
    this.players.set(id, p);
    ws._pid = id;
    ws._room = this;
    return p;
  }

  lobbyInfo() {
    return {
      t: 'lobby', room: this.id,
      players: [...this.players.values()].filter(p => !p.bot).map(p => ({ id: p.id, name: p.name, char: p.char })),
      max: this.maxReal,
    };
  }

  broadcast(obj, exceptId) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) {
      if (!p.bot && p.ws.readyState === 1 && p.id !== exceptId) p.ws.send(s);
    }
  }

  sendTo(p, obj) { if (!p.bot && p.ws.readyState === 1) p.ws.send(JSON.stringify(obj)); }

  tryStart() {
    if (this.state !== 'lobby') return;
    const reals = [...this.players.values()].filter(p => !p.bot);
    if (!reals.length) return;
    const waited = Date.now() - this.createdAt;
    if (reals.length >= this.maxReal || (reals.length >= 1 && waited > 5000)) {
      this.start();
    }
  }

  start() {
    if (this.state !== 'lobby') return;
    this.state = 'playing';
    this.danger = 0; this.openedChests = 0;
    this.map = generateMap(this.lastThemeKey);
    this.lastThemeKey = this.map.theme.key;
    this.phase = 'loadout';
    this.phaseEndAt = Date.now() + LOADOUT_TIME;
    this.doorOpen = false;
    this.startAt = this.phaseEndAt;
    this.exitsOpen = false;
    this.endAt = this.startAt + ROUND_TIME;
    this.lastSnap = 0;
    this.projectiles = [];
    this.dropBags = [];
    this.monsterChests = [];
    this.events = [];

    // 补机器人
    const reals = [...this.players.values()].filter(p => !p.bot);
    const want = Math.min(6, Math.max(5, reals.length));
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const charKeys = Object.keys(CHARS);
    while (this.players.size < want) {
      const id = 'b' + nextEntityId++;
      const bot = {
        id, ws: null, name: names[this.players.size % names.length] + '·AI',
        char: charKeys[Math.floor(Math.random() * charKeys.length)],
        bot: true, x: 0, z: 0, ry: 0, hp: 0, st: 'alive',
        bag: [], banked: 0, kills: 0, hotbar: [], buffs: {},
        weapon: 'fist', ammo: 0, coins: STARTING_COINS, boughtWeapons: [],
        relations: {}, handWith: null,
        lastAtk: 0, openProg: 0, openTarget: null, openAt: 0,
        grabProg: 0, grabTarget: null, extractProg: 0, respawnAt: 0, anim: '',
        ai: { mode: 'loot', path: null, pathAt: 0, thinkAt: 0, tgtChest: null, tgtExit: null, tgtEnemy: null, tgtBag: null, wanderX: 0, wanderZ: 0 },
      };
      this.players.set(id, bot);
    }

    // 出生点
    const spawns = [...this.map.spawns].sort(() => Math.random() - 0.5);
    let si = 0;
    for (const p of this.players.values()) {
      const c = CHARS[p.char];
      p.hp = c.hp; p.st = 'alive';
      p.x = spawns[si % spawns.length].x; p.z = spawns[si % spawns.length].z;
      p.spawnX = p.x; p.spawnZ = p.z;
      p.ry = Math.atan2(-p.x, -p.z);
      p.bag = []; p.banked = 0; p.kills = 0; p.buffs = {};
      p.weapon = 'fist'; p.ammo = 0;
      p.coins = STARTING_COINS; p.boughtWeapons = [];
      p.hotbar = [];
      si++;
    }

    // 棺材
    this.chests = this.map.chests.map(c => ({ ...c, open: false, loot: rollLoot(c.big, c.tier) }));
    // 道具
    this.items = this.map.items.map(it => ({ ...it, taken: false }));
    // 武器刷新点
    this.weaponSpawns = (this.map.weapons || []).map(w => ({ ...w, taken: false }));
    // 陷阱与危害
    this.traps = (this.map.traps || []).map(t => ({ ...t, cdUntil: 0 }));
    this.hazards = (this.map.hazards || []).map(h => ({ ...h }));
    this._hazTick = 0; this._nextEvent = Date.now() + 50000;
    // 尸煞（含变体）
    this.zombies = this.map.zombieSpawns.map((s, i) => {
      const v = ZOMBIE_VARIANTS[s.variant] || ZOMBIE_VARIANTS.normal;
      const hp = Math.round(ZOMBIE.hp * v.hp);
      return {
        id: 'z' + i, x: s.x, z: s.z, variant: s.variant || 'normal', name: v.name,
        hp, maxHp: hp, dmgMul: v.dmg, st: 'wander', outside: !!s.outside,
        tgt: null, path: null, pathAt: 0, lastAtk: 0, deadUntil: 0, spawnX: s.x, spawnZ: s.z,
        wx: s.x, wz: s.z,
      };
    });

    // 发送 start
    const cdata = {};
    for (const [k, v] of Object.entries(CHARS)) cdata[k] = { name: v.name, gender: v.gender, hp: v.hp, dmg: v.dmg, speed: v.speed, color: v.color, desc: v.desc, skill: v.skill };
    const wdata = {};
    for (const [k, v] of Object.entries(ALL_WEAPONS)) wdata[k] = { name: v.name, dmg: v.dmg, range: v.range, cd: v.cd, type: v.type, icon: v.icon, ammo: v.ammo || 0, aoe: !!v.aoe, cost: v.cost || 0, desc: v.desc || '', rarity: v.rarity || '普通' };
    const shopData = Object.fromEntries(Object.entries(SHOP_WEAPONS).map(([k, v]) => [k, wdata[k]]));

    for (const p of this.players.values()) {
      this.sendTo(p, {
        t: 'start', id: p.id, map: this.map, chars: cdata, weapons: wdata, shop: shopData, coins: p.coins, items: ITEM_TYPES,
        players: [...this.players.values()].map(q => ({ id: q.id, name: q.name, char: q.char, bot: q.bot })),
        phase: this.phase, loadoutMs: LOADOUT_TIME, roundMs: ROUND_TIME, exitsOpenAt: EXITS_OPEN_AT, respawnMs: RESPAWN_TIME,
      });
    }
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  // ---------- 消息处理 ----------
  onMessage(p, m) {
    if (this.state === 'lobby') {
      if (m.t === 'ready') { p.ready = !!m.v; this.broadcast(this.lobbyInfo()); this.tryStart(); }
      return;
    }
    if (this.state !== 'playing') return;
    switch (m.t) {
      case 'st': {
        if (p.st !== 'alive' || this.phase === 'loadout') break;
        const c = CHARS[p.char];
        let mul = c.speed;
        if (p.buffs.speed > Date.now()) mul *= 1.45;
        if (p.buffs.slow > Date.now()) mul *= 0.5;
        const maxV = BASE_SPEED * mul * 1.6;
        const dt = Math.min(1, (Date.now() - (p._lastSt || 0)) / 1000);
        p._lastSt = Date.now();
        const dx = m.p[0] - p.x, dz = m.p[1] - p.z;
        const d = Math.hypot(dx, dz);
        let nx, nz;
        if (d > maxV * dt + 0.6) {
          const k = (maxV * dt + 0.6) / d;
          nx = p.x + dx * k; nz = p.z + dz * k;
        } else { nx = m.p[0]; nz = m.p[1]; }
        const blockedDoor = !this.doorOpen && Math.abs(nx - this.map.door.x) < 1.7 && Math.abs(nz - this.map.door.z) < 0.8;
        if (this.walkable(nx, nz) && !blockedDoor) { p.x = nx; p.z = nz; }
        p.ry = m.ry; p.anim = m.a || '';
        break;
      }
      case 'atk': if (this.phase !== 'loadout') this.attack(p); break;
      case 'use': if (this.phase !== 'loadout') this.useItem(p, m.slot); break;
      case 'open': if (this.phase === 'tomb') this.progressOpen(p, m.id); break;
      case 'grab': if (this.phase !== 'loadout') this.progressGrab(p, m.id); break;
      case 'door': if (this.phase === 'outside') this.progressDoor(p); break;
      case 'monsterChest': if (this.phase !== 'loadout') this.openMonsterChest(p, m.id); break;
      case 'bind': this.bindPlayers(p, m.target, m.relation); break;
      case 'hand': this.toggleHand(p, m.target); break;
      case 'buy': if (this.phase === 'loadout') this.buyWeapon(p, m.weapon); break;
    }
  }

  // ---------- 攻击（近战+远程统一）----------
  attack(p) {
    const now = Date.now();
    if (p.st !== 'alive') return;
    const c = CHARS[p.char];
    const w = ALL_WEAPONS[p.weapon || 'fist'];
    if (now - p.lastAtk < w.cd) return;
    p.lastAtk = now;
    p.anim = 'atk';

    // 狂战被动
    const frenzyMul = (c.frenzy && p.hp < c.hp * 0.4) ? 1.5 : 1;

    if (w.type === 'ranged') {
      if (p.ammo <= 0) return;
      p.ammo--;
      const dmg = Math.round(w.dmg * (c.rangedMul || 1) * frenzyMul);
      const dx = Math.sin(p.ry), dz = Math.cos(p.ry);
      this.projectiles.push({ id: 'pr' + nextEntityId++, x: p.x + dx, z: p.z + dz, dx, dz, owner: p.id, dmg, range: w.range, traveled: 0, until: now + 3000 });
      this.events.push({ k: 'throw', id: p.id });
      if (p.ammo <= 0) { p.weapon = 'fist'; this.sendWeapon(p); }
      return;
    }

    // 近战
    const dmg = Math.round(w.dmg * (c.dmgMul || 1) * frenzyMul);
    const range = w.range;
    let hit = false;
    // 合作模式：玩家之间无伤害，只攻击怪物
    for (const z of this.zombies) {
      if (z.hp <= 0) continue;
      if (this.inArc(p, z.x, z.z, range + 0.3)) {
        hit = true;
        this.damageZombie(z, dmg, p, 'melee');
        if (!c.aoe && !w.aoe) break;
      }
    }
    this.events.push({ k: 'swing', id: p.id, hit });
  }

  inArc(p, x, z, range) {
    const dx = x - p.x, dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    const ang = Math.atan2(dx, dz);
    let diff = ang - p.ry;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) < MELEE_ARC;
  }

  damage(q, dmg, from) {
    const now = Date.now();
    const qc = CHARS[q.char];
    // 闪避
    if (qc.dodge && Math.random() < qc.dodge) {
      this.events.push({ k: 'dodge', to: q.id, from: from.id });
      return;
    }
    // 减伤
    if (qc.dmgReduce) dmg = Math.round(dmg * (1 - qc.dmgReduce));
    if (q.buffs.armor > now) dmg = Math.round(dmg * 0.4);
    q.hp -= dmg;
    // 寒霜被动（仅玩家攻击者）
    if (from.char) { const fc = CHARS[from.char]; if (fc && fc.slowOnHit) q.buffs.slow = now + fc.slowOnHit; }
    this.events.push({ k: 'hit', targetType: 'player', to: q.id, from: from.id, fromName: from.name, dmg, hp: Math.max(0, q.hp) });
    if (q.hp <= 0) this.kill(q, from);
  }

  kill(q, from) {
    q.st = 'dead'; q.hp = 0; q.respawnAt = q.bot ? Date.now() + RESPAWN_TIME : 0;
    from.kills++;
    if (from.coins !== undefined) from.coins += COIN_REWARDS.playerKill;
    this.events.push({ k: 'coins', id: from.id, coins: from.coins, gain: COIN_REWARDS.playerKill, reason: '击杀' });
    if (q.bag.length) {
      this.dropBags.push({ id: 'bag' + nextEntityId++, x: q.x, z: q.z, loot: q.bag.splice(0) });
    }
    this.events.push({ k: 'died', id: q.id, by: from.id, byName: from.name, name: q.name });
    if (!q.bot) {
      const teammate = [...this.players.values()].find(p => p.id !== q.id && p.st === 'alive');
      this.sendTo(q, { t: 'deathState', canSpectate: !!teammate, target: teammate?.id || null });
    }
  }

  damageZombie(z, dmg, from, source = 'melee') {
    if (!z || z.hp <= 0) return;
    z.hp -= dmg;
    const killed = z.hp <= 0;
    this.events.push({
      k: 'hit', targetType: 'zombie', to: z.id, from: from.id,
      dmg, hp: Math.max(0, z.hp), killed, source
    });
    if (killed) this.killZombie(z, from);
  }

  killZombie(z, from) {
    z.hp = 0; z.deadUntil = Date.now() + Math.round(ZOMBIE.respawn * Math.max(.625, 1 - this.danger * .075));
    const v = ZOMBIE_VARIANTS[z.variant] || ZOMBIE_VARIANTS.normal;
    if (v.explode > 0) {
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        if (Math.hypot(p.x - z.x, p.z - z.z) < v.explode) {
          this.damage(p, Math.round(ZOMBIE.dmg * 2.2), { id: z.id, name: v.name, kills: 0 });
        }
      }
      this.events.push({ k: 'explode', id: z.id, x: z.x, z: z.z, variant: z.variant });
    }
    if (from.coins !== undefined) from.coins += COIN_REWARDS.zombieKill;
    this.events.push({ k: 'coins', id: from.id, coins: from.coins, gain: COIN_REWARDS.zombieKill, reason: '诛煞' });
    const r = Math.random();
    let color, value;
    if (r < 0.04) { color = 'red'; value = 500000; }
    else if (r < 0.20) { color = 'gold'; value = 20000 + Math.floor(Math.random() * 80001); }
    else if (r < 0.45) { color = 'purple'; value = 12000; }
    else { color = 'white'; value = 200 + Math.floor(Math.random() * 801); }
    const id = 'mc' + nextEntityId++;
    this.monsterChests.push({ id, x: z.x, z: z.z, color, value, taken: false });
    this.events.push({ k: 'monsterChestDrop', id, x: z.x, z: z.z, color, value });
    this.events.push({ k: 'zombieDead', id: z.id, by: from.id, byName: from.name });
  }

  openMonsterChest(p, chestId) {
    const chest = this.monsterChests.find(c => c.id === chestId && !c.taken);
    if (!chest || p.st !== 'alive' || Math.hypot(chest.x - p.x, chest.z - p.z) > 2.3) return;
    chest.taken = true;
    p.coins += chest.value;
    this.events.push({ k: 'monsterChestOpen', id: chest.id, by: p.id, name: p.name, color: chest.color, value: chest.value });
    this.events.push({ k: 'coins', id: p.id, coins: p.coins, gain: chest.value, reason: '怪物宝箱' });
  }

  // ---------- 道具 ----------
  useItem(p, slot) {
    if (p.st !== 'alive') return;
    const it = p.hotbar[slot];
    if (!it) return;
    const now = Date.now();
    const c = CHARS[p.char];
    if (it.type === 'heal') {
      const heal = 45 * (c.healMul || 1);
      p.hp = Math.min(c.hp, p.hp + heal);
      this.events.push({ k: 'heal', id: p.id, hp: p.hp });
    } else if (it.type === 'speed') {
      p.buffs.speed = now + 8000;
      this.events.push({ k: 'buff', id: p.id, buff: 'speed' });
    } else if (it.type === 'armor') {
      p.buffs.armor = now + 10000;
      this.events.push({ k: 'buff', id: p.id, buff: 'armor' });
    }
    p.hotbar.splice(slot, 1);
    this.sendHotbar(p);
  }

  sendHotbar(p) {
    this.sendTo(p, { t: 'hotbar', hotbar: p.hotbar.map(i => ({ type: i.type, n: i.n })) });
  }

  sendWeapon(p) {
    this.sendTo(p, { t: 'weapon', weapon: p.weapon, ammo: p.ammo });
    this.events.push({ k: 'weapon', id: p.id, weapon: p.weapon, ammo: p.ammo });
  }

  // ---------- 商店购买 ----------
  buyWeapon(p, weaponKey) {
    if (p.st !== 'alive' || this.phase !== 'loadout') return;
    const sw = SHOP_WEAPONS[weaponKey];
    if (!sw) return;
    if (!p.boughtWeapons) p.boughtWeapons = [];

    // 已拥有武器永远可以免费重新装备，不受当前余额影响。
    if (p.boughtWeapons.includes(weaponKey)) {
      p.weapon = weaponKey;
      p.ammo = sw.ammo || 0;
      this.sendWeapon(p);
      this.sendTo(p, { t: 'shopMsg', msg: `已装备 ${sw.name}（补给完成）`, ok: true, action: 'equipped', weapon: weaponKey });
      return;
    }
    if (p.coins < sw.cost) {
      this.sendTo(p, { t: 'shopMsg', msg: '铜元不足！', ok: false, action: 'rejected', weapon: weaponKey });
      return;
    }

    p.coins -= sw.cost;
    p.boughtWeapons.push(weaponKey);
    p.weapon = weaponKey;
    p.ammo = sw.ammo || 0;
    this.sendWeapon(p);
    this.events.push({ k: 'coins', id: p.id, coins: p.coins, gain: -sw.cost, reason: `购买${sw.name}` });
    this.sendTo(p, { t: 'shopMsg', msg: `购得并装备 ${sw.name}！`, ok: true, action: 'bought', weapon: weaponKey });
  }

  // ---------- 关系绑定与牵手 ----------
  bindPlayers(p, targetId, relation) {
    const allowed = ['爸妈','情侣','闺蜜','兄弟','大佬和小弟','朋友','亲友'];
    const q = this.players.get(targetId);
    if (!q || q.bot || p.bot || q.id === p.id || !allowed.includes(relation)) return;
    p.relations[q.id] = relation; q.relations[p.id] = relation;
    this.events.push({ k:'relation', a:p.id, b:q.id, aName:p.name, bName:q.name, relation });
  }

  toggleHand(p, targetId) {
    const q = this.players.get(targetId);
    if (!q || q.bot || p.bot || !p.relations[q.id] || Math.hypot(q.x-p.x,q.z-p.z)>3.5) return;
    const joining = p.handWith !== q.id;
    if (p.handWith) { const old=this.players.get(p.handWith); if(old) old.handWith=null; }
    if (q.handWith) { const old=this.players.get(q.handWith); if(old) old.handWith=null; }
    p.handWith = joining ? q.id : null; q.handWith = joining ? p.id : null;
    this.events.push({ k:'hand', a:p.id, b:q.id, on:joining, aName:p.name, bName:q.name });
  }

  // ---------- 墓门 ----------
  progressDoor(p) {
    if (this.doorOpen || p.st !== 'alive') return;
    const d = this.map.door;
    if (Math.hypot(d.x - p.x, d.z - p.z) > 2.8) { p.doorProg = 0; return; }
    p.doorProg = (p.doorProg || 0) + 170;
    this.sendTo(p, { t: 'doorProg', prog: Math.min(1, p.doorProg / DOOR_OPEN_TIME) });
    if (p.doorProg >= DOOR_OPEN_TIME) {
      this.doorOpen = true; this.phase = 'tomb'; p.doorProg = 0;
      this.events.push({ k: 'doorOpen', id: p.id, name: p.name });
      this.broadcast({ t: 'phase', phase: 'tomb' });
    }
  }

  // ---------- 开棺 ----------
  progressOpen(p, chestId) {
    if (p.st !== 'alive') return;
    const chest = this.chests.find(c => c.id === chestId);
    if (!chest) return;
    if (Math.hypot(chest.x - p.x, chest.z - p.z) > 2.6) return;
    const now = Date.now();
    if (p.openTarget !== chestId || now - p.openAt > 600) {
      p.openProg = 0; p.openTarget = chestId;
    }
    p.openAt = now;
    const c = CHARS[p.char];
    p.openProg += 170;
    const need = OPEN_TIME * (c.openMul || 1);
    this.sendTo(p, { t: 'openProg', id: chestId, prog: Math.min(1, p.openProg / need) });
    if (p.openProg >= need) {
      p.openProg = 0; p.openTarget = null;
      this.openChest(p, chest);
    }
  }

  openChest(p, chest) {
    const firstOpen = !chest.open;
    chest.open = true;
    const taken = [], remain = [];
    let w = this.bagWeight(p);
    const limit = BAG_LIMIT + (CHARS[p.char].bagBonus || 0);
    for (const t of chest.loot) {
      if (w + t.w <= limit) { taken.push(t); w += t.w; }
      else remain.push(t);
    }
    p.bag.push(...taken);
    chest.loot = remain;
    if (taken.length && p.coins !== undefined) {
      const gain = taken.length * COIN_REWARDS.chestOpen;
      p.coins += gain;
      this.events.push({ k: 'coins', id: p.id, coins: p.coins, gain, reason: '开棺' });
    }
    let dangerGain = 0;
    if (firstOpen && taken.length) {
      const routeMul = chest.route === 'danger' ? 1.3 : chest.route === 'mechanism' ? 1.05 : .8;
      dangerGain = (DANGER_BY_TIER[chest.tier] || .35) * routeMul;
      this.danger = Math.min(DANGER_MAX, this.danger + dangerGain);
      this.openedChests++;
    }
    this.events.push({ k: 'chest', id: chest.id, by: p.id, byName: p.name, got: taken, big: chest.big, dangerGain:+dangerGain.toFixed(2), danger:+this.danger.toFixed(2), route:chest.route });
    if (!taken.length && remain.length) this.sendTo(p, { t:'bagFull', w, limit });
    this.sendTo(p, { t: 'bag', bag: p.bag, w, limit });
  }

  progressGrab(p, bagId) {
    if (p.st !== 'alive') return;
    const bag = this.dropBags.find(b => b.id === bagId);
    if (!bag) return;
    if (Math.hypot(bag.x - p.x, bag.z - p.z) > 2.2) return;
    const now = Date.now();
    if (p.grabTarget !== bagId || now - (p._grabAt || 0) > 600) { p.grabProg = 0; p.grabTarget = bagId; }
    p._grabAt = now;
    p.grabProg += 170;
    this.sendTo(p, { t: 'openProg', id: bagId, prog: Math.min(1, p.grabProg / GRAB_TIME) });
    if (p.grabProg >= GRAB_TIME) {
      p.grabProg = 0; p.grabTarget = null;
      let w = this.bagWeight(p);
      const limit = BAG_LIMIT + (CHARS[p.char].bagBonus || 0);
      const got = [];
      bag.loot = bag.loot.filter(t => { if (w + t.w <= limit) { got.push(t); w += t.w; return false; } return true; });
      p.bag.push(...got);
      if (!bag.loot.length) this.dropBags = this.dropBags.filter(b => b.id !== bagId);
      this.events.push({ k: 'grabbed', id: bagId, by: p.id, byName: p.name, got });
      if (!got.length && bag.loot.length) this.sendTo(p, { t:'bagFull', w, limit });
      this.sendTo(p, { t: 'bag', bag: p.bag, w, limit });
    }
  }

  bagWeight(p) { return p.bag.reduce((s, t) => s + t.w, 0); }
  bagValue(p) { return p.bag.reduce((s, t) => s + t.value, 0); }

  // ---------- 主循环 ----------
  tick() {
    const now = Date.now();
    if (this.phase === 'loadout') {
      if (now >= this.phaseEndAt) {
        this.phase = 'outside';
        this.events.push({ k: 'phase', phase: 'outside' });
        this.broadcast({ t: 'phase', phase: 'outside' });
      }
      if (now - this.lastSnap >= SNAP_MS) { this.lastSnap = now; this.broadcastSnapshot(now); }
      return;
    }
    if (now >= this.endAt) return this.endRound();
    if (!this.exitsOpen && this.phase === 'tomb' && now - this.startAt >= EXITS_OPEN_AT) {
      this.exitsOpen = true;
      this.events.push({ k: 'exitsOpen' });
    }
    const lastMin = this.endAt - now < 60000;

    this.tickProjectiles(now);
    this.tickHands();
    this.tickZombies(now, lastMin);
    this.tickTraps(now);
    this.tickHazards(now);
    this.tickRandomEvents(now);
    if (this.phase === 'tomb') this.tickPickups();
    if (this.phase === 'tomb') this.tickExtract(now);
    this.tickRespawns(now);
    for (const p of this.players.values()) if (p.bot) this.tickBot(p, now);

    if (now - this.lastSnap >= SNAP_MS) {
      this.lastSnap = now;
      this.broadcastSnapshot(now);
    }
  }

  tickHands() {
    const done = new Set();
    for (const p of this.players.values()) {
      if (!p.handWith || done.has(p.id)) continue;
      const q = this.players.get(p.handWith); done.add(p.id); if (q) done.add(q.id);
      if (!q || p.st !== 'alive' || q.st !== 'alive') { p.handWith=null; if(q)q.handWith=null; continue; }
      const d=Math.hypot(q.x-p.x,q.z-p.z);
      if (d>6) { p.handWith=null;q.handWith=null;this.events.push({k:'hand',a:p.id,b:q.id,on:false}); continue; }
      if (d>1.6) { const mx=(p.x+q.x)/2,mz=(p.z+q.z)/2; p.x+=(mx-p.x)*.06;p.z+=(mz-p.z)*.06;q.x+=(mx-q.x)*.06;q.z+=(mz-q.z)*.06; }
    }
  }

  tickProjectiles(now) {
    const speed = 18 * TICK_MS / 1000;
    this.projectiles = this.projectiles.filter(k => {
      if (now > k.until) return false;
      k.x += k.dx * speed; k.z += k.dz * speed;
      k.traveled += speed;
      if (k.traveled > k.range) return false;
      const ci = Math.floor(k.x / this.map.cell + this.map.w / 2);
      const cj = Math.floor(k.z / this.map.cell + this.map.h / 2);
      if (ci < 0 || cj < 0 || ci >= this.map.w || cj >= this.map.h || this.map.rows[cj][ci] === '0') return false;
      for (const z of this.zombies) {
        if (z.hp > 0 && Math.hypot(z.x - k.x, z.z - k.z) < 0.7) {
          const owner = this.players.get(k.owner);
          if (owner) this.damageZombie(z, k.dmg, owner, 'ranged');
          return false;
        }
      }
      // 合作模式：投射物穿过队友，不造成伤害
      return true;
    });
  }

  tickZombies(now, frenzy) {
    for (const z of this.zombies) {
      const v = ZOMBIE_VARIANTS[z.variant] || ZOMBIE_VARIANTS.normal;
      const dangerMul = 1 + this.danger * .06;
      const speed = ZOMBIE.speed * v.speed * dangerMul * (frenzy ? 1.25 : 1) * TICK_MS / 1000;
      if (this.phase === 'outside' && !z.outside) continue;
      if (this.phase === 'tomb' && z.outside) continue;
      if (z.hp <= 0) {
        if (now >= z.deadUntil) {
          z.maxHp = Math.round(ZOMBIE.hp * v.hp); z.hp = z.maxHp;
          z.x = z.spawnX; z.z = z.spawnZ; z.st = 'wander';
          this.events.push({ k: 'zombieBack', id: z.id });
        }
        continue;
      }
      let best = null, bd = ZOMBIE.aggro * (1 + this.danger * .08);
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        const d = Math.hypot(p.x - z.x, p.z - z.z);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) {
        z.st = 'chase';
        if (now - z.pathAt > 1200 || !z.path || !z.path.length) {
          z.path = findPath(this.map, z.x, z.z, best.x, best.z);
          z.pathAt = now;
        }
        this.followPath(z, z.path, speed);
        if (bd < 1.7 && now - z.lastAtk > ZOMBIE.atkCd) {
          z.lastAtk = now;
          this.damage(best, Math.round(ZOMBIE.dmg * (z.dmgMul || 1)), { id: z.id, name: z.name, kills: 0 });
          this.events.push({ k: 'zombieAtk', id: z.id, to: best.id });
        }
      } else {
        z.st = 'wander';
        if (Math.hypot(z.wx - z.x, z.wz - z.z) < 1 || Math.random() < 0.01) {
          const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 6;
          z.wx = z.spawnX + Math.cos(a) * r; z.wz = z.spawnZ + Math.sin(a) * r;
        }
        const dx = z.wx - z.x, dz = z.wz - z.z, d = Math.hypot(dx, dz);
        if (d > 0.3) {
          const nx = z.x + dx / d * speed * 0.5, nz = z.z + dz / d * speed * 0.5;
          if (this.walkable(nx, z.z)) z.x = nx;
          if (this.walkable(z.x, nz)) z.z = nz;
        }
      }
    }
  }

  // 陷阱机关：玩家踩中压力板后触发范围伤害
  tickTraps(now) {
    for (const tr of this.traps) {
      if (now < tr.cdUntil) continue;
      let trig = null;
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        if (Math.hypot(p.x - tr.x, p.z - tr.z) < 1.2) { trig = p; break; }
      }
      if (!trig) continue;
      const def = TRAPS[tr.type] || TRAPS.dart;
      tr.cdUntil = now + def.cd;
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        if (Math.hypot(p.x - tr.x, p.z - tr.z) < def.radius) {
          this.damage(p, def.dmg, { id: 'trap', name: def.name, kills: 0 });
        }
      }
      this.events.push({ k: 'trap', id: tr.id, type: tr.type, x: tr.x, z: tr.z, by: trig.id, byName: trig.name });
    }
  }

  // 危害区域：坍塌危险区，计时对范围内玩家造成伤害
  tickHazards(now) {
    if (now - this._hazTick < HAZARD.tick) return;
    this._hazTick = now;
    let hit = false;
    for (const h of this.hazards) {
      if (h.until && now > h.until) continue;
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        if (Math.hypot(p.x - h.x, p.z - h.z) < h.r) {
          this.damage(p, HAZARD.dmg, { id: 'hazard', name: '坍塌危害', kills: 0 });
          hit = true;
        }
      }
    }
    if (hit) this.events.push({ k: 'hazardTick' });
    // 清除过期临时危害
    if (this.hazards.some(h => h.until && now > h.until)) {
      const removed = this.hazards.filter(h => h.until && now > h.until).map(h => h.id);
      this.hazards = this.hazards.filter(h => !(h.until && now > h.until));
      for (const id of removed) this.events.push({ k: 'hazardRemove', id });
    }
  }

  // 随机事件：尸潮 / 塌方，增加重复游玩的变化
  tickRandomEvents(now) {
    if (this.phase !== 'tomb') return;
    if (now < this._nextEvent) return;
    this._nextEvent = now + 50000 + Math.floor(Math.random() * 35000);
    const pick = Math.random() < 0.5 ? 'surge' : 'collapse';
    if (pick === 'surge') {
      const alive = [...this.players.values()].filter(p => p.st === 'alive');
      if (!alive.length) return;
      const anchor = alive[Math.floor(Math.random() * alive.length)];
      for (let k = 0; k < 3; k++) {
        const ox = (Math.random() - 0.5) * 4, oz = (Math.random() - 0.5) * 4;
        const x = anchor.x + ox, z = anchor.z + oz;
        const variant = ['normal', 'swift', 'brute', 'burst'][Math.floor(Math.random() * 4)];
        const v = ZOMBIE_VARIANTS[variant];
        const hp = Math.round(ZOMBIE.hp * v.hp);
        this.zombies.push({
          id: 'z' + nextEntityId++, x, z, variant, name: v.name,
          hp, maxHp: hp, dmgMul: v.dmg, st: 'chase', outside: false,
          tgt: null, path: null, pathAt: 0, lastAtk: 0, deadUntil: 0,
          spawnX: x, spawnZ: z, wx: x, wz: z,
        });
      }
      this.events.push({ k: 'rampage', text: '⚠ 尸潮涌动！古墓杀机骤起', kind: 'surge' });
    } else {
      const anchor = [...this.players.values()].filter(p => p.st === 'alive');
      if (!anchor.length) return;
      const a = anchor[Math.floor(Math.random() * anchor.length)];
      const id = 'haz' + nextEntityId++;
      const haz = { id, x: a.x, z: a.z, r: 3.0, until: now + 22000, temp: true };
      this.hazards.push(haz);
      this.events.push({ k: 'hazardAdd', hazard: haz });
      this.events.push({ k: 'rampage', text: '⚠ 墓道塌方！速速撤离危险区', kind: 'collapse' });
    }
  }

  followPath(ent, path, step) {
    if (!path || !path.length) return;
    let [tx, tz] = path[0];
    const dx = tx - ent.x, dz = tz - ent.z, d = Math.hypot(dx, dz);
    if (d < 0.5) { path.shift(); return; }
    const nx = ent.x + dx / d * step, nz = ent.z + dz / d * step;
    if (this.walkable(nx, ent.z)) ent.x = nx;
    if (this.walkable(ent.x, nz)) ent.z = nz;
    ent.ry = Math.atan2(dx, dz);
  }

  walkable(x, z) {
    const ci = Math.floor(x / this.map.cell + this.map.w / 2);
    const cj = Math.floor(z / this.map.cell + this.map.h / 2);
    if (ci < 0 || cj < 0 || ci >= this.map.w || cj >= this.map.h) return false;
    return this.map.rows[cj][ci] === '1';
  }

  // 道具+武器自动拾取
  tickPickups() {
    for (const it of this.items) {
      if (it.taken) continue;
      for (const p of this.players.values()) {
        if (p.st !== 'alive' || p.hotbar.length >= 4) continue;
        if (Math.hypot(p.x - it.x, p.z - it.z) < 1.1) {
          it.taken = true;
          p.hotbar.push({ type: it.type, n: 1 });
          this.events.push({ k: 'pickup', id: p.id, item: it.id, ptype: it.type });
          this.sendHotbar(p);
          break;
        }
      }
    }
    // 武器拾取
    for (const ws of this.weaponSpawns) {
      if (ws.taken) continue;
      for (const p of this.players.values()) {
        if (p.st !== 'alive') continue;
        if (Math.hypot(p.x - ws.x, p.z - ws.z) < 1.2) {
          ws.taken = true;
          p.weapon = ws.type;
          p.ammo = ALL_WEAPONS[ws.type].ammo || 0;
          p.coins += COIN_REWARDS.pickup;
          this.events.push({ k: 'pickupW', id: p.id, wid: ws.id, weapon: ws.type });
          this.events.push({ k: 'coins', id: p.id, coins: p.coins, gain: COIN_REWARDS.pickup, reason: '寻得武器' });
          this.sendWeapon(p);
          break;
        }
      }
    }
  }

  tickExtract(now) {
    if (!this.exitsOpen) return;
    for (const p of this.players.values()) {
      if (p.st !== 'alive') { p.extractProg = 0; continue; }
      const inExit = this.map.exits.some(e => Math.hypot(p.x - e.x, p.z - e.z) < 2.4);
      if (!inExit) { if (p.extractProg) { p.extractProg = 0; this.sendTo(p, { t: 'extractProg', prog: 0 }); } continue; }
      p.extractProg += TICK_MS;
      if (p.extractProg % 500 < TICK_MS) this.sendTo(p, { t: 'extractProg', prog: Math.min(1, p.extractProg / EXTRACT_TIME) });
      if (p.extractProg >= EXTRACT_TIME) {
        p.st = 'out';
        const bagVal = this.bagValue(p);
        p.banked += bagVal;
        if (p.coins !== undefined) {
          const gain = Math.round(bagVal * COIN_REWARDS.extract);
          p.coins += gain;
          this.events.push({ k: 'coins', id: p.id, coins: p.coins, gain, reason: '撤离' });
        }
        const got = p.bag.splice(0);
        this.events.push({ k: 'extract', id: p.id, name: p.name, value: p.banked, items: got.length });
      }
    }
  }

  tickRespawns(now) {
    for (const p of this.players.values()) {
      if (p.bot && p.st === 'dead' && p.respawnAt && now >= p.respawnAt) {
        const c = CHARS[p.char];
        p.hp = c.hp; p.st = 'alive'; p.x = p.spawnX; p.z = p.spawnZ;
        p.buffs = {}; p.extractProg = 0; p.weapon = 'fist'; p.ammo = 0;
        this.events.push({ k: 'respawn', id: p.id });
        this.sendWeapon(p);
      }
    }
  }

  // ---------- 机器人 AI ----------
  tickBot(b, now) {
    if (b.st === 'dead' || b.st === 'out' || this.phase === 'loadout') return;
    const ai = b.ai;
    if (this.phase === 'outside') {
      const d = Math.hypot(this.map.door.x - b.x, this.map.door.z - b.z);
      if (d > 2.1) {
        if (!ai.path || !ai.path.length || now - ai.pathAt > 1500) { ai.path = findPath(this.map, b.x, b.z, this.map.door.x, this.map.door.z); ai.pathAt = now; }
        this.followPath(b, ai.path, BASE_SPEED * CHARS[b.char].speed * TICK_MS / 1000);
      }
      return;
    }
    const c = CHARS[b.char];
    let mul = c.speed;
    if (b.buffs.slow > now) mul *= 0.5;
    const speed = BASE_SPEED * mul * TICK_MS / 1000;

    if (now >= ai.thinkAt) {
      ai.thinkAt = now + 250 + Math.random() * 300;
      if (b.hp < c.hp * 0.45) {
        const si = b.hotbar.findIndex(h => h.type === 'heal');
        if (si >= 0) this.useItem(b, si);
      }
      let enemy = null, ed = 7;
      for (const q of this.players.values()) {
        if (q.id === b.id || q.st !== 'alive') continue;
        const d = Math.hypot(q.x - b.x, q.z - b.z);
        if (d < ed) { ed = d; enemy = q; }
      }
      for (const z of this.zombies) {
        if (z.hp <= 0) continue;
        const d = Math.hypot(z.x - b.x, z.z - b.z);
        if (d < Math.min(ed, 5)) { ed = d; enemy = z; }
      }
      ai.tgtEnemy = enemy;

      if (enemy) ai.mode = 'fight';
      else if (this.exitsOpen && (this.bagValue(b) >= 500 || this.endAt - now < 70000)) ai.mode = 'extract';
      else {
        let bag = null, gd = 14;
        for (const g of this.dropBags) {
          const d = Math.hypot(g.x - b.x, g.z - b.z);
          if (d < gd) { gd = d; bag = g; }
        }
        if (bag) { ai.mode = 'grab'; ai.tgtBag = bag; }
        else ai.mode = 'loot';
      }
      if (ai.mode === 'loot') {
        let chest = null, cd = Infinity;
        for (const ch of this.chests) {
          if (ch.open && !ch.loot.length) continue;
          const d = Math.hypot(ch.x - b.x, ch.z - b.z) * (ch.big ? 0.7 : 1);
          if (d < cd) { cd = d; chest = ch; }
        }
        if (chest && (!ai.tgtChest || ai.tgtChest.id !== chest.id)) {
          ai.tgtChest = chest;
          ai.path = findPath(this.map, b.x, b.z, chest.x, chest.z);
        }
      }
      if (ai.mode === 'extract' && now - ai.pathAt > 2000) {
        ai.pathAt = now;
        let exit = this.map.exits[0], xd = Infinity;
        for (const e of this.map.exits) { const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < xd) { xd = d; exit = e; } }
        ai.tgtExit = exit;
        ai.path = findPath(this.map, b.x, b.z, exit.x, exit.z);
      }
    }

    if (ai.mode === 'fight' && ai.tgtEnemy) {
      const e = ai.tgtEnemy;
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      b.ry = Math.atan2(e.x - b.x, e.z - b.z);
      const w = ALL_WEAPONS[b.weapon];
      if (w.type === 'ranged' && b.ammo > 0 && d < w.range && d > 2.5) {
        this.attack(b);
      } else if (d > w.range * 0.85) {
        const step = speed * 1.1;
        const nx = b.x + (e.x - b.x) / d * step, nz = b.z + (e.z - b.z) / d * step;
        if (this.walkable(nx, b.z)) b.x = nx;
        if (this.walkable(b.x, nz)) b.z = nz;
      } else {
        this.attack(b);
      }
      return;
    }

    if (ai.mode === 'extract' && ai.tgtExit) {
      const d = Math.hypot(ai.tgtExit.x - b.x, ai.tgtExit.z - b.z);
      if (d > 1.5) { this.followPath(b, ai.path, speed); b.extractProg = 0; }
      return;
    }

    if (ai.mode === 'grab' && ai.tgtBag) {
      const g = ai.tgtBag;
      if (!this.dropBags.includes(g)) { ai.tgtBag = null; ai.mode = 'loot'; return; }
      const d = Math.hypot(g.x - b.x, g.z - b.z);
      if (d > 1.6) {
        if (!ai.path || now - ai.pathAt > 2500) { ai.path = findPath(this.map, b.x, b.z, g.x, g.z); ai.pathAt = now; }
        this.followPath(b, ai.path, speed);
        b.grabProg = 0;
      } else {
        b.grabProg += TICK_MS;
        if (b.grabProg >= GRAB_TIME) {
          b.grabProg = 0;
          let w = this.bagWeight(b);
          const limit = BAG_LIMIT + (CHARS[b.char].bagBonus || 0);
          const got = [];
          g.loot = g.loot.filter(t => { if (w + t.w <= limit) { got.push(t); w += t.w; return false; } return true; });
          b.bag.push(...got);
          if (!g.loot.length) this.dropBags = this.dropBags.filter(x => x.id !== g.id);
          this.events.push({ k: 'grabbed', id: g.id, by: b.id, byName: b.name, got });
          ai.tgtBag = null; ai.mode = 'loot';
        }
      }
      return;
    }

    const ch = ai.tgtChest;
    if (!ch || (ch.open && !ch.loot.length)) { ai.tgtChest = null; return; }
    const d = Math.hypot(ch.x - b.x, ch.z - b.z);
    if (d > 2.0) {
      if (!ai.path || !ai.path.length) ai.path = findPath(this.map, b.x, b.z, ch.x, ch.z);
      this.followPath(b, ai.path, speed);
      b.openProg = 0;
    } else {
      b.ry = Math.atan2(ch.x - b.x, ch.z - b.z);
      b.openProg += TICK_MS;
      const need = OPEN_TIME * (c.openMul || 1);
      if (b.openProg >= need) {
        b.openProg = 0;
        this.openChest(b, ch);
        ai.tgtChest = null; ai.path = null;
      }
    }
  }

  // ---------- 快照 ----------
  broadcastSnapshot(now) {
    const snap = {
      t: 'snap', now,
      phase: this.phase,
      phaseRemain: this.phase === 'loadout' ? Math.max(0, this.phaseEndAt - now) : 0,
      remain: Math.max(0, this.endAt - now),
      doorOpen: this.doorOpen,
      exitsOpen: this.exitsOpen,
      danger: +this.danger.toFixed(2), openedChests: this.openedChests,
      players: [...this.players.values()].map(p => ({
        id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2),
        hp: p.hp, st: p.st, anim: p.anim || '',
        bv: this.bagValue(p), bw: this.bagWeight(p), bl: BAG_LIMIT + (CHARS[p.char].bagBonus || 0),
        spd: p.buffs.speed > now, arm: p.buffs.armor > now, slow: p.buffs.slow > now,
        weapon: p.weapon, ammo: p.ammo, coins: p.coins, bot:p.bot,
        owned: p.boughtWeapons || [], relations:p.relations || {}, handWith:p.handWith || null,
      })),
      zombies: this.zombies.map(z => ({ id: z.id, x: +z.x.toFixed(2), z: +z.z.toFixed(2), hp: z.hp, maxHp: z.maxHp, st: z.st, ry: +(z.ry || 0).toFixed(2), variant: z.variant, name: z.name })),
      chests: this.chests.map(c => ({ id: c.id, open: c.open, empty: c.open && !c.loot.length, tier: c.tier, big: c.big, route:c.route })),
      items: this.items.filter(i => !i.taken).map(i => i.id),
      weapons: this.weaponSpawns.filter(w => !w.taken).map(w => w.id),
      projectiles: this.projectiles.map(k => ({ id: k.id, x: +k.x.toFixed(2), z: +k.z.toFixed(2) })),
      bags: this.dropBags.map(b => ({ id: b.id, x: +b.x.toFixed(2), z: +b.z.toFixed(2), n: b.loot.length })),
      monsterChests: this.monsterChests.filter(c => !c.taken).map(c => ({ id:c.id, x:c.x, z:c.z, color:c.color, value:c.value })),
      traps: this.traps.map(t => ({ id: t.id, x: t.x, z: t.z, type: t.type })),
      hazards: this.hazards.map(h => ({ id: h.id, x: h.x, z: h.z, r: h.r, temp: !!h.temp })),
      ev: this.events.splice(0),
    };
    this.broadcast(snap);
  }

  endRound() {
    this.state = 'ended';
    clearInterval(this.tickTimer);
    const board = [...this.players.values()]
      .map(p => ({ id: p.id, name: p.name, char: p.char, bot: p.bot, banked: p.banked, kills: p.kills, out: p.st === 'out', carried: this.bagValue(p) }))
      .sort((a, b) => b.banked - a.banked || b.kills - a.kills);
    this.broadcast({ t: 'end', board });
    setTimeout(() => this.destroy(), 30000);
  }

  removePlayer(p) {
    this.players.delete(p.id);
    if (this.state === 'lobby') this.broadcast(this.lobbyInfo());
    else this.events?.push({ k: 'left', id: p.id, name: p.name });
    const reals = [...this.players.values()].filter(q => !q.bot);
    if (!reals.length) this.destroy();
  }

  destroy() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.startTimer) clearInterval(this.startTimer);
    this.onEmpty(this);
  }
}
