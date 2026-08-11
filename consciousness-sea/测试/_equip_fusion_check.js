/* ═══════════════ 装备扩展+融合+buff 回归检查 ═══════════════
 * 运行：node 测试/_equip_fusion_check.js
 * 检查：EQUIPMENT 完整性 / 字冲突 / targetMode / 商店价目 / 融合配置 / buff池 / 永久升级
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'chapter-1', 'js');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(dir, 'config.js'), 'utf8'), ctx);
// const 声明在 vm context 的全局词法环境，用 context 内求值取回
const get = (name) => vm.runInContext(name, ctx);
const EQUIPMENT = get('EQUIPMENT'), SHOP_CATALOG = get('SHOP_CATALOG'), PERMANENT_UPGRADES = get('PERMANENT_UPGRADES');
const FUSION = get('EQUIP_FUSION'), WEAPON_BUFFS = get('WEAPON_BUFFS');
const NOISE_WORDS = get('NOISE_WORDS'), NOISE_FAKE_ATTACK = get('NOISE_FAKE_ATTACK'),
      NOISE_FAKE_DEFENSE = get('NOISE_FAKE_DEFENSE'), NOISE_FAKE_TALISMAN = get('NOISE_FAKE_TALISMAN');

const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push(msg); };

// ── 1. 装备字段完整性 ──
Object.values(EQUIPMENT.weapons).forEach(w => {
  ok(w.id && w.name && w.damage && w.wordCount, `武器 ${w.id} 字段缺失`);
  ok(w.words.length === w.wordCount, `武器 ${w.id} words长度(${w.words.length})≠wordCount(${w.wordCount})`);
  ok(w.targetMode === 'single' || w.targetMode === 'aoe', `武器 ${w.id} 缺 targetMode`);
  ok(w.damage >= 5 && w.damage <= 12, `武器 ${w.id} damage(${w.damage}) 超出锚点 5~12`);
});
Object.values(EQUIPMENT.armors).forEach(a => {
  ok(a.words.length === a.wordCount, `防具 ${a.id} words长度≠wordCount`);
  ok(a.defense >= 1 && a.defense <= 4, `防具 ${a.id} defense(${a.defense}) 超出锚点 1~4`);
  ok(a.maxShield >= 8 && a.maxShield <= 30, `防具 ${a.id} maxShield(${a.maxShield}) 超出锚点 8~30`);
});
Object.values(EQUIPMENT.skills).forEach(s => {
  ok(s.chars && s.chars.length > 0, `技能 ${s.id} 缺 chars`);
  ok(s.type === 'sequence' || s.type === 'charge', `技能 ${s.id} type 非法`);
});
Object.values(EQUIPMENT.talismans).forEach(t => {
  ok(t.healMin >= 3 && t.healMax <= 18, `护符 ${t.id} heal 超出锚点 3~18`);
});

// ── 2. 字冲突：伪装池避让 + 单道具内部不重复（跨类别/跨武器共享字是原设计允许）──
const fakePool = [...NOISE_FAKE_ATTACK, ...NOISE_FAKE_DEFENSE, ...NOISE_FAKE_TALISMAN];
const allEquipChars = [];
Object.values(EQUIPMENT.weapons).forEach(w => allEquipChars.push(...w.words));
Object.values(EQUIPMENT.armors).forEach(a => allEquipChars.push(...a.words));
Object.values(EQUIPMENT.skills).forEach(s => allEquipChars.push(...s.chars));
Object.values(EQUIPMENT.talismans).forEach(t => allEquipChars.push(...t.words));
const fakeDup = fakePool.filter(c => allEquipChars.includes(c));
ok(fakeDup.length === 0, fakeDup.length ? `伪装字撞装备字: ${fakeDup.join(',')}` : '伪装字避让检查通过');

let dup = null;
Object.values(EQUIPMENT).forEach(cat => Object.values(cat).forEach(item => {
  const arr = item.words || item.chars || [];
  const seen = new Set();
  arr.forEach(c => { if (seen.has(c)) dup = `${item.id} 字「${c}」内部重复`; seen.add(c); });
}));
ok(!dup, dup || '单道具内部字重复检查通过');

// ── 3. 商店价目覆盖 ──
Object.keys(EQUIPMENT.weapons).forEach(k => { if (k !== 'beginner_brush' && !SHOP_CATALOG.weapons[k]) errors.push(`商店缺武器价目 ${k}`); });
Object.keys(EQUIPMENT.armors).forEach(k => { if (k !== 'thin_silk' && !SHOP_CATALOG.armors[k]) errors.push(`商店缺防具价目 ${k}`); });
Object.keys(EQUIPMENT.skills).forEach(k => {
  // 传承技能（INHERIT_SKILL_IDS，config.js 上移后 vm 可读）走传承事件/工坊渠道，不要求商店价目
  const inherit = (typeof get === 'function') ? (get('INHERIT_SKILL_IDS') || []) : [];
  if (k !== 'concentration' && !inherit.includes(k) && !SHOP_CATALOG.skills[k]) errors.push(`商店缺技能价目 ${k}`);
});
Object.keys(EQUIPMENT.talismans).forEach(k => { if (!SHOP_CATALOG.talismans[k]) errors.push(`商店缺护符价目 ${k}`); });

// ── 4. 融合 / buff / 永久升级配置 ──
ok(FUSION && FUSION.BASE_SUCCESS > 0 && FUSION.PER_LEVEL_MULT > 0 && FUSION.MAX_LEVEL >= 3, 'FUSION 配置缺失');
ok(WEAPON_BUFFS && Object.keys(WEAPON_BUFFS).length >= 5, 'WEAPON_BUFFS 池缺失或过少');
ok(PERMANENT_UPGRADES && PERMANENT_UPGRADES.fusionLuck, '融合之缘(fusionLuck) 永久升级缺失');

// ── 5. 假装备名冲突（从 rooms.js 提取 FAKE_WEAPON_NAMES）──
const roomsSrc = fs.readFileSync(path.join(dir, 'rooms.js'), 'utf8');
const m = roomsSrc.match(/FAKE_WEAPON_NAMES\s*=\s*\[([\s\S]*?)\]/);
if (m) {
  const fakeNames = m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
  Object.values(EQUIPMENT).forEach(cat => Object.values(cat).forEach(item => {
    if (fakeNames.includes(item.name)) errors.push(`装备名「${item.name}」撞假装备名池`);
  }));
}

console.log(errors.length ? '❌ 发现 ' + errors.length + ' 个问题:\n' + errors.join('\n')
                          : '✅ 装备扩展+融合+buff 配置检查全部通过');
process.exit(errors.length ? 1 : 0);
