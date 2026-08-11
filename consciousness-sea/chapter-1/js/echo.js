/* ═══════════════════ §H 遗响系统 — 局内构筑被动强化（Relic） ═══════════════════
 *
 * 依赖：config.js（全局风格）；运行时依赖 particles.js (HitParticle/DamageText)、
 *       sound.js (Sound)、battle.js (playerHP/playerMaxHP/threatLevel/updatePlayerUI)、
 *       boss.js (bossActive/bossState/bossProjectiles/restorePlayerWords)、main.js (saveGame)。
 *
 * 核心约定：遗响效果全部通过 echoMod(key) 在战斗时对 echoInventory 实时求和读取，
 *          绝不写持久化装备状态；grant 时一次性代价（扣血/扣上限/威胁+1）直接落在
 *          playerHP/playerMaxHP/threatLevel 上。存档/重开天然无残留。
 *
 * 获取渠道：① 层末 Boss 击败三选一（echoChoice UI） ② 商店上架 ③ 宝箱概率出 ④ 事件代价交换
 */

// ═══════════════ 稀有度配置 ═══════════════

const ECHO_RARITY = {
  common: { weight: 0.55, color: '#9ecbff', label: '普通', cost: 80 },
  rare:   { weight: 0.30, color: '#c9a2ff', label: '稀有', cost: 130 },
  epic:   { weight: 0.15, color: '#ffb648', label: '史诗', cost: 200 },
};

// ═══════════════ 遗响数据池（24 个：普通8 / 稀有11 / 史诗5） ═══════════════
// effects 的 key 见 ECHO_EFFECT_FMT（绘制时转中文）。含代价 key：
//   hpMaxCost / hpCost / threatUp / enemyDmgUp / noiseUp 会在效果行标红。
// 流派遗响带 school 字段（对应 config.js SCHOOLS），参与同流派计件协同。

const ECHO_DEFS = {
  // ── 普通 ──
  origin_echo:  { name:'起源之忆', rarity:'common', icon:'起', effects:{ atkDmg:0.08 },
    desc:'第一个字从混沌中浮起。它记得被说出之前的光。' },
  shallows_echo:{ name:'浅潮之忆', rarity:'common', icon:'潮', effects:{ defenseFlat:1 },
    desc:'浅海层最轻的浪，却挡得住最碎的沙。' },
  resonance_echo:{ name:'共鸣之忆', rarity:'common', icon:'鸣', effects:{ healMult:0.25 },
    desc:'回春的字在记忆里震荡，越响越亮。' },
  drift_echo:   { name:'漂流之忆', rarity:'common', icon:'漂', effects:{ shardMult:0.20 },
    desc:'从深处漂上来的碎片，总爱绕着你转。' },
  echo_murmur:  { name:'余音之忆', rarity:'common', icon:'余', effects:{ wordCount:1 },
    desc:'多一个低语的音符，多一分斩出的可能。' },
  calm_echo:    { name:'澄澈之忆', rarity:'common', icon:'澄', effects:{ noiseReduce:0.15 },
    desc:'水面平静时，杂音无处藏身。' },
  shell_echo:   { name:'螺鸣之忆', rarity:'common', icon:'螺', effects:{ shieldPerWord:1 },
    desc:'螺壳记得海的声音，也记得硬住自己。' },

  // ── 稀有 ──
  storm_echo:   { name:'风暴之忆', rarity:'rare', icon:'暴', effects:{ atkDmg:0.12, comboBoost:0.15 },
    desc:'风暴不是一次打击，是接踵而来的轰鸣。' },
  mirror_echo:  { name:'镜语之忆', rarity:'rare', icon:'镜', effects:{ dodgeChance:0.10 },
    desc:'镜子里的你，比你更快一步躲开。' },
  ember_echo:   { name:'余烬之忆', rarity:'rare', icon:'烬', effects:{ blazeBonus:8 },
    desc:'焚天的余烬还在烧，下一次会更旺。' },
  anchor_echo:  { name:'锚定之忆', rarity:'rare', icon:'锚', effects:{ shieldMax:10, shieldPerWord:1 },
    desc:'沉锚定住你，不让任何浪把你卷走。' },
  fountain_echo:{ name:'涌泉之忆', rarity:'rare', icon:'泉', effects:{ healFlat:3 },
    desc:'记忆深处有一眼泉，一直满着。' },
  whisper_echo: { name:'呢喃之忆', rarity:'rare', icon:'喃', effects:{ enemyIntervalUp:0.8 },
    desc:'你听过的最轻的呢喃，让躁动慢了下来。' },
  prism_echo:   { name:'棱镜之忆', rarity:'rare', icon:'棱', effects:{ critChance:0.12, critMult:0.5 },
    desc:'光透过棱镜，一分为二，再合二为一。' },
  trade_echo:   { name:'市集之忆', rarity:'rare', icon:'市', effects:{ shopDiscount:0.15 },
    desc:'前任潜航者留下的议价直觉。' },
  cinder_echo:  { name:'燔薪之忆', rarity:'rare', icon:'燔', school:'blaze', effects:{ blazeBonus:12 },
    desc:'燔薪为引，燎原在即——炎流派的薪火。' },
  frost_echo:   { name:'霜华之忆', rarity:'rare', icon:'霜', school:'frost', effects:{ slowBonus:0.35 },
    desc:'霜华落定，万物迟滞——冰流派的第一片雪。' },
  volt_echo:    { name:'惊蛰之忆', rarity:'rare', icon:'蛰', school:'storm', effects:{ comboBoost:0.10, atkDmg:0.06 },
    desc:'蛰伏既久，一雷惊春——雷流派的第一道电。' },
  glaze_echo:   { name:'凝冰之忆', rarity:'common', icon:'凝', school:'frost', effects:{ slowBonus:0.20 },
    desc:'凝冰成镜，照见自己的倒影慢慢变慢。' },

  // ── 史诗（含代价型）──
  dawn_echo:    { name:'破晓之刻', rarity:'epic', icon:'晓', effects:{ atkDmg:0.25, critChance:0.10 },
    desc:'天光破海的一瞬，万物重新定义。' },
  abyss_echo:   { name:'深渊之忆', rarity:'epic', icon:'渊', effects:{ atkDmg:0.20, enemyDmgUp:0.15 },
    desc:'深渊凝视着你，你也学会了凝视深渊——代价是深渊也看见了你。' },
  sacrifice_echo:{ name:'牺牲之忆', rarity:'epic', icon:'牺', effects:{ atkDmg:0.35, hpMaxCost:20, healMult:-0.30 },
    desc:'你烧掉一部分自我，换一瞬的锋利。' },
  greed_echo:   { name:'贪婪之忆', rarity:'epic', icon:'贪', effects:{ shardMult:0.60, noiseUp:0.10, enemyDmgUp:0.10 },
    desc:'什么都想要的人，连噪点都想装进行囊。' },
  awaken_echo:  { name:'觉醒之忆', rarity:'epic', icon:'醒', effects:{ wordCount:2, atkDmg:0.10, healMult:0.20, hpCost:15 },
    desc:'醒来的那一刻很疼，但眼前全是字。' },
};

// 效果 key → 中文（用于卡片/背包展示）。value 为数值。
const ECHO_EFFECT_FMT = {
  atkDmg:         v => `攻字伤害 +${Math.round(v*100)}%`,
  atkDmgFlat:     v => `攻字伤害 +${v}`,
  comboBoost:     v => `连击倍率 +${v}`,
  critChance:     v => `暴击率 +${Math.round(v*100)}%`,
  critMult:       v => `暴击伤害 +${v}`,
  defenseFlat:    v => `减伤 +${v}`,
  shieldPerWord:  v => `每枚防字护盾 +${v}`,
  shieldMax:      v => `护盾上限 +${v}`,
  dodgeChance:    v => `闪避率 +${Math.round(v*100)}%`,
  healMult:       v => `符字回复 ${v>=0?'+':''}${Math.round(v*100)}%`,
  healFlat:       v => `符字回复 +${v}`,
  wordCount:      v => `攻字上限 +${v}`,
  noiseReduce:    v => `干扰字率 -${Math.round(v*100)}%`,
  noiseUp:        v => `干扰字率 +${Math.round(v*100)}%`,
  shardMult:      v => `碎片获得 +${Math.round(v*100)}%`,
  shopDiscount:   v => `商店价格 -${Math.round(v*100)}%`,
  blazeBonus:     v => `「炎」槽累积 +${v}`,
  slowBonus:      v => `「霜」减速 +${v}s`,
  enemyIntervalUp:v => `敌人攻击间隔 +${v}s`,
  enemyDmgUp:     v => `敌人伤害 +${Math.round(v*100)}%`,
  hpMaxCost:      v => `最大意识上限 -${v}`,
  hpCost:         v => `立即失去 ${v} 点意识`,
  threatUp:       () => `威胁等级 +1`,
};

// 代价型 effect key（展示标红）
const ECHO_COST_KEYS = ['hpMaxCost', 'hpCost', 'threatUp', 'enemyDmgUp', 'noiseUp'];

// ═══════════════ 全局状态 ═══════════════

let echoInventory = [];        // 已收集遗响 id（每局潜航重置）
let echoChoiceActive = false;  // 三选一 UI 是否打开（模态）
let echoChoicePending = false; // Boss DEFEATED 是否在等待玩家选择（暂停清理）
let echoChoiceOptions = [];    // 当前 3 张候选卡
let echoChoiceHovered = null;  // 悬停卡
let echoChoiceAlpha = 0;       // 淡入
let echoChoicesUsed = [];      // 本局已 offer 过的 id（防重复 offer）
let echoRollsSinceEpic = 0;    // 保底计数器

// ═══════════════ 查询与收集 ═══════════════

/** 对某个效果 key 在已收集遗响中求和 */
function echoMod(key) {
  if (!Array.isArray(echoInventory)) return 0;
  let s = 0;
  for (const id of echoInventory) {
    const d = ECHO_DEFS[id];
    if (d && d.effects && typeof d.effects[key] === 'number') s += d.effects[key];
  }
  return s;
}

// ═══════════════ 属性流派协同（SCHOOL） ═══════════════
// 计件源：①当前武器 school ②遗响 ECHO_DEFS[].school ③当前武器固化的 buff（WEAPON_BUFFS[].school）。
// 只读、不落持久化；件数≥2 起效（synergy2），≥3 升级（synergy3），数值温和不压过混搭。

/** 统计某流派的计件数（武器 + 遗响 + 武器buff） */
function schoolCount(school) {
  let n = 0;
  // ① 当前武器
  if (typeof playerWeapon !== 'undefined' && playerWeapon && playerWeapon.school === school) n++;
  // ② 遗响
  if (Array.isArray(echoInventory)) {
    for (const id of echoInventory) {
      const d = ECHO_DEFS[id];
      if (d && d.school === school) n++;
    }
  }
  // ③ 当前武器固化的 buff
  if (typeof playerWeapon !== 'undefined' && playerWeapon && typeof weaponBuffs !== 'undefined'
      && typeof WEAPON_BUFFS !== 'undefined') {
    const buffId = weaponBuffs[playerWeapon.id];
    const bd = buffId && WEAPON_BUFFS[buffId];
    if (bd && bd.school === school) n++;
  }
  return n;
}

/** 流派协同修正：某 key 按当前件数取 synergy2/synergy3，不够 2 件返回 0 */
function schoolMod(key, school) {
  if (!school || typeof SCHOOLS === 'undefined' || !SCHOOLS[school]) return 0;
  const S = SCHOOLS[school];
  const n = schoolCount(school);
  if (n >= 3 && S.synergy3 && S.synergy3[key] != null) return S.synergy3[key];
  if (n >= 2 && S.synergy2 && S.synergy2[key] != null) return S.synergy2[key];
  return 0;
}

/** 流派标签中文（显示层用） */
function schoolLabel(school) {
  if (!school || typeof SCHOOLS === 'undefined' || !SCHOOLS[school]) return '';
  const s = SCHOOLS[school];
  return `${s.icon}${s.name}`;
}

/** 收集一个遗响（含 grant 时一次性代价） */
function grantEcho(id) {
  const d = ECHO_DEFS[id];
  if (!d || echoInventory.includes(id)) return;
  echoInventory.push(id);

  // grant-time 代价
  if (d.effects.hpCost && typeof playerHP !== 'undefined') {
    playerHP = Math.max(1, playerHP - d.effects.hpCost);
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }
  if (d.effects.hpMaxCost && typeof playerMaxHP !== 'undefined') {
    playerMaxHP = Math.max(20, playerMaxHP - d.effects.hpMaxCost);
    playerHP = Math.min(playerHP, playerMaxHP);
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }
  if (d.effects.threatUp && typeof threatLevel !== 'undefined') {
    threatLevel = Math.min(10, threatLevel + d.effects.threatUp);
  }

  // 粒子 + 音效
  if (typeof particles !== 'undefined' && typeof HitParticle !== 'undefined') {
    const cx = typeof W !== 'undefined' ? W * 0.5 : 600;
    const cy = typeof H !== 'undefined' ? H * 0.4 : 400;
    const rr = ECHO_RARITY[d.rarity] || ECHO_RARITY.common;
    for (let i = 0; i < 25; i++) particles.push(new HitParticle(cx, cy, rr.color, '◇'));
    if (typeof DamageText !== 'undefined') particles.push(new DamageText(cx, cy - 30, `遗响 · ${d.name}`, '#ffddaa'));
  }
  if (typeof Sound !== 'undefined' && Sound.itemGet) Sound.itemGet();
  if (typeof registerRelic === 'function') registerRelic(id);
  if (typeof saveGame === 'function') saveGame();
}

/** 每局潜航重置遗响（不清三选一 UI 状态） */
function clearEchoes() {
  echoInventory = [];
  echoChoicesUsed = [];
  echoRollsSinceEpic = 0;
}

/** 获取遗响稀有度配置 */
function getEchoRarity(key) {
  const d = ECHO_DEFS[key];
  return (d && ECHO_RARITY[d.rarity]) || ECHO_RARITY.common;
}

// ═══════════════ 随机抽卡 ═══════════════

/** 加权稀有度（bias=层数偏移 0/0.08/0.15，提高史诗占比） */
function rollEchoRarity(bias) {
  bias = bias || 0;
  const cw = Math.max(0.20, 0.55 - bias * 1.0);
  const rw = 0.30;
  const r = Math.random();
  if (r < cw) return 'common';
  if (r < cw + rw) return 'rare';
  return 'epic';
}

/** 三选一 roll n 张（不重复；连续 5 次无史诗则保底一张史诗；池空允许重复兜底） */
function rollEchoOptions(n, bias) {
  n = n || 3; bias = bias || 0;
  const allKeys = Object.keys(ECHO_DEFS);
  const pool = allKeys.filter(k => !echoInventory.includes(k) && !echoChoicesUsed.includes(k));
  const src = pool.length >= n ? pool : allKeys;
  const out = [];
  for (let i = 0; i < n; i++) {
    let rarity = (i === 0 && echoRollsSinceEpic >= 5) ? 'epic' : rollEchoRarity(bias);
    let cands = src.filter(k => ECHO_DEFS[k].rarity === rarity && !out.some(o => o.id === k));
    if (!cands.length) cands = src.filter(k => !out.some(o => o.id === k));
    if (!cands.length) cands = src;
    const pick = cands[Math.floor(Math.random() * cands.length)];
    const def = ECHO_DEFS[pick];
    out.push({ id: pick, ...def });
    echoChoicesUsed.push(pick);
    if (def.rarity === 'epic') echoRollsSinceEpic = 0; else echoRollsSinceEpic++;
  }
  return out;
}

/** 事件/宝箱用：随机一张未拥有的遗响（可过滤稀有度），池空返回 null */
function rollRandomEcho(rarity) {
  const pool = Object.keys(ECHO_DEFS).filter(k =>
    !echoInventory.includes(k) && (!rarity || ECHO_DEFS[k].rarity === rarity));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ═══════════════ 三选一 UI 状态机（Canvas 覆盖层，仿 shop.js/bestiary.js） ═══════════════

function openEchoChoice(bias) {
  echoChoiceOptions = rollEchoOptions(3, bias);
  echoChoiceActive = true;
  echoChoiceAlpha = 0;
  echoChoiceHovered = null;
  // 强制恢复正常缩放，防弹幕阶段 1.4x 残留导致点击坐标错位
  if (typeof canvasZoom !== 'undefined') canvasZoom = 1;
  if (typeof canvas !== 'undefined' && canvas) canvas.style.transform = 'scale(1)';
  // 禁用囊字按钮，防止三选一时误开背包
  const _pb = document.getElementById('pouch-btn');
  if (_pb) _pb.style.pointerEvents = 'none';
  if (typeof Sound !== 'undefined' && Sound.chime) Sound.chime();
}

function updateEchoChoice(dt) {
  echoChoiceAlpha = Math.min(1, echoChoiceAlpha + (dt || 0.016) * 4);
}

/** 效果行文本（代价行标红） */
function formatEchoEffects(effects) {
  const out = [];
  Object.entries(effects || {}).forEach(([k, v]) => {
    if (ECHO_EFFECT_FMT[k]) out.push({ text: ECHO_EFFECT_FMT[k](v), cost: ECHO_COST_KEYS.includes(k) });
  });
  return out;
}

function drawEchoChoice(ctx) {
  if (!echoChoiceActive) return;
  const Ww = W, Hh = H;
  ctx.save();
  ctx.globalAlpha = echoChoiceAlpha;

  // 遮罩
  ctx.fillStyle = 'rgba(2,2,18,0.93)';
  ctx.fillRect(0, 0, Ww, Hh);

  // 标题
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(200,220,240,0.85)';
  ctx.font = '24px "Noto Serif SC","SimSun",serif';
  ctx.fillText('遗响 · 记忆的回声', Ww * 0.5, Hh * 0.16);
  ctx.fillStyle = 'rgba(160,180,210,0.5)';
  ctx.font = '13px "Noto Serif SC","SimSun",serif';
  ctx.fillText('Boss 的执念消散，留下一段可以纳入意识的记忆', Ww * 0.5, Hh * 0.21);

  // 卡片
  const cardW = Math.min(250, Ww * 0.28), cardH = Math.min(175, Hh * 0.44);
  const gapX = Math.min(28, Ww * 0.03);
  const totalW = 3 * cardW + 2 * gapX;
  const startX = Ww * 0.5 - totalW * 0.5;
  const cardY = Hh * 0.30;

  echoChoiceOptions.forEach((card, i) => {
    if (!card) return;
    const cx = startX + i * (cardW + gapX) + cardW / 2;
    const cy = cardY + cardH / 2;
    const isHover = echoChoiceHovered === card;
    const rr = ECHO_RARITY[card.rarity] || ECHO_RARITY.common;
    const sz = isHover ? 1.05 : 1;
    const w = cardW * sz, h = cardH * sz;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.003);

    ctx.save();
    ctx.fillStyle = isHover ? 'rgba(255,230,180,0.12)' : 'rgba(255,230,180,0.05)';
    ctx.strokeStyle = rr.color;
    ctx.lineWidth = isHover ? 2 : 1;
    if (isHover) ctx.shadowColor = rr.color;
    ctx.shadowBlur = isHover ? 20 * pulse : 0;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // 稀有度标签
    ctx.fillStyle = rr.color;
    ctx.font = '10px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'left';
    ctx.fillText(rr.label, cx - w / 2 + 10, cy - h / 2 + 16);

    // 流派标签（右上角）：一眼可辨所属流派
    if (card.school && typeof SCHOOLS !== 'undefined' && SCHOOLS[card.school]) {
      const s = SCHOOLS[card.school];
      ctx.fillStyle = s.color;
      ctx.textAlign = 'right';
      ctx.fillText(`${s.icon}${s.name}`, cx + w / 2 - 10, cy - h / 2 + 16);
    }

    // 图标
    ctx.fillStyle = rr.color;
    ctx.font = '28px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText(card.icon || '忆', cx, cy - 36);

    // 名字
    ctx.fillStyle = '#ffddaa';
    ctx.shadowColor = 'rgba(255,200,80,0.5)';
    ctx.shadowBlur = 8;
    ctx.font = '17px "Noto Serif SC","SimSun",serif';
    ctx.fillText(card.name, cx, cy - 8);
    ctx.shadowBlur = 0;

    // 效果行
    let ey = cy + 20;
    formatEchoEffects(card.effects).forEach(ln => {
      ctx.fillStyle = ln.cost ? '#ff8866' : 'rgba(200,215,240,0.85)';
      ctx.font = '11px "Noto Serif SC","SimSun",serif';
      ctx.fillText(ln.text, cx, ey);
      ey += 15;
    });

    // hover 提示
    if (isHover) {
      ctx.fillStyle = `rgba(255,240,200,${pulse})`;
      ctx.font = '11px "Noto Serif SC","SimSun",serif';
      ctx.fillText('点击纳入意识', cx, cy + h / 2 - 12);
    }
    ctx.restore();
  });

  // 底部提示
  ctx.fillStyle = 'rgba(160,180,210,0.4)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.fillText('选择一个遗响 · ESC 放弃', Ww * 0.5, Hh * 0.90);

  ctx.restore();
}

function hitTestEchoChoice(mx, my) {
  if (!echoChoiceActive) return null;
  const Ww = W, Hh = H;
  const cardW = Math.min(250, Ww * 0.28), cardH = Math.min(175, Hh * 0.44);
  const gapX = Math.min(28, Ww * 0.03);
  const totalW = 3 * cardW + 2 * gapX;
  const startX = Ww * 0.5 - totalW * 0.5;
  const cardY = Hh * 0.30;
  echoChoiceHovered = null;
  for (let i = 0; i < echoChoiceOptions.length; i++) {
    const card = echoChoiceOptions[i];
    if (!card) continue;
    const cx = startX + i * (cardW + gapX) + cardW / 2;
    const cy = cardY + cardH / 2;
    if (mx > cx - cardW / 2 && mx < cx + cardW / 2 &&
        my > cy - cardH / 2 && my < cy + cardH / 2) {
      echoChoiceHovered = card;
      return card;
    }
  }
  return null;
}

function clickEchoChoice(card) {
  if (!card || !echoChoiceActive) return;
  grantEcho(card.id);
  resolveBossChoice();
}

/** Boss 三选一结束后的唯一清理点：手动执行 DEFEATED 分支该做的清理，走通 checkRoomComplete */
function resolveBossChoice() {
  echoChoiceActive = false;
  echoChoicePending = false;
  echoChoiceOptions = [];
  echoChoiceHovered = null;
  // 恢复囊字按钮
  const _pb = document.getElementById('pouch-btn');
  if (_pb) _pb.style.pointerEvents = '';
  if (typeof bossActive !== 'undefined') bossActive = false;
  if (typeof bossState !== 'undefined') bossState = null;
  if (typeof bossProjectiles !== 'undefined') bossProjectiles = [];
  if (typeof restorePlayerWords === 'function') restorePlayerWords();
}
