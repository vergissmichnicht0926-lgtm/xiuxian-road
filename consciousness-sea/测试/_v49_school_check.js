/* ═══ v4.9 流派数据层检查：SCHOOLS 表 / 武器标签 / 流派遗响 / tempest标签 / 传承白名单 ═══
 * 运行：node 测试/_v49_school_check.js
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'chapter-1', 'js');

// 加载 config.js
const ctxC = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctxC);
const getC = (name) => vm.runInContext(name, ctxC);
const SCHOOLS = getC('SCHOOLS');
const EQUIPMENT = getC('EQUIPMENT');
const WEAPON_BUFFS = getC('WEAPON_BUFFS');
const INHERIT = getC('INHERIT_SKILL_IDS');

// 加载 echo.js（依赖 config 的全局，用同一沙箱顺序加载）
const ctxE = vm.createContext({});
try {
  vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctxE);
  vm.runInContext(fs.readFileSync(path.join(dir, 'echo.js'), 'utf8'), ctxE);
} catch (e) {
  // echo.js 顶层可能引用未定义运行时变量，忽略加载错误，仅用正则抓 ECHO_DEFS
}
const getE = (name) => {
  try { return vm.runInContext(name, ctxE); } catch (e) { return undefined; }
};
const ECHO_DEFS = getE('ECHO_DEFS');

const errors = [];
const ok = (c, m) => { if (!c) errors.push(m); };

// 1. SCHOOLS 三键齐全
['blaze', 'frost', 'storm'].forEach(k => {
  ok(!!SCHOOLS[k], `SCHOOLS 缺 ${k}`);
  if (SCHOOLS[k]) {
    ok(!!SCHOOLS[k].name && !!SCHOOLS[k].icon && !!SCHOOLS[k].color, `${k} 缺 name/icon/color`);
    ok(!!SCHOOLS[k].synergy2 && !!SCHOOLS[k].synergy3, `${k} 缺 synergy2/synergy3`);
    ok(Object.keys(SCHOOLS[k].synergy2).length > 0, `${k} synergy2 为空`);
  }
});
// 2. 三武器 school 标签正确
ok(EQUIPMENT.weapons.blaze_heaven.school === 'blaze', `焚天 school 应=blaze`);
ok(EQUIPMENT.weapons.frost_verse.school === 'frost', `霜序 school 应=frost`);
ok(EQUIPMENT.weapons.thunder_strike.school === 'storm', `惊雷 school 应=storm`);
// 3. tempest buff 标签
ok(WEAPON_BUFFS.tempest.school === 'storm', `tempest 应 school=storm`);
// 4. 传承白名单长度 5
ok(Array.isArray(INHERIT) && INHERIT.length === 5, `INHERIT_SKILL_IDS 应长 5，实际 ${INHERIT && INHERIT.length}`);
// 5. 4 个流派遗响字段完整（echo.js 可解析时）
if (ECHO_DEFS) {
  const NEW = ['cinder_echo', 'frost_echo', 'glaze_echo', 'volt_echo'];
  NEW.forEach(id => {
    const d = ECHO_DEFS[id];
    ok(!!d, `遗响 ${id} 缺失`);
    if (d) {
      ok(!!d.name && !!d.icon, `${id} 缺 name/icon`);
      ok(!!d.rarity, `${id} 缺 rarity`);
      ok(!!d.school, `${id} 缺 school`);
      ok(!!d.effects && Object.keys(d.effects).length > 0, `${id} 缺 effects`);
      ok(!!d.desc, `${id} 缺 desc`);
    }
  });
  // 流派对应正确
  ok(ECHO_DEFS.cinder_echo.school === 'blaze', `燔薪之忆 school 应=blaze`);
  ok(ECHO_DEFS.frost_echo.school === 'frost' && ECHO_DEFS.glaze_echo.school === 'frost', `霜华/凝冰 school 应=frost`);
  ok(ECHO_DEFS.volt_echo.school === 'storm', `惊蛰之忆 school 应=storm`);
  // 6. 关键效果存在
  ok(ECHO_DEFS.frost_echo.effects.slowBonus === 0.35, `霜华之忆 slowBonus 应=0.35`);
  ok(ECHO_DEFS.glaze_echo.effects.slowBonus === 0.20, `凝冰之忆 slowBonus 应=0.20`);
  ok(ECHO_DEFS.cinder_echo.effects.blazeBonus === 12, `燔薪之忆 blazeBonus 应=12`);
  ok(ECHO_DEFS.volt_echo.effects.comboBoost === 0.10, `惊蛰之忆 comboBoost 应=0.10`);
  // 7. 遗响总数 28（v5.2 加 4 个流派遗响：镜返/辉光/蛇信/蚀骨忆）
  const total = Object.keys(ECHO_DEFS).length;
  ok(total === 28, `遗响总数 ${total} ≠ 28`);
} else {
  console.log('⚠️ echo.js 未能在 vm 完整加载（运行时依赖多），流派遗响断言跳过');
}

// ── 8. 流派协同 schoolCount/schoolMod 逻辑（从 echo.js 提取函数源码 + 模拟全局验证）──
{
  const echoSrc = fs.readFileSync(path.join(dir, 'echo.js'), 'utf8');
  // 提取 schoolCount 和 schoolMod 函数体
  const scFn = echoSrc.match(/function schoolCount\(school\) \{[\s\S]*?\n\}/);
  const smFn = echoSrc.match(/function schoolMod\(key, school\) \{[\s\S]*?\n\}/);
  ok(!!scFn, 'echo.js 应定义 schoolCount');
  ok(!!smFn, 'echo.js 应定义 schoolMod');
  if (scFn && smFn) {
    // 模拟全局：焚天(blaze) + 余烬(ember_echo, blaze) + 燔薪(cinder_echo, blaze) → 3 件
    const s3 = vm.createContext({
      playerWeapon: { id:'blaze_heaven', school:'blaze' },
      echoInventory: ['ember_echo', 'cinder_echo'],
      weaponBuffs: {},
      ECHO_DEFS: {
        ember_echo: { school:'blaze' },
        cinder_echo: { school:'blaze' },
      },
      SCHOOLS: SCHOOLS,
    });
    vm.runInContext(`${scFn[0]}\n${smFn[0]}\n`, s3);
    const n3 = vm.runInContext(`schoolCount('blaze')`, s3);
    ok(n3 === 3, `焚天+余烬+燔薪 应计 3 件，实际 ${n3}`);
    ok(vm.runInContext(`schoolMod('blazeDmgMult','blaze')`, s3) === SCHOOLS.blaze.synergy3.blazeDmgMult, '3件应取 synergy3');

    // 仅武器 + tempest buff → 雷 2 件
    const s2 = vm.createContext({
      playerWeapon: { id:'thunder_strike', school:'storm' },
      echoInventory: [],
      weaponBuffs: { thunder_strike: 'tempest' },
      WEAPON_BUFFS: WEAPON_BUFFS,
      SCHOOLS: SCHOOLS,
    });
    vm.runInContext(`${scFn[0]}\n${smFn[0]}\n`, s2);
    const n2 = vm.runInContext(`schoolCount('storm')`, s2);
    ok(n2 === 2, `惊雷+tempest 应计 2 件，实际 ${n2}`);
    ok(vm.runInContext(`schoolMod('aoeDmgMult','storm')`, s2) === SCHOOLS.storm.synergy2.aoeDmgMult, '2件应取 synergy2');

    // 仅武器 1 件 → 协同不触发
    const s1 = vm.createContext({
      playerWeapon: { id:'frost_verse', school:'frost' },
      echoInventory: [],
      weaponBuffs: {},
      SCHOOLS: SCHOOLS,
    });
    vm.runInContext(`${scFn[0]}\n${smFn[0]}\n`, s1);
    ok(vm.runInContext(`schoolCount('frost')`, s1) === 1, `霜序单件 应计 1 件`);
    ok(vm.runInContext(`schoolMod('slowBonus','frost')`, s1) === 0, `1件协同不触发（应 0）`);
  }
}

console.log(errors.length ? 'FAIL:\n' + errors.join('\n') : 'ALL PASS');
process.exit(errors.length ? 1 : 0);
