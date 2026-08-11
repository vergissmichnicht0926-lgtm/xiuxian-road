// 新Boss战斗冒烟测试：走完三层，每个Boss房观察20秒攻击流转（不秒杀），验证无异常
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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 8000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' | ' + JSON.stringify(r.exceptionDetails.exception || {}) };
  return r.result ? r.result.value : r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 自动推进器：地图推进正常，但 Boss 分支只观察不秒杀
const INJECT = `
(function installAuto() {
  if (window.__autoInstalled) return 'already';
  window.__autoInstalled = true;
  window.__autoError = [];
  window.__bossPhases = [];
  setInterval(() => {
    try {
      // 锁血：观察Boss时玩家不操作，防止被Boss打死进入defeat状态
      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') { playerHP = playerMaxHP; } } catch(e) {}
      try {
        if (typeof Tutorial !== 'undefined' && Tutorial.phase !== 'tutorial_backpack'
            && typeof backpackOpen !== 'undefined' && backpackOpen
            && typeof toggleBackpack === 'function') toggleBackpack();
      } catch(e) {}
      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push('UPDATE_EXC: ' + e.message); }
      if (typeof Dialogue !== 'undefined' && Dialogue.active) {
        if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide();
        return;
      }
      // BATTLE 非boss：攻字杀敌（普通战斗房推进）
      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {
        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');
        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }
      }
      // Boss：只记录 phase 流转，不秒杀
      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState) {
        const key = (bossConfig ? bossConfig.name : '?') + '|' + bossState.phase + '|' + (bossState.currentAttack ? bossState.currentAttack.type : '-');
        const arr = window.__bossPhases;
        if (arr[arr.length-1] !== key) arr.push(key);
        return;
      }
      // 事件选项
      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {
        handleEventChoice(eventOptions[0]); return;
      }
      // 装备提示
      if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {
        handleEquipPromptClick({ action: 'keep' }); return;
      }
      if (typeof shopOpen !== 'undefined' && shopOpen) {
        closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return;
      }
      // 地图节点
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
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.enable');

  // 存档进 Hub
  const save = JSON.stringify({
    difficulty:1, timestamp:Date.now(), unlockedWeapons:[], soulCrystals:0, permanentUpgrades:{}, affection:0,
    prologuePhase:4, tutorialPhase:'end', prologueHanDefeated:true,
    inHub:true, hubRunNumber:0, hubZeroTalkIndex:0,
    weaponId:'beginner_brush', armorId:'thin_silk', skillId:'concentration', talismanId:'vitality_charm',
    playerHP:100, playerMaxHP:100, hasShield:false, shieldHP:0, threatLevel:0, nextAttackBoost:false,
    skillState:{collected:[],chargeLevel:0,ready:false},
    mapRooms:null, mapConnections:null, isRoguelikeMap:false
  });
  await ev(`localStorage.setItem('consciousness_sea_save', '${save.replace(/'/g, "\\'")}'); location.reload(); true`);
  await sleep(2000);
  await ev('try{continueGame(); "ok"}catch(e){e.message}');
  await sleep(1200);
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  for (let i = 0; i < 60; i++) {
    const st = await ev(`({dact:typeof Dialogue!=="undefined"?Dialogue.active:false, story:typeof hubFirstDiveStoryActive!=="undefined"?hubFirstDiveStoryActive:false, hub:typeof hubActive!=="undefined"?hubActive:false})`);
    if (st.__err) break;
    if (!st.dact && st.hub) break;
    await ev('try{ if(typeof Dialogue!=="undefined"&&Dialogue.active){ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); } "ok" }catch(e){e.message}');
    await sleep(80);
  }
  await sleep(1800);
  await ev(INJECT);
  await sleep(200);

  // 轮询：记录到每个 Boss 房，观察20秒
  let lastRoom = '';
  let bossWatch = null;
  for (let i = 0; i < 260; i++) {
    await sleep(1000);
    const st = await ev(`JSON.stringify({room: typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, err:(window.__autoError||[]).length, bossPhases: (window.__bossPhases||[]).slice(-6)})`);
    let s; try { s = typeof st === 'string' ? JSON.parse(st) : st; } catch(e) { continue; }
    if (s.__err) { console.log('err', s.__err); break; }
    // 进入新的 boss 房 → 开始观察
    if (s.room && s.room.startsWith('boss_') && s.room !== lastRoom) {
      console.log(`\n🔍 进入Boss房 ${s.room}，观察20秒...`);
      bossWatch = { room: s.room, seen: [], wait: 0 };
    }
    if (bossWatch && s.room === bossWatch.room) {
      bossWatch.wait++;
      const phases = (s.bossPhases || []);
      if (phases.length) bossWatch.seen = phases;
      if (bossWatch.wait >= 20) {
        const distinct = [...new Set(bossWatch.seen.map(p => p.split('|')[1]))];
        const hasAttack = bossWatch.seen.some(p => p.split('|')[2] !== '-');
        console.log(`  ${bossWatch.room}: phase序列=${distinct.join('→')} | 攻击触发=${hasAttack} | err=${s.err}`);
        console.log(`  详情: ${bossWatch.seen.join(' → ')}`);
        // 秒杀Boss，继续推进下一层
        await ev('try{ if(bossActive&&bossState) damageBoss(99999,1); true }catch(e){String(e)}');
        bossWatch = null;
      }
    }
    if (s.room && s.room !== lastRoom && !s.room.startsWith('boss_')) {
      console.log(`[${i}s] ${s.room} (err=${s.err})`);
      lastRoom = s.room;
    } else if (s.room) lastRoom = s.room;
    if (s.hub && i > 20) { console.log('\n✅ 回到 Hub'); break; }
    if (s.err > 50) { console.log('⚠️ err暴涨', await ev('JSON.stringify((window.__autoError||[]).slice(0,3))')); break; }
  }
  console.log('\n=== 最终 err ===', await ev('(window.__autoError||[]).length'));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
