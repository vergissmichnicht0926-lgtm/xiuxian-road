// 第一章潜航完整验证：存档进Hub → 开始潜航 → 走完第一章肉鸽 → 观察safehouse后行为
const fs = require('fs');
const LOGFILE = 'C:/Users/V_ER_G~1/AppData/Local/Temp/_ch1.log';
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
}
async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list[0];
  return page.webSocketDebuggerUrl;
}
let msgId = 0;
const pending = new Map();
let ws;
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 8000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' | ' + JSON.stringify(r.exceptionDetails.exception || {}) };
  return r.result ? r.result.value : r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const INJECT = `
(function installAuto() {
  if (window.__autoInstalled) return 'already';
  window.__autoInstalled = true;
  window.__autoError = [];
  setInterval(() => {
    try {
      // 锁血：防测试玩家被弹幕/敌人打死
      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') { playerHP = playerMaxHP; } } catch(e) {}
      // === 遗响三选一（最优先，防 Boss 三选一卡死）===
      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive
          && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length
          && typeof clickEchoChoice === 'function') {
        clickEchoChoice(echoChoiceOptions[0]); return;
      }
      try {
        if (typeof Tutorial !== 'undefined' && Tutorial.phase !== 'tutorial_backpack'
            && typeof backpackOpen !== 'undefined' && backpackOpen
            && typeof toggleBackpack === 'function') toggleBackpack();
      } catch(e) {}
      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push('UPDATE_EXC: ' + e.message); }
      if (typeof Tutorial !== 'undefined' && Tutorial._driftActive && !Tutorial._driftSelected) {
        if (!Tutorial._driftSettled) Tutorial._driftSettled = true;
        const dt = Tutorial.driftTexts.find(d => !d.dead);
        if (dt) { dt.x = window.innerWidth/2; dt.y = window.innerHeight/2; dt.hitTest = () => true; Tutorial._selectDrift(dt); }
        return;
      }
      const _tutPhases = ['meet_mentor','memory_loss','pre_battle','victory','hook'];
      if (typeof Tutorial !== 'undefined' && Tutorial.phase && (Tutorial.phase.startsWith('tutorial_') || _tutPhases.indexOf(Tutorial.phase) >= 0) && typeof Dialogue !== 'undefined' && Dialogue.active) {
        mx = window.innerWidth/2; my = window.innerHeight/2;
        Tutorial.handleClick();
        return;
      }
      if (typeof Dialogue !== 'undefined' && Dialogue.active) {
        if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide();
        return;
      }
      if (typeof Tutorial !== 'undefined' && Tutorial.phase && Tutorial.phase.startsWith('tutorial_') && Tutorial.phase !== 'tutorial_backpack') {
        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat !== '乱');
        if (bw) { bw.x = 10; bw.y = 10; Tutorial.handleWordClick(bw); return; }
      }
      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {
        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');
        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }
      }
      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState
          && (typeof echoChoiceActive === 'undefined' || !echoChoiceActive) // 三选一期间停止秒杀
          && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {
        if (bossState.hp > 0) damageBoss(99999, 1);
        return;
      }
      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {
        handleEventChoice(eventOptions[0]); return;
      }
      if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {
        handleEquipPromptClick({ action: 'keep' }); return;
      }
      if (typeof Tutorial !== 'undefined' && Tutorial.phase === 'tutorial_backpack' && Tutorial._introPlayed) {
        if (typeof backpackOpen !== 'undefined' && !backpackOpen && typeof toggleBackpack === 'function') toggleBackpack();
        return;
      }
      if (typeof shopOpen !== 'undefined' && shopOpen) {
        closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return;
      }
      if (typeof mapActive !== 'undefined' && mapActive && (typeof currentDiveRoom === 'undefined' || !currentDiveRoom)) {
        const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);
        if (target) { if (typeof enterRoom === 'function') enterRoom(target); return; }
      }
      const overlay = document.getElementById('ending-overlay');
      if (overlay && overlay.classList.contains('show')) { overlay.click(); return; }
    } catch (e) { window.__autoError.push(String(e)); }
  }, 80);
  return 'installed';
})()`;

async function main() {
  let navCount = 0;
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.frameNavigated') navCount++;
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.reload', { ignoreCache: true });
  await sleep(3000);

  // 1. 存档进 Hub（模拟"序章通关，首次进第一章"）
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
  // 等 hubAlpha 到位（handleHubClick 门槛 0.9）
  for (let i = 0; i < 40; i++) {
    const a = await ev('typeof hubActive!=="undefined" && hubActive ? hubAlpha : 0');
    if (a && a >= 0.95) break;
    await sleep(120);
  }
  // 推进可能存在的 Hub 对话（零的对话会吞掉点潜航）
  for (let i = 0; i < 10; i++) {
    const d = await ev('typeof Dialogue!=="undefined" && Dialogue.active');
    if (!d) break;
    await ev('if(Dialogue.active){ if(!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); } true');
    await sleep(80);
  }
  log('进Hub:', await ev('JSON.stringify({hub:typeof hubActive!=="undefined"?hubActive:null, alpha:hubAlpha})'));

  // 2. 点开始潜航 + 推进首次潜航剧情
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(200);
  log('点潜航: story=', await ev('typeof hubFirstDiveStoryActive!=="undefined" ? hubFirstDiveStoryActive : null'));
  for (let i = 0; i < 80; i++) {
    const st = await ev(`({dact:typeof Dialogue!=="undefined"?Dialogue.active:false, story:typeof hubFirstDiveStoryActive!=="undefined"?hubFirstDiveStoryActive:false, hub:typeof hubActive!=="undefined"?hubActive:false, rogue:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:false})`);
    if (!st.dact && st.rogue) break; // 真正进入潜航
    if (st.__err) { log('推进err', st.__err); break; }
    await ev('try{ if(typeof Dialogue!=="undefined"&&Dialogue.active){ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); } "ok" }catch(e){e.message}');
    await sleep(100);
  }
  await sleep(500);
  log('潜航前状态:', await ev('JSON.stringify({phase:prologuePhase, map:typeof mapActive!=="undefined"?mapActive:null, roguelike:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:null, runNum:typeof hubRunNumber!=="undefined"?hubRunNumber:null})'));

  // 3. 注入自动推进器
  await ev(INJECT);
  await sleep(200);

  // 4. 轮询监控第一章潜航，记录房间推进 + 关键状态跳变
  let lastRoom = '', lastPhase = -1, lastHub = false, lastFusion = false;
  let lastLog = Date.now();
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const st = await ev(`JSON.stringify({room: typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, phase:typeof prologuePhase!=="undefined"?prologuePhase:-1, hub:typeof hubActive!=="undefined"?hubActive:false, rogue:typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:null, fusion:typeof fusionActive!=="undefined"?fusionActive:false, err:(window.__autoError||[]).length, dl:typeof Dialogue!=="undefined"?Dialogue.active:false})`);
    let s;
    try { s = typeof st === 'string' ? JSON.parse(st) : st; } catch(e) { log('parse err', st); continue; }
    if (s.__err) { log('state err', s.__err); continue; }
    const changed = (s.room !== lastRoom) || (s.phase !== lastPhase) || (s.hub !== lastHub) || (s.fusion !== lastFusion);
    if (changed) {
      const mark = s.hub ? '←HUB' : (s.phase >= 4 ? '←END' : '');
      log(`[${i}s] room=${s.room} phase=${s.phase} hub=${s.hub} rogue=${s.rogue} fusion=${s.fusion} err=${s.err} ${mark}`);
      lastRoom = s.room; lastPhase = s.phase; lastHub = s.hub; lastFusion = s.fusion;
    }
    if (s.hub && i > 5) { log('✅ 第一章潜航完成并回到 Hub（第二轮潜航可开始）'); break; }
    if (s.err > 300) { log('⚠️ err 暴涨', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))')); break; }
  }

  log('\n=== 最终 ===');
  log('hubActive:', await ev('typeof hubActive!=="undefined"?hubActive:"x"'));
  log('prologuePhase:', await ev('typeof prologuePhase!=="undefined"?prologuePhase:"x"'));
  log('isRoguelikeMap:', await ev('typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:"x"'));
  log('hubRunNumber:', await ev('typeof hubRunNumber!=="undefined"?hubRunNumber:"x"'));
  log('autoErrors:', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))'));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
