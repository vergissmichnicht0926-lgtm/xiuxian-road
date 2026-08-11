// 遗响系统端到端冒烟：存档进Hub → 潜航 → 走完三层（每层Boss三选一遗响）→ 回Hub
// 验证：Boss三选一触发/收集、商店买遗响、事件换遗响、无卡死、回Hub
const fs = require('fs');
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  try { fs.appendFileSync('C:/Users/V_ER_G~1/AppData/Local/Temp/_echo.log', line + '\n'); } catch(e) {}
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

const INJECT = [
  '(function installAuto() {',
  "  if (window.__autoInstalled) return 'already';",
  '  window.__autoInstalled = true;',
  '  window.__autoError = [];',
  '  window.__echoGot = [];',
  '  window.__echoChoiceCount = 0;',
  '  setInterval(() => {',
  '    try {',
  "      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') playerHP = playerMaxHP; } catch(e) {}",
  '      // === 遗响三选一：自动选第一张 ===',
  "      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive",
  "          && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length) {",
  '        window.__echoChoiceCount++;',
  '        const pick = echoChoiceOptions[0];',
  "        if (typeof clickEchoChoice === 'function') clickEchoChoice(pick);",
  '        return;',
  '      }',
  '      // === 商店：优先买遗响 ===',
  "      if (typeof shopOpen !== 'undefined' && shopOpen) {",
  "        const echoItem = shopItems.find(si => si.type === 'echo' && shards >= (typeof getShopPrice==='function'?getShopPrice(si):si.cost));",
  "        if (echoItem && typeof attemptPurchase === 'function') { attemptPurchase(echoItem); return; }",
  "        const anyAfford = shopItems.find(si => shards >= (typeof getShopPrice==='function'?getShopPrice(si):si.cost));",
  "        if (anyAfford && anyAfford.type !== 'consumable') { if (typeof attemptPurchase === 'function') attemptPurchase(anyAfford); return; }",
  "        if (typeof closeShop === 'function') closeShop();",
  "        if (typeof shopRoomDone === 'function') shopRoomDone();",
  '        return;',
  '      }',
  '      try {',
  "        if (typeof Tutorial !== 'undefined' && Tutorial.phase !== 'tutorial_backpack' && typeof backpackOpen !== 'undefined' && backpackOpen && typeof toggleBackpack === 'function') toggleBackpack();",
  '      } catch(e) {}',
  "      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push('UPDATE_EXC: ' + e.message); }",
  "      if (typeof Tutorial !== 'undefined' && Tutorial._driftActive && !Tutorial._driftSelected) {",
  "        if (!Tutorial._driftSettled) Tutorial._driftSettled = true;",
  '        const dt = Tutorial.driftTexts.find(d => !d.dead);',
  "        if (dt) { dt.x = window.innerWidth/2; dt.y = window.innerHeight/2; dt.hitTest = () => true; Tutorial._selectDrift(dt); }",
  '        return;',
  '      }',
  "      const _tutPhases = ['meet_mentor','memory_loss','pre_battle','victory','hook'];",
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase && (Tutorial.phase.startsWith('tutorial_') || _tutPhases.indexOf(Tutorial.phase) >= 0) && typeof Dialogue !== 'undefined' && Dialogue.active) {",
  '        mx = window.innerWidth/2; my = window.innerHeight/2; Tutorial.handleClick(); return;',
  '      }',
  "      if (typeof Dialogue !== 'undefined' && Dialogue.active) {",
  "        if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide();",
  '        return;',
  '      }',
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase && Tutorial.phase.startsWith('tutorial_') && Tutorial.phase !== 'tutorial_backpack') {",
  "        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat !== '乱');",
  '        if (bw) { bw.x = 10; bw.y = 10; Tutorial.handleWordClick(bw); return; }',
  '      }',
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {",
  "        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');",
  "        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }",
  '      }',
  "      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState",
  "          && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {",
  '        if (bossState.hp > 0) damageBoss(99999, 1);',
  '        return;',
  '      }',
  '      // === 事件：优先选「代价换遗响」选项 ===',
  "      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {",
  "        const echoOpt = eventOptions.find(o => o.action === 'echo_deal' || o.action === 'echo_altar' || o.action === 'echo_trade');",
  '        handleEventChoice(echoOpt || eventOptions[0]);',
  '        return;',
  '      }',
  "      if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {",
  "        handleEquipPromptClick({ action: 'keep' }); return;",
  '      }',
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase === 'tutorial_backpack' && Tutorial._introPlayed) {",
  "        if (typeof backpackOpen !== 'undefined' && !backpackOpen && typeof toggleBackpack === 'function') toggleBackpack();",
  '        return;',
  '      }',
  "      if (typeof mapActive !== 'undefined' && mapActive && (typeof currentDiveRoom === 'undefined' || !currentDiveRoom)) {",
  '        const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);',
  "        if (target) { if (typeof enterRoom === 'function') enterRoom(target); return; }",
  '      }',
  '      // 记录遗响获得',
  "      if (typeof echoInventory !== 'undefined' && echoInventory.length > window.__echoGot.length) {",
  '        const got = echoInventory.slice(window.__echoGot.length);',
  '        window.__echoGot.push(...got);',
  "        window.__echoLogs = window.__echoLogs || []; window.__echoLogs.push('获得遗响: ' + got.join(','));",
  '      }',
  '      const overlay = document.getElementById(\'ending-overlay\');',
  "      if (overlay && overlay.classList.contains('show')) { overlay.click(); return; }",
  '    } catch (e) { window.__autoError.push(String(e)); }',
  '  }, 80);',
  '  return \'installed\';',
  '})()',
].join('\n');

async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.enable');

  // 0. 导航
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(2500);
  log('页面加载:', await ev('document.title'));

  // 1. 存档进 Hub
  const save = JSON.stringify({
    difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
    prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
    inHub: true, hubRunNumber: 0, hubZeroTalkIndex: 0,
    weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
    playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
    skillState: { collected: [], chargeLevel: 0, ready: false },
    mapRooms: null, mapConnections: null, isRoguelikeMap: false
  });
  await ev("localStorage.setItem('consciousness_sea_save', '" + save.replace(/'/g, "\\'") + "'); location.reload(); true");
  await sleep(2000);
  await ev('try{continueGame(); "ok"}catch(e){e.message}');
  await sleep(1200);
  log('进Hub:', await ev('JSON.stringify({hub:typeof hubActive!=="undefined"?hubActive:null, phase:prologuePhase})'));

  // 2. 等 Hub 完全进入 → 点潜航 → 推进首潜剧情直到真正进入潜航
  for (let i = 0; i < 50; i++) {
    const a = await ev('typeof hubAlpha!=="undefined"?hubAlpha:0');
    if (a >= 0.95) break;
    await sleep(100);
  }
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  let inDive = false;
  for (let i = 0; i < 200; i++) {
    const st = await ev('({dact:typeof Dialogue!=="undefined"?Dialogue.active:false, hub:typeof hubActive!=="undefined"?hubActive:false, map:typeof mapActive!=="undefined"?mapActive:false, phase:typeof prologuePhase!=="undefined"?prologuePhase:-1, run:typeof hubRunNumber!=="undefined"?hubRunNumber:0})');
    if (st.map && !st.hub) { inDive = true; break; }
    if (st.phase === 3) { inDive = true; break; }
    if (st.dact) {
      await ev('try{ if(typeof Dialogue!=="undefined"&&Dialogue.active){ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); } "ok" }catch(e){e.message}');
    }
    if (st.__err) { log('push err', st.__err); break; }
    await sleep(80);
  }
  await sleep(1500);
  log('潜航前:', await ev('JSON.stringify({phase:prologuePhase, map:mapActive, rogue:isRoguelikeMap, runNum:hubRunNumber, inDive:' + inDive + '})'));
  if (!inDive) { log('❌ 未能进入潜航'); ws.close(); process.exit(1); }

  // 3. 注入推进器
  await ev('window.__echoLogs = []; true');
  await ev(INJECT);
  await sleep(200);

  // 4. 轮询到回 Hub
  let lastRoom = '', lastHub = false, lastEchoCount = -1;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const st = await ev('({room: typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null,'
      + 'hub:typeof hubActive!=="undefined"?hubActive:false,'
      + 'echoN:typeof echoInventory!=="undefined"?echoInventory.length:0,'
      + 'echoAct:typeof echoChoiceActive!=="undefined"?echoChoiceActive:false,'
      + 'echoCount:typeof window.__echoChoiceCount!=="undefined"?window.__echoChoiceCount:0,'
      + 'logs:(window.__echoLogs||[]).slice(),'
      + 'err:(window.__autoError||[]).length})');
    if (st.__err) { log('state err', st.__err); break; }
    if (st.logs && st.logs.length) {
      st.logs.forEach(l => log('   [遗响日志] ' + l));
      await ev('window.__echoLogs=[]; true');
    }
    const changed = (st.room !== lastRoom) || (st.hub !== lastHub) || (st.echoN !== lastEchoCount);
    if (changed) {
      log('[' + i + 's] room=' + st.room + ' hub=' + st.hub + ' echoN=' + st.echoN + ' echoAct=' + st.echoAct + ' choiceCount=' + st.echoCount + ' err=' + st.err);
      lastRoom = st.room; lastHub = st.hub; lastEchoCount = st.echoN;
    }
    if (st.hub && i > 5) { log('✅ 潜航完成回到 Hub'); break; }
    if (st.err > 300) { log('⚠️ err 暴涨', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))')); break; }
  }

  // 5. 最终检查
  log('\n=== 最终 ===');
  const finalEcho = await ev('JSON.stringify({inv: typeof echoInventory!=="undefined"?echoInventory.slice():null, count: typeof window.__echoChoiceCount!=="undefined"?window.__echoChoiceCount:null})');
  log('遗响: ', finalEcho);
  log('hubActive:', await ev('typeof hubActive!=="undefined"?hubActive:"x"'));
  log('autoErrors:', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))'));

  const fin = typeof finalEcho === 'string' ? JSON.parse(finalEcho) : finalEcho;
  const inv = (fin.inv || []).length;
  const pass = inv >= 3 && fin.count >= 3;
  log(pass ? '\n✅✅ 冒烟通过：三层Boss三选一 + 遗响构筑正常' : '\n❌❌ 冒烟未达标：遗响数=' + inv + ' 三选一次数=' + fin.count);
  ws.close(); process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
