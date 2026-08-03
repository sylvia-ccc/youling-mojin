// 冒烟测试：模拟 2 个真人玩家加入 -> 开局 -> 移动/攻击/开棺 -> 校验快照
import WebSocket from 'ws';

const URL = 'ws://localhost:8080';
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '✅' : '❌') + ' ' + msg); if (!cond) failures++; };

function client(name, char) {
  const ws = new WebSocket(URL);
  const c = { ws, name, id: null, msgs: [], snaps: 0, started: null, events: [] };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name, char })));
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'joined') c.id = m.id;
    if (m.t === 'start') c.started = m;
    if (m.t === 'snap') { c.snaps++; c.lastSnap = m; for (const e of m.ev) c.events.push(e); }
    c.msgs.push(m.t);
  });
  return c;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const a = client('测试甲', 'hu');
const b = client('测试乙', 'shao');
await sleep(500);
ok(a.id && b.id, '两名玩家已加入并拿到ID');

// 双方都 ready 触发提前开局
a.ws.send(JSON.stringify({ t: 'ready', v: true }));
b.ws.send(JSON.stringify({ t: 'ready', v: true }));
await sleep(1500);

ok(!!a.started && !!b.started, '收到开局消息 start');
if (a.started) {
  const m = a.started;
  ok(m.map && m.map.rows.length === m.map.h, `地图下发 ${m.map.w}x${m.map.h}`);
  ok(m.map.chests.length >= 8, `棺材数量 ${m.map.chests.length}（含主墓室宝棺）`);
  ok(m.map.chests.some(c => c.big), '存在主墓室大宝棺');
  ok(m.map.exits.length === 2, '撤离点 x2');
  ok(m.map.items.length >= 10, `地面道具 ${m.map.items.length} 个`);
  ok(m.players.length >= 5, `局内人数 ${m.players.length}（真人2 + AI补位）`);
  const bots = m.players.filter(p => p.bot);
  ok(bots.length >= 3, `AI 校尉补位 ${bots.length} 个`);
}

// 移动上报
for (let i = 0; i < 5; i++) {
  a.ws.send(JSON.stringify({ t: 'st', p: [a.started ? (Math.random() * 4 - 2) : 0, 0], ry: 0, a: 'run' }));
  await sleep(60);
}
await sleep(500);
ok(a.snaps > 3, `收到游戏快照 x${a.snaps}`);
const meInSnap = a.lastSnap?.players.find(p => p.id === a.id);
ok(!!meInSnap && meInSnap.st === 'alive', '快照中包含自己且存活');
const botInSnap = a.lastSnap?.players.filter(p => p.id.startsWith('b'));
ok(botInSnap?.length >= 3, '快照中AI在移动更新');

// 攻击
a.ws.send(JSON.stringify({ t: 'atk' }));
await sleep(300);
ok(a.events.some(e => e.k === 'swing'), '攻击事件广播');

// 走到棺材旁开棺（小步移动，避免被防瞬移拉回）
const chest = a.started.map.chests[1] || a.started.map.chests[0];
let myPos = a.lastSnap.players.find(p => p.id === a.id);
let px = myPos.x, pz = myPos.z;
for (let i = 0; i < 200; i++) {
  const d = Math.hypot(chest.x + 1 - px, chest.z - pz);
  if (d < 1.2) break;
  px += (chest.x + 1 - px) / d * 0.7;
  pz += (chest.z - pz) / d * 0.7;
  a.ws.send(JSON.stringify({ t: 'st', p: [px, pz], ry: 0 }));
  await sleep(70);
}
for (let i = 0; i < 30; i++) {
  a.ws.send(JSON.stringify({ t: 'open', id: chest.id }));
  await sleep(160);
}
ok(a.events.some(e => e.k === 'chest'), '开棺成功并拿到明器事件');

// 尸煞快照存在
ok(a.lastSnap.zombies.length > 0, `尸煞在线 x${a.lastSnap.zombies.length}`);

// 观察 AI 行为：等 15 秒看 AI 是否开棺/打架
await sleep(15000);
const botChest = a.events.filter(e => e.k === 'chest' && String(e.by).startsWith('b'));
ok(botChest.length > 0, `AI 自主开棺摸金 x${botChest.length} 次`);
const botMoved = a.lastSnap.players.some(p => String(p.id).startsWith('b') && (Math.abs(p.x) > 2 || Math.abs(p.z) > 2));
ok(botMoved, 'AI 在墓中游走');

a.ws.close(); b.ws.close();
await sleep(300);
console.log(failures ? `\n❌ ${failures} 项失败` : '\n🎉 全部通过');
process.exit(failures ? 1 : 0);
