/* ═══════════════ v5.2 数据层检查：buff/派别/变异/觉醒/收藏 ═══════════════
 * 运行：node 测试/_v52_config_check.js
 * 检查：3新buff / SCHOOLS.light+poison / 曜刃 / 4新遗响 / VARIANT_DEFS /
 *       AWAKEN_THRESHOLD + 全武器防具awaken覆盖 / 源码接线（variantMod/isAwakened/totalClears/成就）
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'chapter-1', 'js');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
const get = (name) => vm.runInContext(name, ctx);
const EQUIPMENT = get('EQUIPMENT'), SHOP_CATALOG = get('SHOP_CATALOG');
const SCHOOLS = get('SCHOOLS'), WEAPON_BUFFS = get('WEAPON_BUFFS');
const VARIANT_DEFS = get('VARIANT_DEFS'), EQUIP_UNLOCK = get('EQUIP_UNLOCK');
const NOISE_FAKE_ATTACK = get('NOISE_FAKE_ATTACK'), NOISE_FAKE_DEFENSE = get('NOISE_FAKE_DEFENSE'),
      NOISE_FAKE_TALISMAN = get('NOISE_FAKE_TALISMAN');

const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };
const src = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

// ── 1. 3 新武器 buff ──
['sunder', 'freeze', 'rage'].forEach(b => {
  ok(WEAPON_BUFFS[b] && WEAPON_BUFFS[b].name && WEAPON_BUFFS[b].desc, `WEAPON_BUFFS 缺 ${b}`);
});
ok(Object.keys(WEAPON_BUFFS).length >= 9, `WEAPON_BUFFS 总数 ${Object.keys(WEAPON_BUFFS).length} ≠ 9+`);

// ── 2. 新派别 SCHOOLS.light / poison ──
['light', 'poison'].forEach(s => {
  ok(SCHOOLS[s] && SCHOOLS[s].name && SCHOOLS[s].icon, `SCHOOLS 缺 ${s}`);
  ok(SCHOOLS[s].synergy2 && SCHOOLS[s].synergy3, `${s} 缺 synergy`);
  ok(Object.keys(SCHOOLS[s].synergy2).length > 0 && Object.keys(SCHOOLS[s].synergy3).length > 0, `${s} 协同为空`);
});

// ── 3. 曜刃 + 蚀骨标签 ──
ok(EQUIPMENT.weapons.solar_blade && EQUIPMENT.weapons.solar_blade.school === 'light', '曜刃 solar_blade 缺或 school≠light');
ok(EQUIPMENT.weapons.solar_blade.radiance, '曜刃缺 radiance 字段');
ok(EQUIPMENT.weapons.poison_fang.school === 'poison', '蚀骨 school 应=poison');
ok(SHOP_CATALOG.weapons['solar_blade'] > 0, '商店缺曜刃价目');
ok(EQUIPMENT.weapons.solar_blade.words.length === EQUIPMENT.weapons.solar_blade.wordCount, '曜刃 words≠wordCount');

// ── 4. 4 新遗响（ECHO_DEFS 在 echo.js，vm 运行时依赖多，用源码正则断言）──
const echoSrc = src('echo.js');
const relicChecks = {
  mirror_veil: /mirror_veil:\s*\{[^}]*school:'light'[^}]*thornsUp:0\.3/,
  glare_echo:  /glare_echo:\s*\{[^}]*school:'light'[^}]*shieldPerWord:2/,
  venom_echo:  /venom_echo:\s*\{[^}]*school:'poison'[^}]*poisonSpeedUp:1/,
  rot_echo:    /rot_echo:\s*\{[^}]*school:'poison'[^}]*poisonBurstUp:10/,
};
Object.entries(relicChecks).forEach(([id, re]) => {
  ok(re.test(echoSrc), `遗响 ${id} 缺失或 school/effects 不符`);
});

// ── 5. VARIANT_DEFS 6 个 ──
ok(VARIANT_DEFS && Object.keys(VARIANT_DEFS).length >= 6, `VARIANT_DEFS 应≥6，实际 ${VARIANT_DEFS ? Object.keys(VARIANT_DEFS).length : 0}`);
Object.values(VARIANT_DEFS).forEach(v => {
  ok(v.name && v.icon && v.desc, `变异 ${v.id} 缺 name/icon/desc`);
  ok(v.effects && Object.keys(v.effects).length >= 2, `变异 ${v.id} 应至少2个效果（正+负）`);
});

// ── 6. 觉醒阈值 + 全武器防具 awaken 覆盖 ──
ok(EQUIP_UNLOCK.AWAKEN_THRESHOLD === 10, 'AWAKEN_THRESHOLD 应=10');
const awkAll = Object.values(EQUIPMENT.weapons).every(w => w.awaken && w.awaken.desc)
  && Object.values(EQUIPMENT.armors).every(a => a.awaken && a.awaken.desc);
ok(awkAll, '全部武器/防具应有 awaken 词缀');
Object.values(EQUIPMENT.weapons).forEach(w => {
  ok(w.awaken && w.awaken.desc, `武器 ${w.id} 缺 awaken`);
  ok(!w.words.some(c => c === '✦'), `武器 ${w.id} 词元误用 ✦`);
});
Object.values(EQUIPMENT.armors).forEach(a => {
  ok(a.awaken && a.awaken.desc, `防具 ${a.id} 缺 awaken`);
});

// 新装备字避让伪装池
const fakePool = [...NOISE_FAKE_ATTACK, ...NOISE_FAKE_DEFENSE, ...NOISE_FAKE_TALISMAN];
const solarChars = EQUIPMENT.weapons.solar_blade.words;
const fakeDup = solarChars.filter(c => fakePool.includes(c));
ok(fakeDup.length === 0, fakeDup.length ? `曜刃字撞伪装池: ${fakeDup}` : '曜刃字避让 OK');

// ── 7. 源码接线断言 ──
const battle = src('battle.js');
ok(/function isAwakened/.test(battle), 'battle.js 缺 isAwakened');
ok(/variantMod\('enemyDmgUp'\)/.test(battle), 'battle.js 缺变异 enemyDmgUp 接线');
ok(/variantMod\('shieldDown'\)/.test(battle), 'battle.js 缺变异 shieldDown 接线');
ok(/variantMod\('noiseUp'\)/.test(battle), 'battle.js 缺变异 noiseUp 接线');
ok(/variantMod\('atkDmgUp'\)/.test(battle), 'battle.js 缺变异 atkDmgUp 接线');
ok(/variantMod\('healDown'\)/.test(battle), 'battle.js 缺变异 healDown 接线');
ok(/hasWeaponBuff\('sunder'\)/.test(battle), 'battle.js 缺 sunder buff 接线');
ok(/hasWeaponBuff\('freeze'\)/.test(battle), 'battle.js 缺 freeze buff 接线');
ok(/hasWeaponBuff\('rage'\)/.test(battle), 'battle.js 缺 rage buff 接线');
ok(/schoolMod\('thornsUp', 'light'\)/.test(battle), 'battle.js 缺 light 协同 thornsUp');
ok(/schoolMod\('poisonSpeedUp', 'poison'\)/.test(battle), 'battle.js 缺 poison 协同 poisonSpeedUp');

const echo = src('echo.js');
ok(/function variantMod/.test(echo), 'echo.js 缺 variantMod');
ok(/variantMod\('echoCardsDown'\)/.test(echo), 'echo.js 缺变异 echoCardsDown 接线');

const shop = src('shop.js');
ok(/variantMod\('shardMult'\)/.test(shop), 'shop.js 缺变异 shardMult 接线');
ok(/variantMod\('shopDiscount'\)/.test(shop), 'shop.js 缺变异 shopDiscount 接线');

const rooms = src('rooms.js');
ok(/variantMod\('eliteRewardMult'\)/.test(rooms), 'rooms.js 缺变异 eliteRewardMult 接线');

const map = src('map.js');
ok(/variantMod\('eliteForce'\)/.test(map), 'map.js 缺变异 eliteForce 接线');

const main = src('main.js');
ok(/totalClears/.test(main), 'main.js 缺 totalClears');
ok(/checkCollectionAchievements/.test(main), 'main.js 缺收集成就检查');
ok(/checkRelicAllReward/.test(main), 'main.js 缺遗响集齐奖励');
ok(/openVariantChoice/.test(main), 'main.js 缺变异三选一 openVariantChoice');
ok(/openSettings/.test(main), 'main.js 缺设置面板 openSettings');
ok(/function loadSettings/.test(main), 'main.js 缺设置持久化 loadSettings');

const ach = src('achievements.js');
['ach_clear_1', 'ach_clear_10', 'ach_equip_all', 'ach_relic_all', 'ach_awaken_1'].forEach(id => {
  ok(new RegExp(id).test(ach), `achievements.js 缺成就 ${id}`);
});
ok(/function checkCollectionAchievements/.test(ach), 'achievements.js 缺 checkCollectionAchievements');
ok(/function checkRelicAllReward/.test(ach), 'achievements.js 缺 checkRelicAllReward');

const hub = src('hub.js');
ok(/openVariantChoice/.test(hub), 'hub.js 缺变异选择触发');
ok(/clearRunVariant/.test(hub), 'hub.js 缺变异重置');

const sound = src('sound.js');
ok(/setSfxVolume/.test(sound), 'sound.js 缺 setSfxVolume');
ok(/setMuted/.test(sound), 'sound.js 缺 setMuted');

console.log(errors.length ? '❌ 发现 ' + errors.length + ' 个问题:\n' + errors.join('\n')
                          : '✅ v5.2 数据层+接线检查全部通过');
process.exit(errors.length ? 1 : 0);
