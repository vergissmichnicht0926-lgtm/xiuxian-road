/* ═══════════════ v5.3 「断」节点点击修复 + 悔量表说明验证 ═══════════════
 * 运行：node 测试/_v53_breaknode_verify.js（需先起 server 8734 + Chrome CDP 9222）
 * 心牢/锁链锁定后，验证点「断」能立即挣脱；悔量表带说明。
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
  async function bootBoss(key) {
    await ev(`startTestBoss('${key}')`);
    for (let g=0;g<30;g++){ await ev(`(() => { try { if (Dialogue.active) Dialogue.hide(); } catch(e){} try { advanceRoomDialogue(); } catch(e){} return 1; })()`); await sleep(80); if (await ev(`bossActive && bossState && bossState._bossKey==='${key}'`)) break; }
  }
  async function lockInto(bossKey, atk) {
    // 返回锁定时断节点位置（真实场景），并把 boss 置于 locked
    await bootBoss(bossKey);
    return await ev(`(() => {
      const s = bossState;
      s.left.x = W*0.5-160; s.left.y = H*0.22; s.right.x = W*0.5+160; s.right.y = H*0.22;
      const a = ${JSON.stringify(atk)};
      s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
      executeAttack(a, 1);
      mx = W*0.5; my = H*0.5;
      // 驱动到 locked
      for (let f=0; f<120; f++) {
        bossProjectiles.forEach(p=>p.update(0.033));
        bossProjectiles = bossProjectiles.filter(p=>p.alive);
        updateGripChain(s, a, 0.033);
        const g = s._gripChain;
        if (g && g.phase === 'locked') break;
      }
      const g = s._gripChain;
      return { locked: g && g.phase === 'locked', breakNode: g ? { x: Math.round(g.breakNode.x), y: Math.round(g.breakNode.y) } : null, anchor: g ? { x: Math.round(g.anchorX), y: Math.round(g.anchorY) } : null, knotRadius: g ? g.knotRadius : null };
    })()`);
  }

  // ① 憾·心牢：断节点位置（应 = 绘制位置 anchor+knotRadius），点它应挣脱
  const knot = await lockInto('regret_abyss', { type:'heart_knot', part:'left', chainSpeed:16, chainSize:28, chainColor:'#ff5544', lockRadius:120, lockDuration:2.6, burstDamage:26, knotSize:52 });
  log('[心牢-锁定]', knot);
  let knotBreak = null;
  if (knot && knot.locked) {
    knotBreak = await ev(`(() => {
      const s = bossState, g = s._gripChain, bn = g.breakNode;
      // 点击断节点位置（模拟玩家点击看到的「断」）
      const hitTest = (cx, cy) => hitTestBossInteract(cx, cy);
      const before = g.lockTimer;
      const ok = hitTest(bn.x, bn.y);   // 点「断」
      return { broke: ok, done: g.done, lockTimer: g.lockTimer, before, phase: g.phase, breakNodeAlive: bn.alive };
    })()`);
  }
  log('[心牢-点断]', knotBreak);

  // ② 执·锁链：点断节点应挣脱
  const chain = await lockInto('obsess', { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 });
  log('[锁链-锁定]', chain);
  let chainBreak = null;
  if (chain && chain.locked) {
    chainBreak = await ev(`(() => {
      const s = bossState, g = s._gripChain, bn = g.breakNode;
      const ok = hitTestBossInteract(bn.x, bn.y);
      return { broke: ok, done: g.done, phase: g.phase, lockTimer: g.lockTimer };
    })()`);
  }
  log('[锁链-点断]', chainBreak);

  // ③ 悔量表说明：遗憾 Boss 悔条带说明文字（检查 drawRegretBurst 里有 caption —— 通过读取源码字符串不可行，改为渲染后视觉验证）
  // 直接验证悔条能累积并显示（_regret 计数）
  await bootBoss('regretful');
  const regret = await ev(`(() => {
    const s = bossState;
    // 模拟受击累积
    if (typeof accumulateRegret === 'function') { for (let i=0;i<3;i++) accumulateRegret(s); }
    return { regret: s._regret, max: cfgRegretMax(), hasBurst: !!s._regretBurst };
  })()`);
  log('[悔条-累积]', regret);

  // ④ 截图：心牢锁定 + 悔条（视觉验证说明文字）
  const shot = await ev(`(() => {
    const s = bossState;
    s.left.x = W*0.5-160; s.left.y = H*0.22; s.right.x = W*0.5+160; s.right.y = H*0.22;
    const a = { type:'heart_knot', part:'left', chainSpeed:16, chainSize:28, chainColor:'#ff5544', lockRadius:120, lockDuration:2.6, burstDamage:26, knotSize:52 };
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p=>!p._gripHead);
    executeAttack(a, 1); mx = W*0.5; my = H*0.5;
    for (let f=0; f<120; f++) { bossProjectiles.forEach(p=>p.update(0.033)); bossProjectiles = bossProjectiles.filter(p=>p.alive); updateGripChain(s, a, 0.033); const g=s._gripChain; if (g && g.phase==='locked') break; }
    s._regret = 4;  // 让悔条可见
    return s._gripChain.phase;
  })()`);
  log('[截图-心牢锁定]', shot);
  const cap = await send('Page.captureScreenshot', { format: 'png' });
  if (cap.result && cap.result.data) { const fs = require('fs'); fs.writeFileSync('C:/tmp/v53_knot_regret.png', Buffer.from(cap.result.data, 'base64')); }

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
