// HUD：血条、背包、快捷栏、武器栏、小地图、播报、结算
const $ = id => document.getElementById(id);

const ITEM_ICON = { heal: '🩸', speed: '💨', armor: '🛡' };
const ITEM_NAME = { heal: '回阳丹', speed: '神行符', armor: '护身符' };

export class HUD {
  constructor() {
    this.mm = $('minimap').getContext('2d');
    this.map = null;
    this.announceTimer = null;
    this.last = {};
  }

  setMap(map) { this.map = map; this.mmStatic = null; }

  hp(cur, max) {
    const value = Math.max(0, cur / max * 100);
    if (this.last.hp === value) return;
    this.last.hp = value;
    $('hpFill').style.width = value + '%';
    const level = value <= 15 ? 'critical' : value <= 35 ? 'low' : 'normal';
    if (this.last.hpLevel !== level) {
      this.last.hpLevel = level;
      $('hpWrap').classList.toggle('low', level === 'low');
      $('hpWrap').classList.toggle('critical', level === 'critical');
      $('lowHpPulse').classList.toggle('active', level !== 'normal');
      $('lowHpPulse').classList.toggle('critical', level === 'critical');
    }
  }

  buffs(p) {
    let html = '';
    if (p.spd) html += '<span class="buff">神行</span>';
    if (p.arm) html += '<span class="buff armor">护身</span>';
    if (p.slow) html += '<span class="buff slow">减速</span>';
    if (this.last.buffs === html) return;
    this.last.buffs = html;
    $('buffs').innerHTML = html;
  }

  bag(value, w, limit) {
    const key = `${value}:${w}:${limit}`;
    if (this.last.bag === key) return;
    this.last.bag = key;
    $('bagValue').textContent = '💰 ' + value;
    const el = $('bagWeight');
    el.textContent = `${w}/${limit}斤`;
    el.classList.toggle('heavy', w >= limit * .8 && w < limit);
    el.classList.toggle('full', w >= limit);
  }

  danger(value, opened = 0) {
    const v = Math.max(0, Math.min(5, Number(value) || 0));
    const level = Math.min(5, Math.ceil(v));
    const key = `${v.toFixed(2)}:${opened}`;
    if (this.last.danger === key) return;
    this.last.danger = key;
    const el = $('dangerState');
    el.className = v >= 3.5 ? 'high' : v >= 1.5 ? 'watch' : 'calm';
    el.querySelector('span').textContent = `阴气 ${level}/5 · 已开${opened}棺`;
    $('dangerFill').style.width = (v / 5 * 100) + '%';
    $('dangerTip').textContent = v >= 4.5 ? '尸潮将至 · 建议立即撤离' : v >= 3 ? '凶险加剧 · 继续摸金或撤离' : v >= 1.5 ? '尸煞警觉正在提高' : '墓穴尚算平静';
  }

  hotbar(hotbar) {
    let html = '';
    for (let i = 0; i < 3; i++) {
      const it = hotbar[i];
      html += `<div class="slot" data-slot="${i}" role="button" aria-label="使用${ITEM_NAME[it?.type] || `第${i + 1}格道具`}"><span class="key">${i + 1}</span>` +
        (it ? `<span class="ico">${ITEM_ICON[it.type] || '?'}</span><span class="nm">${ITEM_NAME[it.type] || ''}</span>` : '') +
        `</div>`;
    }
    $('hotbar').innerHTML = html;
  }

  weapon(wname, icon, ammo, type) {
    $('weaponIcon').textContent = icon || '✊';
    $('weaponName').textContent = wname || '拳脚';
    $('weaponAmmo').textContent = (type === 'ranged' && ammo > 0) ? '×' + ammo : '';
  }

  timer(ms, exitsOpen) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const el = $('timer');
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    el.classList.toggle('urgent', s <= 60);
    const es = $('exitState');
    es.textContent = exitsOpen ? '✦ 撤离点已开启 ✦' : '撤离点未开启';
    es.classList.toggle('open', exitsOpen);
  }

  killfeed(text) {
    const div = document.createElement('div');
    div.className = 'kf';
    div.textContent = text;
    $('killfeed').prepend(div);
    setTimeout(() => div.remove(), 5000);
    while ($('killfeed').children.length > 5) $('killfeed').lastChild.remove();
  }

  announce(text, ms = 2600) {
    const el = $('announce');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  interactTip(html) {
    const el = $('interactTip');
    if (!html) el.classList.add('hidden');
    else { el.innerHTML = html; el.classList.remove('hidden'); }
  }

  prog(v, label = '交互中') {
    const w = $('progWrap');
    if (v == null || v <= 0) { w.classList.add('hidden'); return; }
    w.classList.remove('hidden');
    $('progLabel').textContent = label;
    $('progBar').style.width = (v * 100) + '%';
  }

  hitMarker(killed = false) {
    const el = $('hitMarker');
    el.classList.remove('show', 'kill');
    void el.offsetWidth;
    el.classList.add('show');
    if (killed) el.classList.add('kill');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => el.classList.remove('show', 'kill'), 150);
  }

  dmgFlash() {
    const el = $('dmgFlash');
    el.style.opacity = 1;
    clearTimeout(this.dmgTimer);
    this.dmgTimer = setTimeout(() => el.style.opacity = 0, 150);
  }

  dead(show) {
    $('deadOverlay').classList.toggle('hidden', !show);
  }

  out(show, value) {
    $('outOverlay').classList.toggle('hidden', !show);
    if (show) $('outTip').textContent = `💰 ${value} 铜元已入库 · 观战中`;
  }

  minimap(players, myId, chests, exits, exitsOpen, bags) {
    if (!this.map) return;
    const ctx = this.mm, S = 180;
    const scale = S / (this.map.w * this.map.cell);
    if (!this.mmStatic) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = S;
      const c = cv.getContext('2d');
      c.fillStyle = '#0a0906'; c.fillRect(0, 0, S, S);
      const routeColor = { safe:'rgba(79,157,114,.28)', mechanism:'rgba(195,154,69,.28)', danger:'rgba(180,67,53,.3)' };
      for (const r of this.map.regions || []) {
        const x = (r.minX / this.map.cell + this.map.w / 2) * this.map.cell * scale;
        const y = (r.minZ / this.map.cell + this.map.h / 2) * this.map.cell * scale;
        c.fillStyle = routeColor[r.route] || 'rgba(255,255,255,.1)';
        c.fillRect(x, y, (r.maxX - r.minX) * scale, (r.maxZ - r.minZ) * scale);
      }
      c.fillStyle = '#4a4238';
      for (let j = 0; j < this.map.h; j++) for (let i = 0; i < this.map.w; i++) {
        if (this.map.rows[j][i] === '0') c.fillRect(i * this.map.cell * scale, j * this.map.cell * scale, this.map.cell * scale + .5, this.map.cell * scale + .5);
      }
      this.mmStatic = cv;
    }
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mmStatic, 0, 0);
    const toMap = (x, z) => [(x / this.map.cell + this.map.w / 2) * this.map.cell * scale, (z / this.map.cell + this.map.h / 2) * this.map.cell * scale];
    for (const e of exits) {
      const [x, y] = toMap(e.x, e.z);
      ctx.fillStyle = exitsOpen ? '#3f9e9e' : '#2a4a4a';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fill();
    }
    const tierColor = { common: '#8a7434', fine: '#4dc86e', epic: '#9b59b6', legendary: '#ffd700' };
    for (const ch of chests) {
      if (ch.empty) continue;
      const [x, y] = toMap(ch.x, ch.z);
      ctx.fillStyle = ch.big ? '#ffd700' : (tierColor[ch.tier] || '#8a7434');
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const b of bags || []) {
      const [x, y] = toMap(b.x, b.z);
      ctx.fillStyle = '#c8a44d';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
    }
    for (const p of players) {
      if (p.st === 'dead') continue;
      const [x, y] = toMap(p.x, p.z);
      if (p.id === myId) {
        ctx.fillStyle = '#e8dcc0';
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(Math.sin(p.ry), Math.cos(p.ry)));
        ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(3.5, 4); ctx.lineTo(-3.5, 4); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = '#b03a2e';
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      }
    }
  }

  scoreboard(board, myId, chars) {
    let html = '<div class="sb-row head"><span>#</span><span>摸金校尉</span><span>入库铜元</span><span>击杀</span><span>结局</span></div>';
    board.forEach((r, i) => {
      const cname = chars?.[r.char]?.name || '';
      const fate = r.out ? '<span style="color:#3f9e9e">生还</span>' : '<span style="color:#b03a2e">留在墓中</span>';
      html += `<div class="sb-row ${r.id === myId ? 'me' : ''}">
        <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
        <span>${r.name}${r.bot ? '' : ' 👤'} <small style="color:#6a5d42">${cname}</small></span>
        <span class="v">💰${r.banked}</span><span>${r.kills}</span><span>${fate}</span></div>`;
    });
    $('scoreboard').innerHTML = html;
  }
}
