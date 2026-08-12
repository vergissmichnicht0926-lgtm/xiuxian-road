// ═══════════════════ v5.1 三系统扩展 · CDP 功能验证 ═══════════════════
// 用法：node 测试/_server.js & + Edge(9222) & → node 测试/_v51_feature_check.js
// 覆盖：蚀骨叠毒 / 曜甲反伤(普通敌+Boss) / 追风静渊 / defenseUp减伤 /
//       shieldStart初始盾 / echoGift初始遗响 / soulBoost结算 / 威胁修复(enemyDmg) / 精英房生成
const fs = require('fs');
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  try { fs.appendFileSync('C:/Users/V_ER_G~1/AppData/Local/Temp/_test.log', line + '\n'); } catch(e) {}
}
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

const SAVE_HUB_FIRST = JSON.stringify({
  difficulty: 1, timestamp: Date.now(), unlockedWeapons: [], soulCrystals: 0, permanentUpgrades: {}, affection: 0,
  prologuePhase: 4, tutorialPhase: 'end', prologueHanDefeated: true,
  inHub: true, hubRunNumber: 0, hubZeroTalkIndex: 0,
  weaponId: 'beginner_brush', armorId: 'thin_silk', skillId: 'concentration', talismanId: 'vitality_charm',
  playerHP: 100, playerMaxHP: 100, hasShield: false, shieldHP: 0, threatLevel: 0, nextAttackBoost: false,
  skillState: { collected: [], chargeLevel: 0, ready: false },
  mapRooms: null, mapConnections: null, isRoguelikeMap: false
});

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

// ── 页面内测试套件（IIFE，返回 PASS/FAIL/ERR 行）──
const TESTS = `(() => {
  const out = [];
  const A = (name, cond, extra) => out.push((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra !== undefined ? ' :: ' + extra : ''));
  const need = (fn) => { if (typeof fn !== 'function') throw new Error(fn + ' 未定义'); };

  // ── 1. 蚀骨叠毒（命中叠层，叠满5爆18清零）──
  try {
    need(buildEnemyObj); need(dealDamageToEnemy);
    playerWeapon = EQUIPMENT.weapons.poison_fang;
    const e = buildEnemyObj(false, 'bash', 100, 100, 200, 5);
    enemyList = [e]; e.poison = 0;
    const hpBefore = e.hp;
    dealDamageToEnemy(e, 5, false, false); dealDamageToEnemy(e, 5, false, false);
    dealDamageToEnemy(e, 5, false, false); dealDamageToEnemy(e, 5, false, false);
    A('毒叠层递增', e.poison === 4, 'poison=' + e.poison);
    dealDamageToEnemy(e, 5, false, false); // 第5次 → 爆发
    A('毒叠满清零', e.poison === 0, 'poison=' + e.poison);
    const dmgTotal = hpBefore - e.hp;
    A('毒爆追加伤害', dmgTotal >= 25 + 18, '总损=' + dmgTotal + '(期望≥43)');
  } catch (err) { out.push('ERR 蚀骨叠毒 ' + err.message); }

  // ── 2. 曜甲反伤（护盾吸收 → 反弹给普通敌人）──
  try {
    need(applyDamageToPlayer); need(getArmorDefense);
    playerArmor = EQUIPMENT.armors.solar_mail;
    playerDefense = getArmorDefense(playerArmor);
    permanentUpgrades.defenseUp = 0; // 排除干扰
    hasShield = true; shieldHP = 10;
    const e = buildEnemyObj(false, 'bash', 200, 100, 100, 5);
    enemyList = [e];
    const before = e.hp;
    applyDamageToPlayer(10); // 10-减伤2=8 → 盾吸8 → 反伤 8*0.5=4
    A('护盾被吸减', shieldHP === 2, '盾=' + shieldHP);
    A('反伤命中普通敌', e.hp === before - 4, '敌血=' + e.hp + '(期望' + (before-4) + ')');
    hasShield = false; shieldHP = 0;
  } catch (err) { out.push('ERR 曜甲反伤 ' + err.message); }

  // ── 3. 曜甲反伤（Boss 战）──
  try {
    need(damageBoss);
    hasShield = true; shieldHP = 8;
    const fakeBoss = { hp: 500, phase: 'attack' };
    bossActive = true; bossState = fakeBoss;
    applyDamageToPlayer(10); // 减伤2 → 8 → 盾吸8 → 反伤4 → damageBoss(4)
    A('Boss战反伤', bossState.hp === 496, 'Boss血=' + bossState.hp + '(期望496)');
    bossActive = false; bossState = null; hasShield = false; shieldHP = 0;
  } catch (err) { out.push('ERR 曜甲Boss反伤 ' + err.message); }

  // ── 4. 追风 / 静渊 装备生效 ──
  try {
    playerWeapon = EQUIPMENT.weapons.wind_chase;
    playerArmor = EQUIPMENT.armors.still_depths;
    playerDefense = getArmorDefense(playerArmor);
    A('追风高wordCount', playerWeapon.words.length === 8 && playerWeapon.wordCount === 8, 'wc=' + playerWeapon.wordCount);
    A('静渊高防御', playerDefense === 4, 'def=' + playerDefense);
  } catch (err) { out.push('ERR 追风静渊 ' + err.message); }

  // ── 5. 威胁修复：enemyAttackMelee 读 currentDiveRoom.enemyDmg（固定10 → 近战×0.7=7）──
  try {
    need(enemyAttackMelee);
    playerHP = playerMaxHP = 100;
    playerArmor = null; playerDefense = 0; permanentUpgrades.defenseUp = 0;
    hasShield = false; shieldHP = 0;
    currentDiveRoom = { type: 'combat', enemyDmg: [10, 10] };
    const e = buildEnemyObj(false, 'bash', 100, 100, 100, 5);
    enemyList = [e];
    enemyAttackMelee(e);
    A('威胁修复近战伤害', playerHP === 93, 'HP=' + playerHP + '(期望93: 10×0.7)');
    currentDiveRoom = null;
  } catch (err) { out.push('ERR 威胁修复 ' + err.message); }

  // ── 6. 坚韧意识 defenseUp 减伤 ──
  try {
    playerHP = playerMaxHP = 100; playerArmor = null; playerDefense = 0;
    hasShield = false; shieldHP = 0;
    permanentUpgrades.defenseUp = 2;
    applyDamageToPlayer(10); // 10 - 0 - 0 - 2 = 8
    A('defenseUp减伤', playerHP === 92, 'HP=' + playerHP + '(期望92: 10-2)');
    permanentUpgrades.defenseUp = 0;
  } catch (err) { out.push('ERR defenseUp ' + err.message); }

  // ── 7. shieldStart 初始盾 + echoGift 初始遗响 ──
  try {
    permanentUpgrades.shieldStart = 2; permanentUpgrades.echoGift = 1;
    hasShield = false; shieldHP = 0; echoInventory = [];
    applyPermanentUpgrades();
    A('shieldStart初始盾', hasShield && shieldHP >= 10, '盾=' + shieldHP + '(期望10)');
    A('echoGift初始遗响', echoInventory.length === 1 && ECHO_DEFS[echoInventory[0]].rarity === 'common',
      '遗响=' + JSON.stringify(echoInventory));
    permanentUpgrades.shieldStart = 0; permanentUpgrades.echoGift = 0;
    hasShield = false; shieldHP = 0;
  } catch (err) { out.push('ERR shieldStart/echoGift ' + err.message); }

  // ── 8. 精英房生成（反复生成地图直到出现 elite 分支房）──
  try {
    need(generateRoguelikeMap);
    let found = false, info = '';
    for (let i = 0; i < 12 && !found; i++) {
      generateRoguelikeMap();
      const elites = (dynamicRoomData || []).filter(r => r.elite);
      if (elites.length) { found = true; info = '段位layers=' + elites.map(e => e.layer).join(',') + ' label=' + elites.map(e => e.label).join(','); }
    }
    A('精英房生成', found, info);
  } catch (err) { out.push('ERR 精英房生成 ' + err.message); }

  return out.join('\\n');
})()`;

async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 0, mobile: false });

  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(2500);
  await enterHubFromSave(SAVE_HUB_FIRST);
  log('进Hub:', await ev('typeof hubActive!=="undefined"?hubActive:"x"'));

  const res = await ev(TESTS);
  if (res && res.__err) { log('测试执行错误:', res.__err); ws.close(); process.exit(1); }
  log(res);

  const lines = String(res).split('\n');
  const fails = lines.filter(l => l.startsWith('FAIL') || l.startsWith('ERR'));
  log(fails.length ? '❌ ' + fails.length + ' 项失败' : '✅ v5.1 功能验证全部通过');
  ws.close(); process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
