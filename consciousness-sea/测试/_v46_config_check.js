/* ═══ v4.6 改动数据层检查：新技能 / 商店隔离 / 单多敌配置 ═══
 * 运行：node 测试/_v46_config_check.js
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'chapter-1', 'js');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
const get = (name) => vm.runInContext(name, ctx);
const EQUIPMENT = get('EQUIPMENT');
const SHOP_CATALOG = get('SHOP_CATALOG');
const POOL = get('ROGUELIKE_ROOM_POOL');

const errors = [];
const ok = (c, m) => { if (!c) errors.push(m); };

// 1. 新技能字段完整
const NEW = ['eight_gates', 'kamehameha', 'guangzhi', 'jinitaimei', 'railgun'];
NEW.forEach(id => {
  const s = EQUIPMENT.skills[id];
  ok(!!s, `技能 ${id} 缺失`);
  if (s) {
    ok(s.chars && s.chars.length >= 2, `${id} chars 缺失`);
    ok(s.type === 'sequence' || s.type === 'charge', `${id} type 非法: ${s.type}`);
    ok(!!s.effect, `${id} effect 缺失`);
    ok(!!s.desc, `${id} desc 缺失`);
  }
});
// 2. 新技能不进商店（只靠事件）
NEW.forEach(id => ok(!(SHOP_CATALOG.skills || {})[id], `新技能 ${id} 不应进商店目录`));
// 3. 技能池总数 8（卍解/扎瓦鲁多/ex咖喱棒 + 传承5）；背水/雷充已删
ok(Object.keys(EQUIPMENT.skills).length === 8, `技能总数 ${Object.keys(EQUIPMENT.skills).length} ≠ 8`);
ok(!EQUIPMENT.skills['last_resort'] && !EQUIPMENT.skills['thunder_charge'], '背水/雷充应已删除');
ok(EQUIPMENT.skills['concentration'].name === '卍解', `凝神应改名为卍解，实际: ${EQUIPMENT.skills['concentration'].name}`);
ok(EQUIPMENT.skills['time_freeze'].name === '扎瓦鲁多', `时间暂停应改名为扎瓦鲁多，实际: ${EQUIPMENT.skills['time_freeze'].name}`);
ok(!(SHOP_CATALOG.skills || {})['last_resort'] && !(SHOP_CATALOG.skills || {})['thunder_charge'], '商店不应再有背水/雷充价目');
ok(Object.keys(SHOP_CATALOG.skills || {}).length === 2, `商店技能应为 2（扎瓦鲁多+ex咖喱棒），实际 ${Object.keys(SHOP_CATALOG.skills || {}).length}`);
// 4. 单/多敌房 3:3，单敌波次多、多敌波次少
const single = POOL.combat.filter(r => r.count === 1);
const multi = POOL.combat.filter(r => !r.count);
ok(single.length === 3, `单敌房 ${single.length} ≠ 3`);
ok(multi.length === 3, `多敌房 ${multi.length} ≠ 3`);
single.forEach(r => ok(r.waves >= 4, `单敌房 ${r.id} waves ${r.waves} < 4`));
multi.forEach(r => ok(r.waves <= 3, `多敌房 ${r.id} waves ${r.waves} > 3`));
// 5. split 不应带 count（1→2→4 递增专用）
ok(POOL.combat.every(r => r.enemyType !== 'split' || !r.count), `split 房不应设 count`);
// 6. 技能字内部不重复
const skillChars = [];
Object.values(EQUIPMENT.skills).forEach(s => skillChars.push(...s.chars));
const dup = skillChars.filter((c, i) => skillChars.indexOf(c) !== i);
ok(dup.length === 0, `技能字内部重复: ${[...new Set(dup)].join(',')}`);
// 7. 新技能效果与 triggerSkill 分支对应（kamehameha 走 charge 释放，不需新 effect 分支）
ok(EQUIPMENT.skills.eight_gates.effect === 'eight_gates', `eight_gates effect 应独立`);
ok(EQUIPMENT.skills.guangzhi.effect === 'guangzhi', `guangzhi effect 应独立`);
ok(EQUIPMENT.skills.jinitaimei.effect === 'jinitaimei', `jinitaimei effect 应独立`);
ok(EQUIPMENT.skills.kamehameha.fieldCount === 4, `kamehameha fieldCount 应为4`);
ok(EQUIPMENT.skills.kamehameha.baseDmg === 25 && EQUIPMENT.skills.kamehameha.dmgPerCharge === 15, `kamehameha 蓄力数值缺失`);
ok(EQUIPMENT.skills.railgun.effect === 'railgun', `railgun effect 应独立`);
// 8. 商店消耗品：词元净化已删、意识共鸣保留
const SC = get('SHOP_CONSUMABLES');
ok(!SC.purify, '词元净化应已删除');
ok(SC.gamble && SC.gamble.effect === 'gamble', '意识共鸣应保留');
// 9. 工坊新增「传承共鸣」
const PU = get('PERMANENT_UPGRADES');
ok(!!PU.inheritShop, '工坊应新增「传承共鸣」升级项');
ok(PU.inheritShop.maxLevel === 5, `传承共鸣 maxLevel 应为5`);

console.log(errors.length ? 'FAIL:\n' + errors.join('\n') : 'ALL PASS');
process.exit(errors.length ? 1 : 0);
