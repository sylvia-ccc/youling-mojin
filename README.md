# 幽陵摸金 - 网页多人合作摸金游戏

## 项目概述

3D 网页多人合作 PVE 摸金游戏。玩家选择原创角色，真人优先匹配、AI 补位；经过20秒武器整备后，从荒院杀入古墓，合作对抗尸煞、开棺摸金、开启怪物宝箱并撤离结算。玩家之间没有友伤，支持手机和平板横屏触控。

## 技术栈

- **前端**: 纯 HTML + CSS + Three.js (ES Module, 无框架)
- **后端**: Node.js + WebSocket (ws)
- **3D 引擎**: Three.js r0.185
- **轻量持久化**: 对局状态在内存；匿名运营统计写入本地 JSON（原子替换）

## 项目结构

```
youling-mojin/
├── package.json          # 依赖与启动命令
├── server/
│   ├── server.js         # HTTP + WebSocket 服务 (73行)
│   ├── game.js           # 游戏核心逻辑 (717行) - 房间/战斗/摸金/尸煞/机器人
│   ├── mapgen.js         # 古墓地图程序化生成 (210行)
│   └── shared.js         # 共享常量: 10角色/8武器/明器 (72行)
├── client/
│   ├── index.html        # 入口页面 (97行)
│   ├── css/style.css     # 全部样式 (131行)
│   ├── js/
│   │   ├── main.js       # 主逻辑: 输入/相机/网络同步/渲染循环 (692行)
│   │   ├── world.js      # 3D 场景构建: 墙体/火把/雾效/角色/武器 (278行)
│   │   ├── hud.js        # HUD 界面: 血量/背包/小地图/击杀播报 (169行)
│   │   └── net.js        # WebSocket 客户端封装 (21行)
│   └── vendor/
│       ├── three.module.js   # Three.js 引擎 (从 npm 拷贝)
│       └── three.core.js
└── test/
    ├── smoke.mjs         # 协议冒烟测试
    └── debug.mjs         # 地图连通性调试
```

## 依赖

```json
{
  "three": "^0.185.1",
  "ws": "^8.21.1"
}
```

## 本地运行

```bash
npm install
npm start
# 打开 http://localhost:8080
```

## 部署指南

### 方式一：传统服务器 / VPS

```bash
# 1. 上传整个 youling-mojin 目录到服务器
# 2. 安装 Node.js >= 18
# 3. 安装依赖
npm install
# 4. 启动（默认端口 8080，可通过 PORT 环境变量修改）
PORT=3000 npm start

# 可选：启用管理员统计后台（密码至少12位）
ADMIN_USER=admin ADMIN_PASSWORD='请替换为高强度密码' PORT=3000 npm start
# 后台地址：http://localhost:3000/admin

# 可选：修改统计文件位置
ANALYTICS_FILE=/data/youling-analytics.json npm start

# 5. 用 nginx 反代到 80/443，记得代理 WebSocket:
#    proxy_set_header Upgrade $http_upgrade;
#    proxy_set_header Connection "upgrade";
```

### 方式二：Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server/server.js"]
```

```bash
docker build -t youling-mojin .
docker run -p 8080:8080 youling-mojin
```

### 方式三：云平台 (Railway / Render / Fly.io)

1. 推送代码到 GitHub
2. 创建新项目，选择该仓库
3. 构建命令: `npm install`
4. 启动命令: `node server/server.js`
5. 端口: 8080（或设置 PORT 环境变量）
6. 注意：WebSocket 需要平台支持长连接

### 关键部署注意事项

1. **WebSocket 必须**: 平台/Nginx 必须支持 WebSocket 长连接
2. **对局不持久化**: 服务重启后进行中的房间会丢失；管理员匿名统计会保留在 JSON 文件中
3. **端口**: 默认 8080，可通过 `PORT` 环境变量修改
4. **静态文件**: server.js 同时托管 client/ 目录的静态文件，无需额外 Web 服务器
5. **HTTPS**: 生产环境建议 HTTPS + WSS，否则浏览器可能阻止 WebSocket

## 游戏内容

### 10 个角色 (5男5女)

| ID | 名字 | 性别 | 技能 |
|----|------|------|------|
| mofeng | 墨锋 | 男 | 剑意 - 近战伤害+30% |
| shuangye | 霜叶 | 女 | 影遁 - 闪避25% |
| leizhen | 雷震 | 男 | 震击 - 近战附带AOE |
| liuyan | 柳烟 | 女 | 回春 - 回血效果翻倍 |
| tieshan | 铁山 | 男 | 铁壁 - 受伤减免20% |
| yueyao | 月瑶 | 女 | 寒霜 - 命中附带减速 |
| fengsun | 风隼 | 男 | 鹰眼 - 远程伤害+50% |
| hongchen | 红尘 | 女 | 妙手 - 开棺速度翻倍 |
| shenglang | 苼狼 | 男 | 狂战 - 血量<40%攻击+50% |
| qingluan | 青鸾 | 女 | 灵巧 - 移速+20%闪避15% |

### 8 种武器

| 武器 | 类型 | 伤害 | 特点 |
|------|------|------|------|
| 拳脚 | 近战 | 12 | 默认，无限 |
| 匕首 | 近战 | 20 | 攻速快 |
| 长剑 | 近战 | 30 | 平衡 |
| 长枪 | 近战 | 35 | 范围大 |
| 铁锤 | 近战 | 40 | AOE伤害 |
| 连弩 | 远程 | 25 | 3发弹药 |
| 飞镖 | 远程 | 20 | 5发弹药 |
| 火铳 | 远程 | 60 | 1发高伤 |

### 玩法循环

角色选择 → 真人优先匹配 → 20秒购买/装备玄兵 → 荒院合作战斗 → 真人开启墓门 → 古墓开棺摸金 → 尸煞四色宝箱 → 撤离结算。
真人死亡后观战存活队友，可切换目标或主动退出；没有存活队友时自动返回主页面。AI 校尉可按规则重返战斗。

### 操作

- WASD 移动
- 鼠标转视角
- 左键 攻击
- E 开棺摸金
- V 切换第一/第三人称
- Shift 疾跑
- 1-3 使用快捷栏道具
- 手机/平板：必须横屏；左摇杆移动、右侧滑动转向、右侧按钮攻击/交互/疾跑

## 管理员统计后台

- 默认关闭，不设置环境变量时 `/admin` 返回 404。
- 设置 `ADMIN_USER` 和至少12位的 `ADMIN_PASSWORD` 后启用。
- 使用浏览器 Basic Auth 登录，可查看累计进入次数、匿名独立用户数、当前在线人数和近期进入记录。
- 用户以浏览器本地生成的匿名 ID 去重；服务端只保存脱敏 IP，不保存完整地址。
- 默认数据文件为 `data/analytics.json`，写盘时先写临时文件再原子替换。
