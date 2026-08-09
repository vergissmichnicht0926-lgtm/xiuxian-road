/* ═══════════════════ §G 战斗系统 v2 ═══════════════════
 *
 * 依赖：config.js (WORD_LIBRARY, EQUIPMENT, DIFFICULTY, NOISE_WORDS)
 *       sound.js (Sound)
 *       particles.js (HitParticle, DamageText, BattleWord)
 *       main.js (playerWeapon, playerArmor, playerSkill, skillState)
 *       tutorial.js (Tutorial)
 *
 * 全局状态：战斗相关的HP、计时器、技能收集
 */

let enemyHP=40, enemyMaxHP=40, enemyTimer=0, enemyInterval=6;
let enemyEntity = null; // 战场中的敌人视觉实体 { x, y, char, color, size, phase, hurtFlash }
let currentEnemyType = 'bash';   // 当前敌人攻击类型（房间设置：bash/volley/rain/track/shield/split）
let enemyProjectiles = [];       // 普通敌人弹幕（弹幕型敌人发射）

// ═══ 多敌人编队系统（唯一真相源 = enemyList[]，旧标量为「主敌人镜像」）═══
let enemyList = [];      // 每个 { id, type, hp, maxHp, timer, interval, entity:{...}, alive }
let targetIndex = 0;     // 当前索敌目标下标（默认锁最左）

// ═══ 装备强化状态 ═══
let equipmentLevels = {};        // { [equipmentId]: lv }，融合等级，跨局持久化
let weaponBuffs = {};            // { [weaponId]: buffId }，深层掉落固化的武器buff，持久化
let unlockedArmors = new Set();  // 局内已解锁防具（run-scoped，每局重置）
let unlockedTalismans = new Set();// 局内已解锁护符（run-scoped，每局重置）

// ═══ 装备熟练度 / 开局随机池 ═══
let equipProficiency = {};       // { [equipmentId]: count } 熟练度，跨局持久化（5次解锁开局池）
let runEquipGains = {};          // { [equipmentId]: count } 本局拾取计数（仅通关结算）

// ═══ 武器buff运行时状态 ═══
let _focusTarget = null;  // 专注buff当前锁定目标id
let _focusStacks = 0;     // 专注buff层数
let _chainGuard = false;  // 连锁溅射递归守卫
let _frameAttacked = false; // 帧内是否已有敌人攻击（合并comboPenalty）

// ═══ 本局潜航统计（总结页展示，局内不存档）═══
let runKills = 0;         // 击败普通敌人
let runEliteKills = 0;    // 击败精英（hardMode 强化怪）
let runBossKills = 0;     // 击败 Boss
let maxLayerReached = 1;  // 抵达最深层
let playerHP=100, playerMaxHP=100;
let hasShield=false, shieldHP=0;
let playerDefense=0; // 当前防具减伤值
let playerHurtTimer=0; // 玩家血条受击抖动
let nextAttackBoost=false;
let combo=0, comboTimer=0, comboWords=[];
let shieldDecayTimer=0; // 护盾衰减计时器
let blazeProgress=0;    // 焚天「炎」debuff进度 0~100
let blazeActive=false;  // 炎爆是否激活
let blazeTimer=0;       // 炎爆剩余时间
let blazeCooldown=0;    // 炎爆冷却
let threatLevel=0;      // 威胁等级 0~10

// DOM引用（main.js中赋值）
let elComboDisplay, elComboCount, elComboWords;

/** 根据装备获取指定类别的词元配置 */
function getCatConfig(cat) {
  if (cat==='攻' && typeof playerWeapon!=='undefined' && playerWeapon) {
    return { words:playerWeapon.words, color:playerWeapon.color, glow:playerWeapon.glow };
  }
  if (cat==='防' && typeof playerArmor!=='undefined' && playerArmor) {
    return { words:playerArmor.words, color:playerArmor.color, glow:playerArmor.glow };
  }
  // 符字 — 由护符配置提供（战场治疗来源）
  if (cat==='符' && typeof playerTalisman!=='undefined' && playerTalisman) {
    return { words:playerTalisman.words, color:playerTalisman.color, glow:playerTalisman.glow };
  }
  // 技能字 — 由技能配置提供
  if (cat==='skill' && typeof playerSkill!=='undefined' && playerSkill) {
    return { words:playerSkill.chars, color:playerSkill.color, glow:playerSkill.glow };
  }
  return null;
}

/** combo保护：降级而非清零 */
function comboPenalty(levels) {
  levels = levels || 2;
  combo = Math.max(0, combo - levels);
  comboTimer = Math.max(0, comboTimer - 0.3);
  if (combo === 0) { comboWords = []; elComboDisplay.classList.remove('show'); }
  else { comboWords = comboWords.slice(-Math.min(combo, 5)); updateComboColors(); }
}

/** 敌人视觉特征表（名字对应攻击方式） */
function getEnemyVis(type) {
  const VIS = {
    bash:   { chars:['敌','噪','乱','扰','侵'], color:'#cc8866', glow:'#884422', size:44 },
    volley: { chars:['矢','射','齐','迸'],       color:'#66aaff', glow:'#3366cc', size:48 },
    rain:   { chars:['雨','滴','滂','霖'],       color:'#55ccdd', glow:'#2288aa', size:48 },
    track:  { chars:['追','逐','缠','觅'],       color:'#aa77ff', glow:'#6633cc', size:50 },
    shield: { chars:['壁','护','盾','御'],       color:'#ddcc88', glow:'#aa9933', size:52 },
    split:  { chars:['裂','散','分','崩'],       color:'#ff9966', glow:'#cc5522', size:46 },
  };
  return VIS[type] || VIS.bash;
}

let _enemyIdSeq = 0;  // 敌人自增id

/** 构建单个敌人对象（hp/interval 读当前标量或显式传入） */
function buildEnemyObj(hardMode, enemyType, x, y, hp, interval, idx, splitLevel) {
  const v = getEnemyVis(enemyType || 'bash');
  const hardChars = ['恨','悔','惜','怅'];
  return {
    id: ++_enemyIdSeq,
    type: enemyType || 'bash',
    elite: !!hardMode,   // hardMode 强化怪计为「精英」（总结页统计）
    splitLevel: splitLevel || 1, // 分裂残响轮次（1/2/3 → 伤害 ×0.5^(N-1)）
    hp: (hp === undefined ? enemyHP : hp),
    maxHp: (hp === undefined ? enemyMaxHP : hp),
    timer: (interval === undefined ? enemyInterval : interval),
    interval: (interval === undefined ? enemyInterval : interval),
    entity: {
      x: x, y: y,
      char: hardMode ? hardChars[Math.floor(Math.random()*hardChars.length)] : v.chars[Math.floor(Math.random()*v.chars.length)],
      color: hardMode ? '#dd9988' : v.color,
      glow: hardMode ? '#994433' : v.glow,
      size: hardMode ? 56 : v.size,
      phase: Math.random()*Math.PI*2,
      hurtFlash: 0,
      wobbleX: 0, wobbleY: 0,
    },
    alive: true,
  };
}

/** 刷新单个敌人实体（兼容所有旧调用点：tutorial/事件房——它们先设标量再spawn） */
function spawnEnemyEntity(hardMode, enemyType) {
  clearEnemyList();
  const e = buildEnemyObj(hardMode, enemyType || 'bash', W*0.5, H*0.26);
  enemyList.push(e);
  targetIndex = 0;
  syncEnemyCompat();
  updateEnemyUI();
}

/**
 * 编队生成器：按形状排列生成多个敌人（战斗房用）。
 * opts = { layer, formation, count, hp, interval }
 *  hp/interval 可为数组（逐敌指定，分裂残片用）或标量
 */
function spawnEnemyFormation(hardMode, enemyType, opts) {
  opts = opts || {};
  const layer = opts.layer || 1;
  const diff = (typeof difficulty !== 'undefined') ? difficulty : 1;
  const count = opts.count || formationCount(layer, diff, enemyType);
  const formation = opts.formation || pickFormation(1, layer);
  const positions = formationPositions(formation, count);
  clearEnemyList();
  for (let i = 0; i < positions.length; i++) {
    const hp = Array.isArray(opts.hp) ? (opts.hp[i] || enemyHP) : (opts.hp || enemyHP);
    const interval = Array.isArray(opts.interval) ? (opts.interval[i] || enemyInterval) : (opts.interval || enemyInterval);
    enemyList.push(buildEnemyObj(hardMode, enemyType || 'bash', positions[i].x, positions[i].y, hp, interval, i, opts.splitLevel));
  }
  targetIndex = getLeftmostAliveIndex();
  syncEnemyCompat();
  updateEnemyUI();
}

/** 编队敌人数量：随层深/难度/攻击类型增长 */
function formationCount(layer, diff, enemyType, override) {
  if (override) return Math.max(1, Math.min(5, override));
  let n = 2 + Math.floor((layer - 1) / 2);         // 每2层 +1
  if (diff === 2) n += 1;                           // 深层难度 +1
  if (enemyType === 'volley' || enemyType === 'rain') n += 1; // 弹幕型多1
  return Math.max(1, Math.min(5, n));
}

/** 按形状生成编队坐标（敌群集中上中区 y∈[H*0.18,H*0.42]，不遮战场词元） */
function formationPositions(formation, count) {
  const pts = [];
  const cx = W * 0.5, topY = H * 0.26;
  const x0 = W * 0.12, x1 = W * 0.88;   // 横排范围放宽
  if (formation === 'line') {
    for (let i = 0; i < count; i++) pts.push({ x: x0 + (x1 - x0) * (count === 1 ? 0.5 : i / (count - 1)), y: topY });
  } else if (formation === 'rect') {
    const rows = 2, cols = Math.ceil(count / 2);
    for (let i = 0; i < count; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      pts.push({ x: cx + (c - (cols - 1) / 2) * 112, y: topY - 24 + r * 62 });  // 行高加大防重叠
    }
  } else if (formation === 'triangle') {
    const rows = Math.ceil((Math.sqrt(8 * count + 1) - 1) / 2);
    let placed = 0;
    for (let r = 0; r < rows && placed < count; r++) {
      const inRow = Math.min(r + 1, count - placed);
      for (let c = 0; c < inRow && placed < count; c++, placed++) {
        pts.push({ x: cx + (c - (inRow - 1) / 2) * 112, y: topY - (rows - 1) * 30 + r * 62 });
      }
    }
  } else if (formation === 'ring') {
    const r = 105 + count * 14;   // 半径加大，count大时不挤
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: cx + Math.cos(a) * r, y: topY + Math.sin(a) * r * 0.55 });
    }
  } else if (formation === 'arrow') {
    // 箭头（楔形）：尖1 → 行2×2 → 第3行起左右交替扩展（间距加大）
    pts.push({ x: cx, y: topY - 30 });                                  // 尖
    if (count >= 2) pts.push({ x: cx - 85, y: topY + 20 });             // 左翼
    if (count >= 3) pts.push({ x: cx + 85, y: topY + 20 });             // 右翼
    for (let i = 3; i < count; i++) {                                   // 第3行起（与第2行拉开≥60）
      const row = Math.floor((i - 3) / 2);
      const side = (i - 3) % 2 === 0 ? -1 : 1;
      pts.push({ x: cx + side * (85 + Math.floor(row / 2) * 56), y: topY + 80 + row * 46 });
    }
  } else { // random 撒点（最小间距105）
    let tries = 0;
    while (pts.length < count && tries < 60) {
      tries++;
      const px = x0 + Math.random() * (x1 - x0);
      const py = topY - 40 + Math.random() * 80;
      if (pts.every(p => Math.hypot(p.x - px, p.y - py) > 105)) pts.push({ x: px, y: py });
    }
  }
  // ⚠️ 兜底：最小间距约束（防止任何形状下敌人贴在一起）
  return enforceMinSpacing(pts, 90);
}

/** 兜底约束：把过近的点推开到至少 minDist，且约束在画布上中区 */
function enforceMinSpacing(pts, minDist) {
  if (!pts.length) return pts;
  const out = [{ x: pts[0].x, y: pts[0].y }];
  for (let i = 1; i < pts.length; i++) {
    const p = { x: pts[i].x, y: pts[i].y };
    // 与已有点逐对推开，多轮迭代收敛
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (let j = 0; j < out.length; j++) {
        const dx = p.x - out[j].x, dy = p.y - out[j].y;
        const d = Math.hypot(dx, dy);
        if (d > 0.1 && d < minDist) {
          const push = (minDist - d) / d;
          p.x += dx * push;
          p.y += dy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    // 边界约束（画布内上中区，不遮战场词元）
    p.x = Math.max(40, Math.min(W - 40, p.x));
    p.y = Math.max(H * 0.16, Math.min(H * 0.42, p.y));
    out.push(p);
  }
  return out;
}

/** 按波次选择形状：越深层越倾向 ring/arrow */
function pickFormation(wave, layer) {
  if (layer >= 6 && Math.random() < 0.4) return Math.random() < 0.5 ? 'ring' : 'arrow';
  const seq = ['line', 'rect', 'triangle', 'ring', 'arrow'];
  return seq[(wave - 1) % seq.length];
}

/** 返回最左（x最小）的存活敌人下标 */
function getLeftmostAliveIndex() {
  let best = -1, bestX = Infinity;
  for (let i = 0; i < enemyList.length; i++) {
    if (!enemyList[i].alive) continue;
    if (enemyList[i].entity.x < bestX) { bestX = enemyList[i].entity.x; best = i; }
  }
  return best;
}

/** 当前索敌目标（targetIndex 失效时重锁最左存活） */
function getMainEnemy() {
  const alive = enemyList.filter(e => e.alive);
  if (!alive.length) return null;
  if (targetIndex < 0 || targetIndex >= enemyList.length || !enemyList[targetIndex] || !enemyList[targetIndex].alive) {
    targetIndex = getLeftmostAliveIndex();
  }
  return enemyList[targetIndex] || null;
}

/** 同步旧标量 = 主敌人镜像（多敌改造兼容层） */
function syncEnemyCompat() {
  const alive = enemyList.filter(e => e.alive);
  if (alive.length > 0) {
    const main = getMainEnemy();
    enemyEntity = main.entity;
    enemyHP = main.hp;
    enemyMaxHP = main.maxHp;
    enemyTimer = main.timer;
    enemyInterval = main.interval;
    currentEnemyType = main.type;
  } else if (enemyList.length > 0) {
    // 列表存在但全灭 → 让房间check感知清波
    enemyHP = 0;
    enemyEntity = null;
  }
  // enemyList.length===0 时不碰 enemyHP（保护 treasure 房 -1 无敌语义 / 事件房防御性 999）
}

/** 清空敌人列表（startRoom / Boss 冻结调用） */
function clearEnemyList() {
  enemyList = [];
  targetIndex = 0;
  _focusTarget = null; _focusStacks = 0; _chainGuard = false;
  enemyEntity = null;
}

// ═══════════════ 装备等级 / 融合数值辅助 ═══════════════
function getEquipLevel(key) { return (equipmentLevels && equipmentLevels[key]) || 1; }
function getEquipMult(key) {
  return 1 + (getEquipLevel(key) - 1) * (typeof EQUIP_FUSION !== 'undefined' ? EQUIP_FUSION.PER_LEVEL_MULT : 0.25);
}
function getArmorDefense(armor) { return armor ? Math.floor(armor.defense * getEquipMult(armor.id)) : 0; }
function getShieldPerWord(armor) { return armor ? Math.floor((armor.shieldPerWord || 2) * getEquipMult(armor.id)) : 2; }
function getMaxShieldCap(armor) { return armor ? Math.floor((armor.maxShield || 10) * getEquipMult(armor.id)) : 10; }
function getTalismanHeal(t, which) {
  if (!t) return which === 'min' ? 3 : 7;
  return Math.floor((which === 'min' ? t.healMin : t.healMax) * getEquipMult(t.id));
}

/** 武器是否携带指定buff（固有字段 或 weaponBuffs 深层掉落） */
function hasWeaponBuff(buffId) {
  if (!playerWeapon) return false;
  if (playerWeapon[buffId] !== undefined && playerWeapon[buffId] !== false) return true; // pierce:true / leech:0.15 / focus:true
  return weaponBuffs && weaponBuffs[playerWeapon.id] === buffId;
}

/** 每局开始重置局内装备状态（unlockedArmors/Talismans 是局内的；融合等级与buff持久化不清） */
function resetRunEquipmentState() {
  unlockedArmors = new Set();
  unlockedTalismans = new Set();
}

/** 每局潜航开始重置统计与局内装备获得计数（hub.js startRoguelikeDive / main.js startPrologue 调用） */
function resetRunStats() {
  runKills = 0; runEliteKills = 0; runBossKills = 0;
  maxLayerReached = 1;
  runEquipGains = {};
}

/** 小萤出发前随机提供装备：基础件 + 熟练度达标件（weaponGift 升级 = 武器池全开） */
function rollStartGear() {
  if (typeof EQUIPMENT === 'undefined') return;
  const threshold = (typeof EQUIP_UNLOCK !== 'undefined') ? EQUIP_UNLOCK.THRESHOLD : 5;
  const unlocked = (id, cat) => {
    if (cat === 'weapon' && typeof getUpgradeLevel === 'function' && getUpgradeLevel('weaponGift') > 0) return true;
    return ((equipProficiency && equipProficiency[id]) || 0) >= threshold;
  };
  const pick = pool => pool[Math.floor(Math.random() * pool.length)];
  const wpnKeys = ['beginner_brush'].concat(Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush' && unlocked(k, 'weapon')));
  const armKeys = ['thin_silk'].concat(Object.keys(EQUIPMENT.armors).filter(k => k !== 'thin_silk' && unlocked(k, 'armor')));
  const talKeys = ['vitality_charm'].concat(Object.keys(EQUIPMENT.talismans).filter(k => k !== 'vitality_charm' && unlocked(k, 'talisman')));
  const wpn = EQUIPMENT.weapons[pick(wpnKeys)];
  const arm = EQUIPMENT.armors[pick(armKeys)];
  const tal = EQUIPMENT.talismans[pick(talKeys)];
  // 图鉴：开局装备即记录（幂等）
  if (typeof registerEquipment === 'function') {
    registerEquipment(wpn.id); registerEquipment(arm.id); registerEquipment(tal.id);
  }
  if (typeof playerWeapon !== 'undefined') playerWeapon = wpn;
  if (typeof playerArmor !== 'undefined') {
    playerArmor = arm;
    if (typeof playerDefense !== 'undefined') playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : (playerArmor.defense || 0);
  }
  if (typeof playerTalisman !== 'undefined') playerTalisman = tal;
}

/** 通关结算：本局装备获得计数 → 熟练度（仅通关调用；死亡/主动返回作废） */
function settleEquipGains() {
  if (!runEquipGains) return;
  Object.entries(runEquipGains).forEach(([id, c]) => {
    equipProficiency[id] = (equipProficiency[id] || 0) + c;
  });
}

/** 更新敌人实体动画（遍历所有存活敌人） */
function updateEnemyEntity(dt) {
  for (const e of enemyList) {
    if (!e.alive) continue;
    const ent = e.entity;
    ent.phase += dt * 1.6;
    ent.wobbleX = Math.sin(ent.phase) * 6;
    ent.wobbleY = Math.cos(ent.phase * 0.7) * 4;
    if (ent.hurtFlash > 0) ent.hurtFlash -= dt;
  }
  syncEnemyCompat();
}

/** 绘制单个敌人 */
function drawEnemyOne(ctx, e) {
  const ent = e.entity;
  const breathe = 1 + Math.sin(ent.phase) * 0.06;
  const sz = ent.size * breathe;
  const hurtShake = ent.hurtFlash > 0 ? Math.sin(ent.hurtFlash * 45) * ent.hurtFlash * 8 : 0;

  ctx.save();
  // 脉动圆环
  const ringR = sz * 0.95 + Math.sin(ent.phase * 1.3) * 3;
  ctx.strokeStyle = `rgba(200,140,100,${0.25 + 0.1 * Math.sin(ent.phase * 1.3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ent.x + hurtShake, ent.y + hurtShake*0.5, ringR, 0, Math.PI*2); ctx.stroke();

  // 暗影光环
  const glowGrad = ctx.createRadialGradient(ent.x, ent.y, sz*0.3, ent.x, ent.y, sz*1.6);
  glowGrad.addColorStop(0, `rgba(200,120,80,${0.18 + 0.06*Math.sin(ent.phase)})`);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(ent.x + hurtShake, ent.y + hurtShake*0.5, sz*1.6, 0, Math.PI*2); ctx.fill();

  // 主字
  ctx.shadowColor = ent.glow;
  ctx.shadowBlur = 12 + Math.sin(ent.phase)*4;
  ctx.fillStyle = ent.color;
  ctx.font = `${sz}px "Noto Serif SC","SimSun",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ent.char, ent.x + hurtShake + ent.wobbleX*0.3, ent.y + hurtShake*0.5 + ent.wobbleY*0.3);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** 绘制索敌指示器（当前目标 = 旋转菱形 + 顶部三角） */
function drawTargetMarker(ctx, e) {
  const ent = e.entity;
  ctx.save();
  const pulse = 1 + 0.1 * Math.sin(performance.now() * 0.006);
  const s = (ent.size || 44) * 0.95 * pulse;
  ctx.strokeStyle = 'rgba(255,220,120,0.75)';
  ctx.lineWidth = 1.5;
  ctx.translate(ent.x, ent.y);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-s, -s, s * 2, s * 2);
  ctx.rotate(-Math.PI / 4);
  // 顶部小三角
  ctx.beginPath();
  ctx.moveTo(0, -s - 12);
  ctx.lineTo(-6, -s - 2);
  ctx.lineTo(6, -s - 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,220,120,0.75)';
  ctx.fill();
  ctx.restore();
}

/** 绘制敌人编队 */
function drawEnemyEntity(ctx) {
  const alive = enemyList.filter(e => e.alive);
  if (!alive.length || enemyHP <= 0) return;
  for (const e of enemyList) {
    if (e.alive) drawEnemyOne(ctx, e);
  }
  const main = getMainEnemy();
  if (main) drawTargetMarker(ctx, main);
}

/** 对敌人编队造成伤害（targetMode：'aoe' 全打 / 'single' 打主敌人/指定目标） */
function dealDamage(dmg,isCombo,target) {
  const alive = enemyList.filter(e => e.alive);
  if (!alive.length) return;
  const isAoe = playerWeapon && playerWeapon.targetMode === 'aoe';
  if (isAoe) {
    for (const e of enemyList) if (e.alive) dealDamageToEnemy(e, dmg, isCombo, true);
  } else {
    const main = (target && target.alive) ? target : getMainEnemy();
    if (main) dealDamageToEnemy(main, dmg, isCombo, false);
  }
  syncEnemyCompat();
  updateEnemyUI();

  // 受控房间（combat/treasure/event）不进入全局VICTORY，由各自check函数处理
  const inControlledRoom = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && (currentDiveRoom.type === 'combat' || currentDiveRoom.type === 'treasure' || currentDiveRoom.type === 'event');
  if(enemyHP<=0&&Tutorial.phase===PHASE.BATTLE && !inControlledRoom){
    Tutorial.enterPhase(PHASE.VICTORY);
    document.getElementById('enemy-timer-fill').style.width='100%';
    document.getElementById('enemy-timer-fill').classList.remove('urgent');
  }
}

/** 对单个敌人造成伤害（武器buff挂接点：处刑/专注/风暴/穿透/连锁/汲取） */
function dealDamageToEnemy(e, dmg, isCombo, isAoe) {
  if (!e || !e.alive) return;
  const ent = e.entity;
  let final = Math.max(1, Math.floor(dmg));

  // 处刑 execute：20%血以下伤害翻倍
  if (hasWeaponBuff('execute') && e.maxHp > 0 && e.hp / e.maxHp < 0.20) final = Math.floor(final * 2);
  // 专注 focus：连续命中同一目标递增（最多5层，换目标/死亡重置）
  if (hasWeaponBuff('focus')) {
    if (_focusTarget === e.id) { _focusStacks = Math.min(5, _focusStacks + 1); final = Math.floor(final * (1 + _focusStacks * 0.08)); }
    else { _focusTarget = e.id; _focusStacks = 1; final = Math.floor(final * 1.08); }
  }
  // 风暴 tempest：AOE命中增伤
  if (isAoe && hasWeaponBuff('tempest')) final = Math.floor(final * 1.3);
  // 护壁减半（穿透 buff 或 贯日固有 pierce 豁免）
  if (e.type === 'shield' && !hasWeaponBuff('pierce')) final = Math.max(1, Math.floor(final * 0.5));

  e.hp -= final;
  if (e.hp < 0) e.hp = 0;
  if (e.hp <= 0) {
    e.alive = false;
    if (e.elite) runEliteKills++; else runKills++;  // 击杀统计
  }

  particles.push(new DamageText(ent.x, ent.y - 20, `-${final}`, isCombo ? '#ffcc44' : '#ff8866'));
  for (let i = 0; i < 5; i++) particles.push(new HitParticle(ent.x, ent.y, isCombo ? '#ffcc44' : '#ff6644'));
  ent.hurtFlash = 0.18;
  shakeAmount = Math.max(shakeAmount, final * 0.3);

  // 连锁 chain：单伤命中时对其他敌人溅射30%（_chainGuard 防递归）
  if (!isAoe && hasWeaponBuff('chain') && !_chainGuard) {
    _chainGuard = true;
    for (const o of enemyList) {
      if (o.alive && o !== e) dealDamageToEnemy(o, Math.max(1, Math.floor(final * 0.3)), false, false);
    }
    _chainGuard = false;
  }

  // 汲取 leech：伤害回血（武器固有 leech 数值 或 汲取buff 默认15%）
  let leechPct = 0;
  if (hasWeaponBuff('leech')) leechPct = (playerWeapon && typeof playerWeapon.leech === 'number') ? playerWeapon.leech : 0.15;
  if (leechPct > 0) {
    const heal = Math.max(1, Math.floor(final * leechPct));
    playerHP = Math.min(playerMaxHP, playerHP + heal);
    updatePlayerUI();
  }
}

/** 应用武器特殊效果（焚天炎debuff / 霜序减速） */
function applyWeaponEffects() {
  if (!playerWeapon) return;

  // 焚天「炎」debuff
  if (playerWeapon.blaze && blazeCooldown <= 0) {
    // Boss CHARGING/ATTACK阶段冻结进度
    const bossFreeze = bossActive && bossState &&
      (bossState.phase === BOSS_PHASE.CHARGING || bossState.phase === BOSS_PHASE.ATTACK);
    if (!bossFreeze) {
      blazeProgress = Math.min(100, blazeProgress + 20 + (typeof echoMod==='function'?echoMod('blazeBonus'):0));
      // 炎爆触发
      if (blazeProgress >= 100 && !blazeActive) {
        blazeActive = true; blazeTimer = 6.0; blazeProgress = 100;
        for (let i = 0; i < 15; i++) {
          const p = new HitParticle(W * 0.5, H * 0.35, '#ff6600', '炎');
          p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3 - 1;
          p.size = 8 + Math.random() * 14; p.life = 20 + Math.random() * 25;
          particles.push(p);
        }
        particles.push(new DamageText(W * 0.5, H * 0.28, '炎爆!', '#ff6600'));
        Sound.anomaly();
      }
    }
  }

  // 霜序减速（对全体存活敌人生效，含遗响·减速加成）
  if (playerWeapon.slow) {
    const slowAmt = 0.25 + (typeof echoMod==='function'?echoMod('slowBonus'):0);
    for (const e of enemyList) {
      if (!e.alive) continue;
      e.timer = Math.min(e.timer + slowAmt, e.interval * 1.5);
      // 冰霜粒子
      if (Math.random() < 0.5) {
        const fp = new HitParticle(e.entity.x, e.entity.y, '#99ccff', '❄');
        fp.vx *= 0.3; fp.vy *= 0.3; fp.size = 6 + Math.random() * 8;
        fp.life = 15 + Math.random() * 15; fp.gravity = -0.03;
        particles.push(fp);
      }
    }
    syncEnemyCompat();
  }
}

/** 对玩家施加伤害：防御减伤 → 护盾吸收 → HP扣除，返回实际HP损失 */
function applyDamageToPlayer(rawDmg) {
  // 防御减伤（含遗响·减伤加成）
  let dmg = Math.max(1, rawDmg - playerDefense - (typeof echoMod==='function'?echoMod('defenseFlat'):0));
  let absorbed = 0;
  // 护盾吸收
  if (hasShield && shieldHP > 0) {
    absorbed = Math.min(shieldHP, dmg);
    shieldHP -= absorbed;
    dmg -= absorbed;
    if (shieldHP <= 0) { hasShield = false; shieldHP = 0; }
  }
  playerHP -= dmg;
  if (playerHP < 0) playerHP = 0;
  if (dmg > 0) playerHurtTimer = 0.2;
  updatePlayerUI();
  return { dmg, absorbed, shieldBroken: hasShield === false && absorbed > 0 };
}

/** 敌人攻击 — 按攻击类型分发：弹幕型发射弹幕，近战型直接扣血（enemy 缺省主敌人） */
function enemyAttack(enemy) {
  if(Tutorial.phase!==PHASE.BATTLE) return;
  if (!enemy || !enemy.alive) enemy = getMainEnemy();
  if (!enemy) return;

  // 闪避判定（独立于防御/护盾，完全避开；含遗响·闪避加成）
  const baseDodge=(playerArmor&&playerArmor.dodgeChance)?playerArmor.dodgeChance:0;
  const dodgeTotal=baseDodge+(typeof echoMod==='function'?echoMod('dodgeChance'):0);
  if(dodgeTotal>0&&Math.random()<dodgeTotal){
    Sound.shieldBlock();
    particles.push(new DamageText(W*0.5,H*0.65,'闪避!','#88ccff'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.7,'#88ccff','◇'));
    if (!_frameAttacked) { comboPenalty(); _frameAttacked = true; }
    enemy.timer=enemy.interval;
    return;
  }

  if (enemy.type==='volley' || enemy.type==='rain' || enemy.type==='track') {
    enemyLaunchProjectiles(enemy);
  } else {
    enemyAttackMelee(enemy);
  }

  // 同帧多敌攻击合并一次连击惩罚（防连击被连环打掉）
  if (!_frameAttacked) { comboPenalty(); _frameAttacked = true; }

  // 玩家死亡判定
  if(playerHP<=0){
    if(typeof Tutorial!=='undefined' && Tutorial.phase && Tutorial.phase.toString().startsWith('tutorial_')){
      playerHP=30;
      updatePlayerUI();
      Dialogue.show({mode:'shake',speaker:'零',text:'……你需要再来一次。集中精神！',speed:30});
      enemy.timer=enemy.interval;
      refreshWords();
      return;
    }
    handlePlayerDeath();
    return;
  }
  enemy.timer=enemy.interval;
}

/** 多敌人攻击计时：每帧遍历存活敌人，到点各自攻击（main.js 调用） */
function updateEnemyTimers(dt) {
  _frameAttacked = false;
  let attacked = false;
  for (const e of enemyList) {
    if (!e.alive) continue;
    e.timer -= dt;
    if (e.timer <= 0) {
      e.timer = e.interval;
      attacked = true;
      enemyAttack(e);
      if (Tutorial.phase !== PHASE.BATTLE) break; // 玩家死亡/胜利后停止
    }
  }
  if (attacked) {
    syncEnemyCompat();
    if (Tutorial.phase === PHASE.BATTLE) refreshWords();
  }
}

/** 近战攻击：直接对玩家造成伤害（bash/shield/split 类型；enemy 参数供编队兼容） */
function enemyAttackMelee(enemy) {
  const diff=DIFFICULTY[difficulty];
  const dmgMult=(typeof currentDiveRoom!=='undefined'&&currentDiveRoom&&currentDiveRoom.enemyDmgMult)?currentDiveRoom.enemyDmgMult:1;
  let rawDmg=Math.round((diff.enemyDmg[0]+Math.floor(Math.random()*(diff.enemyDmg[1]-diff.enemyDmg[0])))*dmgMult);
  // ⚠️ 近战（非弹幕：bash/shield/split）整体削弱 30%
  rawDmg = Math.max(1, Math.round(rawDmg * 0.7));
  // 分裂残响：逐轮递减（第N轮伤害 × 0.5^(N-1)，第一轮不折）
  if (enemy && enemy.type === 'split' && enemy.splitLevel > 1) {
    rawDmg = Math.max(1, Math.round(rawDmg * Math.pow(0.5, enemy.splitLevel - 1)));
  }
  // 残响之影：波纹攻击伤害翻倍
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'treasure') {
    rawDmg = 16 + Math.floor(Math.random() * 12); // 16-27，很高
    shakeAmount = Math.max(shakeAmount, 14);
    // 波纹粒子
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 80;
      const p = new HitParticle(W*0.5 + Math.cos(a)*r, H*0.5 + Math.sin(a)*r, '#c8a0d8', '~');
      p.vx = Math.cos(a) * 2; p.vy = Math.sin(a) * 2;
      p.size = 4 + Math.random() * 8; p.life = 20 + Math.random() * 20;
      particles.push(p);
    }
  }
  const result = applyDamageToPlayer(rawDmg);

  Sound.enemyAtk();
  shakeAmount=Math.max(shakeAmount,rawDmg*0.5);

  // 伤害反馈粒子
  if (result.absorbed > 0) {
    Sound.shieldBlock();
    particles.push(new DamageText(W*0.5,H*0.62,`盾-${result.absorbed}`,'#66aaff'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.68,'#66aaff','□'));
  }
  if (result.dmg > 0) {
    const defInfo = playerDefense > 0 ? ` (防-${Math.min(rawDmg-1, playerDefense)})` : '';
    particles.push(new DamageText(W*0.5,H*0.65,`-${result.dmg}${defInfo}`,'#ff4444'));
    for(let i=0;i<10;i++) particles.push(new HitParticle(W*0.5,H*0.7,'#ff3333','×'));
  }
}

/** 弹幕型敌人：发射弹幕（玩家被击中时扣血），弹幕原点跟随敌人 */
function enemyLaunchProjectiles(enemy) {
  if (!enemy || !enemy.alive) enemy = getMainEnemy();
  const ent = enemy ? enemy.entity : null;
  const cx = ent ? ent.x : W*0.5;
  const cy = ent ? ent.y : H*0.26;
  const diff = DIFFICULTY[difficulty];
  const dmgMult=(typeof currentDiveRoom!=='undefined'&&currentDiveRoom&&currentDiveRoom.enemyDmgMult)?currentDiveRoom.enemyDmgMult:1;
  const dmg = Math.round((diff.enemyDmg[0] + Math.floor(Math.random()*(diff.enemyDmg[1]-diff.enemyDmg[0]))) * dmgMult);
  const type = enemy ? enemy.type : currentEnemyType;
  let projs = [];
  if (type === 'volley') {
    projs = BulletPattern.radial(cx, cy, '·', 8, 2.0, '#66aaff', dmg, 14);
  } else if (type === 'rain') {
    projs = BulletPattern.rain(cx, cy, '·', 6, 1.6, '#55ccdd', dmg, 16);
  } else if (type === 'track') {
    // aimed 签名是位置参数 (cx,cy,toX,toY,char,count,speed,color,damage,size,spreadAngle)
    projs = BulletPattern.aimed(cx, cy, mx, my, '·', 1, 3.2, '#aa77ff', dmg, 14, 0);
  }
  enemyProjectiles.push(...projs);
  Sound.enemyAtk();
}

/** 普通敌人弹幕更新（位移 + 鼠标碰撞扣血） */
function updateEnemyProjectiles(dt) {
  if (enemyProjectiles.length === 0) return;
  enemyProjectiles.forEach(p => {
    p.update(dt);
    if (p.alive && p.hitMouse(mx, my, 18)) {
      p.alive = false;
      const result = applyDamageToPlayer(p.damage);
      particles.push(new DamageText(p.x, p.y - 10, `-${result.dmg}`, '#ff4444'));
      for (let i = 0; i < 6; i++) particles.push(new HitParticle(p.x, p.y, '#ff3333', '·'));
      comboPenalty();
      if (playerHP <= 0 && typeof handlePlayerDeath === 'function') {
        if (typeof Tutorial !== 'undefined' && Tutorial.phase && Tutorial.phase.toString().startsWith('tutorial_')) {
          playerHP = 30; updatePlayerUI();
          Dialogue.show({ mode:'shake', speaker:'零', text:'……你需要再来一次。集中精神！', speed:30 });
        } else {
          handlePlayerDeath();
        }
      }
    }
  });
  enemyProjectiles = enemyProjectiles.filter(p => p.alive);
}

/** 绘制普通敌人弹幕 */
function drawEnemyProjectiles(ctx) {
  enemyProjectiles.forEach(p => p.draw(ctx));
}

/** 更新敌人HP条（主敌人血量；多敌时名字后追加 ×N） */
function updateEnemyUI() {
  const hpEl = document.getElementById('enemy-hp-fill');
  if (hpEl) hpEl.style.width = `${(enemyHP / enemyMaxHP) * 100}%`;
  const alive = enemyList.filter(e => e.alive);
  const nameEl = document.getElementById('enemy-name');
  if (nameEl) {
    // 名字若被 rooms.js 重新设置过（不含 × 后缀），刷新 base
    if (!nameEl.textContent.includes('×')) nameEl.setAttribute('data-base', nameEl.textContent);
    if (alive.length > 1) nameEl.textContent = `${nameEl.getAttribute('data-base')} ×${alive.length}`;
    else nameEl.textContent = nameEl.getAttribute('data-base');
  }
}

/** 更新玩家HP条 */
function updatePlayerUI() {
  document.getElementById('player-hp-fill').style.width=`${(playerHP/playerMaxHP)*100}%`;
  if(playerHP<playerMaxHP*0.25) document.getElementById('player-hp-fill').classList.add('low');
  else document.getElementById('player-hp-fill').classList.remove('low');
  let info = `潜航者 · 意识完整度 ${Math.round(playerHP)}%`;
  if (playerDefense > 0) info += ` · 防${playerDefense}`;
  if (hasShield && shieldHP > 0) info += ` · 盾${Math.ceil(shieldHP)}`;
  if (typeof playerTalisman !== 'undefined' && playerTalisman) info += ` · ${playerTalisman.name}`;
  document.getElementById('player-info').textContent = info;
}

/** 动态平衡战场文字数量 */
function balanceWords() {
  // ═══ 统一守卫：非战斗区域不生成任何词元 ═══
  if (typeof mapActive !== 'undefined' && mapActive) return;
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom) {
    const t = currentDiveRoom.type;
    // 纯对话/休息区：静流、起点、安全屋、遗落装备
    if (t === 'rest' || t === 'start' || t === 'safe_house' || t === 'treasure') return;
    // 记忆涟漪(事件)：怪物已消灭或无怪物时不生成
    if (t === 'event') {
      if (typeof eventResolved === 'undefined' || !eventResolved) return; // 选项未出现
      if (typeof eventMonsterDefeated !== 'undefined' && eventMonsterDefeated) return; // 怪物已消灭
      if (typeof enemyHP !== 'undefined' && enemyHP <= 0 && typeof eventMonsterWaves !== 'undefined' && eventMonsterWaves <= 0) return;
    }
    // Boss房间：boss活跃时由boss.js控制，不活跃时不生成
    if (t === 'boss' && (typeof bossActive === 'undefined' || !bossActive)) return;
  }
  // 序章过渡期 / 结局
  if (typeof PROLOGUE !== 'undefined' && typeof prologuePhase !== 'undefined') {
    if (prologuePhase === PROLOGUE.PRE_DIVE || prologuePhase === PROLOGUE.END) return;
  }

  // Boss战中，攻击阶段不生成文字（玩家需点击暴露部件），其他阶段正常
  if(bossActive && bossState){
    if(bossState.phase === BOSS_PHASE.ENTRANCE || bossState.phase === BOSS_PHASE.ATTACK || bossState.phase === BOSS_PHASE.DEFEATED) return;
  }

  const diff=DIFFICULTY[difficulty];
  battleWords=battleWords.filter(bw=>bw.alive||bw.alpha>0.03); // 保留淡出中的字，避免突消失

  // 多敌时攻字随存活敌数微调，避免手速跟不上掉血
  const aliveCount = (typeof enemyList !== 'undefined') ? enemyList.filter(e => e.alive).length : 0;
  const atkCount = Math.max(1, ((typeof playerWeapon!=='undefined' && playerWeapon && playerWeapon.wordCount) ? playerWeapon.wordCount : 5)
    + (typeof echoMod==='function'?echoMod('wordCount'):0)
    + Math.floor(aliveCount / 2));
  const defCount = (typeof playerArmor!=='undefined' && playerArmor && playerArmor.wordCount) ? playerArmor.wordCount : 2;
  const talismanCount = (typeof playerTalisman!=='undefined' && playerTalisman && playerTalisman.wordCount) ? playerTalisman.wordCount : 0;
  const targets={攻:atkCount,防:defCount,符:talismanCount};
  const current={攻:0,防:0,符:0};
  battleWords.forEach(bw=>{if(current[bw.cat]!==undefined) current[bw.cat]++;});

  // 渐进恢复：每个周期只补1个词，缓慢充盈
  const gradual = bossActive && bossState && bossState._gradualRestore > 0;
  let addedThisCall = 0;
  const maxPerCall = gradual ? 2 : 99;

  // 补字 — 使用装备词元池
  for(const cat of ['攻','防','符']){
    const cfg=getCatConfig(cat);
    if(!cfg) continue;
    while(current[cat]<targets[cat] && addedThisCall < maxPerCall){
      const text=cfg.words[Math.floor(Math.random()*cfg.words.length)];
      const bw=new BattleWord(cat,text);
      bw.vx*=diff.speed;bw.vy*=diff.speed;bw.wobbleAmp*=diff.speed;
      battleWords.push(bw);
      current[cat]++; addedThisCall++;
    }
  }

  // 技能字 — 只在战斗中、有技能装备时生成
  if(typeof playerSkill!=='undefined' && playerSkill && typeof skillState!=='undefined'){
    const skillCfg=getCatConfig('skill');
    if(skillCfg){
      const skillOnField=battleWords.filter(bw=>bw.alive&&bw.cat==='skill').length;
      // 序列型：只生成下一个需要的字
      if(playerSkill.type==='sequence' && skillOnField<1 && skillState && addedThisCall < maxPerCall){
        const nextIdx=skillState.collected.length;
        if(nextIdx<playerSkill.chars.length){
          const neededChar=playerSkill.chars[nextIdx];
          const sw=new BattleWord('skill',neededChar);
          sw.vx*=diff.speed;sw.vy*=diff.speed;sw.wobbleAmp*=diff.speed;
          sw.size=32+Math.random()*6;
          battleWords.push(sw); addedThisCall++;
        }
      }
      // 蓄力型：持续生成e/x
      if(playerSkill.type==='charge' && skillOnField<2 && skillState && addedThisCall < maxPerCall){
        const char=playerSkill.chars[Math.floor(Math.random()*playerSkill.chars.length)];
        const sw=new BattleWord('skill',char);
        sw.vx*=diff.speed;sw.vy*=diff.speed;sw.wobbleAmp*=diff.speed;
        sw.size=30+Math.random()*8;
        battleWords.push(sw); addedThisCall++;
      }
    }
  }

  // 干扰字（增强版：随威胁等级增加数量+追踪+伪装）
  const playerCount=battleWords.filter(bw=>bw.alive&&bw.cat!=='乱').length;
  const noiseBoost = Math.min(0.16, (threatLevel || 0) * 0.02);
  // 遗响·干扰字率修正（noiseReduce 降低 / noiseUp 提高，乘算）
  const noiseMult = Math.max(0.1, (1 - (typeof echoMod==='function'?echoMod('noiseReduce'):0))
    * (1 + (typeof echoMod==='function'?echoMod('noiseUp'):0)));
  const noiseActualRate = Math.min(0.45, (diff.noiseRate + noiseBoost) * noiseMult);
  const noiseTarget=Math.min(8, Math.floor(playerCount*noiseActualRate)+1);
  const noiseCurrent=battleWords.filter(bw=>bw.alive&&bw.cat==='乱').length;

  if(noiseCurrent<noiseTarget && addedThisCall < maxPerCall){
    const tl = threatLevel || 0;
    // 伪装比例：威胁0~1→0%, 2~3→20%, 4~5→35%, 6~7→50%, 8+→65%
    const fakeRate = tl <= 1 ? 0 : tl <= 3 ? 0.20 : tl <= 5 ? 0.35 : tl <= 7 ? 0.50 : 0.65;
    let text, catColor, catGlow, isFake=false;

    if (Math.random() < fakeRate) {
      // 伪装字：随机选攻/防/符伪装
      const catRoll = Math.random();
      if (catRoll < 0.5) {
        text = NOISE_FAKE_ATTACK[Math.floor(Math.random()*NOISE_FAKE_ATTACK.length)];
        const cfg = getCatConfig('攻'); catColor = cfg ? cfg.color : '#ff6644'; catGlow = cfg ? cfg.glow : '#cc3311';
      } else if (catRoll < 0.8) {
        text = NOISE_FAKE_DEFENSE[Math.floor(Math.random()*NOISE_FAKE_DEFENSE.length)];
        const cfg = getCatConfig('防'); catColor = cfg ? cfg.color : '#66aaff'; catGlow = cfg ? cfg.glow : '#3366cc';
      } else {
        text = NOISE_FAKE_TALISMAN[Math.floor(Math.random()*NOISE_FAKE_TALISMAN.length)];
        catColor = '#44dd88'; catGlow = '#228844';
      }
      isFake = true;
    } else {
      text = NOISE_WORDS[Math.floor(Math.random()*NOISE_WORDS.length)];
    }

    const nw=new BattleWord('乱',text);
    nw._isFakeNoise = isFake;
    nw._noiseCatColor = isFake ? catColor : null;
    nw._noiseCatGlow = isFake ? catGlow : null;
    // 追踪强度：威胁0~1→0, 2~3→0.3, 4~5→0.5, 6~7→0.7, 8+→1.0
    nw._trackMouse = tl <= 1 ? 0 : tl <= 3 ? 0.3 : tl <= 5 ? 0.5 : tl <= 7 ? 0.7 : 1.0;
    nw.size = isFake ? (20+Math.random()*8) : (18+Math.random()*8);
    nw.alpha = isFake ? 0.72 : 0.55;
    nw.vx*=diff.speed;nw.vy*=diff.speed;nw.wobbleAmp*=diff.speed;
    nw.noiseLife=diff.noiseLife;
    battleWords.push(nw); addedThisCall++;
  }

  // 渐进恢复递减
  if (gradual && bossState._gradualRestore > 0) bossState._gradualRestore--;
}

function refreshWords() { balanceWords(); }

/** 更新连击颜色 */
function updateComboColors() {
  let clr='#ffffff';
  if(combo>=10) clr='#ff4400';
  else if(combo>=7) clr='#ffdd00';
  else if(combo>=5) clr='#ff88ff';
  else if(combo>=3) clr='#ffaa44';
  elComboCount.style.color=clr;
  if(combo>=3){
    elComboWords.textContent=comboWords.slice(-3).join('·'); elComboWords.style.color=clr;
  } else {
    elComboWords.textContent=''; elComboWords.style.color='#ffffff';
  }
}

/** 收集技能字 */
function collectSkillChar(bw) {
  if(!skillState) return;
  const cfg=getCatConfig('skill');
  if(!cfg) return;

  skillState.collected.push(bw.text);
  for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,cfg.color,bw.text));
  particles.push(new DamageText(bw.x,bw.y-8,'收集!',cfg.color));
  Sound.boost();
  bw.alive=false;bw.targetAlpha=0;

  // 更新技能UI
  updateSkillUI();

  // 序列型：检查是否全部收集完成
  if(playerSkill.type==='sequence'){
    const needed=playerSkill.chars.join('');
    const got=skillState.collected.join('');
    if(got===needed){
      triggerSkill();
    }
  }
  // 蓄力型：增加充能
  if(playerSkill.type==='charge'){
    skillState.chargeLevel=(skillState.chargeLevel||0)+1;
    updateSkillUI();
  }

  refreshWords();
}

/** 触发技能效果 */
function triggerSkill() {
  if(!playerSkill||!skillState) return;
  const cfg=getCatConfig('skill');

  if(playerSkill.effect==='nextAttackBoost'){
    nextAttackBoost=true;
    skillState.ready=true;
    for(let i=0;i<15;i++) particles.push(new HitParticle(W*0.5,H*0.5,cfg.color,'◆'));
    particles.push(new DamageText(W*0.5,H*0.45,'凝神·倍击!',cfg.color));
    Sound.boost();
  }
  if(playerSkill.effect==='freezeTimer'){
    // 冻结全体存活敌人（控场语义统一）
    for (const e of enemyList) {
      if (e.alive) e.timer = Math.min(e.interval, e.timer + playerSkill.freezeDuration);
    }
    syncEnemyCompat();
    for(let i=0;i<20;i++) particles.push(new HitParticle(W*0.5,H*0.3,cfg.color,'❄'));
    particles.push(new DamageText(W*0.5,H*0.25,'时间暂停!',cfg.color));
    Sound.boost();
  }

  // 重置收集
  skillState.collected=[];
  updateSkillUI();
}

/** 释放蓄力技能（快捷键调用） */
function releaseChargedSkill() {
  if(!playerSkill||playerSkill.type!=='charge'||!skillState) return;
  const lv=skillState.chargeLevel||0;
  if(lv<=0) return;
  const cfg=getCatConfig('skill');
  const dmg=5+lv*3;
  dealDamage(dmg,true);
  for(let i=0;i<20;i++) particles.push(new HitParticle(W*0.5,H*0.3,cfg.color,'★'));
  particles.push(new DamageText(W*0.5,H*0.25,`EX·${lv}!`,cfg.color));
  Sound.comboMilestone(Math.min(lv,7));
  skillState.chargeLevel=0;
  skillState.collected=[];
  updateSkillUI();
}

/** 玩家死亡处理 */
function handlePlayerDeath() {
  // 阻止重复触发
  if (Tutorial.phase === PHASE.DEFEAT) return;

  // 三选一模态中死亡 → 复位，防止卡死（遗响保留，肉鸽惯例）
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive) {
    echoChoiceActive = false; echoChoicePending = false; echoChoiceOptions = [];
  }

  // 战斗房间：仅序章原地重试（肉鸽改为死亡结束 → 锚点传送 + 总结页）
  const inRoguelike = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  if (!inRoguelike && typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'combat') {
    playerHP = playerMaxHP || 100;
    updatePlayerUI();
    if (typeof respawnCurrentWave === 'function') {
      respawnCurrentWave();  // rooms.js：按当前波次/形状重建编队
    } else {
      enemyHP = enemyMaxHP = currentDiveRoom.enemyHP || 40;
      enemyTimer = enemyInterval = currentDiveRoom.enemyInterval || 6.0;
      spawnEnemyEntity(false, currentDiveRoom.enemyType);
    }
    updateEnemyUI();
    if (typeof balanceWords === 'function') balanceWords();
    shakeAmount = 12;
    Dialogue.show({ mode:'shake', speaker:'零', text:'集中精神！再来一次！', speed:30 });
    return;
  }

  Tutorial.enterPhase(PHASE.DEFEAT);

  // 清空战场
  battleWords.forEach(bw => { if (bw.alive) for (let i = 0; i < 8; i++) particles.push(new HitParticle(bw.x, bw.y, '#ff2222', bw.text)); });
  battleWords = [];

  // Boss战清理 — 立即清除bossActive防止残留渲染
  if (bossActive && bossState) {
    // 清理遗假撤退的挂起定时器，防止死亡后融合演出残留
    if (bossState._fusionTimers) { bossState._fusionTimers.forEach(clearTimeout); bossState._fusionTimers = null; }
    bossProjectiles.forEach(p => { for (let i = 0; i < 4; i++) particles.push(new HitParticle(p.x, p.y, '#ff3333', '·')); });
    bossProjectiles = [];
    bossState._gravityActive = false;
    bossState._heartLock = null;
    bossState._afterimages = []; bossState._burstBombs = [];
    // 立即清除boss状态（粒子已生成，不再需要DEFEATED动画）
    bossActive = false; bossState = null;
  }

  // 强烈震动
  shakeAmount = 22;

  // 红色粒子爆发
  const cx = W * 0.5, cy = H * 0.5;
  for (let i = 0; i < 60; i++) {
    const p = new HitParticle(cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 300, '#ff3322', '×');
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = (Math.random() - 0.5) * 6 - 2;
    p.size = 4 + Math.random() * 14;
    p.life = 40 + Math.random() * 60;
    p.gravity = 0.04;
    particles.push(p);
  }

  Sound.defeat();

  // 结束画面：肉鸽 → 锚点剧情 + 总结页；序章 → 战败画面（可重试）
  if (inRoguelike) {
    const showSummary = () => { if (typeof showRunSummary === 'function') showRunSummary(false); };
    if (typeof Dialogue !== 'undefined' && Dialogue.show) {
      Dialogue.show({ mode:'whisper', speaker:'零', text:'锚点感知到你的濒危……我拉你回来。', speed:34 });
      // 轮询对话关闭（玩家点击推进）后弹总结页；Dialogue.onComplete 是打字完成回调，不能直接串联
      let _anchorTimer = setInterval(() => {
        if (typeof Dialogue === 'undefined' || !Dialogue.active) {
          clearInterval(_anchorTimer);
          showSummary();
        }
      }, 200);
    } else {
      setTimeout(showSummary, 600);
    }
  } else {
    setTimeout(() => {
      if (typeof showDefeat === 'function') showDefeat();
    }, 1200);
  }
}

/** 遗的剧情杀：零牺牲 → 瞬移至安全屋 */
function triggerYiSacrifice() {
  Tutorial.enterPhase(PHASE.DEFEAT);

  // 清除Boss战场 — 立即清除状态防止残留，粒子留存做视觉演出
  if (bossActive && bossState) {
    // 清理遗假撤退的挂起定时器
    if (bossState._fusionTimers) { bossState._fusionTimers.forEach(clearTimeout); bossState._fusionTimers = null; }
    bossProjectiles.forEach(p => { for (let i = 0; i < 3; i++) particles.push(new HitParticle(p.x, p.y, '#aaeeff', '·')); });
    bossProjectiles = [];
    bossState._gravityActive = false;
    bossState._heartLock = null;
    bossState._afterimages = []; bossState._burstBombs = [];
    bossActive = false; bossState = null;
  }
  battleWords = [];

  const cx = W * 0.5, cy = H * 0.5;

  // 白色冲击波 — 零的能量爆发
  shakeAmount = 45;
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 12;
    const p = new HitParticle(cx, cy, '#aaccff', '·');
    p.vx = Math.cos(a) * spd;
    p.vy = Math.sin(a) * spd;
    p.size = 4 + Math.random() * 18;
    p.life = 40 + Math.random() * 80;
    p.gravity = 0.02;
    particles.push(p);
  }

  // 零的粒子形体爆散
  for (let i = 0; i < 40; i++) {
    const p = new HitParticle(cx + (Math.random()-0.5)*100, cy + (Math.random()-0.5)*100, '#88bbee', '零');
    p.vx = (Math.random()-0.5)*4;
    p.vy = (Math.random()-0.5)*4;
    p.size = 8 + Math.random() * 20;
    p.life = 50 + Math.random() * 70;
    particles.push(p);
  }

  Sound.anomaly();

  // 闪白 → 对话 → 传送
  document.getElementById('stun-overlay').classList.add('active');
  setTimeout(() => {
    document.getElementById('stun-overlay').classList.remove('active');
    Dialogue.show({
      mode:'shake', speaker:'零',
      text:'我不会让你死在这里。绝对不会！！',
      speed:35, locked:false
    });
  }, 600);

  // 2.5秒后进入安全屋
  setTimeout(() => {
    Dialogue.hide();
    document.getElementById('stun-overlay').classList.remove('active');
    if (typeof returnToMap === 'function') {
      // 用真实房间id（肉鸽动态id如boss_0），硬编码'boss_yi'会导致boss房完成不了、肉鸽卡住
      const id = (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.id) || 'boss_yi';
      returnToMap(id);
    }
  }, 3000);
}

/** 更新技能收集UI */
function updateSkillUI() {
  const el=document.getElementById('skill-display');
  if(!el||!playerSkill||!skillState) return;
  // 只在战斗或教程阶段显示
  const ph=Tutorial.phase;
  const show=(ph===PHASE.BATTLE||(typeof ph==='string'&&ph.startsWith('tutorial_')));
  if(!show){ el.style.opacity='0'; return; }

  if(playerSkill.type==='sequence'){
    const needed=playerSkill.chars;
    const got=skillState.collected;
    let html='';
    for(let i=0;i<needed.length;i++){
      const collected=i<got.length;
      html+=`<span style="color:${collected?playerSkill.color:'rgba(255,255,255,0.15)'};font-size:20px;margin:0 2px;">${needed[i]}</span>`;
    }
    el.innerHTML=html;
    el.style.opacity='1';
  }
  if(playerSkill.type==='charge'){
    const lv=skillState.chargeLevel||0;
    el.innerHTML=`<span style="color:${playerSkill.color};font-size:16px;">EX充能: ${lv}</span>`;
    el.style.opacity='1';
  }
}

/** 战斗中点击文字的处理 */
function handleBattleClick(bw) {
  // 技能字
  if(bw.cat==='skill'){
    collectSkillChar(bw);
    return;
  }

  if(bw.cat==='攻'){
    // 无敌敌人（残响之影等）→ 攻击无效
    if (enemyHP === -1) {
      particles.push(new DamageText(bw.x,bw.y-8,'无效','#888888'));
      for(let i=0;i<4;i++) particles.push(new HitParticle(bw.x,bw.y,'#998899','◇'));
      bw.alive=false;bw.targetAlpha=0;
      Sound.stun();
      refreshWords();
      return;
    }
    // 敌人已死 → 不再造成伤害，避免"空血条还要补刀"
    if (enemyHP <= 0 && !bossActive) {
      particles.push(new DamageText(bw.x,bw.y-8,'已消灭','#888888'));
      bw.alive=false;bw.targetAlpha=0;
      refreshWords();
      return;
    }
    const comboBase=combo>=10?2.5:combo>=7?2.0:combo>=5?1.5:combo>=3?1.2:1;
    const bonus=comboBase+(typeof echoMod==='function'?echoMod('comboBoost'):0);
    const boostMult=nextAttackBoost?2:1;
    const baseDmg=(playerWeapon?playerWeapon.damage:10)*getEquipMult(playerWeapon?playerWeapon.id:'')+(typeof echoMod==='function'?echoMod('atkDmgFlat'):0);
    let dmg=Math.floor((baseDmg+Math.random()*3)*bonus*boostMult*(1+(typeof echoMod==='function'?echoMod('atkDmg'):0)));
    // 遗响·暴击
    const critCh=(typeof echoMod==='function'?echoMod('critChance'):0);
    if(critCh>0&&Math.random()<critCh){
      dmg=Math.floor(dmg*(2+(typeof echoMod==='function'?echoMod('critMult'):0)));
      particles.push(new DamageText(bw.x,bw.y-20,'暴击!','#ffdd44'));
      Sound.boost();
    }

    // Boss战：攻击判定（蓄力期0.8x / 暴露期1.5x / 其他无效）
    if(bossActive && typeof hitBossPart==='function'){
      const hit = hitBossPart(mx, my);
      if(hit || (bossState && bossState.phase===BOSS_PHASE.VULNERABLE)){
        // 命中才消耗凝神倍击（无效点击不吞）
        if(nextAttackBoost){nextAttackBoost=false;skillState.ready=false;particles.push(new DamageText(bw.x,bw.y-14,'倍击!','#ffaa44'));}
        const mult = hit ? hit.multiplier : 1.5;
        Sound.attack();
        damageBoss(dmg, mult);

        // Boss战连击数
        if([3,5,7,10].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
        combo++;comboTimer=2.0;comboWords.push(bw.text);
        if(comboWords.length>5) comboWords.shift();
        elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
        applyWeaponEffects();
      } else {
        // 非蓄力/暴露期点击无效
        particles.push(new DamageText(bw.x,bw.y-8,'无效','#888888'));
        for(let i=0;i<3;i++) particles.push(new HitParticle(bw.x,bw.y,'#888888','×'));
      }
      bw.alive=false;bw.targetAlpha=0;
      refreshWords();
      return;
    }
    // 普通敌人（走到这里必命中，消耗凝神倍击）
    if(nextAttackBoost){nextAttackBoost=false;skillState.ready=false;particles.push(new DamageText(bw.x,bw.y-14,'倍击!','#ffaa44'));}
    dealDamage(dmg,combo>=3);

    if([3,5,7,10].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
    combo++;comboTimer=2.0;comboWords.push(bw.text);
    if(comboWords.length>5) comboWords.shift();
    elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
    applyWeaponEffects();
    const cfg=getCatConfig('攻');
    for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#ff6644',bw.text));
    bw.alive=false;bw.targetAlpha=0;
    refreshWords();
    return;
  }
  if(bw.cat==='防'){
    const perWord = getShieldPerWord(playerArmor)
      + (typeof echoMod==='function'?echoMod('shieldPerWord'):0);
    const maxShield = getMaxShieldCap(playerArmor)
      + (typeof echoMod==='function'?echoMod('shieldMax'):0);
    const oldShield = hasShield ? shieldHP : 0;
    shieldHP = Math.min(oldShield + perWord, maxShield);
    hasShield = true;
    updatePlayerUI();Sound.defense();
    comboPenalty();
    const cfg=getCatConfig('防');
    for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#66aaff','□'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${shieldHP - oldShield}盾`,cfg?cfg.color:'#66aaff'));
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='符'){
    const t = typeof playerTalisman!=='undefined' ? playerTalisman : null;
    if(!t){ bw.alive=false; bw.targetAlpha=0; refreshWords(); return; }
    const hMin = getTalismanHeal(t, 'min');
    const hMax = getTalismanHeal(t, 'max');
    let healAmt = hMin + Math.floor(Math.random()*(hMax - hMin + 1));
    // 遗响·回复加成（healMult 可负，clamp 防负回复）
    if(typeof echoMod==='function'){
      healAmt = Math.floor(healAmt * Math.max(0.1, 1 + echoMod('healMult')) + echoMod('healFlat'));
    }
    playerHP=Math.min(playerMaxHP,playerHP+healAmt);updatePlayerUI();Sound.heal();
    for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,t.color,'+'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${healAmt}`,t.color));
    // 护身符：额外附加护盾
    if(t.shieldOnHeal){
      const maxShield = getMaxShieldCap((typeof playerArmor!=='undefined') ? playerArmor : null);
      const added = t.shieldOnHeal;
      shieldHP = Math.min(maxShield, (hasShield ? shieldHP : 0) + added);
      hasShield = true;
      updatePlayerUI();
    }
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='乱'){
    Sound.noise();Sound.stun();
    const tl = threatLevel || 0;
    // 惩罚随威胁升级：低威胁→轻, 高威胁→重
    const flashDur = tl <= 2 ? 500 : tl <= 5 ? 400 : 300;
    const comboLoss = tl <= 2 ? 2 : tl <= 5 ? 3 : 99; // 99 = full reset
    const hpLoss = tl <= 2 ? 0 : tl <= 5 ? (1+Math.floor(Math.random()*2)) : (2+Math.floor(Math.random()*3));

    document.getElementById('stun-overlay').classList.add('active');
    setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'), flashDur);

    if (comboLoss >= 99) { combo = 0; comboTimer = 0; comboWords = []; elComboDisplay.classList.remove('show'); }
    else comboPenalty(comboLoss);

    if (hpLoss > 0) {
      playerHP = Math.max(0, playerHP - hpLoss);
      updatePlayerUI();
      particles.push(new DamageText(bw.x, bw.y - 10, `-${hpLoss}`, '#ff4444'));
    }

    const label = bw._isFakeNoise ? '伪装!' : '混乱';
    particles.push(new DamageText(bw.x,bw.y,label,'#ff4444'));
    for(let i=0;i<5;i++) particles.push(new HitParticle(bw.x,bw.y,'#ff4444','×'));
    bw.alive=false;bw.targetAlpha=0;
    return;
  }
}

/** 应用威胁等级修正到战斗数值 */
function applyThreatModifiers(baseStats) {
  const t = threatLevel || 0;
  const dl = difficulty || 1;
  const diff = DIFFICULTY[dl];
  return {
    enemyHP:       Math.floor((baseStats.enemyHP || diff.enemyHP) * (1 + t * 0.06)),
    enemyDmg:      [
      Math.floor((baseStats.enemyDmg ? baseStats.enemyDmg[0] : diff.enemyDmg[0]) * (1 + t * 0.05) * (1 + (typeof echoMod==='function'?echoMod('enemyDmgUp'):0))),
      Math.floor((baseStats.enemyDmg ? baseStats.enemyDmg[1] : diff.enemyDmg[1]) * (1 + t * 0.05) * (1 + (typeof echoMod==='function'?echoMod('enemyDmgUp'):0)))
    ],
    enemyInterval: Math.max(2.5, (baseStats.enemyInterval || diff.enemyInterval) * (1 - t * 0.03)) + (typeof echoMod==='function'?echoMod('enemyIntervalUp'):0),
    noiseRate:     Math.min(0.45, (baseStats.noiseRate || diff.noiseRate) + t * 0.02),
    speed:         (baseStats.speed || diff.speed) + t * 0.06,
  };
}

/** 命中检测：点击是否落在某个敌人上（索敌用） */
function hitTestEnemies(mx, my) {
  for (let i = 0; i < enemyList.length; i++) {
    const e = enemyList[i];
    if (!e.alive) continue;
    const ent = e.entity;
    const r = (ent.size || 44) * 0.85;
    if (Math.abs(mx - ent.x) < r && Math.abs(my - ent.y) < r) return e;
  }
  return null;
}

/** 点击敌人切换索敌目标（默认锁最左；点击后锁定该敌） */
function switchTargetFromClick(cx, cy) {
  const e = hitTestEnemies(cx, cy);
  if (!e) return false;
  targetIndex = enemyList.indexOf(e);
  _focusTarget = null; _focusStacks = 0;
  syncEnemyCompat();
  updateEnemyUI();
  if (typeof Sound !== 'undefined' && Sound.uiOpen) Sound.uiOpen();
  particles.push(new DamageText(e.entity.x, e.entity.y - e.entity.size, '索敌', '#ffdd88'));
  return true;
}

/** 判断房间所在层段索引（0=浅层/1=中层/2=深层）— 供深层武器buff掉落判定 */
function getRoomSegmentIndex(layer) {
  if (typeof dynamicSegments !== 'undefined' && dynamicSegments && dynamicSegments.length) {
    for (let i = 0; i < dynamicSegments.length; i++) {
      const seg = dynamicSegments[i];
      if (layer >= seg.startLayer && layer <= seg.endLayer) return i;
    }
  }
  // 兜底：按模板近似（浅层≈10层，中层≈18，深层≈24）
  return layer >= 19 ? 2 : layer >= 11 ? 1 : 0;
}

/** 深层掉落：武器有概率天生携带 buff（仅深层「遗憾」段；融合只升数值不产生buff） */
function rollWeaponBuff(weaponKey, layer) {
  if (typeof weaponBuffs === 'undefined' || typeof WEAPON_BUFFS === 'undefined') return;
  if (weaponBuffs[weaponKey]) return; // 已有 buff 不覆盖
  const seg = getRoomSegmentIndex(layer || 1);
  if (seg < 2) return; // 仅深层段
  if (Math.random() < 0.4) {
    const keys = Object.keys(WEAPON_BUFFS);
    weaponBuffs[weaponKey] = keys[Math.floor(Math.random() * keys.length)];
    if (typeof saveGame === 'function') saveGame();
  }
}
