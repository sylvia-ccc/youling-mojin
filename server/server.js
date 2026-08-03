// 《幽陵摸金》服务端：静态文件 + WebSocket 匹配
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { Room } from './game.js';
import { CHARS } from './shared.js';
import { Analytics } from './analytics.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const CLIENT = path.join(__dirname, '..', 'client');
const PORT = process.env.PORT || 8080;
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_ENABLED = ADMIN_USER.length > 0 && ADMIN_PASSWORD.length >= 12;
const analytics = new Analytics(process.env.ANALYTICS_FILE || path.join(__dirname, '..', 'data', 'analytics.json'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function adminAuthorized(req) {
  if (!ADMIN_ENABLED) return false;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch { return false; }
  const i = decoded.indexOf(':');
  return i > -1 && safeEqual(decoded.slice(0, i), ADMIN_USER) && safeEqual(decoded.slice(i + 1), ADMIN_PASSWORD);
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  if (p === '/api/admin/stats') {
    if (!ADMIN_ENABLED) return sendJson(res, 404, { error: 'disabled' });
    if (!adminAuthorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Youling Admin", charset="UTF-8"', 'Cache-Control': 'no-store' });
      return res.end('Unauthorized');
    }
    return sendJson(res, 200, analytics.snapshot());
  }
  if (p === '/admin' || p === '/admin/') p = '/admin.html';
  if (p === '/admin.html' && !ADMIN_ENABLED) { res.writeHead(404); return res.end('not found'); }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(CLIENT, p));
  if (!file.startsWith(CLIENT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const rooms = new Map();
let lobbyRoom = null;

function getLobbyRoom() {
  if (lobbyRoom && lobbyRoom.state === 'lobby' && [...lobbyRoom.players.values()].filter(p => !p.bot).length < lobbyRoom.maxReal) {
    return lobbyRoom;
  }
  lobbyRoom = new Room(r => { rooms.delete(r.id); if (lobbyRoom === r) lobbyRoom = null; });
  rooms.set(lobbyRoom.id, lobbyRoom);
  // 匹配等待：2 秒查一次是否可开局（超时补机器人）
  lobbyRoom.startTimer = setInterval(() => { if (lobbyRoom) lobbyRoom.tryStart(); }, 1000);
  return lobbyRoom;
}

wss.on('connection', (ws, request) => {
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join') {
      if (ws._room) return;
      const room = getLobbyRoom();
      const char = CHARS[m.char] ? m.char : 'mofeng';
      const p = room.addPlayer(ws, m.name, char);
      const forwarded = String(request.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
      const ip = forwarded || request.socket?.remoteAddress || '';
      analytics.recordEntry({ visitorId: m.visitorId, name: p.name, char, ip, connectionId: p.id });
      ws._analyticsId = p.id;
      ws.send(JSON.stringify({ t: 'joined', id: p.id, room: room.id }));
      room.broadcast(room.lobbyInfo());
      room.tryStart();
      return;
    }
    const room = ws._room, p = room?.players.get(ws._pid);
    if (!room || !p) return;
    if (m.t === 'leave') { room.removePlayer(p); analytics.disconnect(ws._analyticsId); ws._analyticsId = null; ws._room = null; ws._pid = null; return; }
    room.onMessage(p, m);
  });
  ws.on('close', () => {
    const room = ws._room, p = room?.players.get(ws._pid);
    if (room && p) room.removePlayer(p);
    analytics.disconnect(ws._analyticsId);
  });
});

server.listen(PORT, () => {
  console.log(`[幽陵摸金] 服务已启动: http://localhost:${PORT}`);
  console.log(`[管理员后台] ${ADMIN_ENABLED ? `已启用: http://localhost:${PORT}/admin` : '未启用（需设置 ADMIN_USER 和至少12位 ADMIN_PASSWORD）'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    analytics.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 2000).unref();
  });
}
