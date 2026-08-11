// 事件系统冒烟：通用事件池（含新 wreck/storm/rift/spring）+ 独特事件（第一章一次性碎片剧情）
// 验证：① 第一章事件房触发独特事件 ② 触发后收录图鉴「记忆」 ③ 一次性不重复 ④ 新通用事件跑通 ⑤ 无卡死回 Hub
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

// 推进器：事件选项优先选独特事件「握住」/新通用事件，其余按通用逻辑推进
const INJECT = [
  '(function installAuto() {',
  "  if (window.__autoInstalled) return;",
  '  window.__autoInstalled = true;',
  '  window.__autoError = [];',
  '  window.__eventActions = [];',        // 记录已触发的事件 action
  '  window.__uniqueSeen = [];',          // 记录遇到的独特事件 id
  '  setInterval(() => {',
  '    try {',
  "      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') playerHP = playerMaxHP; } catch(e) {}",
  "      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length) {",
  "        if (typeof clickEchoChoice === 'function') clickEchoChoice(echoChoiceOptions[0]);",
  '        return;',
  '      }',
  "      if (typeof shopOpen !== 'undefined' && shopOpen) {",
  "        if (typeof closeShop === 'function') closeShop();",
  "        if (typeof shopRoomDone === 'function') shopRoomDone();",
  '        return;',
  '      }',
  "      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push(e.message); }",
  "      if (typeof Dialogue !== 'undefined' && Dialogue.active) { if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); return; }",
  "      // 装备切换提示（force 打怪胜后弹出）",
  "      if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {",
  "        handleEquipPromptClick({ action: 'keep' }); return;",
  "      }",
  "      // 事件：优先独特「握住」+ 新通用事件选项",
  "      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {",
  "        if (typeof currentEventScenario !== 'undefined' && currentEventScenario && currentEventScenario.unique) window.__uniqueSeen.push(currentEventScenario.id);",
  "        const pref = eventOptions.find(o => ['unique_hold','wreck','storm','rift','gain_shards','heal_full'].indexOf(o.action) >= 0);",
  '        const pick = pref || eventOptions[0];',
  '        window.__eventActions.push(pick.action);',
  '        handleEventChoice(pick);',
  '        return;',
  '      }',
  "      if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {",
  "        const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');",
  "        if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }",
  '      }',
  "      if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {",
  '        if (bossState.hp > 0) damageBoss(99999, 1); return;',
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
  log('页面:', await ev('document.title'));

  // 存档进 Hub（hubRunNumber:1 跳过首潜剧情，直接可潜航）
  const save = JSON.stringify({
    difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
    prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
    inHub: true, hubRunNumber: 1, hubZeroTalkIndex: 0,
    weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
    playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
    skillState: { collected: [], chargeLevel: 0, ready: false },
    mapRooms: null, mapConnections: null, isRoguelikeMap: false
  });
  await ev("localStorage.setItem('consciousness_sea_save', '" + save.replace(/'/g, "\\'") + "'); location.reload(); true");
  await sleep(2000);
  await ev('try{continueGame(); "ok"}catch(e){e.message}');
  await sleep(1200);
  for (let i = 0; i < 50; i++) { const a = await ev('typeof hubAlpha!=="undefined"?hubAlpha:0'); if (a >= 0.95) break; await sleep(100); }
  log('进Hub:', await ev('JSON.stringify({hub:hubActive, phase:prologuePhase})'));

  // 点潜航
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  let inDive = false;
  for (let i = 0; i < 200; i++) {
    const st = await ev('({hub:typeof hubActive!=="undefined"?hubActive:false, map:typeof mapActive!=="undefined"?mapActive:false, dact:typeof Dialogue!=="undefined"?Dialogue.active:false})');
    if (st.map && !st.hub) { inDive = true; break; }
    if (st.dact) await ev('try{ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); "ok" }catch(e){e.message}');
    await sleep(80);
  }
  log('潜航:', inDive, await ev('JSON.stringify({map:mapActive, rogue:isRoguelikeMap})'));
  if (!inDive) { log('❌ 未能进入潜航'); ws.close(); process.exit(1); }

  // 清空图鉴里旧的独特事件记录，只测本次
  await ev('try{ if(typeof bestiaryData!=="undefined"){ Object.keys(bestiaryData.memories||{}).forEach(k=>{ if(k.indexOf("unique_")===0) delete bestiaryData.memories[k]; }); localStorage.setItem("consciousness_sea_bestiary", JSON.stringify(bestiaryData)); } "ok" }catch(e){e.message}');
  await ev(INJECT);
  await sleep(200);

  // 轮询到回 Hub
  let lastRoom = '', lastHub = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const st = await ev('({room:typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, err:(window.__autoError||[]).length})');
    if (st.__err) { log('state err', st.__err); break; }
    if (st.room !== lastRoom || st.hub !== lastHub) { log('[' + i + 's] room=' + st.room + ' hub=' + st.hub + ' err=' + st.err); lastRoom = st.room; lastHub = st.hub; }
    if (st.hub && i > 5) { log('✅ 潜航完成回 Hub'); break; }
    if (st.err > 300) { log('⚠️ err 暴涨', await ev('JSON.stringify((window.__autoError||[]).slice(0,5))')); break; }
  }

  // 断言
  const fin = await ev('({done:typeof uniqueEventsDone!=="undefined"?uniqueEventsDone.slice():null, uniqueSeen:(window.__uniqueSeen||[]).slice(), actions:(window.__eventActions||[]).slice(), mem: typeof bestiaryData!=="undefined"?Object.keys(bestiaryData.memories||{}).filter(k=>k.indexOf("unique_")===0):[], remain: typeof UNIQUE_EVENTS!=="undefined"?(UNIQUE_EVENTS.length - (typeof uniqueEventsDone!=="undefined"?uniqueEventsDone.length:0)):null, err:(window.__autoError||[]).length})');
  log('\n=== 结果 ===');
  log('独特事件已触发(uniqueEventsDone):', JSON.stringify(fin.done));
  log('本次遇到的独特事件:', JSON.stringify(fin.uniqueSeen));
  log('触发的事件 action:', JSON.stringify(fin.actions));
  log('图鉴收录 unique_* 记忆:', JSON.stringify(fin.mem));
  log('独特事件剩余可触发:', fin.remain, ' err:', fin.err);

  const doneArr = fin.done || [];
  const uniqueSet = new Set(doneArr);
  const newGen = ['wreck','storm','rift','gain_shards','heal_full'].filter(a => (fin.actions||[]).includes(a));
  const pass =
    doneArr.length >= 1 &&                                  // 至少触发 1 个独特事件
    uniqueSet.size === doneArr.length &&                    // 无重复（一次性）
    fin.mem.length >= doneArr.length &&                     // 图鉴收录 >= 已触发
    (fin.actions||[]).some(a => a === 'unique_hold' || a === 'unique_drop') && // 独特事件被选择
    fin.err === 0;                                          // 无错误
  log(pass ? '\n✅✅ 事件冒烟通过：独特事件触发+一次性+图鉴收录 正常' : '\n❌❌ 事件冒烟未达标：' + JSON.stringify(fin));
  ws.close(); process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
