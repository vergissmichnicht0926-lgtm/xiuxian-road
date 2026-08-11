// ═══ v4.7 技能重构验证：改名/八门递进/DoT眩晕/连锁/gamble/工坊 ═══
// 前置：_server.js + Chrome(9222)。运行：node 测试/_v47_skill_check.js
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
  // 确保页面已加载游戏（smoke_flow 等脚本依赖）
  const t = await ev('document.title');
  if (t !== '意识之海') {
    await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
    await sleep(3500);
  }
  const errors = [];
  const ok = (c, m) => { console.log((c ? '✅' : '❌') + ' ' + m); if (!c) errors.push(m); };

  // ── A. 改名 ──
  ok(await ev("EQUIPMENT.skills.concentration.name") === '卍解', '凝神→卍解');
  ok(await ev("EQUIPMENT.skills.time_freeze.name") === '扎瓦鲁多', '时间暂停→扎瓦鲁多');

  // 构造单敌战斗环境（重置 buff/focus 防上次运行残留污染）
  await ev("clearEnemyList(); weaponBuffs={}; _focusTarget=null; _focusStacks=0; enemyList.push({id:'e1',type:'bash',hp:500,maxHp:500,timer:5,interval:5,alive:true,entity:{x:400,y:200,char:'残'},stun:0,dot:null}); syncEnemyCompat(); updateEnemyUI(); true");

  // ── B. 八门递进：触发3次，伤害/自损递增 ──
  await ev("playerSkill=EQUIPMENT.skills.eight_gates; skillState={collected:[],chargeLevel:0,ready:false}; eightGatesLevel=0; playerHP=100; enemyList[0].hp=500; true");
  await ev("skillState.collected=['八','门','遁','甲']; triggerSkill(); true");
  const h1 = await ev("enemyList[0].hp"), hp1 = await ev("playerHP");
  await ev("skillState.collected=['八','门','遁','甲']; triggerSkill(); true");
  const h2 = await ev("enemyList[0].hp"), hp2 = await ev("playerHP");
  await ev("skillState.collected=['八','门','遁','甲']; triggerSkill(); true");
  const h3 = await ev("enemyList[0].hp"), hp3 = await ev("playerHP");
  const dmg1 = 500 - h1, dmg2 = h1 - h2, dmg3 = h2 - h3;
  const cost1 = hp1 !== 100 ? 100 - hp1 : 0, cost2 = hp1 - hp2, cost3 = hp2 - hp3;
  ok(dmg1 === 37 && dmg2 === 49 && dmg3 === 61, `八门伤害递增 37/49/61，实际 ${dmg1}/${dmg2}/${dmg3}`);
  ok(cost2 === 8 && cost3 === 10, `八门自损递增 6/8/10，实际 ${cost1}/${cost2}/${cost3}`);
  ok(await ev("eightGatesLevel") === 3, `八门门数应=3，实际 ${await ev('eightGatesLevel')}`);

  // ── C. 鸡你太美：单体伤 + DoT + 眩晕 ──
  await ev("enemyList[0].hp=200; enemyList[0].stun=0; enemyList[0].dot=null; playerSkill=EQUIPMENT.skills.jinitaimei; skillState={collected:[],chargeLevel:0,ready:false}; true");
  await ev("skillState.collected=['鸡','你','太','美']; triggerSkill(); true");
  const j = JSON.parse(await ev("JSON.stringify({hp:enemyList[0].hp,stun:enemyList[0].stun,dot:enemyList[0].dot})"));
  ok(j.hp === 170, `鸡你太美单体30伤，实际 hp ${j.hp}`);
  ok(j.stun === 3, `鸡你太美眩晕3s，实际 ${j.stun}`);
  ok(j.dot && j.dot.dmg === 10 && j.dot.duration === 3, `鸡你太美 DoT 设置，实际 ${JSON.stringify(j.dot)}`);

  // ── D. 超电磁炮：单体45 + 连锁30%溅射（先清 buff/focus 防上轮残留污染）──
  await ev("clearEnemyList(); weaponBuffs={}; _focusTarget=null; _focusStacks=0; enemyList.push({id:'m1',type:'bash',hp:200,maxHp:200,timer:5,interval:5,alive:true,entity:{x:300,y:200,char:'残'},stun:0,dot:null},{id:'m2',type:'bash',hp:200,maxHp:200,timer:5,interval:5,alive:true,entity:{x:500,y:200,char:'残'},stun:0,dot:null}); playerSkill=EQUIPMENT.skills.railgun; skillState={collected:[],chargeLevel:0,ready:false}; true");
  await ev("skillState.collected=['超','电','磁','炮']; triggerSkill(); true");
  const r = JSON.parse(await ev("JSON.stringify({a:enemyList[0].hp,b:enemyList[1].hp})"));
  ok(r.a === 155 && r.b === 187, `超电磁炮 单体45+连锁13，实际 ${r.a}/${r.b}`);

  // ── E. 意识共鸣 gamble：武器 buff 铭刻/重铸 ──
  await ev("shards=100; playerWeapon=EQUIPMENT.weapons.beginner_brush; weaponBuffs={}; true");
  await ev("attemptPurchase({type:'consumable',key:'gamble',effect:'gamble',cost:50}); true");
  const b1 = await ev("weaponBuffs['beginner_brush']");
  ok(typeof b1 === 'string' && b1.length > 0, `意识共鸣铭刻 buff，实际 ${b1}`);
  ok(await ev("shards") === 50, `意识共鸣扣50碎片，实际 shards ${await ev('shards')}`);
  await ev("attemptPurchase({type:'consumable',key:'gamble',effect:'gamble',cost:50}); true");
  const b2 = await ev("weaponBuffs['beginner_brush']");
  ok(b2 !== b1, `意识共鸣重铸为不同 buff，实际 ${b1}→${b2}`);

  // ── F. 工坊 getInheritShopChance ──
  const ch = await ev("permanentUpgrades.inheritShop=3; getInheritShopChance()");
  ok(Math.abs(ch - 0.15) < 0.0001, `传承共鸣3级 → 商店概率15%（实际 ${ch}）`);
  await ev("permanentUpgrades.inheritShop=0; true");

  console.log(errors.length ? 'SKILL FAIL: ' + errors.length : 'SKILL PASS');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('SKILL CHECK FAIL:', e.message); process.exit(1); });
