// WebSocket 客户端封装
export class Net {
  constructor() { this.handlers = {}; this.ws = null; }
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}`);
      this.ws.onopen = () => resolve();
      this.ws.onerror = e => reject(e);
      this.ws.onclose = () => this.emit('close', {});
      this.ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        this.emit(m.t, m);
      };
    });
  }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, m) { (this.handlers[type] || []).forEach(fn => fn(m)); }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  close() { this.ws?.close(); }
}
