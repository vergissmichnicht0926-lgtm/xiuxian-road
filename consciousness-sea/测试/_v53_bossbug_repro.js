/* ═══════════════ v5.3 Boss bug 复现：忆回血 / 锁链卡住 ═══════════════
 * 运行：node 测试/_v53_bossbug_repro.js（需先起 server 8734 + Chrome CDP 9222）
 * 驱动真实 startTestBoss → startRoom → 对话 → initBoss，再强制特定攻击观测状态机。
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
  if (!ready) { log('ERR not ready'); process.exit(1); }

  // 启动 Boss 并跳过入场对话（复用 _v53_bosstest_check 的驱动）
  async function bootBoss(key) {
    await ev(`startTestBoss('${key}')`);
    for (let g = 0; g < 30; g++) {
      await ev(`(() => { try { if (typeof Dialogue !== 'undefined' && Dialogue.active) Dialogue.hide(); } catch(e){} try { if (typeof advanceRoomDialogue === 'function') advanceRoomDialogue(); } catch(e){} return 1; })()`);
      await sleep(100);
      const ok = await ev(`(typeof bossActive !== 'undefined' && bossActive && bossState && bossState._bossKey === '${key}')`);
      if (ok) break;
    }
    return await ev(`(typeof bossActive !== 'undefined' && bossActive && bossState && bossState._bossKey === '${key}')`);
  }

  // ═══ ① 忆·回血回溯：验证条件可达性与触发频率 ═══
  // 手动模拟：蓄力开始记录HP→蓄力期间掉血→蓄力结束，多次尝试看回溯概率
  const recall = await bootBoss('recall');
  const backtrack = await ev(`(() => {
    const s = bossState;
    s.phase = BOSS_PHASE.CHARGING; s.chargeProgress = 0.5;
    // 记录蓄力开始血量（SPLIT→CHARGING 处逻辑）
    s._backtrackHp = s.hp;
    // 蓄力期间掉血
    s.hp -= 60;
    s._backtrackUsed = false;
    // 模拟蓄力完成 → 触发 onBossChargeComplete
    onBossChargeComplete();
    return { hpAfter: s.hp, backtrackHp: s._backtrackHp, used: s._backtrackUsed, healed: s.hp >= s._backtrackHp };
  })()`);
  log('[忆-回溯-单次尝试]', backtrack);
  // 多次尝试统计触发率
  const rate = await ev(`(() => {
    let hits = 0, tries = 500;
    for (let i = 0; i < tries; i++) {
      const s = bossState;
      s._backtrackHp = s.hp = 200; s.hp = 140; s._backtrackUsed = false;
      // 覆写随机数种子不可行，直接调用并数触发（onBossChargeComplete 内部 Math.random()）
      const before = s.hp;
      onBossChargeComplete();
      if (s.hp > before) hits++;
    }
    return { hits, tries, rate: Math.round(hits/tries*100) };
  })()`);
  log('[忆-回溯-触发率500次]', rate);

  // ═══ ② 锁链·执：模拟已落地 Boss（部件在屏内）→ throw→locked→自动结束 ═══
  const obsess = await bootBoss('obsess');
  const grip_inscreen = await ev(`(() => {
    const s = bossState;
    // 模拟落地：部件摆到攻击位置（屏内）
    s.left.x = W*0.5 - 160; s.left.y = H*0.22;
    s.right.x = W*0.5 + 160; s.right.y = H*0.22;
    s.phase = BOSS_PHASE.ATTACK; s._exposedPart = 'right';
    s.currentAttack = { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 };
    s.attackWaveCount = 0; s._attackMaxWaves = 1; s.timer = 0;
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p => !p._gripHead);
    s.left._isFlying = false; s.right._isFlying = false;
    executeAttack(s.currentAttack, 1);
    mx = W*0.5; my = H*0.5;   // 鼠标固定在屏内
    return { phase: s._gripChain.phase, headX: s._gripChain.heads[0].x, headY: s._gripChain.heads[0].y };
  })()`);
  log('[执-锁链-初始化(落地)]', grip_inscreen);
  const grip_run = await ev(`(async () => {
    let snap = [];
    for (let f = 0; f < 300; f++) {
      update(0.033);
      const g = bossState._gripChain;
      if (g && f % 30 === 0) snap.push({ f, phase: g.phase, lockTimer: Math.round(g.lockTimer*10)/10, done: g.done, headAlive: g.heads.length ? g.heads.some(h=>h.alive) : null });
      if (g && g.done) break;
      await new Promise(r => setTimeout(r, 8));
    }
    const g2 = bossState._gripChain;
    return { done: g2 && g2.done, phase: g2 && g2.phase, bossPhase: bossState.phase, snap };
  })()`);
  log('[执-锁链-屏内鼠标(落地)]', grip_run);

  // ═══ ③ 锁链·执：锁定后不点「断」→ 是否自动结束（2.8s）═══
  const grip_locked_no_click = await ev(`(async () => {
    const s = bossState;
    s.left.x = W*0.5 - 160; s.left.y = H*0.22;
    s.right.x = W*0.5 + 160; s.right.y = H*0.22;
    s.phase = BOSS_PHASE.ATTACK; s._exposedPart = 'right';
    s.currentAttack = { type:'grip_chain', chainSpeed:16, chainSize:26, chainColor:'#ff8844', lockRadius:140, lockDuration:2.8, damage:14 };
    s.attackWaveCount = 0; s._attackMaxWaves = 1; s.timer = 0;
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p => !p._gripHead);
    s.left._isFlying = false; s.right._isFlying = false;
    executeAttack(s.currentAttack, 1);
    mx = W*0.5; my = H*0.5;
    // 锁定后把鼠标放在「断」节点上但不点击，纯等超时
    let lockedAt = -1;
    for (let f = 0; f < 300; f++) {
      update(0.033);
      const g = bossState._gripChain;
      if (!g) break;
      if (g.phase === 'locked' && lockedAt < 0) { lockedAt = f; g.lockTimer = 0; }
      if (g.done) { return { endedAt: f, elapsedFromLock: (f - lockedAt) * 0.033, phase: g.phase }; }
      await new Promise(r => setTimeout(r, 8));
    }
    const g = bossState._gripChain;
    return { stuck: true, phase: g && g.phase, lockTimer: g && Math.round(g.lockTimer*10)/10 };
  })()`);
  log('[执-锁链-锁定不点击]', grip_locked_no_click);

  // ═══ ④ 憾·心牢：锁定后不点「断」→ 是否自动合拢 ═══
  const han = await bootBoss('regret_abyss');
  const knot_no_click = await ev(`(async () => {
    const s = bossState;
    s.left.x = W*0.5 - 170; s.left.y = H*0.22;
    s.right.x = W*0.5 + 170; s.right.y = H*0.22;
    s.phase = BOSS_PHASE.ATTACK; s._exposedPart = 'right';
    s.currentAttack = { type:'heart_knot', part:'left', chainSpeed:16, chainSize:28, chainColor:'#ff5544', lockRadius:120, lockDuration:2.6, burstDamage:26, knotSize:52 };
    s.attackWaveCount = 0; s._attackMaxWaves = 1; s.timer = 0;
    s._gripChain = null; bossProjectiles = bossProjectiles.filter(p => !p._gripHead);
    s.left._isFlying = false; s.right._isFlying = false;
    executeAttack(s.currentAttack, 1);
    mx = W*0.5; my = H*0.5;
    for (let f = 0; f < 300; f++) {
      update(0.033);
      const g = bossState._gripChain;
      if (!g) break;
      if (g.phase === 'locked' && g.lockTimer < 0.1) g.lockTimer = 0;
      if (g.done) return { endedAt: f, phase: g.phase };
      await new Promise(r => setTimeout(r, 8));
    }
    const g = bossState._gripChain;
    return { stuck: true, phase: g && g.phase, lockTimer: g && Math.round(g.lockTimer*10)/10 };
  })()`);
  log('[憾-心牢-锁定不点击]', knot_no_click);

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
