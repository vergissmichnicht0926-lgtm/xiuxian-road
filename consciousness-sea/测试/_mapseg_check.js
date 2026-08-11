// 分屏修复验证：击败第一个 Boss（忆）进入中层段后，getActiveRooms 里的「市」应只属当前段
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

const INJECT = [
  '(function installAuto() {',
  '  if (window.__autoInstalled) return;',
  '  window.__autoInstalled = true;',
  '  window.__autoError = [];',
  '  setInterval(() => {',
  '    try {',
  "      try { if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') playerHP = playerMaxHP; } catch(e) {}",
  "      if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof echoChoiceOptions !== 'undefined' && echoChoiceOptions.length) {",
  "        if (typeof clickEchoChoice === 'function') clickEchoChoice(echoChoiceOptions[0]);",
  '        return;',
  '      }',
  "      if (typeof shopOpen !== 'undefined' && shopOpen) { if (typeof closeShop === 'function') closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return; }",
  "      try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push(e.message); }",
  "      if (typeof Dialogue !== 'undefined' && Dialogue.active) { if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); return; }",
  "      if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {",
  '        handleEventChoice(eventOptions[0]); return;',
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
  await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
  await sleep(300);
  for (let i = 0; i < 200; i++) {
    const st = await ev('({hub:typeof hubActive!=="undefined"?hubActive:false, map:typeof mapActive!=="undefined"?mapActive:false, dact:typeof Dialogue!=="undefined"?Dialogue.active:false})');
    if (st.map && !st.hub) break;
    if (st.dact) await ev('try{ if(!Dialogue.complete)Dialogue.skip(); else Dialogue.hide(); "ok" }catch(e){e.message}');
    await sleep(80);
  }
  await ev(INJECT);
  await sleep(200);

  // 监控到击败第一个 Boss（中层段激活）后检查
  let segIdx = 0, checked = false;
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const st = await ev('({seg:(typeof _currentSegmentIndex==="function")?_currentSegmentIndex():-1, room:typeof currentDiveRoom!=="undefined"&&currentDiveRoom?currentDiveRoom.id:null, hub:typeof hubActive!=="undefined"?hubActive:false, err:(window.__autoError||[]).length})');
    if (st.__err) { log('err', st.__err); break; }
    if (st.seg !== segIdx) { log('[' + i + 's] segIdx=' + st.seg + ' room=' + st.room + ' err=' + st.err); segIdx = st.seg; }
    if (st.seg >= 1 && !checked) {
      checked = true;
      // 中层段激活：检查当前活跃房间里的商店是否都在中层段范围内
      const check = await ev(`(() => {
        const seg = dynamicSegments[1];
        const shops = getActiveRooms().filter(r => r.isShop).map(r => ({ id: r.id, layer: r.layer, segRange: [seg.startLayer, seg.endLayer] }));
        const outside = shops.filter(s => s.layer < seg.startLayer || s.layer > seg.endLayer);
        const allRoomsOutside = getActiveRooms().filter(r => r.layer < seg.startLayer || r.layer > seg.endLayer);
        return JSON.stringify({ shops, outside, allRoomsOutside, segRange: [seg.startLayer, seg.endLayer], allShopCount: _getRoomData().filter(r => r.isShop).length });
      })()`);
      log('中层段活跃房间检查:', check);
      const c = JSON.parse(check);
      const pass = c.outside.length === 0 && c.allRoomsOutside.length === 0 && c.shops.length < c.allShopCount;
      log(pass ? '\n✅✅ 分屏修复通过：中层段只显示本段「市」，无跨段残留' : '\n❌❌ 分屏仍有跨段残留：' + check);
      log('完成后回 Hub 确认无卡死:', await ev('typeof hubActive!=="undefined"?hubActive:false'));
      ws.close(); process.exit(pass ? 0 : 1);
    }
    if (st.err > 300) { log('err 暴涨'); break; }
  }
  log('⚠️ 未在中层段完成检查（可能卡住）');
  ws.close(); process.exit(1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
