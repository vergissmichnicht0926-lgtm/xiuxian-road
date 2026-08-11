# 意识之海 · 自动测试体系

纯静态 HTML 游戏（无构建工具）。端到端测试用 **Node CDP 脚本驱动真实 Chrome**：
起静态服务器 → 起带远程调试的 Chrome → CDP 脚本注入自动推进器走完流程。

## 快速开始

```bash
# 1. 起静态服务器（后台）
node 测试/_server.js &

# 2. 起带远程调试的 Chrome（后台，端口 9222）
"/c/Program Files/Google/Chrome/Application/chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir="/c/Users/你的用户名/AppData/Local/Temp/chrome-echo-profile" \
  --disable-gpu --no-first-run about:blank &

# 3. 跑测试脚本
node 测试/_echo_verify.js      # 遗响三层冒烟
node 测试/_echo_regress.js     # 遗响回归（存档恢复 + ESC）
node 测试/_ch1_verify.js       # 第一章肉鸽冒烟
node 测试/_cdp_full2.js        # 序章回归
```

## 目录

| 文件 | 用途 |
|------|------|
| `_server.js` | 静态服务器（端口 8734，ROOT 指向 `../chapter-1`） |
| `_cdp_harness.js` | **可复用模板**：CDP 连接基建 + 自动推进器骨架。写新测试时复制它 |
| `_echo_verify.js` | 遗响端到端冒烟：三层走通、Boss 三选一×3、多渠道收集、回 Hub |
| `_echo_regress.js` | 遗响回归：存档恢复 echoes + ESC 放弃三选一不卡死 |
| `_ch1_verify.js` | 第一章肉鸽冒烟（存档进 Hub → 走完三层 → 回 Hub） |
| `_cdp_full2.js` | 序章回归（教程 → 憾 → 序章潜航 → 遗 → 安全屋 → Hub） |
| `_boss_fight.js` | 锁血观察单场 Boss 攻击循环（需手动锁血） |

## 怎么写一个新测试

1. 复制 `_cdp_harness.js` 为 `_my_test.js`
2. 在 `INJECT` 的自动推进器里按场景加分支（三选一 / 商店 / 事件 / Boss / 地图…）
3. 主流程里：`Page.navigate` → 注入存档 → `continueGame()` → 点潜航 → 注入推进器 → 轮询断言

## 自动推进器核心逻辑（INJECT 里的 setInterval）

每 80ms 跑一次，优先级从高到低，`return` 即短路。**新功能测试 = 加一个分支插到对应优先级**：

```js
if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && echoChoiceOptions.length) {
  clickEchoChoice(echoChoiceOptions[0]);   // 三选一自动选卡
  return;
}
if (typeof shopOpen !== 'undefined' && shopOpen) { /* 商店：买/离开 */ return; }
if (typeof Dialogue !== 'undefined' && Dialogue.active) { Dialogue.skip/hide; return; }
if (bossActive && bossState && bossState._landed && bossState.phase !== 'entrance') {
  damageBoss(99999, 1);                     // 秒杀 Boss 跳过战斗
  return;
}
if (eventOptionsActive && eventOptions.length) { handleEventChoice(eventOptions[0]); return; }
if (mapActive && !currentDiveRoom) { enterRoom(下一个未完成房间); return; }
```

## 关键坑位（踩过）

- **进 Hub 后 `handleHubClick` 要求 `hubAlpha >= 0.9`**：点潜航前先轮询等 `hubAlpha` 涨到 0.95
- **首次潜航是剧情**（`startFirstDiveStory`，`hubRunNumber===0`）：点潜航按钮后要走完对话才 `startRoguelikeDive`；检测 `mapActive && !hubActive` 确认真正进入潜航
- **存档进 Hub**：`localStorage.setItem('consciousness_sea_save', ...)` 后 `location.reload()` + `continueGame()`
- **自动推进器开头锁血**：`playerHP = playerMaxHP`，防测试玩家被打死卡 defeat
- **推进器必须处理 `equipPrompt`**（事件 force 打怪胜利、宝箱拾取会弹装备切换提示）：`handleEquipPromptClick({action:'keep'})`，漏了会卡房永不完成
- **`vm.runInContext` 测试**：模块顶层 `const` 声明不挂到 sandbox 对象上，用 `vm.runInContext('表达式', sandbox)` 求值（如 `Object.keys(ECHO_DEFS).length`）
- **`Page.navigate` 后等 2.5s** 再操作，防脚本未加载完
- 测试脚本自包含，可独立 `node` 运行；日志同时写 `AppData/Local/Temp/*.log` 方便复盘
