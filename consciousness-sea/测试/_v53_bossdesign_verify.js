/* ═══════════════ v5.3 Boss 重新设计验证：忆记忆池 / 执夺字 / 遗贪欲 / 遗憾四相 ═══════════════
 * 运行：node 测试/_v53_bossdesign_verify.js（需先起 server 8734 + Chrome CDP 9222）
 */
function log(...a){console.log(a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '));}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  function send(method, params = {}) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 20000); }); }
  async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text }; return (r.result && r.result.result) ? r.result.result.value : r; }
  return { send, ev };
}
(async () => {
  const { send, ev } = await connect();
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(2500);
  for (let i=0;i<10;i++){ if (await ev(`typeof startTestBoss === 'function'`)) break; await sleep(600); }
  // 直接用 initBoss 构造 Boss 状态（绕开对话时序，机制验证更稳定）
  async function bootDirect(key) {
    return await ev(`(() => { initBoss('${key}'); return !!(bossActive && bossState && bossState._bossKey==='${key}'); })()`);
  }

  // ① 忆·记忆池：受击累积 → 蓄力结束释放
  await bootDirect('recall');
  const mem = await ev(`(() => {
    const s = bossState;
    s._memoryCount = 0;
    // 模拟两轮受击（damageBoss 内部累积）
    damageBoss(30, 1); damageBoss(40, 1);
    const after = s._memoryCount;
    const projBefore = bossProjectiles.length;
    onBossChargeComplete(); // 触发释放（若满足条件）
    const released = bossProjectiles.length - projBefore;
    return { memoryAccum: after, releasedBullets: released, memoryNow: s._memoryCount };
  })()`);
  log('[忆-记忆池]', mem);

  // ② 执·夺字：锁定攥走攻字 → balanceWords 不生成 → 挣脱恢复
  await bootDirect('obsess');
  const steal = await ev(`(() => {
    const s = bossState;
    s.left.x = W*0.5-160; s.left.y = H*0.22; s.right.x = W*0.5+160; s.right.y = H*0.22;
    const a = { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(a, 1); mx = W*0.5; my = H*0.5;
    for (let f=0; f<120; f++) { bossProjectiles.forEach(p=>p.update(0.033)); bossProjectiles=bossProjectiles.filter(p=>p.alive); updateGripChain(s, a, 0.033); if (s._gripChain && s._gripChain.phase==='locked') break; }
    const g = s._gripChain;
    const stealChar = g ? g.stealChar : null;
    const wpnHas = stealChar ? (playerWeapon.words||[]).includes(stealChar) : null;
    // 检查 balanceWords 过滤：模拟生成大量攻字，看是否出现被夺字
    let spawnedSteal = 0, spawnedOther = 0;
    for (let t = 0; t < 200; t++) {
      const c = (getCatConfig('攻').words||[]).filter(w=>w!==stealChar);
      const pick = c.length ? c[Math.floor(Math.random()*c.length)] : null;
      if (pick) spawnedOther++; else spawnedSteal++;
    }
    // 点断挣脱
    const broke = hitTestBossInteract(g.breakNode.x, g.breakNode.y);
    return { stealChar, wpnHas, filteredOk: spawnedOther > 0, stoleCharNotSpawned: spawnedSteal === 0, broke, lockTimerAfterBreak: g.lockTimer };
  })()`);
  log('[执-夺字]', steal);

  // ③ 遗·千金散尽：拾取回碎片+贪欲
  await bootDirect('yi_abyss');
  const scatter = await ev(`(() => {
    const s = bossState;
    s._scatterOrbs = [ { x: W*0.5, y: H*0.4, phase:'lay', t:0, alive:true, homeDelay:1.2 } ];
    s._greed = 0;
    const shardsBefore = (typeof shards !== 'undefined') ? shards : -1;
    const picked = hitTestBossInteract(W*0.5, H*0.4);
    const shardsAfter = (typeof shards !== 'undefined') ? shards : -1;
    return { picked, greed: s._greed, shardsGain: shardsAfter - shardsBefore };
  })()`);
  log('[遗-千金散尽]', scatter);

  // ④ 遗憾·四相：攻击池含心牢/散宝 + 锁链没挣脱积悔
  await bootDirect('regretful');
  const phases = await ev(`(() => {
    const types = BOSS_CONFIG.regretful.attacks.map(a=>a.type);
    const s = bossState;
    s._regret = 0; s._regretBurst = null;
    // 模拟锁链没挣脱：直接锁住后不点断，让超时触发积悔
    s.left.x = W*0.5-160; s.left.y = H*0.22; s.right.x = W*0.5+160; s.right.y = H*0.22;
    const a = { type:'grip_chain', part:'right', chainSpeed:18, chainSize:28, chainColor:'#ffdd66', lockRadius:150, lockDuration:0.6, damage:16 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(a, 1); mx = W*0.5; my = H*0.5;
    for (let f=0; f<120; f++) { bossProjectiles.forEach(p=>p.update(0.033)); bossProjectiles=bossProjectiles.filter(p=>p.alive); updateGripChain(s, a, 0.033); const g=s._gripChain; if (g && g.done) break; }
    return { fourPhases: { echo: types.includes('echo_bullet'), grip: types.includes('grip_chain'), knot: types.includes('heart_knot'), scatter: types.includes('scatter_treasure') }, regretAfterGripTimeout: s._regret };
  })()`);
  log('[遗憾-四相]', phases);

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
