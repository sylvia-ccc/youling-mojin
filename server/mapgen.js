// 古墓地图程序化生成：5 套主题地图，开局随机轮换（避免与上一张重复）
import { MAP_W, MAP_H, cellToWorld } from './shared.js';

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

// 宝箱品级：主墓宝棺恒为传说，其余按权重分布
function rollChestTier(big) {
  if (big) return 'legendary';
  const r = Math.random();
  if (r < 0.5) return 'common';
  if (r < 0.8) return 'fine';
  if (r < 0.95) return 'epic';
  return 'legendary';
}

// 尸煞变体：荒院尸群恒为普通，古墓内按权重随机（weights 为空用默认分布）
function rollZombieVariant(outside, weights) {
  if (outside) return 'normal';
  if (weights) {
    const r = Math.random(); let acc = 0;
    for (const k of ['normal', 'swift', 'brute', 'burst']) { acc += (weights[k] || 0); if (r < acc) return k; }
    return 'normal';
  }
  const r = Math.random();
  if (r < 0.45) return 'normal';
  if (r < 0.72) return 'swift';
  if (r < 0.9) return 'brute';
  return 'burst';
}

// 陷阱类型按权重抽取
function pickTrap(trapW) {
  const r = Math.random(); let acc = 0;
  for (const k of ['dart', 'rock', 'gas']) { acc += (trapW[k] || 0); if (r < acc) return k; }
  return 'dart';
}

// ========== 5 套主题：结构参数 + 视觉配色 ==========
export const MAP_THEMES = [
  {
    key: 'earthen', name: '夯土古墓', desc: '幽深夯土墓道，最经典的摸金之地。',
    floor: 0x2e2a24, wall: 0x4a4238, ceil: 0x1c1916, fog: 0x050403, fogDensity: 0.072,
    ambient: 0x8a7a5a, ambientI: 0.34, torch: 0xff9a2e, outsideGround: 0x3a3425, accent: 0xc8a44d,
    opts: { roomCount: 10, roomMin: 4, roomMax: 8, wideChance: 0.3, twist: 0.6,
            zombieCount: 10, trapCount: 10, hazardCount: 3, hazardR: 3.0, itemCount: 10, weaponCount: 14,
            variantW: null, trapW: { dart: 0.34, rock: 0.33, gas: 0.33 } },
  },
  {
    key: 'bronze', name: '青铜祭坛', desc: '青铜礼器林立的祭奠之殿，明器丰沛。',
    floor: 0x2a2c20, wall: 0x495436, ceil: 0x14160e, fog: 0x070a05, fogDensity: 0.064,
    ambient: 0x9a8f5a, ambientI: 0.4, torch: 0xffb24d, outsideGround: 0x363a28, accent: 0x7fae5a,
    opts: { roomCount: 7, roomMin: 6, roomMax: 10, wideChance: 0.55, twist: 0.4,
            zombieCount: 9, trapCount: 8, hazardCount: 2, hazardR: 3.0, itemCount: 12, weaponCount: 16,
            variantW: { normal: 0.4, swift: 0.25, brute: 0.2, burst: 0.15 }, trapW: { dart: 0.3, rock: 0.3, gas: 0.4 } },
  },
  {
    key: 'ice', name: '冰封地宫', desc: '万年玄冰封存的地宫，空旷而凛冽。',
    floor: 0x223038, wall: 0x3a5a68, ceil: 0x14222a, fog: 0x0a1820, fogDensity: 0.058,
    ambient: 0x7fb8d8, ambientI: 0.46, torch: 0xbfe6ff, outsideGround: 0x2a404a, accent: 0x7fd0ff,
    opts: { roomCount: 8, roomMin: 6, roomMax: 9, wideChance: 0.6, twist: 0.5,
            zombieCount: 9, trapCount: 7, hazardCount: 4, hazardR: 3.2, itemCount: 10, weaponCount: 14,
            variantW: { normal: 0.45, swift: 0.3, brute: 0.1, burst: 0.15 }, trapW: { dart: 0.4, rock: 0.2, gas: 0.4 } },
  },
  {
    key: 'poison', name: '毒雾沼泽', desc: '瘴气弥漫的蜿蜒墓道，步步惊心。',
    floor: 0x222a1e, wall: 0x33402a, ceil: 0x101408, fog: 0x0c1608, fogDensity: 0.1,
    ambient: 0x6a8a4a, ambientI: 0.3, torch: 0x9fe04d, outsideGround: 0x2c3826, accent: 0x6abf4d,
    opts: { roomCount: 12, roomMin: 3, roomMax: 6, wideChance: 0.18, twist: 0.82,
            zombieCount: 13, trapCount: 14, hazardCount: 5, hazardR: 2.6, itemCount: 12, weaponCount: 16,
            variantW: { normal: 0.5, swift: 0.3, brute: 0.1, burst: 0.1 }, trapW: { dart: 0.2, rock: 0.2, gas: 0.6 } },
  },
  {
    key: 'flame', name: '烈焰熔窟', desc: '熔岩奔流的火窟，重装尸煞横行。',
    floor: 0x2a1410, wall: 0x3a1e16, ceil: 0x140806, fog: 0x100402, fogDensity: 0.082,
    ambient: 0xa05030, ambientI: 0.36, torch: 0xff5a1e, outsideGround: 0x301812, accent: 0xff6a2a,
    opts: { roomCount: 9, roomMin: 5, roomMax: 8, wideChance: 0.35, twist: 0.6,
            zombieCount: 10, trapCount: 11, hazardCount: 6, hazardR: 3.4, itemCount: 10, weaponCount: 13,
            variantW: { normal: 0.3, swift: 0.2, brute: 0.3, burst: 0.2 }, trapW: { dart: 0.25, rock: 0.5, gas: 0.25 } },
  },
];

// 参数化生成一张地图（结构随 opts 变化，视觉由调用方附加 theme）
function buildMapData(o) {
  const W = MAP_W, H = MAP_H;
  const cells = new Uint8Array(W * H); // 0=墙 1=地板
  const at = (i, j) => cells[j * W + i];
  const set = (i, j, v) => { if (i > 0 && j > 0 && i < W - 1 && j < H - 1) cells[j * W + i] = v; };
  const carveRect = (x, y, w, h) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, 1); };

  // ---- 1. 挖墓室 ----
  const rooms = [];
  const cw = 11, ch = 11;
  const cx = Math.floor(W / 2 - cw / 2), cy = Math.floor(H / 2 - ch / 2);
  carveRect(cx, cy, cw, ch);
  const mainRoom = { x: cx, y: cy, w: cw, h: ch, cx: W / 2 | 0, cy: H / 2 | 0, main: true };
  rooms.push(mainRoom);

  let tries = 0;
  while (rooms.length < o.roomCount && tries++ < 500) {
    const w = rnd(o.roomMin, o.roomMax), h = rnd(o.roomMin, o.roomMax);
    const x = rnd(2, W - w - 3), y = rnd(2, H - h - 3);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) { ok = false; break; }
    }
    if (!ok) continue;
    carveRect(x, y, w, h);
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }

  // ---- 2. 挖甬道（L形，连接各墓室到主墓室 + 相邻串联）----
  function corridor(x1, y1, x2, y2) {
    let x = x1, y = y1;
    const wide = Math.random() < o.wideChance;
    while (x !== x2) { set(x, y, 1); if (wide) set(x, y + 1, 1); x += Math.sign(x2 - x); }
    while (y !== y2) { set(x, y, 1); if (wide) set(x + 1, y, 1); y += Math.sign(y2 - y); }
    set(x2, y2, 1);
  }
  for (let i = 1; i < rooms.length; i++) {
    corridor(rooms[i].cx, rooms[i].cy, mainRoom.cx, mainRoom.cy);
    if (i > 1 && Math.random() < o.twist) corridor(rooms[i].cx, rooms[i].cy, rooms[i - 1].cx, rooms[i - 1].cy);
  }

  // ---- 墓外荒院 + 唯一墓门 ----
  const outside = { x: (W >> 1) - 7, y: 2, w: 15, h: 8 };
  carveRect(outside.x, outside.y, outside.w, outside.h);
  const door = { i: W >> 1, j: outside.y + outside.h };
  set(door.i, door.j, 1);
  corridor(door.i, door.j, mainRoom.cx, mainRoom.cy);

  // ---- 三路线语义：按墓室距墓门的深入程度划分安全/机关/凶险 ----
  const routeDefs = {
    safe: { key:'safe', name:'安途', desc:'尸煞较少，适合稳妥搜寻', color:0x4f9d72 },
    mechanism: { key:'mechanism', name:'机巧道', desc:'机关密集，明器收益更高', color:0xc39a45 },
    danger: { key:'danger', name:'凶煞径', desc:'强敌盘踞，高品棺椁更多', color:0xb44335 },
  };
  const routeRooms = [...rooms].filter(r => !r.main).sort((a, b) =>
    (Math.abs(a.cx - door.i) + Math.abs(a.cy - door.j)) - (Math.abs(b.cx - door.i) + Math.abs(b.cy - door.j)));
  const nRooms = Math.max(1, routeRooms.length);
  routeRooms.forEach((r, idx) => { const q = idx / nRooms; r.route = q < .34 ? 'safe' : q < .68 ? 'mechanism' : 'danger'; });
  mainRoom.route = 'danger';
  function routeAt(i, j) {
    let best = mainRoom, bd = Infinity;
    for (const r of rooms) { const d = Math.abs(i - r.cx) + Math.abs(j - r.cy); if (d < bd) { bd = d; best = r; } }
    return best.route || 'safe';
  }

  // ---- 3. 连通性校验（洪水填充，不连通处补洞）----
  const seen = new Uint8Array(W * H);
  const q = [[mainRoom.cx, mainRoom.cy]];
  seen[mainRoom.cy * W + mainRoom.cx] = 1;
  while (q.length) {
    const [i, j] = q.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni >= 0 && nj >= 0 && ni < W && nj < H && at(ni, nj) === 1 && !seen[nj * W + ni]) {
        seen[nj * W + ni] = 1; q.push([ni, nj]);
      }
    }
  }
  for (const r of rooms) {
    if (!seen[r.cy * W + r.cx]) corridor(r.cx, r.cy, mainRoom.cx, mainRoom.cy);
  }

  // ---- 辅助：随机地板格 ----
  const occupied = new Set();
  const key = (i, j) => j * W + i;
  function randomFloor(pred) {
    for (let t = 0; t < 300; t++) {
      const i = rnd(1, W - 2), j = rnd(1, H - 2);
      if (at(i, j) === 1 && (!pred || pred(i, j))) return [i, j];
    }
    return null;
  }

  // ---- 4. 出生点：墓外荒院 ----
  const spawns = [];
  const spawnCells = [
    [outside.x + 2, outside.y + 2], [outside.x + 5, outside.y + 2],
    [outside.x + 8, outside.y + 2], [outside.x + 11, outside.y + 2],
    [outside.x + 3, outside.y + 5], [outside.x + 7, outside.y + 5],
    [outside.x + 10, outside.y + 5], [outside.x + 12, outside.y + 5],
  ];
  for (const s of spawnCells) { spawns.push(s); occupied.add(key(s[0], s[1])); }

  // ---- 5. 棺椁/宝匣：主墓室中央大宝棺 + 各墓室普通棺 ----
  const chests = [];
  let cid = 0;
  chests.push({ id: cid++, i: mainRoom.cx, j: mainRoom.cy, big: true, tier: 'legendary' });
  occupied.add(key(mainRoom.cx, mainRoom.cy));
  for (const r of rooms) {
    if (r.main) continue;
    const n = rnd(1, 2);
    for (let k = 0; k < n; k++) {
      const i = rnd(r.x, r.x + r.w - 1), j = rnd(r.y, r.y + r.h - 1);
      if (!occupied.has(key(i, j))) {
        const route = r.route || 'safe';
        let tier = rollChestTier(false);
        if ((route === 'mechanism' || route === 'danger') && tier === 'common' && Math.random() < .55) tier = 'fine';
        chests.push({ id: cid++, i, j, big: false, tier, route });
        occupied.add(key(i, j));
      }
    }
  }

  // ---- 6. 撤离点：离主墓室最远的两个墓室 ----
  const byDist = [...rooms].filter(r => !r.main)
    .sort((a, b) => (Math.abs(b.cx - mainRoom.cx) + Math.abs(b.cy - mainRoom.cy)) - (Math.abs(a.cx - mainRoom.cx) + Math.abs(a.cy - mainRoom.cy)));
  const exits = byDist.slice(0, 2).map(r => { occupied.add(key(r.cx, r.cy)); return { i: r.cx, j: r.cy }; });

  // ---- 7. 地面道具 ----
  const itemKinds = ['heal', 'heal', 'speed', 'armor', 'heal', 'speed'];
  const items = [];
  let iid = 0;
  for (let k = 0; k < o.itemCount; k++) {
    const f = randomFloor((i, j) => !occupied.has(key(i, j)));
    if (!f) continue;
    occupied.add(key(f[0], f[1]));
    items.push({ id: iid++, type: itemKinds[k % itemKinds.length], i: f[0], j: f[1] });
  }

  // ---- 7b. 地面武器 ----
  const weaponKinds = ['sword', 'dagger', 'spear', 'hammer', 'crossbow', 'dart', 'firelock', 'sword', 'crossbow', 'dart', 'spear', 'hammer'];
  const weapons = [];
  let wid = 0;
  for (let k = 0; k < o.weaponCount; k++) {
    const f = randomFloor((i, j) => !occupied.has(key(i, j)));
    if (!f) continue;
    occupied.add(key(f[0], f[1]));
    weapons.push({ id: wid++, type: weaponKinds[k % weaponKinds.length], i: f[0], j: f[1] });
  }

  // ---- 8. 火把：沿墙地板格 ----
  const torches = [];
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    if (at(i, j) !== 1) continue;
    const nearWall = at(i + 1, j) === 0 || at(i - 1, j) === 0 || at(i, j + 1) === 0 || at(i, j - 1) === 0;
    if (nearWall && (i * 7 + j * 13) % 9 === 0) torches.push({ i, j });
  }

  // ---- 9. 尸煞点 ----
  const zombieSpawns = [];
  const outsideMonsters = [
    [outside.x + 2, outside.y + 6], [outside.x + 6, outside.y + 4],
    [outside.x + 10, outside.y + 6], [outside.x + 12, outside.y + 3],
  ];
  for (const f of outsideMonsters) { zombieSpawns.push({ p: f, variant: 'normal' }); occupied.add(key(f[0], f[1])); }
  for (let k = 0; k < o.zombieCount; k++) {
    const f = randomFloor((i, j) =>
      j > door.j + 3 && !occupied.has(key(i, j)) &&
      Math.abs(i - mainRoom.cx) + Math.abs(j - mainRoom.cy) < 30);
    if (f) {
      const route = routeAt(f[0], f[1]);
      let variant = rollZombieVariant(false, o.variantW);
      if (route === 'safe' && (variant === 'brute' || variant === 'burst')) variant = Math.random() < .6 ? 'normal' : 'swift';
      if (route === 'danger' && variant === 'normal' && Math.random() < .62) variant = Math.random() < .55 ? 'brute' : 'burst';
      zombieSpawns.push({ p: f, variant, route });
      occupied.add(key(f[0], f[1]));
    }
  }

  // ---- 11. 陷阱机关：古墓甬道与墓室地板（压力板）----
  const traps = [];
  let tid = 0;
  for (let k = 0; k < o.trapCount; k++) {
    const f = randomFloor((i, j) => j > door.j + 4 && !occupied.has(key(i, j)));
    if (!f) continue;
    const route = routeAt(f[0], f[1]);
    if (route === 'safe' && Math.random() < .65) continue;
    occupied.add(key(f[0], f[1]));
    traps.push({ id: tid++, i: f[0], j: f[1], type: pickTrap(o.trapW), route });
  }

  // ---- 12. 危害区域：墓道局部坍塌/险地（计时危险区）----
  const hazards = [];
  let hid = 0;
  for (let k = 0; k < o.hazardCount; k++) {
    const f = randomFloor((i, j) =>
      j > door.j + 6 && !occupied.has(key(i, j)) &&
      Math.abs(i - mainRoom.cx) + Math.abs(j - mainRoom.cy) < 18);
    if (!f) continue;
    occupied.add(key(f[0], f[1]));
    hazards.push({ id: hid++, i: f[0], j: f[1] });
  }

  // ---- 10. 输出世界坐标 ----
  const chestsW = chests.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { id: c.id, x, z, big: c.big, tier: c.tier, route: c.route || routeAt(c.i, c.j) }; });
  const itemsW = items.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { id: c.id, type: c.type, x, z }; });
  const weaponsW = weapons.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { id: c.id, type: c.type, x, z }; });
  const exitsW = exits.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { x, z }; });
  const spawnsW = spawns.map(c => { const [x, z] = cellToWorld(c[0], c[1], W, H); return { x, z }; });
  const torchesW = torches.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { x, z }; });
  const zombieSpawnsW = zombieSpawns.map((c, idx) => { const [x, z] = cellToWorld(c.p[0], c.p[1], W, H); return { x, z, variant: c.variant, route: c.route || (idx < outsideMonsters.length ? 'safe' : routeAt(c.p[0], c.p[1])), outside: idx < outsideMonsters.length }; });
  const trapsW = traps.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { id: c.id, x, z, type: c.type, route: c.route || routeAt(c.i, c.j) }; });
  const hazardsW = hazards.map(c => { const [x, z] = cellToWorld(c.i, c.j, W, H); return { id: c.id, x, z, r: o.hazardR }; });
  const [doorX, doorZ] = cellToWorld(door.i, door.j, W, H);
  const outsideZone = {
    minX: cellToWorld(outside.x, outside.y, W, H)[0] - 1,
    maxX: cellToWorld(outside.x + outside.w - 1, outside.y, W, H)[0] + 1,
    minZ: cellToWorld(outside.x, outside.y, W, H)[1] - 1,
    maxZ: doorZ - 1,
  };

  const regions = rooms.map((r, idx) => {
    const min = cellToWorld(r.x, r.y, W, H);
    const max = cellToWorld(r.x + r.w - 1, r.y + r.h - 1, W, H);
    const def = routeDefs[r.route || 'safe'];
    return { id:'route' + idx, route:def.key, name:def.name, desc:def.desc, color:def.color,
      minX:min[0] - 1, maxX:max[0] + 1, minZ:min[1] - 1, maxZ:max[1] + 1, main:!!r.main };
  });

  // cells 转成行字符串（"0"/"1"）
  const rows = [];
  for (let j = 0; j < H; j++) { let s = ''; for (let i = 0; i < W; i++) s += at(i, j); rows.push(s); }

  return { w: W, h: H, cell: 2, rows, regions, chests: chestsW, items: itemsW, weapons: weaponsW, exits: exitsW, spawns: spawnsW, torches: torchesW, zombieSpawns: zombieSpawnsW, traps: trapsW, hazards: hazardsW, door: { x: doorX, z: doorZ }, outside: outsideZone };
}

// 随机选一张主题地图；prevKey 非空时避免与上一张重复（实现“不停轮换”）
let _lastKey = null;
export function generateMap(prevKey) {
  const avoid = prevKey || _lastKey;
  let pool = MAP_THEMES;
  if (avoid) pool = pool.filter(t => t.key !== avoid);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  _lastKey = pick.key;
  const map = buildMapData(pick.opts);
  map.theme = {
    key: pick.key, name: pick.name, desc: pick.desc,
    floor: pick.floor, wall: pick.wall, ceil: pick.ceil, fog: pick.fog, fogDensity: pick.fogDensity,
    ambient: pick.ambient, ambientI: pick.ambientI, torch: pick.torch, outsideGround: pick.outsideGround, accent: pick.accent,
  };
  return map;
}

// 网格寻路 A*（4 向），供尸煞/机器人使用
export function findPath(map, sx, sz, tx, tz) {
  const W = map.w, H = map.h;
  const pass = (i, j) => i >= 0 && j >= 0 && i < W && j < H && map.rows[j][i] === '1';
  const s = [Math.floor(sx / map.cell + W / 2), Math.floor(sz / map.cell + H / 2)];
  const t = [Math.floor(tx / map.cell + W / 2), Math.floor(tz / map.cell + H / 2)];
  if (!pass(t[0], t[1]) || !pass(s[0], s[1])) return null;
  const open = [[0, s[0], s[1]]];
  const gScore = new Map([[s[1] * W + s[0], 0]]);
  const came = new Map();
  const h = (i, j) => Math.abs(i - t[0]) + Math.abs(j - t[1]);
  let found = false, guard = 0;
  while (open.length && guard++ < 4000) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, ci, cj] = open.splice(bi, 1)[0];
    if (ci === t[0] && cj === t[1]) { found = true; break; }
    const cg = gScore.get(cj * W + ci);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (!pass(ni, nj)) continue;
      const ng = cg + 1;
      if (ng < (gScore.get(nj * W + ni) ?? Infinity)) {
        gScore.set(nj * W + ni, ng);
        came.set(nj * W + ni, cj * W + ci);
        open.push([ng + h(ni, nj), ni, nj]);
      }
    }
  }
  if (!found) return null;
  const path = [];
  let cur = t[1] * W + t[0];
  while (cur !== undefined) {
    const i = cur % W, j = (cur / W) | 0;
    path.push([(i - W / 2 + 0.5) * map.cell, (j - H / 2 + 0.5) * map.cell]);
    cur = came.get(cur);
  }
  path.reverse();
  return path;
}
