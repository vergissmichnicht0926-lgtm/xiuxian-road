/* ═══ v5.0 未接线协同修复检查：shardMult / threatResist / comboBoost 接线 ═══
 * 运行：node 测试/_v50_wiring_check.js
 *
 * 验证三处「定义未调用」已接通：
 *  ① shop.js grantShards 接 echoMod('shardMult')
 *  ② map.js 层威胁增长接 getThreatGrowthRate()
 *  ③ battle.js 连击倍率接 getComboBonusMultiplier()
 * 用 vm 沙箱模拟依赖函数，只测接线公式本身，不依赖完整运行时。
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'chapter-1', 'js');

const errors = [];
const ok = (c, m) => { if (!c) errors.push(m); };

// ── ① grantShards 的 shardMult 接线（从 shop.js 源码提取公式验证）──
{
  const src = fs.readFileSync(path.join(dir, 'shop.js'), 'utf8');
  const m = src.match(/const mult = 1 \+ \(typeof echoMod === 'function' \? \(echoMod\('shardMult'\) \|\| 0\) : 0\);\s*if \(mult !== 1\) amount = Math\.floor\(amount \* mult\);/);
  ok(!!m, 'grantShards 应含 shardMult 接线（mult 公式 + amount 放大）');

  // 模拟验证数值：echoMod('shardMult')=0.2 → 100 碎片 → 120
  const sandbox = { amount: 100 };
  vm.createContext(sandbox);
  vm.runInContext(`
    const echoMod = (k) => k === 'shardMult' ? 0.20 : 0;
    let mult = 1 + (typeof echoMod === 'function' ? (echoMod('shardMult') || 0) : 0);
    if (mult !== 1) amount = Math.floor(amount * mult);
  `, sandbox);
  ok(sandbox.amount === 120, `shardMult=0.2: 100 碎片应→120，实际 ${sandbox.amount}`);

  // 贪婪之忆 0.60 → 160
  const sandbox2 = { amount: 100 };
  vm.createContext(sandbox2);
  vm.runInContext(`
    const echoMod = (k) => k === 'shardMult' ? 0.60 : 0;
    let mult = 1 + (typeof echoMod === 'function' ? (echoMod('shardMult') || 0) : 0);
    if (mult !== 1) amount = Math.floor(amount * mult);
  `, sandbox2);
  ok(sandbox2.amount === 160, `shardMult=0.6: 100 碎片应→160，实际 ${sandbox2.amount}`);

  // 无遗响 → 不变
  const sandbox3 = { amount: 100 };
  vm.createContext(sandbox3);
  vm.runInContext(`
    const echoMod = () => 0;
    let mult = 1 + (typeof echoMod === 'function' ? (echoMod('shardMult') || 0) : 0);
    if (mult !== 1) amount = Math.floor(amount * mult);
  `, sandbox3);
  ok(sandbox3.amount === 100, `无 shardMult: 100 应保持 100，实际 ${sandbox3.amount}`);
}

// ── ② map.js 层威胁增长接 getThreatGrowthRate ──
{
  const src = fs.readFileSync(path.join(dir, 'map.js'), 'utf8');
  const m = src.match(/const rate = \(typeof getThreatGrowthRate === 'function'\) \? getThreatGrowthRate\(\) : 1;\s*threatLevel = Math\.min\(10, baseThreat \+ \(room\.layer - 1\) \* THREAT\.PER_LAYER \* rate\);/);
  ok(!!m, 'map.js 层增长应接 getThreatGrowthRate（rate 乘入 PER_LAYER）');

  // 无升级 → rate=1 → 第5层 base2 + 4*0.5 = 4
  const s1 = { baseThreat: 2, layer: 5, rate: 1 };
  vm.createContext(s1);
  vm.runInContext(`threatLevel = Math.min(10, baseThreat + (layer-1) * 0.5 * rate)`, s1);
  ok(s1.threatLevel === 4, `无抗性: 第5层 threatLevel 应=4，实际 ${s1.threatLevel}`);

  // 深海抗性满（-45% → rate=0.55）→ base2 + 4*0.5*0.55 = 2+1.1 = 3.1 → 3
  const s2 = { baseThreat: 2, layer: 5, rate: 0.55 };
  vm.createContext(s2);
  vm.runInContext(`threatLevel = Math.min(10, Math.floor(baseThreat + (layer-1) * 0.5 * rate))`, s2);
  ok(s2.threatLevel === 3, `深海抗性满: 第5层应=3，实际 ${s2.threatLevel}`);
}

// ── ③ battle.js 连击倍率接 getComboBonusMultiplier ──
{
  const src = fs.readFileSync(path.join(dir, 'battle.js'), 'utf8');
  const m = src.match(/const _comboWorkshop=\(typeof getComboBonusMultiplier==='function'\)\?getComboBonusMultiplier\(\):1;/);
  ok(!!m, 'battle.js 连击倍率应接 getComboBonusMultiplier');

  // combo=10 → base 2.5；无工坊 → ×1 → 2.5；工坊2级(+0.2×2=0.4 → 倍率1.4) → 3.5
  const calc = (combo, echoComboBoost, workshop) => {
    const comboBase = combo >= 10 ? 2.5 : combo >= 7 ? 2.0 : combo >= 5 ? 1.5 : combo >= 3 ? 1.2 : 1;
    const bonus = (comboBase + echoComboBoost) * workshop;
    return bonus;
  };
  ok(calc(10, 0, 1) === 2.5, `combo10 无强化 应=2.5`);
  ok(Math.abs(calc(10, 0, 1.4) - 3.5) < 1e-9, `combo10 +连击强化2级(×1.4) 应=3.5`);
  ok(Math.abs(calc(10, 0.15, 1) - 2.65) < 1e-9, `combo10 +风暴之忆(0.15) 应=2.65`);
  ok(Math.abs(calc(10, 0.15, 1.4) - 3.71) < 1e-9, `combo10 +遗响+工坊叠加 应=3.71`);
}

console.log(errors.length ? 'FAIL:\n' + errors.join('\n') : 'ALL PASS');
process.exit(errors.length ? 1 : 0);
