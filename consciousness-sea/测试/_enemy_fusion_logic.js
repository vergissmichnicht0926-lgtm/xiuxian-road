/* ═══════════════ 多敌人编队 + 融合数值 逻辑回归 ═══════════════
 * 运行：node 测试/_enemy_fusion_logic.js
 * 覆盖：formationCount / formationPositions(6形状) / getEquipMult /
 *       spawnEnemyFormation(多敌生成+镜像同步) / 索敌最左 / 融合等级镜像
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'chapter-1', 'js');
// mock DOM（updateEnemyUI 等函数引用）
const fakeEl = () => ({
  style: {}, classList: { add(){}, remove(){}, contains(){return false} },
  textContent: '', getAttribute(){ return '' }, setAttribute(){},
  innerHTML: '', appendChild(){},
});
const ctx = vm.createContext({
  W: 1600, H: 900, difficulty: 1, mx: 800, my: 300,
  document: { getElementById(){ return fakeEl(); } },
  console,
  // main.js 声明的装备全局（battle.js 运行时读取，测试占位）
  playerWeapon: null, playerArmor: null, playerSkill: null, playerTalisman: null,
  skillState: { collected: [], chargeLevel: 0, ready: false },
  // particles.js 声明的粒子系统（battle.js 伤害函数引用）
  particles: [], HitParticle: function(){}, DamageText: function(){},
  shakeAmount: 0, playerHP: 100, playerMaxHP: 100, playerDefense: 0, hasShield: false, shieldHP: 0,
});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(dir, 'battle.js'), 'utf8'), ctx);
const run = expr => vm.runInContext(expr, ctx);

const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// ── 1. formationCount 随层深/难度递增 ──
ok(run('formationCount(1, 0, "bash")') === 2, `浅层基础应=2，实际 ${run('formationCount(1,0,"bash")')}`);
ok(run('formationCount(5, 1, "bash")') >= 3, `层5应≥3`);
ok(run('formationCount(9, 2, "volley")') >= 4, `深层+弹幕应≥4`);
ok(run('formationCount(1, 0, "bash")') <= 5, '数量不应超上限5');

// ── 2. 六种形状坐标 + 最小间距 ──
['line','rect','triangle','ring','arrow','random'].forEach(s => {
  const pts = run(`formationPositions("${s}", 4)`);
  ok(Array.isArray(pts) && pts.length === 4, `${s} 应生成4个坐标，实际 ${pts.length}`);
  pts.forEach(p => {
    ok(p.x > 0 && p.x < 1600 && p.y > 0 && p.y < 900, `${s} 坐标越界 (${p.x},${p.y})`);
    ok(p.y > 140 && p.y < 400, `${s} y应集中上中区 (${p.y})`);
  });
  // 相邻敌人最小间距 ≥ 85px（兜底 enforceMinSpacing=90，防贴一起）
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    ok(d >= 85, `${s} 敌人间距过近 (${d.toFixed(0)}px)`);
  }
});
// 5敌（深层常见）也要间距足够
['rect','ring','triangle','arrow','line'].forEach(s => {
  const pts = run(`formationPositions("${s}", 5)`);
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    ok(d >= 85, `${s}×5 敌人间距过近 (${d.toFixed(0)}px)`);
  }
});
// 环形应散布不重叠（间距>0）
const ring = run('formationPositions("ring", 4)');
const ringUnique = new Set(ring.map(p => `${p.x},${p.y}`)).size;
ok(ringUnique === 4, 'ring 不应有重叠坐标');

// ── 3. 多敌生成 + 镜像同步 ──
run('spawnEnemyFormation(false, "bash", { layer: 1, count: 3, hp: 40, interval: 5 })');
ok(run('enemyList.length') === 3, '应生成3个敌人');
ok(run('enemyHP') === 40 && run('enemyInterval') === 5, '镜像同步主敌人HP/interval');
ok(run('currentEnemyType') === 'bash', '镜像同步攻击类型');
// 默认索敌 = 最左敌人
const mainX = run('getMainEnemy().entity.x');
const leftX = run('Math.min(...enemyList.filter(e=>e.alive).map(e=>e.entity.x))');
ok(Math.abs(mainX - leftX) < 0.001, `默认索敌应锁最左 (main=${mainX}, left=${leftX})`);

// ── 4. 击杀 → 镜像重锁下一敌人 ──
run('dealDamageToEnemy(enemyList[0], 999, false, false)');
ok(run('enemyList[0].alive') === false, '目标应被击杀');
ok(run('enemyHP') > 0, '击杀后应重锁其他存活敌人，enemyHP>0');
ok(run('enemyList.filter(e=>e.alive).length') === 2, '存活数应=2');

// ── 5. 全灭 → sync 后镜像 enemyHP=0（房间check感知清波；游戏中由外层 dealDamage 调 sync）──
run('for (const e of enemyList) if (e.alive) dealDamageToEnemy(e, 999, false, false)');
run('syncEnemyCompat()');
ok(run('enemyHP') === 0 && run('enemyList.every(e=>!e.alive)'), '全灭后 sync 镜像 enemyHP=0');

// ── 6. 融合等级数值 ──
run('equipmentLevels = { star_shatter: 3 }');
ok(run('getEquipMult("star_shatter")') === 1.5, `lv3 系数应=1.5，实际 ${run('getEquipMult("star_shatter")')}`);
ok(run('getEquipMult("unknown")') === 1, '无等级系数应=1');
ok(run('getArmorDefense({ id:"mind_wall", defense:4 })') === 4, '防具无等级减伤=基础');
run('equipmentLevels.mind_wall = 3');
ok(run('getArmorDefense({ id:"mind_wall", defense:4 })') === 6, `防具lv3 减伤应=6 (4×1.5)`);

// ── 7. buff 读取（固有字段 + weaponBuffs）──
run('playerWeapon = { id:"pierce_lance", pierce:true }');
ok(run('hasWeaponBuff("pierce")') === true, '固有 pierce 应识别');
ok(run('hasWeaponBuff("chain")') === false, '无 chain 应 false');
run('weaponBuffs = { pierce_lance: "chain" }');
ok(run('hasWeaponBuff("chain")') === true, 'weaponBuffs 深层掉落应识别');
run('playerWeapon = null');

console.log(errors.length ? '❌ 发现 ' + errors.length + ' 个问题:\n' + errors.join('\n')
                          : '✅ 多敌人编队 + 融合数值 逻辑检查全部通过');
process.exit(errors.length ? 1 : 0);
