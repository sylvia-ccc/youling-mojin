import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_RECENT = 100;
const FLUSH_MS = 2000;

export class Analytics {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = `${filePath}.tmp`;
    this.data = { totalEntries: 0, visitors: {}, recent: [] };
    this.online = new Map();
    this.dirty = false;
    this.load();
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
    this.timer.unref?.();
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        this.data.totalEntries = Number(parsed.totalEntries) || 0;
        this.data.visitors = parsed.visitors && typeof parsed.visitors === 'object' ? parsed.visitors : {};
        this.data.recent = Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [];
      }
    } catch {}
  }

  hashVisitor(raw) {
    return crypto.createHash('sha256').update(String(raw)).digest('hex').slice(0, 20);
  }

  recordEntry({ visitorId, name, char, ip, connectionId }) {
    const id = this.hashVisitor(visitorId || `${ip}|${name}`);
    const now = new Date().toISOString();
    const visitor = this.data.visitors[id] || { firstSeen: now, entries: 0 };
    visitor.lastSeen = now;
    visitor.entries++;
    this.data.visitors[id] = visitor;
    this.data.totalEntries++;
    this.online.set(connectionId, { id, name: String(name || '无名氏').slice(0, 12), since: now });
    this.data.recent.unshift({ at: now, visitor: id.slice(0, 8), name: String(name || '无名氏').slice(0, 12), char: String(char || ''), ip: this.maskIp(ip) });
    this.data.recent = this.data.recent.slice(0, MAX_RECENT);
    this.dirty = true;
  }

  disconnect(connectionId) {
    this.online.delete(connectionId);
  }

  maskIp(ip = '') {
    const value = String(ip).replace(/^::ffff:/, '');
    if (value.includes('.')) {
      const parts = value.split('.');
      return `${parts[0] || '*'}.*.*.${parts[3] || '*'}`;
    }
    return value ? `${value.slice(0, 5)}…` : '未知';
  }

  snapshot() {
    return {
      totalEntries: this.data.totalEntries,
      uniqueVisitors: Object.keys(this.data.visitors).length,
      onlineUsers: this.online.size,
      recent: this.data.recent.slice(0, 40),
      updatedAt: new Date().toISOString()
    };
  }

  flush(force = false) {
    if (!this.dirty && !force) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.tmpPath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      fs.renameSync(this.tmpPath, this.filePath);
      this.dirty = false;
    } catch (err) {
      console.error('[统计] 写入失败:', err.message);
    }
  }

  close() {
    clearInterval(this.timer);
    this.flush(true);
  }
}
