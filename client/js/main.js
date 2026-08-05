// 《幽陵摸金》客户端主逻辑
import * as THREE from '../vendor/three.module.js';
import { Net } from './net.js';
import { HUD } from './hud.js';
import { createScene, buildMap, makeCharacter, makeNameTag, makeZombie, makeItem, makeWeaponPickup, makeLootBag, makeMonsterChest, makeProjectile, makeTrap, makeHazard, applyHeldWeapon, WALL_H } from './world.js';

const $ = id => document.getElementById(id);
const BASE_SPEED = 4.2;

const MENU_CHARS = {
  mofeng:   { name:'墨锋',  gender:'男', color:0xc8a44d, skill:'剑意', desc:'近战伤害+30%',       stats:'血100 攻28 速1.0' },
  shuangye: { name:'霜叶',  gender:'女', color:0x6a8ec8, skill:'影遁', desc:'闪避25%',            stats:'血80 攻22 速1.15' },
  leizhen:  { name:'雷震',  gender:'男', color:0xb0623a, skill:'震击', desc:'近战附带范围伤害',    stats:'血140 攻30 速0.9' },
  liuyan:   { name:'柳烟',  gender:'女', color:0x4dc86e, skill:'回春', desc:'回血效果翻倍',        stats:'血90 攻18 速1.0' },
  tieshan:  { name:'铁山',  gender:'男', color:0x6a6258, skill:'铁壁', desc:'受伤减免20%',         stats:'血150 攻22 速0.85' },
  yueyao:   { name:'月瑶',  gender:'女', color:0x7a5fc0, skill:'寒霜', desc:'命中附带减速2秒',     stats:'血85 攻20 速1.05' },
  fengsun:  { name:'风隼',  gender:'男', color:0x3f9e9e, skill:'鹰眼', desc:'远程伤害+50%',        stats:'血90 攻18 速1.1' },
  hongchen: { name:'红尘',  gender:'女', color:0xc86a4d, skill:'妙手', desc:'开棺速度翻倍',        stats:'血85 攻20 速1.1' },
  canglang: { name:'苍狼',  gender:'男', color:0x8a5a3a, skill:'狂战', desc:'血量<40%时攻击+50%',  stats:'血110 攻25 速1.0' },
  qingluan: { name:'青鸾',  gender:'女', color:0xc84d8a, skill:'灵巧', desc:'移速+20% 闪避15%',    stats:'血80 攻18 速1.2' },
};

// ---------- 简易合成音效 ----------
const SFX = {
  ctx: null,
  ensure() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  play(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
    try {
      this.ensure();
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), this.ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch {}
  },
  swing() { this.play(300, 0.12, 'sawtooth', 0.06, -220); },
  hit() { this.play(140, 0.15, 'square', 0.12, -60); },
  hurt() { this.play(90, 0.25, 'sawtooth', 0.14, -40); },
  ding() { this.play(880, 0.2, 'sine', 0.12, 220); },
  open() { this.play(180, 0.5, 'triangle', 0.12, 100); },
  extract() { this.play(520, 0.6, 'sine', 0.14, 300); },
  death() { this.play(200, 0.8, 'sawtooth', 0.16, -160); },
  growl() { this.play(70, 0.4, 'sawtooth', 0.1, 20); },
  throwK() { this.play(600, 0.1, 'sine', 0.08, -350); },
  pickup() { this.play(700, 0.15, 'sine', 0.1, 200); },
};

// ---------- 全局状态 ----------
const G = {
  net: new Net(), hud: new HUD(),
  myId: null, myChar: 'mofeng', myName: '',
  renderer: null, scene: null, camera: null,
  world: null, map: null, chars: null, weapons: null, itemDefs: null,
  playing: false,
  yaw: 0, pitch: 0, viewMode: 0,
  camDist: 4.3, camX: 0, camZ: 0, camY: 2.5,
  camShoulder: 1, camShoulderX: 0.68, charFade: 1, charFadeMaterials: [],
  px: 0, pz: 0, keys: {}, running: false,
  remotes: new Map(),
  zombies: new Map(),
  itemMeshes: new Map(),
  weaponMeshes: new Map(),
  bagMeshes: new Map(), monsterChestMeshes:new Map(),
  trapMeshes: new Map(), hazardMeshes: new Map(), explodeFx: [],
  projFx: [], relations:{}, handWith:null, relationMenu:null,
  chestStates: new Map(),
  bags: [],
  hotbar: [],
  myWeapon: 'fist', myAmmo: 0,
  exitsOpen: false,
  myState: 'alive', myBanked: 0,
  deadUntil: 0, adoptPos: false,
  torchLights: [], torchPts: [],
  flashlight: null,
  lastStSend: 0, lastOpenSend: 0,
  eHeld: false, atkHeld: false, lastAtkFx: 0,
  interact: null,
  endAt: 0,
  buffSlow: false,
  coins: 200000, shop: {}, ownedWeapons: [], shopOpen: false, shopPendingWeapon: null,
  phase: 'loadout', doorOpen: false,
  touchCapable: matchMedia('(pointer: coarse)').matches || matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0 || (matchMedia('(orientation: landscape)').matches && innerWidth <= 1366),
  touchMove: { x: 0, y: 0 }, touchLookId: null, touchJoyId: null,
  renderScale: 1, fpsFrames: 0, fpsAt: performance.now(),
  lastTorchSelect: 0, selectedTorchPts: [], lastInteractScan: 0, lastItemAnim: 0,
  lastMiniMap: 0, lastHudSecond: -1, lastSentPos: { x: 0, z: 0, ry: 0, at: 0 },
  currentRoute: null,
  spectateId: null, returningToMenu: false,
};
const CAMERA_DIR = new THREE.Vector3();
const CHAR_SCREEN_POS = new THREE.Vector3();

// 客户端陷阱显示名（与服务端 TRAPS 同步）
const TRAP_NAMES = { dart: '飞镖机关', rock: '落石机关', gas: '毒气机关' };

// ================= 菜单 =================
function initMenu() {
  const cards = $('charCards');
  cards.innerHTML = '';
  for (const [key, c] of Object.entries(MENU_CHARS)) {
    const div = document.createElement('div');
    div.className = 'char-card' + (key === G.myChar ? ' sel' : '');
    div.innerHTML = `<div class="char-dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></div>
      <div class="char-name">${c.name}</div><div class="char-gender">${c.gender}</div>
      <div class="char-skill">${c.skill}</div><div class="char-desc">${c.desc}</div>
      <div class="char-stats">${c.stats}</div>`;
    div.onclick = () => { G.myChar = key; [...cards.children].forEach(el => el.classList.remove('sel')); div.classList.add('sel'); };
    cards.appendChild(div);
  }
  $('matchBtn').onclick = startMatch;
  $('cancelBtn').onclick = () => { G.net.send({ t: 'leave' }); show('menu'); };
  $('againBtn').onclick = () => location.reload();
  $('shopCloseBtn').onclick = () => toggleShop(false);
  $('relationClose').onclick = () => { if (!$('relationPanel').classList.contains('hidden')) toggleRelationPanel(); };
  $('leaveMatchBtn').onclick = () => leaveMatchToMenu();
  $('spectateNextBtn').onclick = () => cycleSpectate();
  $('nameInput').value = localStorage.getItem('mojin_name') || '';
}

async function startMatch() {
  const name = $('nameInput').value.trim() || '无名氏';
  localStorage.setItem('mojin_name', name);
  G.myName = name;
  try {
    if (!G.net.ws || G.net.ws.readyState !== 1) { wireNet(); await G.net.connect(); }
    let visitorId = localStorage.getItem('mojin_visitor_id');
    if (!visitorId) {
      visitorId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('mojin_visitor_id', visitorId);
    }
    G.net.send({ t: 'join', name, char: G.myChar, visitorId });
    show('lobby');
  } catch { alert('连接服务器失败，请确认服务已启动'); }
}

function show(id) {
  for (const s of ['menu', 'lobby', 'hud', 'end']) $(s).classList.toggle('hidden', s !== id);
  if (id === 'hud') $('hud').classList.remove('hidden');
  const mn = document.getElementById('mapName');
  if (mn && id !== 'hud') mn.style.display = 'none';
}

function livingTeammates() {
  return [...G.remotes.entries()].filter(([id, r]) => id !== G.myId && r.cur?.st === 'alive');
}

function showSpectateTarget() {
  const target = G.remotes.get(G.spectateId);
  if (!target?.cur || target.cur.st !== 'alive') return;
  $('respawnTip').textContent = `正在观战：${G.playerNames?.[G.spectateId] || '摸金队友'}`;
  G.hud.dead(true);
}

function cycleSpectate() {
  const mates = livingTeammates();
  if (!mates.length) return leaveMatchToMenu('没有可观战队友');
  const i = mates.findIndex(([id]) => id === G.spectateId);
  G.spectateId = mates[(i + 1) % mates.length][0];
  showSpectateTarget();
}

function leaveMatchToMenu(message = '') {
  if (G.returningToMenu) return;
  G.returningToMenu = true;
  if (G.net.ws?.readyState === 1) G.net.send({ t: 'leave' });
  G.playing = false; G.myState = 'lobby'; G.spectateId = null; G.shopOpen = false;
  clearContinuousInput();
  G.hud.dead(false); G.hud.out(false); G.hud.prog(null); G.hud.interactTip(null);
  $('shopOverlay').classList.add('hidden'); $('relationPanel').classList.add('hidden');
  document.exitPointerLock?.();
  show('menu'); updateTouchControls();
  if (message) G.hud.announce(message, 1300);
  setTimeout(() => { G.returningToMenu = false; }, 300);
}

// ================= 网络 =================
function wireNet() {
  const n = G.net;
  n.on('joined', m => { G.myId = m.id; });
  n.on('lobby', m => {
    $('lobbyList').innerHTML = m.players.map(p =>
      `<div class="lobby-row"><span>${p.name}${p.id === G.myId ? '（你）' : ''}</span><span class="c">${MENU_CHARS[p.char]?.name || p.char}</span></div>`).join('');
    $('lobbyTip').textContent = `已集结 ${m.players.length}/${m.max} 人 · 真人优先，5 秒后 AI 校尉补位`;
  });
  n.on('start', m => onGameStart(m));
  n.on('snap', m => onSnap(m));
  n.on('hotbar', m => { G.hotbar = m.hotbar; G.hud.hotbar(G.hotbar); });
  n.on('weapon', m => { G.myWeapon = m.weapon; G.myAmmo = m.ammo; G.shopPendingWeapon = null; updateWeaponHUD(); if (G.shopOpen) renderShop(); });
  n.on('shopMsg', m => { G.shopPendingWeapon = null; shopNotice(m.msg, m.ok); renderShop(); if (m.ok) SFX.ding(); });
  n.on('phase', m => setPhase(m.phase));
  n.on('doorProg', m => G.hud.prog(m.prog, '正在开启墓门'));
  n.on('deathState', m => {
    if (m.canSpectate && m.target) { G.spectateId = m.target; showSpectateTarget(); }
    else leaveMatchToMenu('小队已全军覆没');
  });
  n.on('openProg', m => { if (G.interact) G.hud.prog(m.prog, G.interact.big ? '正在开启主墓宝棺' : '正在开棺摸金'); });
  n.on('bagFull', m => { const el=$('bagWeight'); el.textContent=`${m.w}/${m.limit}斤`; el.classList.add('full'); G.hud.announce('背包已满 · 前往撤离或放弃重物', 2200); navigator.vibrate?.([30, 35, 30]); });
  n.on('extractProg', m => { G.hud.prog(m.prog > 0 ? m.prog : null, '正在撤离'); });
  n.on('end', m => onEnd(m));
  n.on('close', () => { if (G.playing) { alert('与服务器断开连接'); location.reload(); } });
}

function onGameStart(m) {
  G.map = m.map; G.chars = m.chars; G.weapons = m.weapons; G.shop = m.shop || {}; G.itemDefs = m.items;
  G.coins = m.coins ?? 200000; G.ownedWeapons = []; G.shopOpen = false;
  G.phase = m.phase || 'loadout'; G.doorOpen = false;
  updateCoinHUD(); renderShop();
  G.endAt = Date.now() + m.roundMs;
  G.respawnMs = m.respawnMs;
  G.hud.setMap(m.map);
  buildWorld(m);
  G.playing = true;
  G.camX = G.px; G.camZ = G.pz; G.camY = 2.5; G.camDist = 4.3;
  G.camShoulder = 1; G.camShoulderX = 0.68; G.charFade = 1; G.charFadeMaterials = [];
  G.currentRoute = null;
  G.myState = 'alive';
  show('hud');
  G.hotbar = [];
  G.myWeapon = 'fist'; G.myAmmo = 0;
  G.hud.hotbar(G.hotbar);
  updateWeaponHUD();
  updateViewLabel();
  const mapName = (m.map.theme && m.map.theme.name) || '幽陵秘墓';
  G.hud.announce('进入「' + mapName + '」· 整备玄兵 20秒后出发', 2600);
  const mnEl = document.getElementById('mapName'); if (mnEl) { mnEl.textContent = mapName; mnEl.style.display = ''; }
  G.adoptPos = true;
  if (G.touchCapable && !localStorage.getItem('mojin_mobile_guide')) $('mobileGuide').classList.remove('hidden');
  toggleShop(true);
}

function updateWeaponHUD() {
  const w = G.weapons?.[G.myWeapon];
  if (w) G.hud.weapon(w.name, w.icon, G.myAmmo, w.type);
}

function updateCoinHUD() {
  if ($('coinValue')) $('coinValue').textContent = G.coins;
  if ($('shopCoins')) $('shopCoins').textContent = G.coins;
}

function renderShop() {
  const grid = $('shopGrid');
  if (!grid) return;
  grid.innerHTML = Object.entries(G.shop).map(([key, w]) => {
    const owned = G.ownedWeapons.includes(key);
    const equipped = G.myWeapon === key;
    const pending = G.shopPendingWeapon === key;
    const poor = !owned && G.coins < w.cost;
    const type = `${w.rarity || '精良'} · ${w.type === 'ranged' ? '远程玄兵' : '近战玄兵'}`;
    const action = equipped ? '当前武器' : owned ? '点击装备' : '点击购入';
    const price = equipped ? '已装备' : owned ? '免费补给' : '◆ ' + w.cost;
    return `<div class="shop-card ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''} ${pending ? 'pending' : ''} ${poor ? 'poor' : ''}" data-weapon="${key}" data-icon="${w.icon}">
      <div class="shop-tier">${type}</div><div class="shop-name">${w.name}</div><div class="shop-desc">${w.desc}</div>
      <div class="shop-stats"><span>伤害 ${w.dmg}</span><span>射程 ${w.range}</span><span>${w.ammo ? '弹药 ' + w.ammo : '范围攻击' + (w.aoe ? ' ✓' : '')}</span></div>
      <div class="shop-buy"><span>${action}</span><b>${price}</b></div></div>`;
  }).join('');
  for (const card of grid.children) card.onclick = () => {
    const weapon = card.dataset.weapon;
    if (G.shopPendingWeapon || G.myWeapon === weapon) return;
    G.shopPendingWeapon = weapon;
    renderShop();
    G.net.send({ t: 'buy', weapon });
    setTimeout(() => { if (G.shopPendingWeapon === weapon) { G.shopPendingWeapon = null; renderShop(); shopNotice('请求超时，请重试', false); } }, 1800);
  };
  updateCoinHUD();
}

function shopNotice(msg, ok) {
  const el = $('shopNotice');
  el.textContent = msg;
  el.className = 'shop-notice ' + (ok ? 'ok' : 'bad');
  setTimeout(() => {
    el.className = 'shop-notice';
    el.innerHTML = G.touchCapable
      ? '点武器购买或装备，完成后点“整备完成”'
      : '点击武器购买或装备 · 按 <b>B</b> 关闭';
  }, 1800);
}

function toggleShop(force) {
  if (!G.playing || G.myState !== 'alive' || G.phase !== 'loadout') return;
  G.shopOpen = force ?? !G.shopOpen;
  $('shopOverlay').classList.toggle('hidden', !G.shopOpen);
  clearContinuousInput();
  if (G.shopOpen) { document.exitPointerLock?.(); renderShop(); }
  else if (!G.touchCapable) document.body.requestPointerLock?.();
  updateTouchControls();
}

function setPhase(phase) {
  if (!phase || G.phase === phase) return;
  G.phase = phase;
  if (phase === 'outside') {
    G.shopOpen = false; $('shopOverlay').classList.add('hidden');
    $('objective').textContent = '目标：穿过荒院尸群，找到并开启墓门';
    G.hud.announce('荒院尸群 · 寻找墓门', 3000);
    if (!G.touchCapable) document.body.requestPointerLock?.();
  } else if (phase === 'tomb') {
    G.doorOpen = true; animateTombDoor();
    $('objective').textContent = '目标：深入古墓，开棺摸金并寻找撤离点';
    G.hud.announce('墓门已开 · 入墓摸金', 3200);
  }
  updateTouchControls();
}

function animateTombDoor() {
  const door = G.world?.tombDoor; if (!door || door.userData.opening) return;
  door.userData.opening = true; const y0 = door.position.y, t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 1100); door.position.y = y0 + k * 3.8; if (k < 1) requestAnimationFrame(step); else door.visible = false; };
  step();
}

function toggleRelationPanel() {
  const panel=$('relationPanel');
  if(!panel.classList.contains('hidden')){panel.classList.add('hidden');G.relationMenu=null;clearContinuousInput();if(!G.touchCapable)document.body.requestPointerLock?.();updateTouchControls();return;}
  let target=null,dist=4;
  for(const [id,r] of G.remotes){if(id===G.myId||!r.cur||r.cur.bot)continue;const d=Math.hypot(r.cur.x-G.px,r.cur.z-G.pz);if(d<dist){dist=d;target=id;}}
  if(!target){G.hud.announce('附近没有真人玩家',1200);return;}
  G.relationMenu=target;clearContinuousInput();document.exitPointerLock?.();panel.classList.remove('hidden');updateTouchControls();
  $('relationTarget').textContent='真人玩家：'+(G.playerNames[target]||'伙伴');
  const types=['爸妈','情侣','闺蜜','兄弟','大佬和小弟','朋友','亲友'];
  $('relationChoices').innerHTML=types.map(x=>`<button data-r="${x}">${x}</button>`).join('');
  for(const b of $('relationChoices').children)b.onclick=()=>G.net.send({t:'bind',target,relation:b.dataset.r});
  $('handBtn').onclick=()=>G.net.send({t:'hand',target});
}

function onSnap(m) {
  if (!G.playing) return;
  if (m.phase && m.phase !== G.phase) setPhase(m.phase);
  G.doorOpen = !!m.doorOpen;
  if (G.phase === 'loadout' && $('loadoutCountdown')) $('loadoutCountdown').textContent = Math.max(0, Math.ceil(m.phaseRemain / 1000));
  const now = performance.now();

  const seen = new Set();
  for (const ps of m.players) {
    seen.add(ps.id);
    if (ps.id === G.myId) {
      G.hud.hp(ps.hp, G.chars?.[G.myChar]?.hp || 100);
      G.hud.buffs(ps);
      G.hud.bag(ps.bv, ps.bw, ps.bl || 20);
      G.buffSlow = ps.slow;
      G.coins = ps.coins ?? G.coins;
      G.ownedWeapons = ps.owned || G.ownedWeapons;
      G.relations = ps.relations || {}; G.handWith = ps.handWith || null;
      updateCoinHUD();
      if (ps.st !== G.myState) {
        if (ps.st === 'dead') { G.myState = 'dead'; clearContinuousInput(); SFX.death(); }
        else if (ps.st === 'out') { G.myState = 'out'; G.myBanked = ps.bv; clearContinuousInput(); }
        updateTouchControls();
      }
      if (G.adoptPos) { G.px = ps.x; G.pz = ps.z; G.adoptPos = false; }
      updateRemote(ps, now, true);
      continue;
    }
    updateRemote(ps, now, false);
  }
  for (const [id, r] of G.remotes) {
    if (!seen.has(id)) { G.scene.remove(r.parts.group); G.remotes.delete(id); }
  }

  // 尸煞
  const zseen = new Set();
  for (const zs of m.zombies) {
    zseen.add(zs.id);
    let z = G.zombies.get(zs.id);
    if (!z) {
      const parts = makeZombie(zs.variant);
      G.scene.add(parts.group);
      z = { parts, prev: null, cur: null, variant: zs.variant };
      G.zombies.set(zs.id, z);
    }
    z.prev = z.cur; z.cur = { x: zs.x, z: zs.z, ry: zs.ry || 0, t: now, hp: zs.hp, maxHp: zs.maxHp, st: zs.st, variant: zs.variant };
    z.parts.group.visible = zs.hp > 0;
  }

  // 棺材
  for (const cs of m.chests) {
    const old = G.chestStates.get(cs.id);
    if (old) { old.open = cs.open; old.empty = cs.empty; old.tier = cs.tier; old.big = cs.big; }
  }

  // 道具
  const remainItems = new Set(m.items);
  for (const [id, mesh] of G.itemMeshes) {
    if (!remainItems.has(id)) { G.scene.remove(mesh); G.itemMeshes.delete(id); }
  }

  // 武器
  const remainWeapons = new Set(m.weapons);
  for (const [id, mesh] of G.weaponMeshes) {
    if (!remainWeapons.has(id)) { G.scene.remove(mesh); G.weaponMeshes.delete(id); }
  }

  // 宝袋
  G.bags = m.bags;
  const bagSeen = new Set();
  for (const b of m.bags) {
    bagSeen.add(b.id);
    if (!G.bagMeshes.has(b.id)) {
      const mesh = makeLootBag();
      mesh.position.set(b.x, 0, b.z);
      G.scene.add(mesh);
      G.bagMeshes.set(b.id, mesh);
    }
  }
  for (const [id, mesh] of G.bagMeshes) {
    if (!bagSeen.has(id)) { G.scene.remove(mesh); G.bagMeshes.delete(id); }
  }

  // 怪物宝箱
  const mcSeen=new Set();
  for(const c of m.monsterChests||[]){mcSeen.add(c.id);if(!G.monsterChestMeshes.has(c.id)){const mesh=makeMonsterChest(c.color);mesh.position.set(c.x,0,c.z);G.scene.add(mesh);G.monsterChestMeshes.set(c.id,{mesh,data:c});}}
  for(const [id,o] of G.monsterChestMeshes)if(!mcSeen.has(id)){G.scene.remove(o.mesh);G.monsterChestMeshes.delete(id);}

  // 危害区域（静态 + 随机事件临时生成）
  const hzSeen=new Set();
  for(const h of m.hazards||[]){hzSeen.add(h.id);if(!G.hazardMeshes.has(h.id)){const mesh=makeHazard();mesh.position.set(h.x,0,h.z);G.scene.add(mesh);G.hazardMeshes.set(h.id,mesh);}}
  for(const [id,mesh] of G.hazardMeshes)if(!hzSeen.has(id)){G.scene.remove(mesh);G.hazardMeshes.delete(id);}

  // 事件
  for (const ev of m.ev) onEvent(ev);

  // HUD
  G.hud.danger(m.danger || 0, m.openedChests || 0);
  const remainSecond = Math.ceil(m.remain / 1000);
  if (remainSecond !== G.lastHudSecond) { G.lastHudSecond = remainSecond; G.hud.timer(m.remain, m.exitsOpen); }
  if (m.exitsOpen && !G.exitsOpen) G.exitsOpen = true;
  if (now - G.lastMiniMap > (G.touchCapable ? 220 : 100)) {
    G.lastMiniMap = now;
    G.hud.minimap(m.players, G.myId, [...G.chestStates.values()], G.map.exits, m.exitsOpen, m.bags);
  }

  if (G.myState === 'dead') {
    const mates = livingTeammates();
    if (!mates.length) return leaveMatchToMenu('小队已全军覆没');
    if (!mates.some(([id]) => id === G.spectateId)) G.spectateId = mates[0][0];
    showSpectateTarget();
  } else if (G.myState === 'out') {
    G.hud.out(true, G.myBanked);
  }
}

function updateRemote(ps, now, isMe) {
  let r = G.remotes.get(ps.id);
  if (!r) {
    const color = G.chars?.[ps.id === G.myId ? G.myChar : (G.playerChars?.[ps.id] || 'mofeng')]?.color || 0xc8a44d;
    const parts = makeCharacter(color, ps.id === G.myId ? G.myChar : (G.playerChars?.[ps.id] || 'mofeng'));
    applyHeldWeapon(parts, ps.weapon || 'fist');
    const tagName = ps.id === G.myId ? G.myName : (G.playerNames?.[ps.id] || '校尉');
    const tag = makeNameTag(ps.bot ? `${tagName} · AI` : tagName, !!ps.bot);
    parts.group.add(tag);
    G.scene.add(parts.group);
    r = { parts, prev: null, cur: null, tag, weapon: ps.weapon || 'fist' };
    G.remotes.set(ps.id, r);
  }
  r.prev = r.cur;
  const nw = ps.weapon || 'fist';
  if (r.weapon !== nw) { r.weapon = nw; applyHeldWeapon(r.parts, nw); }
  r.cur = { x: ps.x, z: ps.z, ry: ps.ry, t: now, st: ps.st, anim: ps.anim, hp: ps.hp, weapon: ps.weapon, bot:ps.bot, handWith:ps.handWith };
  if (isMe) r.parts.group.visible = false;
}

function onEvent(ev) {
  switch (ev.k) {
    case 'hit':
      if (ev.to === G.myId) { G.hud.dmgFlash(); SFX.hurt(); navigator.vibrate?.([20, 25, 30]); }
      else if (ev.from === G.myId) {
        G.hud.hitMarker(!!ev.killed);
        SFX.hit();
        navigator.vibrate?.(ev.killed ? 35 : 12);
        if (ev.targetType === 'zombie') {
          const z = G.zombies.get(ev.to);
          if (z) z.hitUntil = performance.now() + (ev.killed ? 220 : 110);
        }
      }
      if (ev.to && ev.to !== ev.from) { const rr = G.remotes.get(ev.to); if (rr) rr.hitUntil = performance.now() + 200; }
      break;
    case 'dodge':
      if (ev.to === G.myId) SFX.ding();
      break;
    case 'swing': {
      const r = G.remotes.get(ev.id);
      if (r) r.swingAt = performance.now();
      if (ev.id !== G.myId && ev.hit) SFX.hit();
      break;
    }
    case 'throw': {
      const r = G.remotes.get(ev.id);
      SFX.throwK();
      if (r?.cur) spawnProjFx(r.cur.x, r.cur.z, r.cur.ry);
      break;
    }
    case 'died':
      G.hud.killfeed(`☠ ${ev.byName} 击倒了 ${ev.name}`);
      if (ev.by === G.myId) G.hud.announce('击倒一人', 1500);
      if (ev.id === G.myId) { G.hud.prog(null); G.hud.dead(true); $('respawnTip').textContent = '正在寻找存活队友…'; }
      { const r = G.remotes.get(ev.id); if (r) spawnDeathFx(r.parts.group.position.x, r.parts.group.position.z, 0x8a2018); }
      break;
    case 'zombieDead': {
      const z = G.zombies.get(ev.id);
      if (z) spawnDeathFx(z.parts.group.position.x, z.parts.group.position.z, z.parts.skinMat.color.getHex());
      break;
    }
    case 'respawn':
      if (ev.id === G.myId) { G.myState = 'alive'; G.adoptPos = true; G.hud.dead(false); G.hud.announce('重返墓中', 1500); updateTouchControls(); }
      break;
    case 'chest': {
      const cs = G.chestStates.get(ev.id);
      if (cs) { cs.open = true; animateChest(ev.id); }
      SFX.open();
      if (ev.by === G.myId && ev.got?.length) {
        const tier = cs?.tier;
        const tierLabel = tier === 'legendary' ? '【传说宝棺】' : tier === 'epic' ? '【史诗宝箱】' : tier === 'fine' ? '【精良宝箱】' : '';
        G.hud.announce(tierLabel + ev.got.map(t => t.name).join(' · '), 2200);
        SFX.ding();
      }
      if (ev.got?.some(t => t.name === '传国玉玺')) G.hud.announce('⚱ 传国玉玺出世 ⚱', 3200);
      if (ev.dangerGain > 0 && ev.by === G.myId && !ev.got?.some(t => t.name === '传国玉玺')) setTimeout(() => G.hud.announce(`阴气 +${ev.dangerGain.toFixed(1)} · 继续摸金或撤离`, 1700), 650);
      break;
    }
    case 'grabbed':
      if (ev.by === G.myId && ev.got?.length) { G.hud.announce('拾得 ' + ev.got.map(t => t.name).join('·'), 1800); SFX.ding(); }
      break;
    case 'pickup':
      if (ev.id === G.myId) { SFX.pickup(); G.hud.announce('拾得 ' + (G.itemDefs?.[ev.ptype]?.name || ev.ptype), 1200); }
      break;
    case 'pickupW':
      if (ev.id === G.myId) { SFX.pickup(); G.hud.announce('获得武器 · ' + (G.weapons?.[ev.weapon]?.name || ev.weapon), 1500); }
      break;
    case 'weapon':
      if (ev.id === G.myId) { G.myWeapon = ev.weapon; G.myAmmo = ev.ammo; updateWeaponHUD(); }
      { const r = G.remotes.get(ev.id); if (r) { r.weapon = ev.weapon; applyHeldWeapon(r.parts, ev.weapon); } }
      break;
    case 'coins':
      if (ev.id === G.myId) {
        G.coins = ev.coins; updateCoinHUD(); if (G.shopOpen) renderShop();
        G.hud.announce(`${ev.gain >= 0 ? '+' : ''}${ev.gain} 铜元 · ${ev.reason}`, 1200);
      }
      break;
    case 'doorOpen':
      G.doorOpen = true; setPhase('tomb'); G.hud.prog(null); SFX.open();
      break;
    case 'phase':
      setPhase(ev.phase);
      break;
    case 'exitsOpen':
      G.exitsOpen = true;
      $('objective').textContent = '目标：前往青铜绿光柱，在撤离点坚持数秒';
      G.hud.announce('✦ 撤离点已开启 · 速速撤离 ✦', 3500);
      SFX.extract();
      break;
    case 'extract':
      G.hud.killfeed(`✦ ${ev.name} 携 💰${ev.value} 撤离`);
      if (ev.id === G.myId) { G.myBanked = ev.value; SFX.extract(); G.hud.prog(null); }
      break;
    case 'monsterChestDrop':
      G.hud.killfeed(`怪物掉落${{red:'大红',purple:'小紫',white:'小白',gold:'小金'}[ev.color]}宝箱`);
      break;
    case 'monsterChestOpen':
      G.hud.killfeed(`${ev.name} 开出 ${ev.value.toLocaleString()} 铜元`);
      if(ev.by===G.myId){G.hud.announce(`宝箱奖励 · ${ev.value.toLocaleString()} 铜元`,2200);SFX.ding();}
      break;
    case 'relation':
      G.hud.killfeed(`${ev.aName} 与 ${ev.bName} 绑定为「${ev.relation}」`);
      break;
    case 'hand':
      G.hud.killfeed(ev.on?`${ev.aName} 牵起了 ${ev.bName}`:'两人松开了手');
      break;
    case 'zombieDead':
      G.hud.killfeed(`🧟 ${ev.byName} 击杀了尸煞`);
      break;
    case 'zombieAtk':
      if (ev.to === G.myId) SFX.growl();
      break;
    case 'trap':
      G.hud.killfeed(`⚙ ${TRAP_NAMES[ev.type] || '机关'}触发 · ${ev.byName}`);
      G.hud.announce(`⚠ 触发${TRAP_NAMES[ev.type] || '机关'}！`, 1200);
      break;
    case 'rampage':
      G.hud.announce(ev.text || '古墓异变！', 3200);
      G.hud.killfeed('⚠ ' + (ev.text || '古墓异变'));
      break;
    case 'explode':
      spawnExplodeFx(ev.x, ev.z, ev.variant);
      G.hud.killfeed('💥 爆裂尸炸裂！');
      break;
    case 'hazardAdd':
      G.hud.announce('⚠ 墓道塌方！速速撤离危险区', 2600);
      break;
    case 'hazardRemove':
      break;
    case 'left':
      G.hud.killfeed(`${ev.name} 离开了古墓`);
      break;
  }
}

function onEnd(m) {
  G.playing = false;
  clearContinuousInput();
  updateTouchControls();
  document.exitPointerLock?.();
  G.hud.scoreboard(m.board, G.myId, G.chars);
  show('end');
  $('hud').classList.add('hidden');
}

// ================= 3D 世界 =================
function buildWorld(m) {
  if (!G.renderer) {
    G.renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: !G.touchCapable, powerPreference: 'high-performance' });
    G.renderScale = G.touchCapable ? (innerWidth * innerHeight > 1000000 ? 1 : 1.2) : Math.min(devicePixelRatio, 2);
    G.renderer.setPixelRatio(G.renderScale);
    G.renderer.setSize(innerWidth, innerHeight);
    G.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 120);
    addEventListener('resize', () => {
      G.camera.aspect = innerWidth / innerHeight;
      G.camera.updateProjectionMatrix();
      if (G.touchCapable) G.renderScale = innerWidth * innerHeight > 1000000 ? 1 : Math.min(G.renderScale, 1.2);
      G.renderer.setPixelRatio(G.renderScale);
      G.renderer.setSize(innerWidth, innerHeight);
    });
  }
  G.scene = createScene();
  G.world = buildMap(G.scene, m.map);
  G.torchPts = G.world.torchPts.map(f => f.position);

  G.torchLights = [];
  const lightCount = G.touchCapable ? 3 : 5;
  const torchColor = (m.map.theme && m.map.theme.torch) || 0xff8a2a;
  for (let i = 0; i < lightCount; i++) {
    const l = new THREE.PointLight(torchColor, 6, 12, 1.6);
    G.scene.add(l);
    G.torchLights.push(l);
  }
  G.flashlight = new THREE.SpotLight(0xfff2d8, 14, 22, 0.5, 0.45, 1.2);
  G.scene.add(G.flashlight);
  G.scene.add(G.flashlight.target);

  G.chestStates = new Map();
  for (const c of m.map.chests) G.chestStates.set(c.id, { id: c.id, x: c.x, z: c.z, big: c.big, tier: c.tier, open: false, empty: false });

  G.itemMeshes = new Map();
  for (const it of m.map.items) {
    const mesh = makeItem(it.type);
    mesh.position.set(it.x, 0.55, it.z);
    G.scene.add(mesh);
    G.itemMeshes.set(it.id, mesh);
  }

  // 武器刷新点
  G.weaponMeshes = new Map();
  for (const w of m.map.weapons || []) {
    const mesh = makeWeaponPickup(w.type);
    mesh.position.set(w.x, 0, w.z);
    G.scene.add(mesh);
    G.weaponMeshes.set(w.id, mesh);
  }

  // 陷阱机关
  G.trapMeshes = new Map();
  for (const t of m.map.traps || []) {
    const mesh = makeTrap(t.type);
    mesh.position.set(t.x, 0, t.z);
    G.scene.add(mesh);
    G.trapMeshes.set(t.id, mesh);
  }

  G.playerNames = {}; G.playerChars = {};
  for (const p of m.players) { G.playerNames[p.id] = p.name; G.playerChars[p.id] = p.char; }

  G.remotes.clear(); G.zombies.clear(); G.bagMeshes.clear(); G.projFx = []; G.hazardMeshes.clear(); G.explodeFx = [];
  G.yaw = Math.atan2(-0, -1); G.pitch = 0; G.camX = G.px; G.camZ = G.pz;
}

function updateTorchLights(t, now) {
  if (!G.torchPts.length) return;
  if (now - G.lastTorchSelect > (G.touchCapable ? 260 : 120) || !G.selectedTorchPts.length) {
    G.lastTorchSelect = now;
    G.selectedTorchPts = [...G.torchPts]
      .sort((a, b) => ((a.x - G.px) ** 2 + (a.z - G.pz) ** 2) - ((b.x - G.px) ** 2 + (b.z - G.pz) ** 2))
      .slice(0, G.torchLights.length);
    G.selectedTorchPts.forEach((p, i) => G.torchLights[i].position.set(p.x, 2.2, p.z));
  }
  for (let i = 0; i < G.torchLights.length; i++) {
    G.torchLights[i].intensity = 5 + Math.sin(t * 11 + i * 1.7) * 1.2 + Math.sin(t * 23 + i) * 0.6;
  }
}

function animateChest(id) {
  const c = G.world.chests.get(id);
  if (!c || c.open) return;
  c.open = true;
  const lid = c.lid;
  const t0 = performance.now();
  const anim = () => {
    const k = Math.min(1, (performance.now() - t0) / 500);
    lid.position.y = c.base + k * 0.5;
    lid.rotation.x = -k * 0.9;
    if (k < 1) requestAnimationFrame(anim);
  };
  anim();
}

function spawnProjFx(x, z, ry) {
  const mesh = makeProjectile();
  mesh.position.set(x, 1.3, z);
  mesh.rotation.y = ry;
  G.scene.add(mesh);
  G.projFx.push({ mesh, dx: Math.sin(ry), dz: Math.cos(ry), life: 1.5 });
}

function spawnExplodeFx(x, z, variant) {
  const color = variant === 'burst' ? 0xff5db0 : 0xff7a3c;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  mesh.position.set(x, 0.8, z);
  G.scene.add(mesh);
  G.explodeFx.push({ mesh, life: 0.5, max: 0.5, t0: performance.now() });
}

function updateExplodeFx(dt) {
  G.explodeFx = G.explodeFx.filter(e => {
    e.life -= dt;
    const k = 1 - Math.max(0, e.life) / e.max;
    e.mesh.scale.setScalar(1 + k * 5);
    e.mesh.material.opacity = Math.max(0, e.life / e.max) * 0.85;
    if (e.life <= 0) { G.scene.remove(e.mesh); return false; }
    return true;
  });
}

// 死亡碎块：角色/尸煞倒下时迸散的碎屑
function spawnDeathFx(x, z, colorHex) {
  if (!G.deathFx) G.deathFx = [];
  const c = new THREE.Color(colorHex);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18),
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, emissive: c, emissiveIntensity: 0.15 }));
    m.position.set(x + (Math.random() - 0.5) * 0.4, 1.0 + Math.random() * 0.6, z + (Math.random() - 0.5) * 0.4);
    G.scene.add(m);
    G.deathFx.push({ mesh: m, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.9 });
  }
}

function updateDeathFx(dt) {
  if (!G.deathFx) return;
  G.deathFx = G.deathFx.filter(f => {
    f.life -= dt;
    f.vy -= 9 * dt;
    f.mesh.position.x += f.vx * dt;
    f.mesh.position.y += f.vy * dt;
    f.mesh.position.z += f.vz * dt;
    f.mesh.rotation.x += dt * 6; f.mesh.rotation.y += dt * 5;
    if (f.mesh.position.y < 0.1) { f.mesh.position.y = 0.1; f.vy *= -0.3; f.vx *= 0.6; f.vz *= 0.6; }
    f.mesh.material.transparent = true;
    f.mesh.material.opacity = Math.max(0, f.life / 0.9);
    if (f.life <= 0) { G.scene.remove(f.mesh); return false; }
    return true;
  });
}

// ================= 输入 =================
function canAct() {
  return G.playing && G.myState === 'alive' && !G.shopOpen && $('relationPanel').classList.contains('hidden') && $('mobileGuide').classList.contains('hidden');
}

function attack() {
  if (!canAct() || G.phase === 'loadout') return;
  sendState(performance.now(), true);
  G.net.send({ t: 'atk' });
  SFX.swing();
  G.lastAtkFx = performance.now();
  navigator.vibrate?.(18);
}

function setInteractHeld(on) {
  if (!canAct() || !G.interact) on = false;
  G.eHeld = on;
  $('touchInteract')?.classList.toggle('active', on);
  if (!on) G.hud.prog(null);
}

function useItem(slot) {
  if (!canAct() || G.phase === 'loadout') return;
  G.net.send({ t: 'use', slot });
  navigator.vibrate?.(12);
}

function updateViewLabel() {
  const names = ['第一人称', '第三人称（背面）', '第三人称（正面）'];
  const shoulder = G.camShoulder > 0 ? '右肩' : '左肩';
  $('viewMode').textContent = (G.touchCapable ? '' : 'V · ') + names[G.viewMode] + (G.viewMode ? ` · ${shoulder}` : '');
  const btn = $('touchShoulder');
  if (btn) { btn.querySelector('span').textContent = G.camShoulder > 0 ? '右' : '左'; btn.querySelector('small').textContent = '切肩'; }
}

function cycleView() {
  if (!canAct()) return;
  G.viewMode = (G.viewMode + 1) % 3;
  updateViewLabel();
  navigator.vibrate?.(8);
}

function toggleShoulder() {
  if (!canAct() || G.viewMode === 0) return;
  G.camShoulder *= -1;
  updateViewLabel();
  G.hud.announce(G.camShoulder > 0 ? '镜头切至右肩' : '镜头切至左肩', 900);
  navigator.vibrate?.(8);
}

function clearContinuousInput() {
  G.touchMove.x = 0; G.touchMove.y = 0;
  G.keys.ShiftLeft = false; G.keys.ShiftRight = false;
  G.eHeld = false; G.touchJoyId = null; G.touchLookId = null;
  const knob = $('joystickKnob'); if (knob) knob.style.transform = 'translate(0px, 0px)';
  $('touchRun')?.classList.remove('active');
  $('touchInteract')?.classList.remove('active');
  G.hud.prog(null);
}

function updateTouchControls() {
  if (!G.touchCapable) return;
  const hud = $('hud');
  const panelOpen = !$('relationPanel').classList.contains('hidden');
  const guideOpen = !$('mobileGuide').classList.contains('hidden');
  const blocked = !G.playing || G.shopOpen || panelOpen || guideOpen || G.myState !== 'alive';
  hud.classList.add('touch-enabled');
  hud.classList.toggle('touch-blocked', blocked);
  $('touchShop').classList.toggle('hidden', G.phase !== 'loadout');
  $('touchRelation').classList.toggle('hidden', G.phase === 'loadout');
}

function initTouchInput() {
  if (!G.touchCapable) return;
  document.body.classList.add('touch-device');
  $('shopCloseBtn').textContent = '整备完成 · 返回战场';

  const joy = $('joystick'), knob = $('joystickKnob'), look = $('lookZone');
  let joyCx = 0, joyCy = 0, joyMax = 42;
  const measureJoy = () => { const r = joy.getBoundingClientRect(); joyCx = r.left + r.width / 2; joyCy = r.top + r.height / 2; joyMax = r.width * .32; };
  const joyMove = e => {
    if (e.pointerId !== G.touchJoyId) return;
    let dx = e.clientX - joyCx, dy = e.clientY - joyCy;
    const max = joyMax, d = Math.hypot(dx, dy);
    if (d > max) { dx *= max / d; dy *= max / d; }
    G.touchMove.x = dx / max; G.touchMove.y = -dy / max;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  joy.addEventListener('pointerdown', e => { if (!canAct() || G.phase === 'loadout') return; measureJoy(); G.touchJoyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
  addEventListener('orientationchange', measureJoy);
  joy.addEventListener('pointermove', joyMove);
  const joyEnd = e => { if (e.pointerId !== G.touchJoyId) return; G.touchJoyId = null; G.touchMove.x = G.touchMove.y = 0; knob.style.transform = 'translate(0px, 0px)'; };
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

  let lastX = 0, lastY = 0;
  look.addEventListener('pointerdown', e => { if (!canAct() || G.phase === 'loadout') return; G.touchLookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove', e => {
    if (e.pointerId !== G.touchLookId) return;
    const scale = Math.max(.75, Math.min(1.25, innerWidth / 900));
    G.yaw -= (e.clientX - lastX) * .006 / scale;
    G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch - (e.clientY - lastY) * .005 / scale));
    lastX = e.clientX; lastY = e.clientY;
  });
  const lookEnd = e => { if (e.pointerId === G.touchLookId) G.touchLookId = null; };
  look.addEventListener('pointerup', lookEnd); look.addEventListener('pointercancel', lookEnd);

  $('touchAttack').addEventListener('pointerdown', e => { e.preventDefault(); attack(); });
  $('touchInteract').addEventListener('pointerdown', e => { e.preventDefault(); setInteractHeld(true); });
  ['pointerup','pointercancel','pointerleave'].forEach(type => $('touchInteract').addEventListener(type, () => setInteractHeld(false)));
  $('touchRun').addEventListener('pointerdown', e => { e.preventDefault(); if (canAct()) { G.keys.ShiftLeft = true; $('touchRun').classList.add('active'); } });
  ['pointerup','pointercancel','pointerleave'].forEach(type => $('touchRun').addEventListener(type, () => { G.keys.ShiftLeft = false; $('touchRun').classList.remove('active'); }));
  $('touchView').addEventListener('pointerdown', e => { e.preventDefault(); cycleView(); });
  $('touchShoulder').addEventListener('pointerdown', e => { e.preventDefault(); toggleShoulder(); });
  $('touchShop').addEventListener('pointerdown', e => { e.preventDefault(); toggleShop(); });
  $('touchRelation').addEventListener('pointerdown', e => { e.preventDefault(); toggleRelationPanel(); });
  $('hotbar').addEventListener('pointerdown', e => { const slot = e.target.closest('.slot[data-slot]'); if (slot) { e.preventDefault(); useItem(+slot.dataset.slot); } });
  const closeGuide = () => { $('mobileGuide').classList.add('hidden'); localStorage.setItem('mojin_mobile_guide', '1'); updateTouchControls(); };
  $('mobileHelpBtn').addEventListener('click', () => { clearContinuousInput(); $('mobileGuide').classList.remove('hidden'); updateTouchControls(); });
  $('mobileGuideClose').addEventListener('click', closeGuide);
  $('mobileGuideOk').addEventListener('click', closeGuide);
  updateTouchControls();
}

function initInput() {
  addEventListener('keydown', e => {
    if (!G.playing) return;
    if (e.code === 'KeyB' && !e.repeat) { toggleShop(); return; }
    if (e.code === 'KeyR' && !e.repeat && G.phase !== 'loadout') { toggleRelationPanel(); return; }
    if (G.shopOpen) { if (e.code === 'Escape') toggleShop(false); return; }
    G.keys[e.code] = true;
    if (e.code === 'KeyV' && !e.repeat) cycleView();
    if (e.code === 'KeyC' && !e.repeat) toggleShoulder();
    if (e.code === 'KeyE') G.eHeld = true;
    if (/^Digit[1-3]$/.test(e.code)) useItem(+e.code.slice(5) - 1);
  });
  addEventListener('keyup', e => { G.keys[e.code] = false; if (e.code === 'KeyE') setInteractHeld(false); });
  $('gl').addEventListener('click', () => { if (G.playing && !G.touchCapable) document.body.requestPointerLock?.(); });
  addEventListener('mousemove', e => {
    if (document.pointerLockElement !== document.body || !G.playing) return;
    G.yaw -= e.movementX * 0.0024;
    G.pitch = Math.max(-1.35, Math.min(1.35, G.pitch - e.movementY * 0.0022));
  });
  addEventListener('mousedown', e => {
    if (document.pointerLockElement !== document.body || e.button !== 0) return;
    attack();
  });
  addEventListener('blur', clearContinuousInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearContinuousInput(); });
  initTouchInput();
}

// ================= 移动 & 碰撞 =================
function walkable(x, z, r = 0.35) {
  const m = G.map;
  if (!G.doorOpen && m.door && Math.abs(x - m.door.x) < 1.6 && Math.abs(z - m.door.z) < 0.7) return false;
  const pts = [[x - r, z - r], [x + r, z - r], [x - r, z + r], [x + r, z + r]];
  for (const [px, pz] of pts) {
    const ci = Math.floor(px / m.cell + m.w / 2);
    const cj = Math.floor(pz / m.cell + m.h / 2);
    if (ci < 0 || cj < 0 || ci >= m.w || cj >= m.h || m.rows[cj][ci] === '0') return false;
  }
  return true;
}

function moveLocal(dt) {
  if (G.myState !== 'alive' || G.shopOpen || G.phase === 'loadout' || !$('relationPanel').classList.contains('hidden')) return;
  let sp = BASE_SPEED * (G.chars?.[G.myChar]?.speed || 1);
  if (G.keys.ShiftLeft || G.keys.ShiftRight) sp *= 1.35;
  if (G.buffSlow) sp *= 0.5;
  let mx = 0, mz = 0;
  const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
  const rx = -Math.cos(G.yaw), rz = Math.sin(G.yaw);
  if (G.keys.KeyW) { mx += fx; mz += fz; }
  if (G.keys.KeyS) { mx -= fx; mz -= fz; }
  if (G.keys.KeyD) { mx += rx; mz += rz; }
  if (G.keys.KeyA) { mx -= rx; mz -= rz; }
  mx += fx * G.touchMove.y + rx * G.touchMove.x;
  mz += fz * G.touchMove.y + rz * G.touchMove.x;
  const d = Math.hypot(mx, mz);
  if (d > 0.08) {
    const strength = G.touchJoyId != null && !G.keys.KeyW && !G.keys.KeyS && !G.keys.KeyA && !G.keys.KeyD ? Math.min(1, d) : 1;
    mx = mx / d * sp * strength * dt; mz = mz / d * sp * strength * dt;
    if (walkable(G.px + mx, G.pz)) G.px += mx;
    if (walkable(G.px, G.pz + mz)) G.pz += mz;
    G.moving = true;
  } else G.moving = false;
}

function updateRouteState() {
  const region = (G.map?.regions || []).find(r => G.px >= r.minX && G.px <= r.maxX && G.pz >= r.minZ && G.pz <= r.maxZ);
  const next = region?.route || null;
  if (next === G.currentRoute) return;
  G.currentRoute = next;
  const el = $('routeState');
  el.className = next || 'hidden';
  if (!region) { el.classList.add('hidden'); return; }
  el.textContent = region.name + (region.main ? ' · 主墓' : '');
  G.hud.announce(`进入${region.name} · ${region.desc}`, 1800);
}

// ================= 渲染循环 =================
let lastFrame = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!G.renderer || !G.scene) return;

  if (G.playing) {
    moveLocal(dt);
    sendState(now);
    updateInteract(now);
    updateRemotes(now, dt);
    updateZombies(now);
    updateRouteState();
    updateProjFx(dt);
    updateExplodeFx(dt);
    updateDeathFx(dt);
    updateTorchLights(now / 1000, now);
    updateCamera(dt);
    if (now - G.lastItemAnim > (G.touchCapable ? 45 : 16)) { G.lastItemAnim = now; updateItemSpin(now); }
    updateAdaptiveQuality(now);
  }
  G.renderer.render(G.scene, G.camera);
}

function updateAdaptiveQuality(now) {
  if (!G.touchCapable || !G.renderer) return;
  G.fpsFrames++;
  const elapsed = now - G.fpsAt;
  if (elapsed < 2500) return;
  const fps = G.fpsFrames * 1000 / elapsed;
  G.fpsFrames = 0; G.fpsAt = now;
  let next = G.renderScale;
  if (fps < 43) next = Math.max(.78, next - .12);
  else if (fps > 57 && next < 1.2) next = Math.min(1.2, next + .06);
  if (Math.abs(next - G.renderScale) >= .05) {
    G.renderScale = next;
    G.renderer.setPixelRatio(next);
    G.renderer.setSize(innerWidth, innerHeight, false);
  }
}

function sendState(now, force = false) {
  const last = G.lastSentPos;
  const moved = Math.hypot(G.px - last.x, G.pz - last.z) > 0.015;
  const turned = Math.abs(Math.atan2(Math.sin(G.yaw - last.ry), Math.cos(G.yaw - last.ry))) > 0.018;
  const interval = (moved || turned || G.moving) ? 50 : 220;
  if (!force && now - G.lastStSend < interval) return;
  G.lastStSend = now;
  last.x = G.px; last.z = G.pz; last.ry = G.yaw; last.at = now;
  G.net.send({ t: 'st', p: [G.px, G.pz], ry: G.yaw, a: G.moving ? 'run' : '' });
}

function updateInteract(now) {
  if (G.myState !== 'alive') { G.hud.interactTip(null); return; }
  if (!G.eHeld && now - G.lastInteractScan < (G.touchCapable ? 90 : 45)) return;
  G.lastInteractScan = now;
  let best = null, bd = 2.6;
  if (G.phase === 'outside' && !G.doorOpen && G.map.door) {
    const d = Math.hypot(G.map.door.x - G.px, G.map.door.z - G.pz);
    if (d < 2.8) { bd = d; best = { kind: 'door', id: 'tomb-door' }; }
  }
  if (G.phase === 'tomb') for (const cs of G.chestStates.values()) {
    if (cs.empty) continue;
    const d = Math.hypot(cs.x - G.px, cs.z - G.pz);
    if (d < bd) { bd = d; best = { kind: 'chest', id: cs.id, big: cs.big }; }
  }
  for (const b of G.bags) {
    const d = Math.hypot(b.x - G.px, b.z - G.pz);
    if (d < Math.min(bd, 2.3)) { bd = d; best = { kind: 'bag', id: b.id }; }
  }
  for(const [id,o] of G.monsterChestMeshes){const d=Math.hypot(o.data.x-G.px,o.data.z-G.pz);if(d<Math.min(bd,2.3)){bd=d;best={kind:'monsterChest',id};}}
  G.interact = best;
  if (!best) {
    G.hud.interactTip(null);
    const btn = $('touchInteract');
    if (btn) { btn.classList.add('disabled'); $('touchInteractLabel').textContent = '靠近目标'; }
    if (G.eHeld) { G.eHeld = false; G.hud.prog(null); }
    return;
  }
  const action = best.kind === 'door' ? '开启墓门' : best.kind === 'monsterChest' ? '开启宝箱' : best.kind === 'chest' ? (best.big ? '开启主墓宝棺' : '开棺摸金') : '拾取明器';
  const btn = $('touchInteract');
  if (btn) { btn.classList.remove('disabled'); $('touchInteractLabel').textContent = action; }
  const prefix = G.touchCapable ? '按住右侧 <b>交</b> 键 · ' : (best.kind === 'monsterChest' ? '按 <b>E</b> · ' : '按住 <b>E</b> · ');
  G.hud.interactTip(prefix + action);
  if (G.eHeld && now - G.lastOpenSend > 150) {
    G.lastOpenSend = now;
    G.net.send({ t: best.kind === 'door' ? 'door' : best.kind === 'monsterChest' ? 'monsterChest' : best.kind === 'chest' ? 'open' : 'grab', id: best.id });
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}

function updateRemotes(now, dt) {
  const RENDER_DELAY = 110;
  for (const [id, r] of G.remotes) {
    if (!r.cur) continue;
    let x, z, ry;
    if (id === G.myId) { x = G.px; z = G.pz; ry = G.yaw; }
    else if (r.prev) {
      const span = Math.max(1, r.cur.t - r.prev.t);
      const k = Math.max(0, Math.min(1.3, (now - RENDER_DELAY - r.prev.t) / span));
      x = r.prev.x + (r.cur.x - r.prev.x) * k;
      z = r.prev.z + (r.cur.z - r.prev.z) * k;
      ry = lerpAngle(r.prev.ry, r.cur.ry, k);
    } else { x = r.cur.x; z = r.cur.z; ry = r.cur.ry; }
    const g = r.parts.group;
    g.position.set(x, 0, z);
    g.rotation.y = ry + Math.PI;
    g.rotation.x = r.cur.st === 'dead' ? -Math.PI / 2 : 0;
    g.position.y = r.cur.st === 'dead' ? 0.3 : 0;
    const moving = r.cur.anim === 'run';
    const wob = moving ? Math.sin(now / 90) * 0.5 : Math.sin(now / 600) * 0.06;
    r.parts.legL.rotation.x = wob;
    r.parts.legR.rotation.x = -wob;
    r.parts.armL.rotation.x = -wob * 0.7;
    // 躯干行走起伏 + 轻微前倾
    r.parts.torso.position.y = moving ? Math.abs(Math.sin(now / 90)) * 0.06 : 0;
    r.parts.torso.rotation.x = moving ? 0.08 : 0;
    if (r.swingAt && now - r.swingAt < 300) {
      const k = (now - r.swingAt) / 300;
      r.parts.armR.rotation.x = -2.2 * Math.sin(k * Math.PI);
      r.parts.torso.rotation.y = (k < 0.5 ? -0.22 : 0.18) * (1 - Math.abs(2 * k - 1));
    } else {
      r.parts.armR.rotation.x = moving ? -wob * 0.7 : Math.sin(now / 600) * 0.04;
      r.parts.torso.rotation.y = 0;
    }
    // 受击抖动
    if (r.hitUntil && now < r.hitUntil) {
      r.parts.torso.rotation.z = (Math.random() - 0.5) * 0.22;
    } else r.parts.torso.rotation.z = 0;
  }
}

function updateZombies(now) {
  const RENDER_DELAY = 110;
  for (const z of G.zombies.values()) {
    if (!z.cur) continue;
    let x, z2, ry;
    if (z.prev) {
      const span = Math.max(1, z.cur.t - z.prev.t);
      const k = Math.max(0, Math.min(1.3, (now - RENDER_DELAY - z.prev.t) / span));
      x = z.prev.x + (z.cur.x - z.prev.x) * k;
      z2 = z.prev.z + (z.cur.z - z.prev.z) * k;
      ry = lerpAngle(z.prev.ry || 0, z.cur.ry || 0, k);
    } else { x = z.cur.x; z2 = z.cur.z; ry = z.cur.ry || 0; }
    const g = z.parts.group;
    g.position.set(x, 0, z2);
    g.rotation.y = (ry || 0) + Math.PI;
    // 变体动作差异：迅捷快摆、重装沉慢、爆裂膨胀
    const vp = { normal: { f: 100, a: 0.5, tilt: 0, arm: 0.4 }, swift: { f: 62, a: 0.72, tilt: 0.25, arm: 0.6 }, brute: { f: 145, a: 0.32, tilt: -0.18, arm: 0.3 }, burst: { f: 88, a: 0.55, tilt: 0.1, arm: 0.5 } }[z.variant] || { f: 100, a: 0.5, tilt: 0, arm: 0.4 };
    const chase = z.cur.st === 'chase';
    const f = chase ? vp.f * 0.7 : vp.f * 1.5;
    const wob = Math.sin(now / f) * vp.a;
    z.parts.legL.rotation.x = wob;
    z.parts.legR.rotation.x = -wob;
    z.parts.armL.rotation.x = -1.1 + Math.sin(now / f) * vp.arm;
    z.parts.armR.rotation.x = -1.1 - Math.sin(now / f) * vp.arm;
    z.parts.torso.rotation.x = vp.tilt + (chase ? 0.12 : 0);
    const hit = z.hitUntil && now < z.hitUntil;
    if (z.parts.skinMat) {
      z.parts.skinMat.emissive.setHex(hit ? 0x8a2018 : 0x0a1408);
      z.parts.skinMat.emissiveIntensity = hit ? 1.1 : 1;
    }
    if (z.parts.threatRing) {
      const d = Math.hypot(x - G.px, z2 - G.pz);
      z.parts.threatRing.material.opacity = d < 8 ? (z.cur.st === 'chase' ? .78 : .48) : .22;
    }
  }
}

function updateProjFx(dt) {
  G.projFx = G.projFx.filter(k => {
    k.life -= dt;
    k.mesh.position.x += k.dx * 18 * dt;
    k.mesh.position.z += k.dz * 18 * dt;
    if (k.life <= 0 || !walkable(k.mesh.position.x, k.mesh.position.z, 0.05)) {
      G.scene.remove(k.mesh);
      return false;
    }
    return true;
  });
}

function updateItemSpin(now) {
  for (const mesh of G.itemMeshes.values()) {
    mesh.rotation.y = now / 600;
    mesh.position.y = 0.55 + Math.sin(now / 400 + mesh.position.x) * 0.08;
  }
  for (const mesh of G.weaponMeshes.values()) {
    mesh.rotation.y = now / 800;
    mesh.position.y = Math.sin(now / 500 + mesh.position.x) * 0.08;
  }
  for (const mesh of G.bagMeshes.values()) {
    mesh.rotation.y = now / 900;
  }
}

// ================= 相机 =================
// 第三人称相机参数
const TP_WANT_DIST = 4.3;   // 期望距离
const TP_MIN_DIST = 0.2;    // 碰撞射线起扫距离（越小越能在窄处找到可行走位）
const TP_FLOOR = 0.1;       // 安全网最低距离，杜绝穿墙
const TP_HEIGHT = 2.5;      // 相机基准高度
// 帧率无关的指数阻尼：lambda 越大收敛越快
function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)); }
// 从玩家向相机方向做网格射线步进，返回不穿墙的最大距离（该距离保证可行走）
function raycastMaxDist(tx, tz, dx, dz, maxDist) {
  const step = 0.16;
  let last = TP_MIN_DIST;
  for (let d = TP_MIN_DIST; d <= maxDist; d += step) {
    if (walkable(tx + dx * d, tz + dz * d, 0.2)) last = d;
    else break;
  }
  return last;
}

function updateCharacterFade(me, viewMode, dt) {
  if (!me?.parts?.group) return;
  me.parts.group.traverse(obj => {
    if (!obj.isMesh || !obj.material) return;
    if (!obj.userData.localFadeMaterial) {
      obj.material = Array.isArray(obj.material) ? obj.material.map(mat => mat.clone()) : obj.material.clone();
      obj.userData.localFadeMaterial = true;
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of mats) {
      if (G.charFadeMaterials.some(x => x.mat === mat)) continue;
      G.charFadeMaterials.push({ mat, transparent: mat.transparent, opacity: mat.opacity, depthWrite: mat.depthWrite });
    }
  });
  let blocked = false;
  if (viewMode !== 0) {
    CHAR_SCREEN_POS.set(G.px, 1.18, G.pz).project(G.camera);
    blocked = Math.abs(CHAR_SCREEN_POS.x) < 0.22 && Math.abs(CHAR_SCREEN_POS.y) < 0.34 && G.camDist < 2.2;
  }
  const target = blocked ? 0.26 : 1;
  G.charFade = damp(G.charFade, target, blocked ? 16 : 9, dt);
  for (const rec of G.charFadeMaterials) {
    rec.mat.transparent = rec.transparent || G.charFade < 0.995;
    rec.mat.opacity = rec.opacity * G.charFade;
    rec.mat.depthWrite = G.charFade < 0.995 ? false : rec.depthWrite;
    rec.mat.needsUpdate = true;
  }
}

function updateCamera(dt) {
  const me = G.remotes.get(G.myId);
  const spectating = G.myState === 'dead' || G.myState === 'out';
  let tx = G.px, tz = G.pz, ry = G.yaw, viewMode = G.viewMode;

  if (spectating) {
    const target = G.remotes.get(G.spectateId);
    if (target?.cur?.st === 'alive') { tx = target.cur.x; tz = target.cur.z; ry = target.cur.ry; viewMode = 1; }
  }

  if (me) me.parts.group.visible = viewMode !== 0 || spectating;

  if (viewMode === 0) {
    // Minecraft式第一人称
    G.camera.position.set(tx, 1.62, tz);
    G.camera.rotation.order = 'YXZ';
    G.camera.rotation.set(G.pitch, ry + Math.PI, 0);
    // 同步平滑状态，切回第三人称时不跳变
    G.camX = tx; G.camZ = tz; G.camY = 1.62;
  } else {
    // Minecraft式第三人称：背面 / 正面，带碰撞与平滑
    const front = viewMode === 2;
    const sign = front ? 1 : -1;
    const dx = Math.sin(ry) * sign, dz = Math.cos(ry) * sign;

    // 碰撞：求出不穿墙的最大距离
    const safeDist = raycastMaxDist(tx, tz, dx, dz, TP_WANT_DIST);
    if (safeDist < G.camDist) G.camDist = safeDist;       // 贴墙立即收回，杜绝穿墙
    else G.camDist = damp(G.camDist, safeDist, 6, dt);    // 离开墙体时平滑拉远

    // 目标水平位置：后/前方向之外加入左右肩偏移
    const sideX = Math.cos(ry) * G.camShoulder;
    const sideZ = -Math.sin(ry) * G.camShoulder;
    const shoulderWant = safeDist < 1.25 ? G.camShoulderX * 0.35 : G.camShoulderX;
    const wx = tx + dx * G.camDist + sideX * shoulderWant;
    const wz = tz + dz * G.camDist + sideZ * shoulderWant;
    // 水平平滑（转角惯性 + 肩位切换平滑）
    G.camX = damp(G.camX, wx, 12, dt);
    G.camZ = damp(G.camZ, wz, 12, dt);
    // 安全网：平滑过程中若仍穿入墙体，硬性拉回到墙前（允许拉到很近以杜绝穿墙）
    if (!walkable(G.camX, G.camZ, 0.2)) {
      let dd = Math.hypot(G.camX - tx, G.camZ - tz);
      while (dd > TP_FLOOR && !walkable(tx + dx * dd, tz + dz * dd, 0.2)) dd -= 0.05;
      G.camX = tx + dx * dd; G.camZ = tz + dz * dd; G.camDist = dd;
    }
    // 高度平滑（随俯仰轻微联动，俯视更顺）
    G.camY = damp(G.camY, TP_HEIGHT + G.pitch * 0.3, 10, dt);
    G.camera.position.set(G.camX, G.camY, G.camZ);
    G.camera.lookAt(tx, 1.35 + G.pitch * -1.2, tz);
  }

  updateCharacterFade(me, viewMode, dt);

  G.camera.getWorldDirection(CAMERA_DIR);
  G.flashlight.position.copy(G.camera.position);
  G.flashlight.target.position.copy(G.camera.position).add(CAMERA_DIR.multiplyScalar(8));

  if (G.world?.exitFx) {
    for (const fx of G.world.exitFx) {
      const target = G.exitsOpen ? 0.35 : 0.0;
      fx.glow.material.opacity += (target - fx.glow.material.opacity) * dt * 3;
      fx.beam.material.opacity += ((G.exitsOpen ? 0.12 : 0) - fx.beam.material.opacity) * dt * 3;
    }
  }
}

// ================= 启动 =================
initMenu();
initInput();
loop();
