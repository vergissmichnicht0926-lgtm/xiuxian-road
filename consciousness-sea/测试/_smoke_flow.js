/* ═══════════════ 完整流程冒烟：进Hub → 首次潜航 → 肉鸽战斗(多敌) → 回Hub ═══════════════
 * 运行：node 测试/_smoke_flow.js（需先起 server + Chrome CDP 9222）
 * 修复 _ch1_verify 的点潜航时序：先等 hubAlpha、推进对话再点潜航
 */
function log(...args) { const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '); console.log(line); }
async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list[0];
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

// 自动推进器：点攻字清怪、处理装备提示/三选一/事件/地图
const INJECT = `
(function installAuto() {
  if (window.__autoInstalled) return 'already';
  window.__autoInstalled = true;
  window.__autoError = [];
  setInterval(() => {
    try {
      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') { playerHP = playerMaxHP; } } catch(e) {}
      // 手动推进主循环（后台标签页 rAF 暂停，必须手动 update；多帧加速补字）
      try { if (typeof update === 'function') { for (let u = 0; u < 6; u++) update(0.033); } } catch(e) { window.__autoError.push('UPDATE_EXC: ' + e.message); }
      // === 潜航总结页：点「返回零的领域」回 Hub ===
      try {
        const _ov = document.getElementById('defeat-overlay');
        if (_ov && _ov.classList.contains('show') && typeof enterHub === 'function') { enterHub(); return; }
      } catch(e) {}
      // === 遗响三选一（最优先，防 Boss 三选一卡死）===
      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive
          && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length
          && typeof clickEchoChoice === 'function') { clickEchoChoice(echoChoiceOptions[0]); return; }
      try { if (typeof Dialogue !== 'undefined' && Dialogue.active) { if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); return; } } catch(e) {}
      if (typeof Tutorial !== 'undefined' && Tutorial._driftActive && !Tutorial._driftSelected) {
        const dt = (Tutorial.driftTexts||[]).find(d => !d.dead);
        if (dt) { dt.x = 10; dt.y = 10; Tutorial._driftSettled = true; Tutorial._selectDrift(dt); }
        return;
      }
      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && !bossActive
          && (typeof enemyList !== 'undefined' ? enemyList.some(e => e.alive) : enemyHP > 0)) {
        // 测试加速：直接秒杀当前敌人（快速推波走完流程）
        if (typeof dealDamage === 'function') dealDamage(99999, false);
        return;
      }
      if (bossActive && bossState && damageBoss && (typeof echoChoiceActive === 'undefined' || !echoChoiceActive)
          && bossState._landed && bossState.phase !== 'entrance') { if (bossState.hp > 0) damageBoss(99999, 1); return; }
      if (eventOptionsActive && handleEventChoice && eventOptions && eventOptions.length) { handleEventChoice(eventOptions[0]); return; }
      if (equipPrompt && handleEquipPromptClick) { handleEquipPromptClick({ action: 'keep' }); return; }
      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && echoChoiceOptions && echoChoiceOptions.length && typeof clickEchoChoice === 'function') { clickEchoChoice(echoChoiceOptions[0]); return; }
      if (shopOpen && closeShop) { closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return; }
      if (mapActive && !currentDiveRoom && typeof enterRoom === 'function') {
        const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);
        if (target) { enterRoom(target); return; }
      }
    } catch (e) { window.__autoError.push(String(e)); }
  }, 80);
  return 'installed';
})()`;

async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.bringToFront'); // 前台运行，否则后台标签页 rAF 暂停、主循环停
  // ⚠️ 固定窗口尺寸：Chrome 窗口可能被压缩到几十px高，导致 Hub 零/按钮 hit 区域重叠、点潜航命中零
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 0, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(3000);

  // 1. 注入存档进 Hub
  const save = JSON.stringify({
    difficulty:1, timestamp:Date.now(), unlockedWeapons:[], soulCrystals:0, permanentUpgrades:{}, affection:0,
    prologuePhase:4, tutorialPhase:'end', prologueHanDefeated:true,
    inHub:true, hubRunNumber:0, hubZeroTalkIndex:0,
    weaponId:'beginner_brush', armorId:'thin_silk', skillId:'concentration', talismanId:'vitality_charm',
    playerHP:100, playerMaxHP:100, hasShield:false, shieldHP:0, threatLevel:0, nextAttackBoost:false,
    skillState:{collected:[],chargeLevel:0,ready:false},
    mapRooms:null, mapConnections:null, isRoguelikeMap:false
  });
  await ev(`localStorage.setItem('consciousness_sea_save', '${save.replace(/'/g, "\\'")}'); true`);
  await ev('location.reload(); true');
  await sleep(3000);
  await ev('try{continueGame(); "ok"}catch(e){e.message}');
  // 等 hubAlpha 到位（后台 rAF 暂停需手动 update 推进）
  for (let i = 0; i < 60; i++) {
    const a = await ev('try{ if(typeof update==="function") update(0.033); }catch(e){} typeof hubActive!=="undefined" && hubActive ? hubAlpha : 0');
    if (a && a >= 0.95) break;
    await sleep(100);
  }
  // 推进可能存在的 Hub 对话
  for (let i = 0; i < 10; i++) {
    const d = await ev('typeof Dialogue!=="undefined" && Dialogue.active');
    if (!d) break;
    await ev('if(Dialogue.active){ if(!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); } true');
    await sleep(80);
  }
  log('进Hub:', await ev('JSON.stringify({hub:typeof hubActive!=="undefined"?hubActive:null, alpha:hubAlpha})'));

  // 2. 点开始潜航（首次 → 小萤剧情）
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(200);
  const story = await ev('typeof hubFirstDiveStoryActive!=="undefined" ? hubFirstDiveStoryActive : null');
  log('点潜航: story=', story);
  // 若首次剧情，推进对话直至进入潜航（后台 rAF 暂停需手动 update 推进）
  for (let i = 0; i < 100; i++) {
    const st = await ev(`try{ if(typeof update==="function") update(0.033); }catch(e){} ({story:typeof hubFirstDiveStoryActive!=="undefined"?hubFirstDiveStoryActive:false, dact:typeof Dialogue!=="undefined"?Dialogue.active:false, hub:typeof hubActive!=="undefined"?hubActive:false, rogue:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:false, err:(window.__autoError||[]).length})`);
    if (!st.dact && st.rogue) break;
    if (st.__err) { log('推进err', st.__err); break; }
    await ev('if(typeof Dialogue!=="undefined"&&Dialogue.active){ if(!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); } true');
    await sleep(80);
  }
  await sleep(500);
  const st1 = await ev('JSON.stringify({rogue:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:null, run:typeof hubRunNumber!=="undefined"?hubRunNumber:null, hub:typeof hubActive!=="undefined"?hubActive:null})');
  log('潜航前:', st1);

  // 3. 注入推进器，走肉鸽（记录房间推进）
  await ev(INJECT);
  let lastRoom = '', rooms = new Set();
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const s = await ev(`JSON.stringify({room: currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, rogue:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:null, err:(window.__autoError||[]).length, n:typeof enemyList!=="undefined"?enemyList.filter(e=>e.alive).length:0, hp:enemyHP})`);
    let st; try { st = JSON.parse(s); } catch(e) { continue; }
    if (st.room && st.room !== lastRoom) { log(`[${i}s] 进入房间 ${st.room} (敌人×${st.n}, HP=${st.hp})`); lastRoom = st.room; rooms.add(st.room); }
    if (st.hub && i > 8) { log('✅ 回到 Hub（完整流程闭环）'); break; }
    if (st.err > 300) { log('⚠️ err暴涨:', await ev('JSON.stringify((window.__autoError||[]).slice(0,4))')); break; }
  }
  log('\n=== 最终 ===');
  log('访问房间数:', rooms.size, [...rooms].slice(0,15).join(','));
  log('hubActive:', await ev('typeof hubActive!=="undefined"?hubActive:"x"'));
  log('isRoguelikeMap:', await ev('typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:"x"'));
  log('hubRunNumber:', await ev('typeof hubRunNumber!=="undefined"?hubRunNumber:"x"'));
  log('autoErrors:', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))'));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
