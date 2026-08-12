/* ═══════════════ v5.1 三系统扩展 — 数据层 + 接线检查 ═══════════════
 * 运行：node 测试/_v51_config_check.js
 * 检查：新装备4件(蚀骨/追风/曜甲/静渊) 字段 + poison/thorns 机制 /
 *       商店价目 / 4新永久升级 / elite房池+模板 / SHARD_REWARDS / RUN_REWARDS /
 *       battle.js 反伤+叠毒+威胁修复接线 / rooms.js buildCombatStats 写回 / main.js 结算增幅
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'chapter-1', 'js');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
const get = (name) => vm.runInContext(name, ctx);
const EQUIPMENT = get('EQUIPMENT'), SHOP_CATALOG = get('SHOP_CATALOG');
const PERMANENT_UPGRADES = get('PERMANENT_UPGRADES'), RUN_REWARDS = get('RUN_REWARDS');
const SHARD_REWARDS = get('SHARD_REWARDS');
const ROGUELIKE_ROOM_POOL = get('ROGUELIKE_ROOM_POOL'), ROGUELIKE_MAP_TEMPLATE = get('ROGUELIKE_MAP_TEMPLATE');
const NOISE_WORDS = get('NOISE_WORDS');
const NOISE_FAKE_ATTACK = get('NOISE_FAKE_ATTACK'), NOISE_FAKE_DEFENSE = get('NOISE_FAKE_DEFENSE'),
      NOISE_FAKE_TALISMAN = get('NOISE_FAKE_TALISMAN');

const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };
const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

// ── 1. 新装备4件存在 + 机制字段 ──
ok(EQUIPMENT.weapons.poison_fang, '新武器 蚀骨(poison_fang) 缺失');
ok(EQUIPMENT.weapons.wind_chase, '新武器 追风(wind_chase) 缺失');
ok(EQUIPMENT.armors.solar_mail, '新防具 曜甲(solar_mail) 缺失');
ok(EQUIPMENT.armors.still_depths, '新防具 静渊(still_depths) 缺失');

ok(EQUIPMENT.weapons.poison_fang.poison && EQUIPMENT.weapons.poison_fang.poison.thresh > 0,
  '蚀骨缺 poison 机制字段');
ok(EQUIPMENT.weapons.poison_fang.poison.burst > 0, '蚀骨缺 poison.burst');
ok(EQUIPMENT.armors.solar_mail.thorns > 0, '曜甲缺 thorns 反伤字段');
ok(EQUIPMENT.weapons.wind_chase.wordCount >= 8, '追风 wordCount 未达 8（攻速流）');
ok(EQUIPMENT.armors.still_depths.words.length === EQUIPMENT.armors.still_depths.wordCount,
  '静渊 words 长度 ≠ wordCount');

// 新装备词元不撞伪装池
const fakePool = [...NOISE_FAKE_ATTACK, ...NOISE_FAKE_DEFENSE, ...NOISE_FAKE_TALISMAN];
const newChars = [
  ...EQUIPMENT.weapons.poison_fang.words, ...EQUIPMENT.weapons.wind_chase.words,
  ...EQUIPMENT.armors.solar_mail.words, ...EQUIPMENT.armors.still_depths.words,
];
const fakeDup = fakePool.filter(c => newChars.includes(c));
ok(fakeDup.length === 0, fakeDup.length ? `新装备字撞伪装池: ${fakeDup.join(',')}` : '新装备字避让伪装池 OK');

// ── 2. 商店价目覆盖新装备 ──
ok(SHOP_CATALOG.weapons['poison_fang'] > 0, '商店缺蚀骨价目');
ok(SHOP_CATALOG.weapons['wind_chase'] > 0, '商店缺追风价目');
ok(SHOP_CATALOG.armors['solar_mail'] > 0, '商店缺曜甲价目');
ok(SHOP_CATALOG.armors['still_depths'] > 0, '商店缺静渊价目');

// ── 3. 4新永久升级 ──
['shieldStart', 'defenseUp', 'soulBoost', 'echoGift'].forEach(k => {
  ok(PERMANENT_UPGRADES[k] && PERMANENT_UPGRADES[k].maxLevel > 0, `永久升级 ${k} 缺失`);
});
ok(PERMANENT_UPGRADES.shieldStart.maxLevel === 3, 'shieldStart maxLevel 非3');
ok(PERMANENT_UPGRADES.echoGift.maxLevel === 1, 'echoGift 应为一次性(maxLevel 1)');

// ── 4. 精英房池 + 模板 ──
ok(ROGUELIKE_ROOM_POOL.elite && ROGUELIKE_ROOM_POOL.elite.length >= 2, 'ROGUELIKE_ROOM_POOL.elite 池缺失或过少');
ROGUELIKE_ROOM_POOL.elite.forEach(e => {
  ok(e.type === 'combat' && e.elite === true, `精英房 ${e.id} 未用 combat type + elite 标记`);
  ok(e.enemyHP >= 90, `精英房 ${e.id} enemyHP 未达精英强度(90+)`);
  ok(e.hardMode === true, `精英房 ${e.id} 未标 hardMode`);
});
ok(SHARD_REWARDS.ELITE_CLEAR >= 30, 'SHARD_REWARDS.ELITE_CLEAR 缺失或过低');
ROGUELIKE_MAP_TEMPLATE.segments.forEach(seg => {
  const hasEliteBranch = seg.rooms.some(r => r.type === 'branch' && r.branchTypes && r.branchTypes.includes('elite'));
  ok(hasEliteBranch, `段「${seg.name}」缺 elite 分支`);
});

// ── 5. 经济调整 ──
ok(RUN_REWARDS.DEATH_BASE >= 10, 'DEATH_BASE 未上调到 10+（死亡收益修复）');
ok(RUN_REWARDS.CLEAR_BASE >= 15, 'CLEAR_BASE 未上调到 15+');
ok(RUN_REWARDS.PER_BOSS_DEATH > 0, 'PER_BOSS_DEATH 缺失（死亡保留 Boss 部分收益）');

// ── 6. 源码接线断言 ──
const battle = src('battle.js');
ok(/playerWeapon\.poison/.test(battle), 'battle.js 缺叠毒(p poison)接线');
ok(/thorns/.test(battle), 'battle.js 缺反伤(thorns)接线');
ok(/getUpgradeLevel\('defenseUp'\)/.test(battle), 'battle.js 缺坚韧意识(defenseUp)减伤接线');
ok(/currentDiveRoom\.enemyDmg/.test(battle), 'battle.js 敌人攻击未读 currentDiveRoom.enemyDmg（威胁修复）');

const rooms = src('rooms.js');
ok(/room\.enemyDmg = modified\.enemyDmg/.test(rooms), 'rooms.js buildCombatStats 未写回修正伤害');
ok(/SHARD_REWARDS\.ELITE_CLEAR/.test(rooms), 'rooms.js 缺精英房 ELITE_CLEAR 奖励');

const perm = src('permanent-shop.js');
ok(/getUpgradeLevel\('shieldStart'\)/.test(perm), 'permanent-shop.js 缺 shieldStart 接线');
ok(/getUpgradeLevel\('echoGift'\)/.test(perm), 'permanent-shop.js 缺 echoGift 接线');

const main = src('main.js');
ok(/getUpgradeLevel\('soulBoost'\)/.test(main), 'main.js 缺 soulBoost 结算增幅接线');
ok(/PER_BOSS_DEATH/.test(main), 'main.js 缺死亡 Boss 收益(PER_BOSS_DEATH)');

const map = src('map.js');
ok(/t === 'elite'/.test(map), 'map.js 生成缺 elite 分支');
ok(/isEliteNode/.test(map), 'map.js 缺精英节点渲染');

console.log(errors.length ? '❌ 发现 ' + errors.length + ' 个问题:\n' + errors.join('\n')
                          : '✅ v5.1 三系统扩展 数据层+接线检查全部通过');
process.exit(errors.length ? 1 : 0);
