---
name: consciousness-sea
description: 处理 consciousness-sea 目录（意识之海游戏）的改动时使用。涵盖 js 模块加载顺序约定、模块职责、本地运行方式、回归测试脚本、已知坑位。仅在与该游戏相关的任务中触发，不影响其他项目。
---

# 意识之海 · 开发约定

主目录 `consciousness-sea/chapter-1/`。现代意识流文字实时战斗游戏，纯前端（HTML+CSS+JS），**无构建工具、无框架、无 npm 依赖**。

## 目录结构
- `index.html` — 入口，script 标签按下方顺序加载（= 依赖方向）
- `js/` — 17 个模块
- `style.css` — 全部样式
- `MUSIC/` — BGM 音频素材
- `../测试/` — 验证/回归脚本（`_*.js`），改完对应系统要跑
- `../设定/` — 剧情与设定文档

## js 模块加载顺序（= 依赖方向，禁止随意调整）
```
config → echo → sound → particles → dialogue → cinematic
→ projectile → battle → boss → map → rooms → shop → permanent-shop
→ tutorial → hub → bestiary → main
```
新加模块必须排在它依赖的模块之后。

## 模块职责速查
- config.js — 全局配置/常量
- echo.js — 遗响构筑系统（v4.0 新增，词条池）
- sound.js — 音频与 BGM 双缓冲
- particles.js — 粒子系统（零的粒子形体）
- dialogue.js — 对话系统
- cinematic.js — 过场演出（序章合体演出等）
- projectile.js — 小怪弹幕
- battle.js — 实时文字战斗
- boss.js — 三层肉鸽 Boss（忆/执/遗憾）
- map.js — 地图与房间生成
- rooms.js — 房间逻辑
- shop.js / permanent-shop.js — 商店与常驻商店
- tutorial.js — 新手教程
- hub.js — 中枢大厅（飘浮选择）
- bestiary.js — 图鉴
- main.js — 主入口/初始化

## 运行与测试
- **file:// 直接打开受 CORS 限制**（涉及 fetch/ES module 会失败），一律起本地 server：
  `python3 -m http.server 8765 --directory consciousness-sea`
  然后访问 `http://localhost:8765/chapter-1/index.html`
- 也可用 `测试/_server.js`
- 改完对应系统，到 `测试/` 跑相关回归脚本，例如：
  - 遗响系统 → `_echo_regress.js` / `_echo_verify.js`
  - 事件系统 → `_event_verify.js`
  - 第一章 → `_ch1_verify.js`

## UI 检查约定
- 查界面/布局/样式/渲染问题：**必须**用 Playwright 截图 + vision.js 视觉模型看实际渲染，禁止只读代码推断
- 识图流程见 skill `look-at-image`

## 已知坑位
1. **file:// CORS 限制** — 涉及 fetch/存档/存储的验证必须走 server
2. **BGM 双缓冲** — 改 sound.js 时别破坏双 buffer 无缝切换
3. **boss 残留** — 切换场景后 Boss 的实例/监听器/粒子必须清理干净，否则画面残留

## 版本基线
- v4.1 事件系统：通用池 9 + 独特池 6（碎片剧情，一次性）
- 三层肉鸽：忆 / 执 / 遗憾 三个 Boss
- 改造既有系统时，先看对应模块职责与加载顺序再动手
