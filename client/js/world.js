// 3D 世界：墓穴场景、角色模型、武器模型、特效
import * as THREE from '../vendor/three.module.js';

// 客户端本地视觉常量（与 server/shared.js 保持同步；服务端为唯一逻辑来源）
const CHEST_TIERS = {
  common:    { name:'普通', color:0x8a7434, glow:0x3a2e10 },
  fine:      { name:'精良', color:0x4dc86e, glow:0x16401e },
  epic:      { name:'史诗', color:0x9b59b6, glow:0x3a1450 },
  legendary: { name:'传说', color:0xe0ad2f, glow:0x5a3c00 },
};
const ZOMBIE_VARIANTS = {
  normal: { name:'尸煞',   color:0x4a5a42, eye:0x8fff4d, scale:1.0 },
  swift:  { name:'迅捷尸', color:0x6a8ec8, eye:0x7fd0ff, scale:0.92 },
  brute:  { name:'重装尸', color:0x8a5a3a, eye:0xff7a3c, scale:1.35 },
  burst:  { name:'爆裂尸', color:0x9a4d6a, eye:0xff5db0, scale:1.0 },
};
const TRAPS = {
  dart: { name:'飞镖机关', color:0xc8a44d },
  rock: { name:'落石机关', color:0x8a8276 },
  gas:  { name:'毒气机关', color:0x6abf4d },
};

export const WALL_H = 3.4;

// ---------- 材质 ----------
const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.95 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e2a24, roughness: 0.9 });
const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1c1916, roughness: 1 });
const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3d20, roughness: 0.85 });
const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a44d, roughness: 0.35, metalness: 0.7, emissive: 0x3a2c08 });
const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.9 });
const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.8, emissive: 0x221a08 });
const zombieMat = new THREE.MeshStandardMaterial({ color: 0x4a5a42, roughness: 0.95, emissive: 0x0a1408 });
const zombieEyeMat = new THREE.MeshBasicMaterial({ color: 0x8fff4d });
const weaponMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.8, roughness: 0.3, emissive: 0x1a1a22 });

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050403);
  scene.fog = new THREE.FogExp2(0x050403, 0.075);
  const amb = new THREE.AmbientLight(0x8a7a5a, 0.32);
  scene.add(amb);
  scene.userData.amb = amb;
  return scene;
}

// ---------- 墓穴搭建 ----------
export function buildMap(scene, map) {
  const group = new THREE.Group();
  const cs = map.cell, W = map.w, H = map.h;

  // 主题视觉：按服务端下发的 map.theme 重着色墙体/地面/顶/雾/环境光（缺省回退原夯土色）
  const th = map.theme;
  if (th) {
    wallMat.color.setHex(th.wall);
    floorMat.color.setHex(th.floor);
    ceilMat.color.setHex(th.ceil);
    scene.background = new THREE.Color(th.fog);
    scene.fog = new THREE.FogExp2(th.fog, th.fogDensity);
    if (scene.userData.amb) { scene.userData.amb.color.setHex(th.ambient); scene.userData.amb.intensity = th.ambientI; }
  } else {
    wallMat.color.setHex(0x4a4238); floorMat.color.setHex(0x2e2a24); ceilMat.color.setHex(0x1c1916);
    scene.background = new THREE.Color(0x050403); scene.fog = new THREE.FogExp2(0x050403, 0.075);
    if (scene.userData.amb) { scene.userData.amb.color.setHex(0x8a7a5a); scene.userData.amb.intensity = 0.32; }
  }

  let wallCount = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (map.rows[j][i] === '0') wallCount++;
  const wallGeo = new THREE.BoxGeometry(cs, WALL_H, cs);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (map.rows[j][i] !== '0') continue;
    const [x, z] = cell2world(map, i, j);
    m4.makeTranslation(x, WALL_H / 2, z);
    walls.setMatrixAt(k++, m4);
  }
  walls.instanceMatrix.needsUpdate = true;
  group.add(walls);

  const size = W * cs;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0;
  group.add(floor);

  // 三路线区域：安全/机关/凶险墓室叠加低透明地面色与符印
  const routeMarks = [];
  for (const r of map.regions || []) {
    const rw = Math.max(1, r.maxX - r.minX), rh = Math.max(1, r.maxZ - r.minZ);
    const zone = new THREE.Mesh(new THREE.PlaneGeometry(rw, rh),
      new THREE.MeshBasicMaterial({ color:r.color, transparent:true, opacity:r.main ? .18 : .11, depthWrite:false, side:THREE.DoubleSide }));
    zone.rotation.x = -Math.PI / 2; zone.position.set((r.minX + r.maxX) / 2, .018, (r.minZ + r.maxZ) / 2);
    group.add(zone);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.55, .82, r.route === 'danger' ? 3 : r.route === 'mechanism' ? 8 : 20),
      new THREE.MeshBasicMaterial({ color:r.color, transparent:true, opacity:.42, depthWrite:false, side:THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(zone.position.x, .026, zone.position.z);
    group.add(ring); routeMarks.push(ring);
  }

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(size, size), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = WALL_H;
  group.add(ceil);

  // 火把
  const torchPts = [];
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 1.2, 5);
  const flameGeo = new THREE.SphereGeometry(0.14, 6, 6);
  const flameMat = new THREE.MeshBasicMaterial({ color: (th && th.torch) || 0xff9a2e });
  for (const t of map.torches) {
    const pole = new THREE.Mesh(poleGeo, woodMat);
    pole.position.set(t.x, 1.4, t.z);
    group.add(pole);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(t.x, 2.1, t.z);
    group.add(flame);
    torchPts.push(flame);
  }

  // 墓外荒院（无顶、枯土地面）
  if (map.outside) {
    const oz = map.outside;
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(oz.maxX - oz.minX, oz.maxZ - oz.minZ),
      new THREE.MeshStandardMaterial({ color:(th && th.outsideGround) || 0x3a3425, roughness:1 }));
    yard.rotation.x = -Math.PI / 2; yard.position.set((oz.minX + oz.maxX) / 2, 0.015, (oz.minZ + oz.maxZ) / 2);
    group.add(yard);
    for (let n = 0; n < 16; n++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.22, 0), stoneMat);
      rock.position.set(oz.minX + Math.random() * (oz.maxX - oz.minX), 0.12, oz.minZ + Math.random() * (oz.maxZ - oz.minZ));
      group.add(rock);
    }
  }

  // 墓门
  let tombDoor = null;
  if (map.door) {
    tombDoor = new THREE.Group();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.5), stoneMat);
    slab.position.y = 1.6; tombDoor.add(slab);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(0.42, 8), new THREE.MeshBasicMaterial({ color:0xb03a2e }));
    seal.position.set(0, 1.65, -0.27); seal.rotation.y = Math.PI; tombDoor.add(seal);
    tombDoor.position.set(map.door.x, 0, map.door.z); group.add(tombDoor);
  }

  // 棺椁（按品级着色）
  const chests = new Map();
  for (const c of map.chests) {
    const g = new THREE.Group();
    const s = c.big ? 1.5 : 1;
    const tier = CHEST_TIERS[c.tier] || CHEST_TIERS.common;
    const tierMat = new THREE.MeshStandardMaterial({ color: c.big ? 0xc8a44d : tier.color, roughness: 0.55, metalness: c.big ? 0.6 : 0.2, emissive: tier.glow, emissiveIntensity: 0.35 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 0.8 * s, 0.9 * s), tierMat);
    body.position.y = 0.4 * s;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 0.25 * s, 1.0 * s), tierMat);
    lid.position.y = 0.92 * s;
    g.add(lid);
    if (!c.big) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0 * s, 1.25 * s, 20),
        new THREE.MeshBasicMaterial({ color: tier.glow, transparent: true, opacity: 0.5, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
      g.add(ring);
    }
    g.position.set(c.x, 0, c.z);
    group.add(g);
    chests.set(c.id, { group: g, lid, base: 0.92 * s, open: false });
  }

  // 撤离点
  const exitFx = [];
  for (const e of map.exits) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 0.4), stoneMat);
    frame.position.y = 1.5;
    g.add(frame);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6),
      new THREE.MeshBasicMaterial({ color: 0x3f9e9e, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
    glow.position.set(0, 1.4, 0.21);
    g.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, WALL_H, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x3f9e9e, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.y = WALL_H / 2;
    g.add(beam);
    g.position.set(e.x, 0, e.z);
    group.add(g);
    exitFx.push({ glow, beam });
  }

  scene.add(group);
  return { group, chests, torchPts, exitFx, tombDoor, routeMarks };
}

export function cell2world(map, i, j) {
  return [(i - map.w / 2 + 0.5) * map.cell, (j - map.h / 2 + 0.5) * map.cell];
}

// ---------- 人物模型 ----------
// 职业轮廓差异：体型、肩宽、头饰、飘带
const CHAR_PROFILE = {
  mofeng:   { bodyW:0.62, bodyH:0.78, shW:0.24, hat:'cap',   ribbon:false },
  shuangye: { bodyW:0.60, bodyH:0.76, shW:0.23, hat:'hair',  ribbon:true },
  leizhen:  { bodyW:0.70, bodyH:0.80, shW:0.28, hat:'cap',   ribbon:false },
  liuyan:   { bodyW:0.60, bodyH:0.76, shW:0.23, hat:'hair',  ribbon:true },
  tieshan:  { bodyW:0.86, bodyH:0.86, shW:0.36, hat:'helm',  ribbon:false },
  yueyao:   { bodyW:0.58, bodyH:0.76, shW:0.22, hat:'hair',  ribbon:true },
  fengsun:  { bodyW:0.66, bodyH:0.78, shW:0.26, hat:'cap',   ribbon:false },
  hongchen: { bodyW:0.60, bodyH:0.76, shW:0.23, hat:'hair',  ribbon:true },
  canglang: { bodyW:0.72, bodyH:0.82, shW:0.30, hat:'cap',   ribbon:false },
  qingluan: { bodyW:0.58, bodyH:0.76, shW:0.22, hat:'hair',  ribbon:true },
};

export function makeCharacter(colorHex, charKey = 'mofeng') {
  const g = new THREE.Group();
  const prof = CHAR_PROFILE[charKey] || CHAR_PROFILE.mofeng;
  const mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.9 });
  const accentColors = { mofeng:0xd0ad4e, shuangye:0x91bce8, leizhen:0xe06b3c, liuyan:0x70dc91, tieshan:0x979087, yueyao:0xa78be0, fengsun:0x57c6c0, hongchen:0xed765d, canglang:0xbb7545, qingluan:0xea70ae };
  const accentMat = new THREE.MeshStandardMaterial({ color:accentColors[charKey] || colorHex, emissive:accentColors[charKey] || colorHex, emissiveIntensity:0.12, roughness:0.55 });

  const torso = new THREE.Group();
  const hipY = 0.55, bodyH = prof.bodyH, bodyW = prof.bodyW;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, 0.38), mat);
  body.position.y = hipY + bodyH / 2;
  torso.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xd8b894, roughness: 0.7 }));
  head.position.y = hipY + bodyH + 0.2;
  torso.add(head);
  // 头饰：差异化轮廓
  if (prof.hat === 'hair') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), darkMat); hair.scale.set(1.05, .72, 1.05); hair.position.y = 0.18; head.add(hair);
    if (prof.ribbon) { const rb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), accentMat); rb.position.set(0.18, 0.12, -0.12); rb.rotation.z = 0.3; head.add(rb); }
  } else if (prof.hat === 'helm') {
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 8), accentMat); helm.position.y = 0.24; head.add(helm);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.44), darkMat); visor.position.y = 0.12; head.add(visor);
  } else {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.16, 8), darkMat); cap.position.y = 0.24; head.add(cap);
  }
  const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(prof.shW, 0.14, 0.44), accentMat); shoulderL.position.set(-bodyW / 2 - 0.02, hipY + bodyH - 0.04, 0); torso.add(shoulderL);
  const shoulderR = shoulderL.clone(); shoulderR.position.x = bodyW / 2 + 0.02; torso.add(shoulderR);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(bodyW + 0.04, 0.1, 0.41), accentMat); belt.position.y = hipY + 0.06; torso.add(belt);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.08, 8), accentMat); badge.position.set(0, hipY + bodyH * 0.5, -0.2); badge.rotation.y = Math.PI; torso.add(badge);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.2), darkMat); pack.position.set(0, hipY + bodyH * 0.4, 0.28); torso.add(pack);
  // 右臂（持武器）：armR 为 pivot，applyHeldWeapon 注入武器模型
  const armR = new THREE.Group();
  const armRmesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), mat); armRmesh.position.y = -0.2; armR.add(armRmesh);
  armR.position.set(bodyW / 2 + 0.06, hipY + bodyH - 0.04, 0); torso.add(armR);
  // 左臂
  const armL = new THREE.Group();
  const armLmesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), mat); armLmesh.position.y = -0.2; armL.add(armLmesh);
  armL.position.set(-bodyW / 2 - 0.06, hipY + bodyH - 0.04, 0); torso.add(armL);
  g.add(torso);
  // 腿（pivot 在髋，便于行走摆动）
  const legL = new THREE.Group();
  const legLm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), darkMat); legLm.position.y = 0.275; legL.add(legLm);
  legL.position.set(-0.16, hipY, 0); g.add(legL);
  const legR = new THREE.Group();
  const legRm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.22), darkMat); legRm.position.y = 0.275; legR.add(legRm);
  legR.position.set(0.16, hipY, 0); g.add(legR);

  return { group: g, torso, head, armR, armL, legL, legR, heldWeapon: null };
}

// 手持武器模型（适配 armR 坐标系：握把在肩下，武器向下延伸）
const HELD_METAL = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.85, roughness: 0.35, emissive: 0x202028, emissiveIntensity: 0.25 });
export function makeHeldWeapon(type) {
  const g = new THREE.Group();
  if (!type || type === 'fist') return g;
  let mesh;
  switch (type) {
    case 'dagger': mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.1), HELD_METAL); mesh.position.y = -0.3; break;
    case 'sword': mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.14), HELD_METAL); mesh.position.y = -0.5; break;
    case 'spear': { mesh = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), HELD_METAL); s.position.y = -0.4; const t = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.3, 6), HELD_METAL); t.position.y = 0.45; mesh.add(s, t); } break;
    case 'hammer': { mesh = new THREE.Group(); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), HELD_METAL); s.position.y = -0.3; const h = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.28), HELD_METAL); h.position.y = -0.75; mesh.add(s, h); } break;
    case 'crossbow': case 'piercing_crossbow': { mesh = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.22), HELD_METAL); b.position.y = -0.35; const w = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 5, 10, Math.PI), HELD_METAL); w.rotation.x = Math.PI / 2; w.position.y = -0.35; mesh.add(b, w); } break;
    case 'dart': case 'firelock': { mesh = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.6, 8), HELD_METAL); b.rotation.x = Math.PI / 2; b.position.set(0, -0.35, 0.1); mesh.add(b); } break;
    case 'poison_cone': mesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.8, 6), new THREE.MeshStandardMaterial({ color: 0x51c878, metalness: .7, roughness: .25, emissive: 0x123a20 })); mesh.position.y = -0.4; break;
    case 'dragon_blade': mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.16), new THREE.MeshStandardMaterial({ color: 0xe0b44d, metalness: .9, roughness: .18, emissive: 0x362300 })); mesh.position.y = -0.6; break;
    case 'iron_greatsword': mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.5, 0.28), HELD_METAL); mesh.position.y = -0.7; break;
    case 'rain_needles': mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.55, 10), HELD_METAL); mesh.position.y = -0.3; break;
    case 'thunder_talisman': mesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.58, 0.04), new THREE.MeshStandardMaterial({ color: 0xe3bc35, emissive: 0x8a5100, emissiveIntensity: .6 })); mesh.position.y = -0.3; break;
    default: mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.12), HELD_METAL); mesh.position.y = -0.4;
  }
  g.add(mesh);
  return g;
}
export function applyHeldWeapon(parts, type) {
  if (!parts || !parts.armR) return;
  if (parts.heldWeapon) { parts.armR.remove(parts.heldWeapon); parts.heldWeapon = null; }
  const w = makeHeldWeapon(type);
  parts.armR.add(w);
  parts.heldWeapon = w;
}

// 头顶名牌
export function makeNameTag(text, isBot) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 56;
  const ctx = cv.getContext('2d');
  ctx.font = '28px "PingFang SC", "Microsoft YaHei"';
  ctx.textAlign = 'center';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 6;
  ctx.fillStyle = isBot ? '#9a8a68' : '#e8dcc0';
  ctx.fillText(text, 128, 38);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(1.8, 0.4, 1);
  sp.position.y = 2.15;
  return sp;
}

// ---------- 尸煞（按变体着色/缩放，动作差异化）----------
export function makeZombie(variant = 'normal') {
  const g = new THREE.Group();
  const v = ZOMBIE_VARIANTS[variant] || ZOMBIE_VARIANTS.normal;
  const skinMat = zombieMat.clone(); skinMat.color.setHex(v.color);
  const eyeMat = zombieEyeMat.clone(); eyeMat.color.setHex(v.eye);
  const torso = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.04, 0.46), skinMat);
  body.position.y = 1.08; torso.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skinMat);
  head.position.set(0, 1.84, -0.06); head.rotation.x = -0.12; torso.add(head);
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.025), eyeMat);
  eyeL.position.set(-0.11, 1.86, -0.3); torso.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.11; torso.add(eyeR);
  // 双臂（pivot 在肩，前伸挥舞）
  const armGeo = new THREE.BoxGeometry(0.16, 0.16, 0.78);
  const armL = new THREE.Group();
  const armLm = new THREE.Mesh(armGeo, skinMat); armLm.position.z = -0.39; armL.add(armLm);
  armL.position.set(-0.3, 1.42, -0.1); armL.rotation.x = -0.08; torso.add(armL);
  const armR = new THREE.Group();
  const armRm = new THREE.Mesh(armGeo, skinMat); armRm.position.z = -0.39; armR.add(armRm);
  armR.position.set(0.3, 1.42, -0.1); armR.rotation.x = -0.08; torso.add(armR);
  g.add(torso);
  const legL = new THREE.Group();
  const legLm = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.62, 0.25), skinMat); legLm.position.y = 0.31; legL.add(legLm);
  legL.position.set(-0.18, 0, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.18; g.add(legR);
  const ringColor = variant === 'brute' ? 0xff7a3c : variant === 'burst' ? 0xff5db0 : variant === 'swift' ? 0x7fd0ff : 0xb03a2e;
  const threatRing = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 0.68, 20),
    new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })
  );
  threatRing.rotation.x = -Math.PI / 2;
  threatRing.position.y = 0.025;
  g.add(threatRing);
  g.scale.setScalar(1.08 * v.scale);
  // 独立材质支持单只尸煞受击闪烁，不会让全场怪物同时变色。
  return { group: g, torso, body, head, armL, armR, legL, legR, skinMat, eyeMat, threatRing, variant };
}

// ---------- 陷阱机关（地面压力板 + 类型标识）----------
export function makeTrap(type = 'dart') {
  const def = TRAPS[type] || TRAPS.dart;
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.4),
    new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.9 }));
  plate.position.y = 0.06;
  g.add(plate);
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5),
    new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.5, roughness: 0.5 }));
  core.position.y = 0.14;
  g.add(core);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 20),
    new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02;
  g.add(ring);
  return g;
}

// ---------- 危害区域（坍塌危险区地面）----------
export function makeHazard() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.0, 28),
    new THREE.MeshBasicMaterial({ color: 0xb03a2e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.03;
  g.add(disc);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.8, 3.0, 28),
    new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  g.add(ring);
  for (let n = 0; n < 7; n++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + Math.random() * 0.2, 0),
      new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 1 }));
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 2.4;
    r.position.set(Math.cos(a) * rr, 0.14, Math.sin(a) * rr);
    g.add(r);
  }
  return g;
}

// ---------- 地面道具 ----------
const ITEM_STYLE = {
  heal:  { color: 0xd4453a, shape: 'ball' },
  speed: { color: 0x4dc86e, shape: 'charm' },
  armor: { color: 0x4d8fc8, shape: 'charm' },
};
export function makeItem(type) {
  const st = ITEM_STYLE[type] || ITEM_STYLE.heal;
  let mesh;
  if (st.shape === 'ball') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshStandardMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.4 }));
  else mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.04), new THREE.MeshStandardMaterial({ color: st.color, emissive: st.color, emissiveIntensity: 0.35 }));
  mesh.position.y = 0.55;
  return mesh;
}

// ---------- 地面武器模型 ----------
export function makeWeaponPickup(type) {
  const g = new THREE.Group();
  let mesh;
  const mat = new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.8, roughness: 0.3, emissive: 0x222230, emissiveIntensity: 0.3 });
  switch (type) {
    case 'poison_cone':
      mesh = new THREE.Mesh(new THREE.ConeGeometry(.11,.72,6), new THREE.MeshStandardMaterial({color:0x51c878,metalness:.7,roughness:.25,emissive:0x123a20})); mesh.position.y=.42; break;
    case 'dragon_blade':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(.14,1.25,.18), new THREE.MeshStandardMaterial({color:0xe0b44d,metalness:.9,roughness:.18,emissive:0x362300})); mesh.position.y=.65; mesh.rotation.z=.08; break;
    case 'iron_greatsword':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(.24,1.5,.3), new THREE.MeshStandardMaterial({color:0x5c6170,metalness:.8,roughness:.4})); mesh.position.y=.75; break;
    case 'piercing_crossbow':
      mesh = new THREE.Group(); { const body=new THREE.Mesh(new THREE.BoxGeometry(.78,.14,.25),mat); body.position.y=.45; mesh.add(body); const bow=new THREE.Mesh(new THREE.TorusGeometry(.36,.035,5,12,Math.PI),mat); bow.rotation.x=Math.PI/2; bow.position.y=.45; mesh.add(bow); } break;
    case 'rain_needles':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(.18,.25,.58,10), new THREE.MeshStandardMaterial({color:0xb7c9dd,metalness:.9,roughness:.2,emissive:0x24354a})); mesh.position.y=.35; break;
    case 'thunder_talisman':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(.38,.62,.05), new THREE.MeshStandardMaterial({color:0xe3bc35,emissive:0x8a5100,emissiveIntensity:.6})); mesh.position.y=.38; break;
    case 'sword':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.12), mat);
      mesh.position.y = 0.5; break;
    case 'dagger':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.08), mat);
      mesh.position.y = 0.3; break;
    case 'spear':
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), mat);
      mesh.position.y = 0.8; break;
    case 'hammer':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.25), mat);
      mesh.position.y = 0.4; break;
    case 'crossbow':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.2), mat);
      mesh.position.y = 0.4; break;
    case 'dart':
      mesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 4), mat);
      mesh.position.y = 0.3; break;
    case 'firelock':
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), mat);
      mesh.position.y = 0.4; break;
    default:
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), mat);
      mesh.position.y = 0.3;
  }
  // 光环
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 16),
    new THREE.MeshBasicMaterial({ color: 0xc8a44d, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  g.add(mesh);
  g.position.y = 0;
  return g;
}

// ---------- 怪物掉落宝箱 ----------
export function makeMonsterChest(color) {
  const colors={red:0xd62f24,purple:0x763bb8,white:0xe9e6dc,gold:0xe0ad2f};
  const g=new THREE.Group(), mat=new THREE.MeshStandardMaterial({color:colors[color]||0xffffff,metalness:.55,roughness:.3,emissive:colors[color]||0xffffff,emissiveIntensity:.18});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.72,.45,.55),mat);body.position.y=.28;g.add(body);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(.76,.18,.59),mat);lid.position.y=.58;g.add(lid);
  const lock=new THREE.Mesh(new THREE.BoxGeometry(.13,.18,.06),goldMat);lock.position.set(0,.44,-.31);g.add(lock);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.58,20),new THREE.MeshBasicMaterial({color:colors[color],transparent:true,opacity:.42,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;g.add(ring);
  return g;
}

// ---------- 掉落宝袋 ----------
export function makeLootBag() {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), bagMat);
  bag.scale.y = 0.8; bag.position.y = 0.28;
  g.add(bag);
  const knot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.16, 6), goldMat);
  knot.position.y = 0.56;
  g.add(knot);
  return g;
}

// ---------- 飞行物 ----------
export function makeProjectile() {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.2, emissive: 0x444455, emissiveIntensity: 0.3 }));
  m.rotation.x = Math.PI / 2;
  return m;
}
