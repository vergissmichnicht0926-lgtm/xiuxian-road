// 遗响回归：① ESC 放弃三选一不卡死 ② 存档恢复遗响（echoes 字段 + echoMod 生效）
const fs = require('fs');
function log(...args) { console.log(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); }
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

// 自动推进器：第一次三选一按 ESC 放弃，之后正常选卡
const INJECT = [
  '(function installAuto() {',
  '  if (window.__autoInstalled) return;',
  '  window.__autoInstalled = true;',
  '  window.__escDone = false;',
  '  window.__autoError = [];',
  '  setInterval(() => {',
  '    try {',
  "      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') playerHP = playerMaxHP; } catch(e) {}",
  "      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length) {",
  "        if (!window.__escDone) { window.__escDone = true; if (typeof resolveBossChoice === 'function') resolveBossChoice(); }",
  "        else { if (typeof clickEchoChoice === 'function') clickEchoChoice(echoChoiceOptions[0]); }",
  '        return;',
  '      }',
  "      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push(e.message); }",
  "      if (typeof Dialogue !== 'undefined' && Dialogue.active) { if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); return; }",
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {",
  "        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');",
  "        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }",
  '      }',
  "      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {",
  '        if (bossState.hp > 0) damageBoss(99999, 1); return;',
  '      }',
  "      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {",
  '        handleEventChoice(eventOptions[0]); return;',
  '      }',
  "      if (typeof shopOpen !== 'undefined' && shopOpen) { if (typeof closeShop === 'function') closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return; }",
  "      if (typeof mapActive !== 'undefined' && mapActive && (typeof currentDiveRoom === 'undefined' || !currentDiveRoom)) {",
  '        const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);',
  "        if (target) { if (typeof enterRoom === 'function') enterRoom(target); return; }",
  '      }',
  '    } catch (e) { window.__autoError.push(String(e)); }',
  '  }, 80);',
  '  return;',
  '})()',
].join('\n');

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

  // ═══ 回归A：存档恢复遗响 ═══
  log('=== 回归A：存档恢复遗响 ===');
  const saveA = JSON.stringify({
    difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
    prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
    inHub: true, hubRunNumber: 2, hubZeroTalkIndex: 0,
    weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
    playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
    skillState: { collected: [], chargeLevel: 0, ready: false },
    echoes: ['origin_echo', 'storm_echo'],
    mapRooms: null, mapConnections: null, isRoguelikeMap: false
  });
  await enterHubFromSave(saveA);
  const invA = await ev('typeof echoInventory!=="undefined"?echoInventory.slice():null');
  const modA = await ev("typeof echoMod==='function'?echoMod('atkDmg'):null");
  log('恢复后 echoInventory:', JSON.stringify(invA), ' echoMod(atkDmg)=', modA);
  const passA = Array.isArray(invA) && invA.includes('origin_echo') && invA.includes('storm_echo') && modA === 0.2;
  // 背包里应有遗响槽
  await ev('try{ if(typeof backpackOpen!=="undefined"&&!backpackOpen&&typeof toggleBackpack==="function") toggleBackpack(); "ok" }catch(e){e.message}');
  await sleep(300);
  const bpA = await ev('typeof backpackItems!=="undefined"?backpackItems.map(b=>b.type).join(","):null');
  log('背包槽位:', bpA);
  await ev('try{ if(typeof backpackOpen!=="undefined"&&backpackOpen&&typeof toggleBackpack==="function") toggleBackpack(); "ok" }catch(e){e.message}');
  log('回归A', passA && bpA && bpA.includes('echo') ? '✅ 通过' : '❌ 失败');
  if (!passA) { ws.close(); process.exit(1); }

  // ═══ 回归B：ESC 放弃三选一不卡死 ═══
  log('\n=== 回归B：ESC 放弃三选一 ===');
  const saveB = JSON.stringify({
    difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
    prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
    inHub: true, hubRunNumber: 3, hubZeroTalkIndex: 0,
    weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
    playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
    skillState: { collected: [], chargeLevel: 0, ready: false },
    mapRooms: null, mapConnections: null, isRoguelikeMap: false
  });
  await enterHubFromSave(saveB);
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  let inDive = false;
  for (let i = 0; i < 200; i++) {
    const st = await ev('({hub:typeof hubActive!=="undefined"?hubActive:false, map:typeof mapActive!=="undefined"?mapActive:false, dact:typeof Dialogue!=="undefined"?Dialogue.active:false})');
    if (st.map && !st.hub) { inDive = true; break; }
    if (st.dact) await ev('try{ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); "ok" }catch(e){e.message}');
    await sleep(80);
  }
  if (!inDive) { log('❌ 未能进入潜航'); ws.close(); process.exit(1); }
  await ev(INJECT);
  await sleep(200);
  let escDone = false, lastRoom = '', escTime = 0, postEscRooms = 0;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const st = await ev('({room:typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, echoN:typeof echoInventory!=="undefined"?echoInventory.length:0, esc:typeof window.__escDone!=="undefined"?window.__escDone:false, err:(window.__autoError||[]).length})');
    if (st.__err) { log('state err', st.__err); break; }
    if (st.room !== lastRoom) {
      log('[' + i + 's] room=' + st.room + ' hub=' + st.hub + ' echoN=' + st.echoN + ' esc=' + st.esc + ' err=' + st.err);
      lastRoom = st.room;
      if (escDone && st.room) postEscRooms++;
    }
    if (st.esc && !escDone) { escDone = true; escTime = Date.now(); log('   ← ESC 已按下（第一次三选一放弃）'); }
    // 判定核心：ESC 放弃后能持续推进（≥2 房间）且无错误即通过，不必走完三层
    if (escDone && postEscRooms >= 2 && Date.now() - escTime > 8000) { log('✅ ESC后持续推进' + postEscRooms + '个房间，未卡死'); break; }
    if (st.err > 300) { log('⚠️ err 暴涨'); break; }
  }
  const finB = await ev('({esc:window.__escDone, echoN:typeof echoInventory!=="undefined"?echoInventory.length:0, hub:typeof hubActive!=="undefined"?hubActive:false, err:(window.__autoError||[]).length})');
  log('最终:', JSON.stringify(finB), ' postEscRooms=' + postEscRooms);
  // ESC 放弃成功 + 持续推进 + 零错误 = 不卡死
  const passB = finB.esc === true && postEscRooms >= 2 && finB.err === 0;
  log('回归B', passB ? '✅ 通过（ESC放弃未卡死，后续推进正常）' : '❌ 失败');
  ws.close(); process.exit(passB ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
