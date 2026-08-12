// ═══════════════════ v5.2 CDP 功能验证 ═══════════════════
// 用法：node 测试/_server.js & + Edge(9222 带 --disable-backgrounding-occluded-windows) & → node 测试/_v52_feature_check.js
// 覆盖：毒系协同叠层 / sunder破甲 / freeze减速 / rage增伤 / 光系反伤协同 /
//       曜刃回盾 / 变异variantMod+chooseVariant / 觉醒isAwakened / 设置音量静音 / 收藏成就
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

const TESTS = `(() => {
  const out = [];
  const A = (name, cond, extra) => out.push((cond ? 'PASS' : 'FAIL') + ' ' + name + (extra !== undefined ? ' :: ' + extra : ''));
  const need = (fn) => { if (typeof fn !== 'function') throw new Error(fn + ' 未定义'); };

  // ── 1. 蚀毒协同：蚀骨 + 蛇信遗响 → 每击叠2层 ──
  try {
    need(buildEnemyObj); need(dealDamageToEnemy);
    playerWeapon = EQUIPMENT.weapons.poison_fang;
    echoInventory = ['venom_echo'];
    const e = buildEnemyObj(false, 'bash', 100, 100, 200, 5);
    enemyList = [e]; e.poison = 0;
    dealDamageToEnemy(e, 5, false, false);
    A('毒系协同每击叠3层', e.poison === 3, 'poison=' + e.poison); // 1 + 遗响蛇信(1) + 协同(1)
    // 第2击 3+3=6≥5 → 爆发清零
    dealDamageToEnemy(e, 5, false, false);
    A('毒系协同爆发清零', e.poison === 0, 'poison=' + e.poison);
    echoInventory = [];
  } catch (err) { out.push('ERR 毒系协同 ' + err.message); }

  // ── 2. sunder 破甲：叠层 + 增伤 ──
  try {
    playerWeapon = { id:'w1', name:'破甲测试', damage:5, wordCount:5, targetMode:'single' };
    weaponBuffs = { w1: 'sunder' };
    const e = buildEnemyObj(false, 'bash', 150, 100, 200, 5);
    enemyList = [e]; e.sunder = 0;
    dealDamageToEnemy(e, 10, false, false); // 命中1，sunder=1
    A('破甲叠层', e.sunder === 1, 'sunder=' + e.sunder);
    const hp1 = e.hp;
    dealDamageToEnemy(e, 10, false, false); // sunder=1 → +8%
    dealDamageToEnemy(e, 10, false, false); // sunder=2 → +16%
    const dmg = hp1 - e.hp;
    A('破甲增伤', dmg >= 20 && dmg <= 25, '三击总损=' + dmg + '(期望20~24: 10×1.08+10×1.16)');
    weaponBuffs = {};
  } catch (err) { out.push('ERR 破甲 ' + err.message); }

  // ── 3. freeze 霜封：命中减速 ──
  try {
    playerWeapon = { id:'w2', name:'霜封测试', damage:5, wordCount:5, targetMode:'single' };
    weaponBuffs = { w2: 'freeze' };
    const e = buildEnemyObj(false, 'bash', 200, 100, 100, 5);
    e.timer = 1.0; enemyList = [e];
    dealDamageToEnemy(e, 5, false, false);
    A('霜封减速', e.timer >= 1.3, 'timer=' + e.timer + '(期望≥1.3)');
    weaponBuffs = {};
  } catch (err) { out.push('ERR 霜封 ' + err.message); }

  // ── 4. rage 狂暴：连击增伤10% ──
  try {
    playerWeapon = { id:'w3', name:'狂暴测试', damage:5, wordCount:5, targetMode:'single' };
    weaponBuffs = { w3: 'rage' };
    const e = buildEnemyObj(false, 'bash', 250, 100, 500, 5);
    enemyList = [e];
    const hp0 = e.hp;
    dealDamageToEnemy(e, 10, true, false); // isCombo=true → ×1.1 → 11
    A('狂暴连击增伤', hp0 - e.hp === 11, '损=' + (hp0 - e.hp) + '(期望11)');
    weaponBuffs = {};
  } catch (err) { out.push('ERR 狂暴 ' + err.message); }

  // ── 5. 曜光协同：曜刃+镜返 → 曜甲反伤率 +0.2 ──
  try {
    need(applyDamageToPlayer); need(getArmorDefense); need(schoolMod);
    playerWeapon = EQUIPMENT.weapons.solar_blade;
    playerArmor = EQUIPMENT.armors.solar_mail;
    playerDefense = getArmorDefense(playerArmor);
    echoInventory = ['mirror_veil']; // light 计2件（曜刃+镜返）→ synergy2 thornsUp 0.2
    permanentUpgrades.defenseUp = 0;
    hasShield = true; shieldHP = 10;
    const e = buildEnemyObj(false, 'bash', 300, 100, 100, 5);
    enemyList = [e];
    const before = e.hp;
    applyDamageToPlayer(10); // 减伤2 → 8 → 盾吸8 → 反伤 8×(0.5曜甲+0.3镜返遗响+0.2协同)=8
    A('曜光协同反伤', e.hp === before - 8, '敌血损=' + (before - e.hp) + '(期望8)');
    echoInventory = []; hasShield = false; shieldHP = 0;
  } catch (err) { out.push('ERR 曜光协同 ' + err.message); }

  // ── 6. 曜刃 radiance：命中回盾 ──
  try {
    playerWeapon = EQUIPMENT.weapons.solar_blade;
    playerArmor = EQUIPMENT.armors.thin_silk;
    hasShield = false; shieldHP = 0;
    const e = buildEnemyObj(false, 'bash', 350, 100, 100, 5);
    enemyList = [e];
    dealDamageToEnemy(e, 5, false, false);
    A('曜刃回盾', hasShield && shieldHP >= 1, '盾=' + shieldHP);
  } catch (err) { out.push('ERR 曜刃回盾 ' + err.message); }

  // ── 7. 变异：variantMod 读取 + chooseVariant ──
  try {
    need(variantMod); need(chooseVariant);
    runVariant = 'fissure';
    A('变异shardMult', variantMod('shardMult') === 0.30, '=' + variantMod('shardMult'));
    A('变异enemyDmgUp', variantMod('enemyDmgUp') === 0.15, '=' + variantMod('enemyDmgUp'));
    A('无变异key返回0', variantMod('noSuchKey') === 0, '=' + variantMod('noSuchKey'));
    // 选择 UI
    if (typeof openVariantChoice === 'function') {
      openVariantChoice();
      const shown = !document.getElementById('variant-screen').classList.contains('hidden');
      const cards = document.querySelectorAll('#variant-cards .variant-card').length;
      A('变异三选一UI', shown && cards === 3, 'cards=' + cards);
      chooseVariant('stilldeep');
      A('chooseVariant生效', runVariant === 'stilldeep', 'runVariant=' + runVariant);
      A('UI关闭', document.getElementById('variant-screen').classList.contains('hidden'));
    } else { out.push('ERR 变异UI openVariantChoice 未定义'); }
    runVariant = null;
  } catch (err) { out.push('ERR 变异 ' + err.message); }

  // ── 8. 觉醒：isAwakened + 词缀生效 ──
  try {
    need(isAwakened);
    equipProficiency = { solar_mail: 10, thin_silk: 3 };
    A('觉醒判定', isAwakened('solar_mail') === true && isAwakened('thin_silk') === false, 'proficiency=' + JSON.stringify(equipProficiency));
    playerArmor = EQUIPMENT.armors.solar_mail;
    const defBase = getArmorDefense(playerArmor); // 2 + 觉醒defenseUp? solar_mail 无 defenseUp，有 thornsUp
    A('曜甲觉醒存在', playerArmor.awaken.thornsUp === 0.3, 'thornsUp=' + playerArmor.awaken.thornsUp);
    playerArmor = EQUIPMENT.armors.thin_silk; // defenseUp 1
    const defAwk = getArmorDefense(playerArmor);
    equipProficiency.thin_silk = 10;
    const defAwk2 = getArmorDefense(playerArmor);
    A('薄绢觉醒减伤', defAwk2 === defAwk + 1, 'def=' + defAwk + '→' + defAwk2);
    equipProficiency = {};
  } catch (err) { out.push('ERR 觉醒 ' + err.message); }

  // ── 9. 设置：音量/静音 ──
  try {
    need(Sound.setSfxVolume); need(Sound.setMuted);
    Sound.setSfxVolume(0.5);
    A('音效音量', Math.abs(Sound.getSfxVolume() - 0.5) < 0.001, '=' + Sound.getSfxVolume());
    Sound.setMuted(true);
    A('静音状态', Sound.getMuted() === true, 'muted=' + Sound.getMuted());
    Sound.setMuted(false);
    A('取消静音', Sound.getMuted() === false, 'muted=' + Sound.getMuted());
  } catch (err) { out.push('ERR 设置 ' + err.message); }

  // ── 10. 收藏成就：装备全收集 → ach_equip_all ──
  try {
    need(checkCollectionAchievements); need(unlockAchievement);
    achievements = {};
    if (typeof bestiaryData !== 'undefined' && typeof BESTIARY_EQUIP_DEFS !== 'undefined') {
      Object.keys(BESTIARY_EQUIP_DEFS).forEach(k => { bestiaryData.equipment[k] = { discovered: true }; });
      checkCollectionAchievements();
      A('装备全收集成就', !!(achievements['ach_equip_all'] && achievements['ach_equip_all'].unlocked));
      achievements = {};
    } else { out.push('WARN bestiary 未加载，跳过收集成就测试'); }
  } catch (err) { out.push('ERR 收藏成就 ' + err.message); }

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
  log(fails.length ? '❌ ' + fails.length + ' 项失败' : '✅ v5.2 功能验证全部通过');
  ws.close(); process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
