// 调试：1) 单机验证地图连通性 2) 观察 AI 位置变化
import { generateMap, findPath } from '../server/mapgen.js';
import WebSocket from 'ws';

// --- 1. 地图连通性 ---
const map = generateMap();
console.log('出生点:', map.spawns.map(s => `(${s.x},${s.z})`).join(' '));
console.log('棺材数:', map.chests.length);
let unreachable = 0;
for (const s of map.spawns) {
  for (const c of map.chests) {
    if (!findPath(map, s.x, s.z, c.x, c.z)) unreachable++;
  }
}
console.log('出生点->棺材 不可达组合:', unreachable);
for (const c of map.chests) {
  if (!findPath(map, map.spawns[0].x, map.spawns[0].z, c.x, c.z)) console.log('  不可达棺材:', c);
}
for (const e of map.exits) {
  if (!findPath(map, map.spawns[0].x, map.spawns[0].z, e.x, e.z)) console.log('  不可达撤离点:', e);
}

// --- 2. 在线观察 AI ---
const ws = new WebSocket('ws://localhost:8080');
ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: '观察者', char: 'hu' })));
let snapCount = 0;
const botTrail = new Map();
ws.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t === 'joined') ws.send(JSON.stringify({ t: 'ready', v: true }));
  if (m.t === 'start') console.log('\n开局，玩家:', m.players.map(p => `${p.id}:${p.name}${p.bot ? '(AI)' : ''}`).join(', '));
  if (m.t === 'snap') {
    snapCount++;
    for (const p of m.players) {
      if (!p.id.startsWith('b')) continue;
      if (!botTrail.has(p.id)) botTrail.set(p.id, []);
      const tr = botTrail.get(p.id);
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(p.x - last[0], p.z - last[1]) > 0.5) tr.push([p.x, p.z]);
    }
    if (snapCount === 100) {
      for (const [id, tr] of botTrail) {
        console.log(`${id} 移动点数: ${tr.length}`, tr.length ? `起(${tr[0][0].toFixed(1)},${tr[0][1].toFixed(1)}) 末(${tr[tr.length-1][0].toFixed(1)},${tr[tr.length-1][1].toFixed(1)})` : '原地不动');
      }
      ws.close();
      process.exit(0);
    }
  }
});
setTimeout(() => { console.log('超时'); process.exit(1); }, 30000);
