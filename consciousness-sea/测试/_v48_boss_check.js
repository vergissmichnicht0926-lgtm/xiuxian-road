// ═══ v4.8 三 Boss 专属机制验证：余音/锁链/悔/碎片态/守卫 ═══
// 前置：_server.js + Chrome(9222)。运行：node 测试/_v48_boss_check.js
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

(async () => {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (m.error) p.rej(new Error(m.error.message)); else p.res(m.result);
    }
  };
  // 强制刷新 + 禁用缓存（确保加载最新 js，避免浏览器缓存旧版）
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(3500);
  const errors = [];
  const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) errors.push(m); };

  // ── A. BOSS_CONFIG 三形态配置 ──
  ok(await ev("BOSS_CONFIG.recall.attacks.some(a=>a.type==='echo_bullet')"), '忆含 echo_bullet');
  ok(await ev("BOSS_CONFIG.obsess.attacks.some(a=>a.type==='grip_chain')"), '执含 grip_chain');
  ok(await ev("!!BOSS_CONFIG.regret_abyss && !!BOSS_CONFIG.yi_abyss"), '碎片态 regret_abyss/yi_abyss 存在');
  // 碎片态专属技能（v4.9）：憾=心牢、遗=千金散尽
  ok(await ev("BOSS_CONFIG.regret_abyss.attacks.some(a=>a.type==='heart_knot')"), '憾碎片含 heart_knot 心牢');
  ok(await ev("BOSS_CONFIG.yi_abyss.attacks.some(a=>a.type==='scatter_treasure')"), '遗碎片含 scatter_treasure 千金散尽');
  ok(await ev("BOSS_CONFIG.regret_abyss.attacks.find(a=>a.type==='heart_knot').burstDamage===26"), 'heart_knot burstDamage=26');
  ok(await ev("BOSS_CONFIG.yi_abyss.attacks.find(a=>a.type==='scatter_treasure').orbs===6"), 'scatter_treasure orbs=6');
  ok(await ev("typeof updateScatterTreasure==='function' && typeof drawScatterTreasure==='function'"), '散宝 update/draw 函数存在');
  ok(await ev("BOSS_CONFIG.regretful.regretMax===6"), '遗憾 regretMax=6');
  ok(await ev("BOSS_CONFIG.regretful.attacks.some(a=>a.type==='echo_bullet'&&a.part==='left')"), '遗憾 echo_bullet part:left');
  ok(await ev("BOSS_CONFIG.regret_abyss.hp===BOSS_CONFIG.yi_abyss.hp"), '碎片态数值平衡（HP 相同）');
  // ── A2. 双核心切换平衡（v4.9 修复：delayed_burst 补 part:'right'）──
  ok(await ev("(function(){function ap(a){return a.part?a.part:(a.type==='left_charge'||a.type==='delayed_burst')?'left':'right';} const parts=BOSS_CONFIG.regretful.attacks.map(ap); const L=parts.filter(p=>p==='left').length; const R=parts.filter(p=>p==='right').length; return L===2&&R===2;})()"), '遗憾攻击左右平衡（2:2）');
  ok(await ev("BOSS_CONFIG.regretful.attacks.find(a=>a.type==='delayed_burst').part==='right'"), '遗憾 delayed_burst part:right');
  ok(await ev("BOSS_CONFIG.yi.attacks.find(a=>a.type==='delayed_burst').part==='right'"), '遗 delayed_burst part:right');
  ok(await ev("BOSS_CONFIG.yi_abyss.attacks.find(a=>a.type==='delayed_burst').part==='right'"), '遗碎片 delayed_burst part:right');

  // ── B. 忆·余音回响（单 ev，避免主循环干扰）──
  const echoR = JSON.parse(await ev("(function(){isRoguelikeMap=true; initBoss('recall'); bossState.currentAttack=BOSS_CONFIG.recall.attacks[0]; try{executeAttack(bossState.currentAttack,1);}catch(e){return JSON.stringify({err:e.message});} const echoN=bossProjectiles.filter(p=>p._echoSource).length; const pp=bossProjectiles.find(p=>p._echoSource); if(pp){spawnEchoMark(bossState,pp); bossState._echoMarks[bossState._echoMarks.length-1].t=bossState._echoMarks[bossState._echoMarks.length-1].delay; updateEchoMarks(bossState,0);} const echoBullet=bossProjectiles.filter(p=>p._homing&&p.char==='忆').length; bossState._echoMarks.push({x:300,y:200,t:0,delay:5,dmg:10,spd:2,color:'#7dd7ff',size:22,alive:true,char:'余'}); hitTestBossInteract(300,200); const remaining=bossState._echoMarks.filter(m=>m.alive).length; const r={echoN:echoN,echoBullet:echoBullet,dispelOK:remaining===0,err:null}; bossActive=false; bossState=null; bossProjectiles=[]; isRoguelikeMap=false; return JSON.stringify(r);})()"));
  ok(!echoR.err && echoR.echoN > 0, `记忆弹带 _echoSource（${echoR.echoN} 发）`);
  ok(echoR.echoBullet > 0, `余音延迟生成追踪回声（${echoR.echoBullet} 发）`);
  ok(echoR.dispelOK, '点击余音提前消除');

  // ── C. 执·执念锁链（单 ev）──
  const gripR = JSON.parse(await ev("(function(){isRoguelikeMap=true; initBoss('obsess'); bossState.currentAttack=BOSS_CONFIG.obsess.attacks[0]; try{executeAttack(bossState.currentAttack,1);}catch(e){return JSON.stringify({err:e.message});} const g=bossState._gripChain; const h=g&&g.heads[0]; mx=h.x; my=h.y; updateGripChain(bossState,bossState.currentAttack,0.1); const locked=g.phase==='locked'; const hasBreak=g.breakNode&&g.breakNode.alive; const r={locked:locked,hasBreak:hasBreak,err:null}; if(locked){const bn=g.breakNode; hitTestBossInteract(bn.x,bn.y); r.freed=g.breakNode.alive===false;} bossActive=false; bossState=null; bossProjectiles=[]; isRoguelikeMap=false; return JSON.stringify(r);})()"));
  ok(!gripR.err, '锁链攻击无异常');
  ok(gripR.locked, '链头触身锁定光标');
  ok(gripR.hasBreak, '断节点出现');
  ok(gripR.freed, '点「断」挣脱锁链');

  // ── D. 遗憾·悔业障 ──
  await ev("initBoss('regretful'); accumulateRegret(bossState,1); true");
  ok(await ev("bossState._regret===1"), '被命中累积悔');
  await ev("accumulateRegret(bossState,5); true");
  ok(await ev("!!bossState._regretBurst"), '悔满触发归尘警告');
  await ev("const dn=bossState._regretBurst.dispelNode; hitTestBossInteract(dn.x,dn.y); true");
  ok(await ev("bossState._regretBurst.dispelNode.alive===false"), '点「放下」取消归尘');
  await ev("bossActive=false; bossState=null; true");

  // ── E. 肉鸽碎片态假撤退守卫 ──
  await ev("isRoguelikeMap=true; initBoss('regret_abyss'); bossState.hp=900; bossState._fled=false; damageBoss(800,1); true");
  const fragHp = await ev("bossState.hp");
  ok(fragHp === 100, `肉鸽碎片态「憾」正常击败（hp=${fragHp}，未触发逃跑）`);
  ok(await ev("!bossState._fled"), '碎片态憾不触发序章逃跑');
  await ev("bossActive=false; bossState=null; isRoguelikeMap=false; true");

  console.log(errors.length ? 'BOSS CHECK FAIL: ' + errors.length : 'BOSS CHECK PASS');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('BOSS CHECK FAIL:', e.message); process.exit(1); });
