/* ═══════════════ v5.3 Boss修复验证：忆回溯 / 锁链状态机 / 卡死消除 ═══════════════
 * 运行：node 测试/_v53_bossfix_verify.js（需先起 server 8734 + Chrome CDP 9222）
 * 直接驱动 initBoss + executeAttack + updateGripChain，确定性观测 throw→locked→done。
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
  await sleep(3000);
  let ready = false;
  for (let i = 0; i < 10; i++) { if (await ev(`typeof startTestBoss === 'function'`)) { ready = true; break; } await sleep(600); }
  if (!ready) { process.exit(1); }
  async function bootBoss(key) {
    await ev(`startTestBoss('${key}')`);
    for (let g = 0; g < 30; g++) {
      await ev(`(() => { try { if (typeof Dialogue !== 'undefined' && Dialogue.active) Dialogue.hide(); } catch(e){} try { if (typeof advanceRoomDialogue === 'function') advanceRoomDialogue(); } catch(e){} return 1; })()`);
      await sleep(90);
      if (await ev(`(typeof bossActive !== 'undefined' && bossActive && bossState && bossState._bossKey === '${key}')`)) break;
    }
  }

  // ① 忆·回溯：保证触发 + 保底回血量
  await bootBoss('recall');
  const bt = await ev(`(() => {
    const s = bossState;
    s._backtrackHp = 300; s.hp = 240; s._backtrackUsed = false;
    const before = s.hp;
    onBossChargeComplete();   // 应触发
    const healed1 = s.hp;
    s.hp = 295; s._backtrackUsed = false;  // 蓄力期只掉5点 → 保底25
    s._backtrackHp = 300;
    onBossChargeComplete();
    const healed2 = s.hp;
    return { first: healed1 - before, second: healed2 - 295, backtracks: { hp: s.hp, used: s._backtrackUsed } };
  })()`);
  log('[忆-回溯-保证触发]', bt);

  // ② 执·锁链状态机（落地 Boss）：throw → locked → 2.8s自动 done
  await bootBoss('obsess');
  const gc = await ev(`(() => {
    const s = bossState;
    s.left.x = W*0.5 - 160; s.left.y = H*0.22;
    s.right.x = W*0.5 + 160; s.right.y = H*0.22;
    const atk = { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(atk, 1);
    mx = W*0.5; my = H*0.5;
    const phases = [];
    for (let f = 0; f < 260; f++) {
      bossProjectiles.forEach(p=>p.update(0.033));
      bossProjectiles = bossProjectiles.filter(p=>p.alive);
      updateGripChain(s, atk, 0.033);
      const g = s._gripChain;
      if (!g) break;
      const last = phases[phases.length-1];
      if (f === 0 || (last && last.phase !== g.phase)) phases.push({ f, phase: g.phase, lockTimer: Math.round(g.lockTimer*10)/10 });
      if (g.done) break;
    }
    const g = s._gripChain;
    return { phases, finalPhase: g && g.phase, done: g && g.done };
  })()`);
  log('[执-锁链状态机]', gc);

  // ③ 执·锁链鼠标屏外（链头出屏）：应自动落空结束，不卡死
  const gcOff = await ev(`(() => {
    const s = bossState;
    s.left.x = W*0.5 - 160; s.left.y = H*0.22;
    s.right.x = W*0.5 + 160; s.right.y = H*0.22;
    const atk = { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(atk, 1);
    mx = W + 900; my = H + 900;   // 鼠标远在屏外
    for (let f = 0; f < 400; f++) {
      bossProjectiles.forEach(p=>p.update(0.033));
      bossProjectiles = bossProjectiles.filter(p=>p.alive);
      updateGripChain(s, atk, 0.033);
      const g = s._gripChain;
      if (g && g.done) return { ended: true, atFrame: f, phase: g.phase };
      if (!g) break;
    }
    const g = s._gripChain;
    return { ended: false, phase: g && g.phase, lockTimer: g && Math.round(g.lockTimer*10)/10 };
  })()`);
  log('[执-锁链-屏外鼠标]', gcOff);

  // ④ 憾·心牢状态机：锁定 → 收缩 → 超时合拢（burst）→ done
  await bootBoss('regret_abyss');
  const hk = await ev(`(() => {
    const s = bossState;
    s.left.x = W*0.5 - 170; s.left.y = H*0.22;
    s.right.x = W*0.5 + 170; s.right.y = H*0.22;
    const atk = { type:'heart_knot', part:'left', chainSpeed:16, chainSize:28, chainColor:'#ff5544', lockRadius:120, lockDuration:2.6, burstDamage:26, knotSize:52 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(atk, 1);
    mx = W*0.5; my = H*0.5;
    const phases = [];
    let burstFiredAt = -1;
    for (let f = 0; f < 260; f++) {
      bossProjectiles.forEach(p=>p.update(0.033));
      bossProjectiles = bossProjectiles.filter(p=>p.alive);
      updateGripChain(s, atk, 0.033);
      const g = s._gripChain;
      if (!g) break;
      if (g.burstFired && burstFiredAt < 0) burstFiredAt = f;
      const last = phases[phases.length-1];
      if (f === 0 || (last && last.phase !== g.phase)) phases.push({ f, phase: g.phase, lockTimer: Math.round(g.lockTimer*10)/10, radius: Math.round(g.radius) });
      if (g.done) break;
    }
    const g = s._gripChain;
    return { phases, burstFiredAt, finalPhase: g && g.phase, done: g && g.done };
  })()`);
  log('[憾-心牢状态机]', hk);

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
