/* ═══════════════ 潜航总结/结算/开局随机池 浏览器验证（CDP）═══════════════
 * 运行：node 测试/_run_summary_verify.js（需先起 server + Chrome CDP 9222）
 * 验证：结算公式 / 熟练度入账 / rollStartGear 解锁池 / 主动返回按钮 / 死亡总结流程
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 8000); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text }; return r.result ? r.result.value : r; };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  // 导航到游戏页并等就绪
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`document.getElementById('dialogue-box') && typeof EQUIPMENT !== 'undefined' && typeof showRunSummary === 'function' && typeof rollStartGear === 'function'`);
    if (ok === true) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) { console.log('❌ 页面未就绪'); ws.close(); process.exit(1); }
  await sleep(300);

  // ═══ 阶段A：同步断言（结算公式/熟练度/rollStartGear/按钮几何）═══
  const syncRes = await ev(`(function(){
    const out = { pass: 0, fail: 0, msgs: [] };
    const check = (c, m) => { if (c) out.pass++; else { out.fail++; out.msgs.push('❌ ' + m); } };
    try {
      // A1. 通关结算公式：10 + 层数3×1 + 精英2×3 + Boss1×10 = 29
      soulCrystals = 0; maxLayerReached = 3; runEliteKills = 2; runBossKills = 1; runKills = 10;
      runEquipGains = { beginner_brush: 2, frost_verse: 1 }; equipProficiency = {};
      showRunSummary(true);
      check(soulCrystals === 29, '通关货币应=29，实际 ' + soulCrystals);
      check(equipProficiency['beginner_brush'] === 2 && equipProficiency['frost_verse'] === 1, '通关熟练度应入账，实际 ' + JSON.stringify(equipProficiency));
      check(document.getElementById('defeat-title').textContent === '潜航完成', '通关标题应为"潜航完成"');
      const statsTxt = document.getElementById('defeat-stats').textContent;
      check(statsTxt.indexOf('灵魂结晶 +29') >= 0, '统计区应显示 +29，实际 [' + statsTxt + ']');
      document.getElementById('defeat-overlay').classList.remove('show');

      // A2. 死亡结算公式：5 + 精英2×2 = 9；熟练度不作废（不入账）
      soulCrystals = 0; runEliteKills = 2; runEquipGains = { void_blade: 3 }; equipProficiency = {};
      showRunSummary(false);
      check(soulCrystals === 9, '死亡货币应=9，实际 ' + soulCrystals);
      check((equipProficiency['void_blade'] || 0) === 0, '死亡熟练度应作废（不入账）');
      check(document.getElementById('defeat-title').textContent === '意识崩解', '死亡标题应为"意识崩解"');
      document.getElementById('defeat-overlay').classList.remove('show');

      // A3. rollStartGear：熟练度≥5 的装备进开局池
      equipProficiency = { star_shatter: 5, frost_verse: 4, mind_wall: 5, moon_shroud: 4, storm_charm: 5 };
      const pools = { wpn: [], arm: [], tal: [] };
      for (let i = 0; i < 30; i++) {
        rollStartGear();
        pools.wpn.push(playerWeapon.id); pools.arm.push(playerArmor.id); pools.tal.push(playerTalisman.id);
      }
      check(pools.wpn.every(id => id === 'beginner_brush' || id === 'star_shatter'), '武器池应只含基础+解锁(star_shatter)，实际 ' + [...new Set(pools.wpn)].join(','));
      check(pools.wpn.includes('star_shatter'), '武器池应能roll到已解锁武器');
      check(pools.wpn.indexOf('frost_verse') < 0, '未达5次的武器(frost_verse)不应进池');
      check(pools.arm.every(id => id === 'thin_silk' || id === 'mind_wall'), '防具池应只含基础+解锁(mind_wall)');
      check(pools.tal.every(id => id === 'vitality_charm' || id === 'storm_charm'), '护符池应只含基础+解锁(storm_charm)');

      // A4. 主动返回按钮几何存在
      check(typeof _mapReturnBtnRect === 'function', '应有 _mapReturnBtnRect');
      const rr = _mapReturnBtnRect(W, H);
      check(rr.x > 0 && rr.y > 0, '按钮应在右上角');
    } catch (e) { out.msgs.push('❌ 异常: ' + e.message); }
    return JSON.stringify(out);
  })()`);
  const sr = typeof syncRes === 'string' ? JSON.parse(syncRes) : syncRes;
  console.log('=== 同步断言（结算/熟练度/开局池/按钮）===');
  console.log('通过 ' + sr.pass + ' / 失败 ' + sr.fail);
  if (sr.msgs && sr.msgs.length) console.log(sr.msgs.join('\n'));

  // ═══ 阶段B：死亡总结流程（异步：锚点对话 → 总结页）═══
  const flow = await ev(`(function(){
    // 构造肉鸽战斗房 + 触发死亡
    isRoguelikeMap = true;
    currentDiveRoom = { id:'test_c', type:'combat', label:'测试', enemyType:'bash', waves:1, enemyHP:40, enemyInterval:5, layer:1, enemyDmgMult:1 };
    if (typeof Tutorial !== 'undefined' && Tutorial.enterPhase) Tutorial.enterPhase(PHASE.BATTLE);
    if (typeof Dialogue !== 'undefined' && Dialogue.init) Dialogue.init();
    if (typeof playerHP !== 'undefined') playerHP = 0;
    // 清掉可能残留的 overlay
    document.getElementById('defeat-overlay').classList.remove('show');
    if (typeof handlePlayerDeath === 'function') handlePlayerDeath();
    return JSON.stringify({
      dact: typeof Dialogue !== 'undefined' ? Dialogue.active : false,
      dtext: (typeof Dialogue !== 'undefined' && Dialogue._fullText) ? Dialogue._fullText : '',
      phase: Tutorial.phase
    });
  })()`);
  const fl = JSON.parse(flow);
  console.log('=== 死亡流程 ===');
  console.log('锚点对话 active:', fl.dact, '| 文本:', fl.dtext, '| phase:', fl.phase);
  if (!fl.dact) { console.log('❌ 死亡后未出现锚点对话'); }

  // 点掉锚点对话 → 等轮询 → 总结页
  await ev(`try{ if(typeof Dialogue!=='undefined'&&Dialogue.active){ Dialogue.hide(); } "ok" }catch(e){e.message}`);
  await sleep(800);
  const after = await ev(`JSON.stringify({show: document.getElementById('defeat-overlay').classList.contains('show'), title: document.getElementById('defeat-title').textContent, stats: document.getElementById('defeat-stats').textContent, btn: document.getElementById('defeat-btns').innerHTML})`);
  const af = JSON.parse(after);
  console.log('总结页显示:', af.show, '| 标题:', af.title, '| 按钮含返回:', af.btn.indexOf('返回零的领域') >= 0);
  const flowPass = af.show && af.title === '意识崩解' && af.btn.indexOf('返回零的领域') >= 0;
  console.log(flowPass ? '✅ 死亡→锚点对话→总结页→返回按钮 全通' : '❌ 死亡总结流程有误');

  // ═══ 阶段C：主动返回按钮 → enterHub（无奖励，无总结）═══
  const abRes = await ev(`(function(){
    const out = { pass: 0, fail: 0, msgs: [] };
    const check = (c, m) => { if (c) out.pass++; else { out.fail++; out.msgs.push('❌ ' + m); } };
    try {
      document.getElementById('defeat-overlay').classList.remove('show');
      isRoguelikeMap = true; mapActive = true;
      const beforeCrystal = soulCrystals;
      const r = _mapReturnBtnRect(W, H);
      // 命中按钮 → enterHub
      handleMapClick(r.x, r.y);
      check(typeof hubActive !== 'undefined' && hubActive === true, '点按钮应进入Hub');
      check(soulCrystals === beforeCrystal, '主动返回不应给货币');
      check(!document.getElementById('defeat-overlay').classList.contains('show'), '主动返回不应弹总结页');
    } catch (e) { out.msgs.push('❌ 异常: ' + e.message); }
    return JSON.stringify(out);
  })()`);
  const ab = JSON.parse(abRes);
  console.log('=== 主动返回 ===');
  console.log('通过 ' + ab.pass + ' / 失败 ' + ab.fail);
  if (ab.msgs && ab.msgs.length) console.log(ab.msgs.join('\n'));

  const total = sr.fail + (flowPass ? 0 : 1) + ab.fail;
  ws.close(); process.exit(total ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
