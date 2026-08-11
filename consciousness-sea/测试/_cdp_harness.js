// ═══════════════════ CDP 测试模板 · 意识之海 ═══════════════════
// 复制本文件为 _xxx_test.js，填 INJECT 推进器 + main() 主流程即可。
// 用法见 README.md。启动前需：node _server.js & + Chrome(9222) &
const fs = require('fs');
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  try { fs.appendFileSync('C:/Users/V_ER_G~1/AppData/Local/Temp/_test.log', line + '\n'); } catch(e) {}
}
async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list.find(t => t.type === 'page');
  return page.webSocketDebuggerUrl;
}
let msgId = 0; const pending = new Map(); let ws;
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 10000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
  return r.result ? r.result.value : r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 存档进 Hub 的标准存档（序章通关、首次进第一章）──
const SAVE_HUB_FIRST = JSON.stringify({
  difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
  prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
  inHub: true, hubRunNumber: 0, hubZeroTalkIndex: 0,
  weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
  playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
  skillState: { collected: [], chargeLevel: 0, ready: false },
  mapRooms: null, mapConnections: null, isRoguelikeMap: false
});

async function enterHubFromSave(save) {
  await ev("localStorage.setItem('consciousness_sea_save', '" + save.replace(/'/g, "\\'") + "'); location.reload(); true");
  await sleep(2000);
  await ev('try{continueGame(); "ok"}catch(e){e.message}');
  await sleep(1200);
  for (let i = 0; i < 50; i++) {
    const a = await ev('typeof hubAlpha!=="undefined"?hubAlpha:0');
    if (a >= 0.95) break;
    await sleep(100);
  }
}

/** 点潜航并推进首次剧情直到真正进入潜航（返回是否成功） */
async function startDiveAndWait() {
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  for (let i = 0; i < 200; i++) {
    const st = await ev('({hub:typeof hubActive!=="undefined"?hubActive:false, map:typeof mapActive!=="undefined"?mapActive:false, phase:typeof prologuePhase!=="undefined"?prologuePhase:-1, dact:typeof Dialogue!=="undefined"?Dialogue.active:false})');
    if (st.map && !st.hub) return true;
    if (st.phase === 3) return true;
    if (st.dact) await ev('try{ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); "ok" }catch(e){e.message}');
    await sleep(80);
  }
  return false;
}

// ═══════════════ 自动推进器 INJECT（按场景加分支，return 短路） ═══════════════
// 复制到你的测试里，按需增删分支。常用变量：echoChoiceActive / shopOpen /
// Dialogue.active / bossActive / bossState / eventOptionsActive / mapActive / mapRooms
const INJECT = [
  '(function installAuto() {',
  "  if (window.__autoInstalled) return;",
  '  window.__autoInstalled = true;',
  '  window.__autoError = [];',
  '  setInterval(() => {',
  '    try {',
  "      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') playerHP = playerMaxHP; } catch(e) {}",
  '      // 【按需】遗响三选一自动选卡',
  "      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length) {",
  "        if (typeof clickEchoChoice === 'function') clickEchoChoice(echoChoiceOptions[0]);",
  '        return;',
  '      }',
  '      // 【按需】商店：买/离开',
  "      if (typeof shopOpen !== 'undefined' && shopOpen) {",
  "        if (typeof closeShop === 'function') closeShop();",
  "        if (typeof shopRoomDone === 'function') shopRoomDone();",
  '        return;',
  '      }',
  "      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push(e.message); }",
  "      if (typeof Tutorial !== 'undefined' && Tutorial._driftActive && !Tutorial._driftSelected) {",
  "        if (!Tutorial._driftSettled) Tutorial._driftSettled = true;",
  '        const dt = Tutorial.driftTexts.find(d => !d.dead);',
  "        if (dt) { dt.x = window.innerWidth/2; dt.y = window.innerHeight/2; dt.hitTest = () => true; Tutorial._selectDrift(dt); }",
  '        return;',
  '      }',
  "      if (typeof Dialogue !== 'undefined' && Dialogue.active) {",
  "        if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide();",
  '        return;',
  '      }',
  '      // 装备切换提示（事件 force 打怪胜后弹出）——容易漏，加了防卡房',
  "      if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {",
  "        handleEquipPromptClick({ action: 'keep' }); return;",
  '      }',
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {",
  "        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');",
  "        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }",
  '      }',
  "      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState && (typeof echoChoiceActive === 'undefined' || !echoChoiceActive) && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {",
  '        if (bossState.hp > 0) damageBoss(99999, 1);',
  '        return;',
  '      }',
  "      // ⚠️ echoChoice 分支必须保持在 boss 秒杀分支之前（Boss 击败后 bossActive 仍 true，秒杀会一直 return 吃掉三选一）",
  "      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {",
  '        handleEventChoice(eventOptions[0]);',
  '        return;',
  '      }',
  "      if (typeof mapActive !== 'undefined' && mapActive && (typeof currentDiveRoom === 'undefined' || !currentDiveRoom)) {",
  '        const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);',
  "        if (target) { if (typeof enterRoom === 'function') enterRoom(target); return; }",
  '      }',
  '    } catch (e) { window.__autoError.push(String(e)); }',
  '  }, 80);',
  '  return;',
  '})()',
].join('\n');

// ═══════════════ main() 主流程骨架 ═══════════════
async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable'); await send('Page.enable');

  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(2500);
  log('页面加载:', await ev('document.title'));

  await enterHubFromSave(SAVE_HUB_FIRST);
  log('进Hub:', await ev('JSON.stringify({hub:typeof hubActive!=="undefined"?hubActive:null, phase:prologuePhase})'));

  if (!(await startDiveAndWait())) { log('❌ 未能进入潜航'); ws.close(); process.exit(1); }
  log('已进入潜航:', await ev('JSON.stringify({map:mapActive, rogue:isRoguelikeMap, runNum:hubRunNumber})'));

  await ev(INJECT);   // ← 换成你的推进器
  await sleep(200);

  // 轮询监控：改检测字段 / 断言
  let lastRoom = '', lastHub = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const st = await ev('({room:typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, err:(window.__autoError||[]).length})');
    if (st.__err) { log('state err', st.__err); break; }
    if (st.room !== lastRoom || st.hub !== lastHub) { log('[' + i + 's] room=' + st.room + ' hub=' + st.hub + ' err=' + st.err); lastRoom = st.room; lastHub = st.hub; }
    if (st.hub && i > 5) { log('✅ 流程完成回到 Hub'); break; }
    if (st.err > 300) { log('⚠️ err 暴涨', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))')); break; }
  }

  log('最终 hub:', await ev('typeof hubActive!=="undefined"?hubActive:"x"'), 'autoErrors:', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))'));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
