/* ═══════════════════ §M 房间内容系统 — 分发房间类型+内容处理 ═══════════════════
 *
 * startRoom(room)  — 进入房间，根据 type 初始化内容
 * checkRoomComplete() — 每帧检查房间目标是否达成
 * 依赖：map.js, battle.js, boss.js, dialogue.js, main.js
 */

let currentDiveRoom = null;  // 当前所在房间的数据
let roomDialogueQueue = [];  // 对话序列队列
let roomDialogueIndex = 0;
let roomCombatWaves = 0;     // 战斗房间剩余波次
let roomCombatAllDone = false; // 全部波次清完后的1秒延迟标记
let roomCombatWaveCleared = false;
let splitChildrenRemaining = 0; // 分裂残响：剩余分裂残片数
let roomTreasureSpawned = false;
let roomTreasureWord = null; // 金色装备字对象
let roomFakeWeapons = [];
let currentEventScenario = null;
let eventOptionsActive = false;
let eventOptionsSettled = false;
let eventOptions = [];
let eventResolved = false;
let eventMonsterDefeated = false;
let eventMonsterWaves = 0;
let eventMonsterWavePending = false;
let eventMonsterReward = null;
let eventStormReward = false; // 记忆风暴：胜利奖励碎片+遗响的标记
let restBubbleActive = false;

// ═══════════════ 入口 ═══════════════

function startRoom(room) {
  currentDiveRoom = room;
  // 记录抵达最深层（总结页统计）
  if (typeof maxLayerReached !== 'undefined') maxLayerReached = Math.max(maxLayerReached, room.layer || 1);
  roomDialogueQueue = [];
  roomDialogueIndex = 0;
  roomCombatWaves = 0;
  roomCombatWaveCleared = false;
  roomCombatAllDone = false;
  splitChildrenRemaining = 0;   // 分裂残响：剩余分裂残片数
  enemyProjectiles = [];        // 清空上一房间的普通弹幕
  roomTreasureSpawned = false;
  roomTreasureWord = null;
  roomFakeWeapons = [];
  eventOptionsActive = false;
  eventOptionsSettled = false;
  eventOptions = [];
  eventResolved = false; // 防止advanceRoomDialogue重复生成选项
  restBubbleActive = false; // 离开静流房间时关闭泡泡
  eventMonsterDefeated = false;
  eventMonsterWaves = 0;
  eventMonsterWavePending = false;
  eventMonsterReward = null;
  eventStormReward = false;
  currentEventScenario = null;
  battleWords = typeof battleWords !== 'undefined' ? [] : battleWords;
  if (typeof clearEnemyList === 'function') clearEnemyList();
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  // 防御：重置敌人HP防止上一房间残留值（具体房间处理函数会覆盖）
  if (typeof enemyHP !== 'undefined') enemyHP = enemyMaxHP = 999;
  if (typeof enemyTimer !== 'undefined') enemyTimer = enemyInterval = 99;

  // 默认隐藏战斗UI + 重置敌人名称/HP条
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';
  const enemyName = document.getElementById('enemy-name');
  if (enemyName) enemyName.textContent = '';
  const enemyHPFill = document.getElementById('enemy-hp-fill');
  if (enemyHPFill) enemyHPFill.style.background = '';

  switch (room.type) {
    case 'start':     startStartRoom(room); break;
    case 'combat':    startCombatRoom(room); break;
    case 'rest':      startRestRoom(room); break;
    case 'treasure':  startTreasureRoom(room); break;
    case 'event':     startEventRoom(room); break;
    case 'boss':      startBossRoom(room); break;
    case 'safe_house':startSafeHouseRoom(room); break;
    case 'shop':      startShopRoom(room); break;
  }
}

/** 每帧由 main.js 调用，返回 true 表示房间完成 */
function checkRoomComplete() {
  if (!currentDiveRoom) return false;

  switch (currentDiveRoom.type) {
    case 'start':
      return !Dialogue.active && roomDialogueIndex >= roomDialogueQueue.length;
    case 'combat':
      // 所有波次清完 + 1秒等待 + 不在战斗中
      return roomCombatWaves <= 0 && enemyHP <= 0 && roomCombatAllDone &&
             Tutorial.phase === PHASE.BATTLE && !Dialogue.active;
    case 'rest':
      return !Dialogue.active && roomDialogueIndex >= roomDialogueQueue.length;
    case 'treasure':
      return roomTreasureSpawned && !roomTreasureWord && !Dialogue.active;
    case 'event':
      if (eventOptionsActive || equipPrompt) return false;
      // 怪物战中 或 波次等待中 → 未完成
      if (eventResolved && !eventMonsterDefeated && (enemyHP > 0 || eventMonsterWavePending || eventMonsterWaves > 0)) return false;
      return !Dialogue.active && roomDialogueIndex >= roomDialogueQueue.length;
    case 'boss':
      // 融合演出中不触发正常完成（由融合DONE逻辑处理）
      if (typeof fusionActive !== 'undefined' && fusionActive) return false;
      // Boss战结束（战败时Tutorial.phase为DEFEAT，不触发完成，由战败流程处理）
      return !bossActive && !Dialogue.active && (typeof Tutorial === 'undefined' || Tutorial.phase !== 'defeat');
    case 'shop':
      return !shopOpen && !Dialogue.active;
    case 'safe_house':
      return !Dialogue.active && roomDialogueIndex >= roomDialogueQueue.length;
    default:
      return true;
  }
}

// ═══════════════ 房间实现 ═══════════════

/** 出发 — 零解释潜航 */
function startStartRoom(room) {
  roomDialogueQueue = [
    { mode:'float', speaker:'零',
      text:'之前深海的信号……我在数据库里找到了匹配。它来自一个叫「遗」的存在。比憾强得多。' },
    { mode:'float', speaker:'零',
      text:'但我们必须去。那个信号和我——（停顿）和深渊的异常有关。' },
    { mode:'plain',
      text:'（零展开了一幅意识海图。浅层区域有几个节点在微微发光。）' },
    { mode:'float', speaker:'零',
      text:'这是意识海图。每一个节点代表一个可以进入的意识场域。' },
    { mode:'float', speaker:'零',
      text:'有些地方有噪点需要清理，有些地方藏着前人留下的东西。' },
    { mode:'float', speaker:'零',
      text:'路径由你选择。但记住——在这里，每次选择都可能改变一切。' },
    { mode:'float', speaker:'零',
      text:'准备好了就出发。我会在后方看着你。' },
  ];
  playRoomDialogue();
}

/** 计算战斗房敌人属性（难度基础 × 房间倍率 × 威胁修正），第一波/后续波/重试共用 */
function buildCombatStats(room) {
  const baseDmg = (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].enemyDmg : [5,8];
  const dmgMult = room.enemyDmgMult || 1;
  const baseStats = {
    enemyHP: room.enemyHP || 40,
    enemyInterval: room.enemyInterval || 6.0,
    enemyDmg: [Math.round(baseDmg[0] * dmgMult), Math.round(baseDmg[1] * dmgMult)],
    noiseRate: (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].noiseRate : 0.15,
    speed: (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].speed : 0.8,
  };
  return (typeof applyThreatModifiers === 'function') ? applyThreatModifiers(baseStats) : baseStats;
}

/** 战斗 — 噪点波次 */
function startCombatRoom(room) {
  const waves = room.waves || 3;
  const modified = buildCombatStats(room);
  const hp = modified.enemyHP;
  const interval = modified.enemyInterval;
  const hard = room.hardMode || false;

  // 图鉴：记录敌人遭遇（按攻击类型区分）
  if (typeof registerEnemy === 'function') {
    const ENEMY_REG_MAP = { bash:'noise_shard', volley:'noise_volley', rain:'noise_rain', track:'noise_track', shield:'noise_shield', split:'noise_split' };
    registerEnemy(room.enemyType ? (ENEMY_REG_MAP[room.enemyType] || 'noise_shard') : (hard ? 'strengthened_noise' : 'noise_shard'));
  }

  roomCombatWaves = waves;

  // 设置战斗参数
  if (typeof enemyMaxHP !== 'undefined') {
    enemyHP = enemyMaxHP = hp;
  }
  if (typeof enemyInterval !== 'undefined') {
    enemyTimer = enemyInterval = interval;
  }
  if (typeof updateEnemyUI === 'function') updateEnemyUI();
  // 重置敌人名称和HP条样式 + 生成敌人编队（多敌+形状排列）
  const enemyName = document.getElementById('enemy-name');
  if (enemyName) enemyName.textContent = room.label || (hard ? '强化噪点' : '噪点');
  const enemyHPFill = document.getElementById('enemy-hp-fill');
  if (enemyHPFill) enemyHPFill.style.background = '';
  if (typeof spawnEnemyFormation === 'function') {
    const formationOpts = { layer: room.layer || 1, formation: pickFormation(1, room.layer || 1) };
    // 单敌房：固定 1 个、居中排列（放 split 分支前，split 房不带 count 字段不受影响）
    if (room.count === 1) { formationOpts.count = 1; formationOpts.formation = 'line'; }
    // 分裂型第一轮：1 个，血/伤 ×1（后续轮次由 startNextCombatWave 递增）
    if (room.enemyType === 'split' && typeof splitWaveParams === 'function') {
      const sp = splitWaveParams(1);
      formationOpts.count = sp.count;
      formationOpts.hp = hp;
      formationOpts.splitLevel = sp.splitLevel;
    }
    spawnEnemyFormation(hard, room.enemyType, formationOpts);
  } else if (typeof spawnEnemyEntity === 'function') {
    spawnEnemyEntity(hard, room.enemyType);
  }

  // 进入战斗阶段
  if (typeof Tutorial !== 'undefined') {
    Tutorial.enterPhase(PHASE.BATTLE);
  }
  // BGM: 战斗音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('battle', 1.2);
  // 显示敌人UI
  const enemyZone = document.getElementById('enemy-zone');
  if (enemyZone) enemyZone.style.opacity = '1';
  const stageHint = document.getElementById('stage-hint');
  if (stageHint) {
    stageHint.style.opacity = '1';
    stageHint.textContent = room.label + (hard ? ' · 强化' : '');
  }

  // 初始文字
  if (typeof balanceWords === 'function') balanceWords();

  // 波次对话（第一章肉鸽精简：直接开打不播对白，stage-hint 已提示；序章保留零引导）
  const hardText = hard ? '这里的噪点更加狂暴。别放松。' : '';
  const inCh1 = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  roomDialogueQueue = inCh1 ? [] : [
    { mode:'float', speaker:'零', text:`${room.label}。${room.desc}一共${waves}波，集中精神。${hardText}` },
  ];
  playRoomDialogue();
}

/** 检查战斗波次：场上敌人全灭后生成下一波 */
function checkCombatWave() {
  if (!currentDiveRoom || currentDiveRoom.type !== 'combat') return;
  if (roomCombatWaves <= 0) return;

  // 场上敌人全灭（多敌编队）→ 标记本波清完
  const allDead = (typeof enemyList !== 'undefined') && enemyList.length > 0 && enemyList.every(e => !e.alive);
  if (allDead && !roomCombatWaveCleared) {
    roomCombatWaveCleared = true;

    // ⚠️ 分裂型敌人：不再"主敌分裂成残片"，改为按波次递增生成（splitWaveParams 在 startNextCombatWave 处理）
    roomCombatWaves--;

    if (roomCombatWaves > 0) {
      // 延迟刷新下一波
      setTimeout(() => {
        if (!currentDiveRoom || currentDiveRoom.type !== 'combat') return;
        startNextCombatWave();
        roomCombatWaveCleared = false;
      }, 1000);
    } else {
      // 全部波次完成 — 1秒等待后再进行奖励/返回判定
      roomCombatAllDone = false;
      // 碎片奖励
      if (typeof grantShards === 'function') {
        grantShards(SHARD_REWARDS.COMBAT_CLEAR, W*0.5, H*0.35);
      }
      // 冻结敌人，防止0血怪物继续攻击
      enemyTimer = enemyInterval = 999;
      document.getElementById('enemy-zone').style.opacity = '0';
      setTimeout(() => { roomCombatAllDone = true; }, 1000);
      // 胜利对话（第一章肉鸽零不出现 → 男主独白）
      setTimeout(() => {
        roomDialogueIndex = 0;
        if (typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap) {
          // 第一章：战斗结束不播对白，直接回地图
          roomDialogueQueue = [];
        } else {
          roomDialogueQueue = [
            { mode:'float', speaker:'零',
              text:'干净利落。你的战斗本能比任何训练生都强——就好像已经做过千百次。' },
            { mode:'plain', text:'（主角低头看着自己的手。确实，这些动作完全不需要思考。）' },
          ];
          if (currentDiveRoom && currentDiveRoom.hardMode) {
            roomDialogueQueue.push(
              { mode:'float', speaker:'零', text:'越往深处，噪点越强。前面应该快到目标位置了。' }
            );
          }
        }
        playRoomDialogue();
      }, 800);
    }
  }
}

/** 生成下一波敌人编队 */
/** 分裂残响波次参数：第N轮 2^(N-1) 个，血/伤 ×0.5^(N-1) */
function splitWaveParams(waveNo) {
  return {
    count: Math.pow(2, waveNo - 1),   // 1 → 2 → 4
    mult: Math.pow(0.5, waveNo - 1),  // 1 → 0.5 → 0.25
    splitLevel: waveNo,               // 1/2/3（伤害递减用）
  };
}

function startNextCombatWave() {
  const modified = buildCombatStats(currentDiveRoom);
  const layer = currentDiveRoom.layer || 1;
  const waveNo = currentDiveRoom.waves - roomCombatWaves + 1;
  let enemyHp = modified.enemyHP + Math.floor(Math.random() * 10);
  const opts = { layer: layer, formation: pickFormation(waveNo, layer) };
  // 单敌房：固定 1 个、居中排列（放 split 分支前）
  if (currentDiveRoom.count === 1) { opts.count = 1; opts.formation = 'line'; }
  // 分裂型：按波次递增 1→2→4，血量逐轮减半
  if (currentDiveRoom.enemyType === 'split') {
    const sp = splitWaveParams(waveNo);
    opts.count = sp.count;
    opts.hp = Math.floor(modified.enemyHP * sp.mult) + Math.floor(Math.random() * 5);
    opts.splitLevel = sp.splitLevel;
    enemyHp = opts.hp;
  }
  enemyHP = enemyMaxHP = enemyHp;
  enemyTimer = enemyInterval = modified.enemyInterval;
  if (typeof updateEnemyUI === 'function') updateEnemyUI();
  if (typeof balanceWords === 'function') balanceWords();
  if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);
  if (typeof spawnEnemyFormation === 'function') {
    spawnEnemyFormation(currentDiveRoom.hardMode, currentDiveRoom.enemyType, opts);
  } else if (typeof spawnEnemyEntity === 'function') {
    spawnEnemyEntity(currentDiveRoom.hardMode, currentDiveRoom.enemyType);
  }
  // 波次提示
  if (typeof particles !== 'undefined' && typeof W !== 'undefined' && typeof H !== 'undefined') {
    for (let i = 0; i < 12; i++) {
      particles.push(new DamageText(W * 0.5, H * 0.3, `第${waveNo}波`, '#ff8866'));
    }
  }
  if (typeof Sound !== 'undefined') Sound.anomaly();
}

/** 玩家死亡重试：重建当前波次编队（battle.js handlePlayerDeath 调用） */
function respawnCurrentWave() {
  if (!currentDiveRoom || currentDiveRoom.type !== 'combat') return;
  const modified = buildCombatStats(currentDiveRoom);
  enemyHP = enemyMaxHP = modified.enemyHP;
  enemyTimer = enemyInterval = modified.enemyInterval;
  updateEnemyUI();
  balanceWords();
  const layer = currentDiveRoom.layer || 1;
  const waveNo = currentDiveRoom.waves - roomCombatWaves + 1;
  if (typeof spawnEnemyFormation === 'function') {
    const opts = { layer: layer, formation: pickFormation(waveNo, layer) };
    if (currentDiveRoom.count === 1) { opts.count = 1; opts.formation = 'line'; }
    spawnEnemyFormation(currentDiveRoom.hardMode, currentDiveRoom.enemyType, opts);
  } else if (typeof spawnEnemyEntity === 'function') {
    spawnEnemyEntity(currentDiveRoom.hardMode, currentDiveRoom.enemyType);
  }
}

/** 静流 — 满血 + 零的对话 + 绿色治愈泡泡 */
function startRestRoom(room) {
  // BGM: 温暖音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('safehouse', 1.5);

  // 重置威胁等级为基础值
  if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined') {
    threatLevel = THREAT.BASE[difficulty] || 2;
  }

  // 满血
  if (typeof playerHP !== 'undefined') {
    playerHP = playerMaxHP || 100;
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }
  // 初始治愈粒子
  if (typeof particles !== 'undefined') {
    for (let i = 0; i < 30; i++) {
      const p = new HitParticle(W * 0.5 + (Math.random() - 0.5) * 200, H * 0.5 + (Math.random() - 0.5) * 150, '#44dd88', '·');
      p.vx *= 0.3; p.vy *= 0.3; p.size = 4 + Math.random() * 10; p.life = 40 + Math.random() * 50;
      p.gravity = -0.02;
      particles.push(p);
    }
  }
  // 激活治愈泡泡生成器
  restBubbleActive = true;
  restBubbleTimer = 0;

  const inCh1 = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  roomDialogueQueue = inCh1 ? [
    { mode:'plain', text:'（静流。暖光裹住全身，意识在缓缓回满。）' },
  ] : [
    { mode:'float', speaker:'零',
      text:'意识之海里偶尔能遇到这种「静流」——纯净的、未被污染的信息流。像深海中的暖流。歇一会儿。' },
    { mode:'plain', text:'（暖绿色的光芒安静地笼罩四周。零的粒子在柔光中微微荡漾，像水下的星光。）' },
    { mode:'plain', speaker:'主角', text:'零，你在这里待了多久？' },
    { mode:'whisper', speaker:'零', text:'……十年。' },
    { mode:'plain', speaker:'主角', text:'一个人？' },
    { mode:'float', speaker:'零', text:'（偏过头）不是还有你吗。虽然是个什么都不记得的菜鸟。' },
    { mode:'float', speaker:'零', text:'……走吧。时间不多了。' },
  ];
  playRoomDialogue();
}

// 治愈泡泡控制
let restBubbleTimer = 0;
const HEALING_CHARS = ['安','复','静','暖','宁','息','生','润','养','补'];

/** 在静流房间中生成治愈泡泡（由 main.js 每帧调用） */
function updateRestBubbles(dt) {
  if (!restBubbleActive) return;
  restBubbleTimer += dt;
  if (restBubbleTimer > 0.30) {  // 每0.3秒一个泡泡
    restBubbleTimer = 0;
    const char = HEALING_CHARS[Math.floor(Math.random() * HEALING_CHARS.length)];
    const x = Math.random() * W * 0.7 + W * 0.15;
    const p = new HitParticle(x, H + 20, '#66eeaa', char);
    p.vx = (Math.random() - 0.5) * 0.4;
    p.vy = -(1.2 + Math.random() * 2.5);  // 缓缓上浮
    p.size = 14 + Math.random() * 18;
    p.life = 80 + Math.random() * 100;     // 长寿命
    p.gravity = 0.005;                      // 极轻微重力，保持漂浮感
    p._bubbleWobble = Math.random() * Math.PI * 2;
    p._bubbleFreq = 0.3 + Math.random() * 0.5;
    p._bubbleAmp = 0.3 + Math.random() * 0.6;
    particles.push(p);
  }
  // 给所有存活泡泡加微弱的正弦漂移
  for (let p of particles) {
    if (p._bubbleWobble !== undefined) {
      p._bubbleWobble += dt * p._bubbleFreq;
      p.vx += Math.sin(p._bubbleWobble) * p._bubbleAmp * dt;
      p.vx *= 0.98; // 阻尼防止无限加速
    }
  }
}

// 假装备名池
const FAKE_WEAPON_NAMES = ['碎梦','焚世','霜华','星陨','幽光','断念','残月','暗潮',
  '裂空','焚野','霜语','星落','幽刃','断空','残影','暗炎','裂风','焚星','霜痕'];

/** 遗落装备 — 残响之影 + 真假装备辨识 */
function startTreasureRoom(room) {
  // 图鉴：记录残响之影
  if (typeof registerEnemy === 'function') registerEnemy('echo_shadow');
  // 残响之影：无敌，对话期间不攻击
  enemyHP = enemyMaxHP = -1;
  enemyTimer = enemyInterval = 99; // 对话结束前冻结
  if (typeof updateEnemyUI === 'function') updateEnemyUI();
  if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);

  // 敌人UI
  const enemyZone = document.getElementById('enemy-zone');
  if (enemyZone) enemyZone.style.opacity = '1';
  const enemyName = document.getElementById('enemy-name');
  if (enemyName) enemyName.textContent = '残响之影 · 不可击杀';
  const enemyHPFill = document.getElementById('enemy-hp-fill');
  if (enemyHPFill) { enemyHPFill.style.width = '100%'; enemyHPFill.style.background = 'rgba(180,150,180,0.5)'; }
  const stageHint = document.getElementById('stage-hint');
  if (stageHint) { stageHint.style.opacity = '1'; stageHint.textContent = '对话中……'; }

  // 不生成战斗文字（此房间无攻/防/符字）

  const inCh1 = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  roomDialogueQueue = inCh1 ? [
    { mode:'plain', text:'（前任潜航者的遗物，被残响之影守护着。它会模仿词元外观——找到真货，拿了就走。）' },
  ] : [
    { mode:'tremble', speaker:'零',
      text:'那是前任潜航者留下的词元结晶——但这股压迫感……是残响之影。' },
    { mode:'tremble', speaker:'零',
      text:'死在这里的潜航者太多了。执念凝聚成了波纹冲击。打不散的。' },
    { mode:'float', speaker:'零',
      text:'残响会模仿词元的外观。别被假货骗了。找到真正的装备，拿了就跑。' },
  ];
  playRoomDialogue();
}

/** 生成真假装备字（对话结束后调用，spawnTreasureWord 必须先调用） */
function spawnFakeWeapons() {
  // roomTreasureSpawned 由 spawnTreasureWord 设置，这里不重复检查
  if (!roomTreasureWord) return; // 真装备必须已创建

  const realName = roomTreasureWord.itemData.name;
  const cx = typeof W !== 'undefined' ? W * 0.5 : 600;
  const cy = typeof H !== 'undefined' ? H * 0.48 : 400;

  // 假装备字
  const usedNames = new Set([realName]);
  const fakeCount = 6 + Math.floor(Math.random() * 4); // 6-9个假货
  for (let i = 0; i < fakeCount; i++) {
    let name;
    do {
      name = FAKE_WEAPON_NAMES[Math.floor(Math.random() * FAKE_WEAPON_NAMES.length)];
    } while (usedNames.has(name) && usedNames.size < FAKE_WEAPON_NAMES.length);
    usedNames.add(name);

    const fake = {
      x: cx + (Math.random() - 0.5) * W * 0.7,
      y: cy + (Math.random() - 0.5) * H * 0.45,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.6,
      size: 18 + Math.random() * 6, alpha: 0.65, targetAlpha: 0.65,
      phase: Math.random() * Math.PI * 2, alive: true, cooldown: 60,
      text: name, isFake: true,
      update() {
        if (this.cooldown > 0) this.cooldown--;
        this.phase += 0.02;
        this.x += this.vx; this.y += this.vy + Math.sin(this.phase) * 0.4;
        const m = 60;
        if (this.x < m) { this.x = m; this.vx *= -1; }
        if (this.x > W - m) { this.x = W - m; this.vx *= -1; }
        if (this.y < m + 80) { this.y = m + 80; this.vy *= -1; }
        if (this.y > H - m - 80) { this.y = H - m - 80; this.vy *= -1; }
      },
      draw(ctx) {
        if (this.alpha < 0.03) return;
        ctx.save();
        ctx.globalAlpha = this.alpha * 0.7;
        ctx.fillStyle = '#ffdd44';  // 与真装备同色，靠字名辨别真伪
        ctx.font = `${this.size}px "Noto Serif SC","SimSun",serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
      },
      hitTest(mx, my) {
        if (this.cooldown > 0) return false;
        const w = this.text.length * this.size * 0.55;
        return mx > this.x - w/2 && mx < this.x + w/2 && my > this.y - this.size/2 && my < this.y + this.size/2;
      },
      onClick() {
        if (typeof Sound !== 'undefined') Sound.noise();
        if (typeof particles !== 'undefined') {
          particles.push(new DamageText(this.x, this.y - 8, '赝品', '#998899'));
          for (let i = 0; i < 5; i++) particles.push(new HitParticle(this.x, this.y, '#998899', '×'));
        }
        if (typeof shakeAmount !== 'undefined') shakeAmount = Math.max(shakeAmount, 3);
        this.alive = false;
      },
    };
    roomFakeWeapons.push(fake);
  }

  // 真装备：比假货快2-3倍，更难追踪
  roomTreasureWord.x = cx + (Math.random() - 0.5) * W * 0.5;
  roomTreasureWord.y = cy + (Math.random() - 0.5) * H * 0.3;
  roomTreasureWord.vx = (Math.random() - 0.5) * 2.2;
  roomTreasureWord.vy = (Math.random() - 0.5) * 1.6;
  roomTreasureWord.cooldown = 50;

  // 激活残响攻击
  enemyTimer = enemyInterval = 2.5;
  const stageHint = document.getElementById('stage-hint');
  if (stageHint) stageHint.textContent = '找出真正的装备！不宜久留！';
}

// 假装备池（roomFakeWeapons 已在文件顶部声明）

// 装备切换提示
let equipPrompt = null; // { itemType, itemKey, itemData, x, y, options }

/** 显示装备切换提示（暂停游戏，二选一） */
/** 是否已拥有某装备（决定拾取提示走「融合强化」还是「替换/保留」） */
function isOwnedEquip(itemType, itemKey) {
  if (itemType === 'weapon') {
    if (typeof unlockedWeapons !== 'undefined' && unlockedWeapons.has(itemKey)) return true;
    return playerWeapon && playerWeapon.id === itemKey;
  }
  if (itemType === 'armor') {
    if (typeof unlockedArmors !== 'undefined' && unlockedArmors.has(itemKey)) return true;
    return playerArmor && playerArmor.id === itemKey;
  }
  if (itemType === 'talisman') {
    if (typeof unlockedTalismans !== 'undefined' && unlockedTalismans.has(itemKey)) return true;
    return playerTalisman && playerTalisman.id === itemKey;
  }
  return false;
}

function showEquipPrompt(itemType, itemKey, itemData) {
  // 图鉴：遇到装备即记录（幂等；商店购买另在 shop.js equipItem 记录）
  if (typeof registerEquipment === 'function') registerEquipment(itemKey);
  const owned = isOwnedEquip(itemType, itemKey);
  equipPrompt = {
    itemType, itemKey, itemData,
    x: W*0.5, y: H*0.55,
    options: owned ? [
      { text:'融合强化', x: W*0.38, y: H*0.62, action:'fuse' },
      { text:'放弃',     x: W*0.62, y: H*0.62, action:'keep' },
    ] : [
      { text:'替换装备', x: W*0.38, y: H*0.62, action:'replace' },
      { text:'保留原装备', x: W*0.62, y: H*0.62, action:'keep' },
    ],
    settled: true,
  };
}

function hideEquipPrompt() {
  equipPrompt = null;
}

function drawEquipPrompt(ctx) {
  if (!equipPrompt) return;
  const p = equipPrompt;
  const now = performance.now();
  const pulse = 0.6 + 0.4 * Math.sin(now * 0.003);

  // 半透明遮罩
  ctx.save();
  ctx.fillStyle = 'rgba(2,2,20,0.7)';
  ctx.fillRect(0, 0, W, H);

  // 装备名
  ctx.fillStyle = '#ffdd44';
  ctx.shadowColor = 'rgba(255,200,80,0.6)';
  ctx.shadowBlur = 16;
  ctx.font = '24px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.itemData.name, p.x, p.y - 20);
  ctx.shadowBlur = 0;

  // 描述
  ctx.fillStyle = 'rgba(200,200,220,0.6)';
  ctx.font = '12px "Noto Serif SC","SimSun",serif';
  ctx.fillText(p.itemData.desc || '', p.x, p.y + 8);

  // 选项
  p.options.forEach(opt => {
    const isHover = opt.hovered;
    ctx.fillStyle = isHover ? '#ffdd88' : 'rgba(200,200,220,0.7)';
    if (isHover) {
      ctx.shadowColor = 'rgba(255,200,120,0.5)';
      ctx.shadowBlur = 10;
    }
    ctx.font = `${isHover ? 19 : 17}px "Noto Serif SC","SimSun",serif`;
    ctx.fillText(opt.text, opt.x, opt.y);
    ctx.shadowBlur = 0;
  });

  // 提示
  ctx.fillStyle = `rgba(180,190,210,${0.3 + 0.2 * pulse})`;
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.fillText('点击选择', p.x, p.y + 44);

  ctx.restore();
}

function hitTestEquipPrompt(mx, my) {
  if (!equipPrompt) return null;
  for (let opt of equipPrompt.options) {
    opt.hovered = false;
    const w = opt.text.length * 18;
    const h = 28;
    if (mx > opt.x - w/2 && mx < opt.x + w/2 && my > opt.y - h/2 && my < opt.y + h/2) {
      opt.hovered = true;
      return opt;
    }
  }
  return null;
}

function handleEquipPromptClick(opt) {
  if (!equipPrompt) return;
  if (opt.action === 'replace') {
    Sound.itemGet();
    const p = equipPrompt;
    // 装备获得计数（熟练度/开局池解锁）
    if (p.itemType !== 'skill' && typeof runEquipGains !== 'undefined' && runEquipGains) {
      runEquipGains[p.itemKey] = (runEquipGains[p.itemKey] || 0) + 1;
    }
    if (p.itemType === 'weapon') {
      if (typeof playerWeapon !== 'undefined') playerWeapon = p.itemData;
      if (typeof unlockedWeapons !== 'undefined') unlockedWeapons.add(p.itemKey);
    } else if (p.itemType === 'armor') {
      if (typeof playerArmor !== 'undefined') {
        playerArmor = p.itemData;
        if (typeof unlockedArmors !== 'undefined') unlockedArmors.add(p.itemKey);
        if (typeof playerDefense !== 'undefined') playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : (playerArmor.defense || 0);
      }
    } else if (p.itemType === 'talisman') {
      if (typeof playerTalisman !== 'undefined') playerTalisman = p.itemData;
      if (typeof unlockedTalismans !== 'undefined') unlockedTalismans.add(p.itemKey);
    }
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof particles !== 'undefined') {
      for (let i = 0; i < 15; i++) particles.push(new HitParticle(equipPrompt.x, equipPrompt.y, '#ffdd44', '◆'));
      particles.push(new DamageText(equipPrompt.x, equipPrompt.y - 10, `装备: ${p.itemData.name}`, '#ffdd44'));
    }
  } else if (opt.action === 'fuse') {
    doFusion(equipPrompt);
  } else {
    if (typeof particles !== 'undefined') {
      particles.push(new DamageText(equipPrompt.x, equipPrompt.y, '已丢弃', '#888888'));
    }
  }
  hideEquipPrompt();
  // 继续房间流程
  if (roomTreasureWord) roomTreasureWord = null;
  const inCh1Equip = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  const plainLine = opt.action === 'fuse'
    ? '（相同的词元相互吸引。装备发生了微妙的变化。）'
    : (opt.action === 'replace' ? '（换上装备。词元在指尖微微发烫。）' : '（还是原来的顺手。收好，继续走。）');
  const zeroLine = opt.action === 'fuse'
    ? '融合的痕迹……很特别。'
    : (opt.action === 'replace' ? '不错的选择。继续前进吧。' : '也好。适合自己的才是最好的。');
  roomDialogueQueue = inCh1Equip ? [
    { mode:'plain', text: plainLine },
  ] : [
    { mode:'float', speaker:'零', text: zeroLine },
  ];
  roomDialogueIndex = 0;
  playRoomDialogue();
}

/** 装备融合：同名拾取 → 有概率升等级（基础成功率 + 局外 fusionLuck） */
function doFusion(p) {
  const lv = (typeof getEquipLevel === 'function') ? getEquipLevel(p.itemKey) : 1;
  const maxLv = (typeof EQUIP_FUSION !== 'undefined') ? EQUIP_FUSION.MAX_LEVEL : 5;
  if (lv >= maxLv) {
    // 已满级 → 拾取物炼化为碎片
    if (typeof grantShards === 'function') grantShards(30, p.x, p.y);
    particles.push(new DamageText(p.x, p.y - 20, '已满级 · 炼化为碎片', '#ffcc44'));
    if (typeof Sound !== 'undefined') Sound.itemGet();
    return;
  }
  let chance = (typeof EQUIP_FUSION !== 'undefined') ? EQUIP_FUSION.BASE_SUCCESS : 0.45;
  if (typeof getFusionLuck === 'function') chance += getFusionLuck();
  if (Math.random() < chance) {
    // 融合成功：装备等级+1
    if (typeof equipmentLevels !== 'undefined') {
      equipmentLevels[p.itemKey] = lv + 1;
      // 融合强化也算一次获得（熟练度/开局池解锁）
      if (typeof runEquipGains !== 'undefined' && runEquipGains) {
        runEquipGains[p.itemKey] = (runEquipGains[p.itemKey] || 0) + 1;
      }
      if (p.itemType === 'armor' && playerArmor && playerArmor.id === p.itemKey && typeof playerDefense !== 'undefined') {
        playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : (playerArmor.defense || 0);
      }
      if (typeof updatePlayerUI === 'function') updatePlayerUI();
    }
    particles.push(new DamageText(p.x, p.y - 20, `融合成功 · ${p.itemData.name} Lv.${lv + 1}`, '#ffdd44'));
    for (let i = 0; i < 20; i++) particles.push(new HitParticle(p.x, p.y, '#ffdd44', '✦'));
    if (typeof Sound !== 'undefined') Sound.boost();
  } else {
    // 融合失败：拾取物消散，原装备/等级不变
    particles.push(new DamageText(p.x, p.y - 20, '融合失败 · 拾取物消散', '#888888'));
    for (let i = 0; i < 12; i++) particles.push(new HitParticle(p.x, p.y, '#888888', '×'));
    if (typeof Sound !== 'undefined') Sound.stun();
  }
}

/** 宝物房间每帧检测 */
function checkTreasureRoom() {
  if (!currentDiveRoom || currentDiveRoom.type !== 'treasure') return;
  // 残响之影无敌 → HP条紫色脉动
  if (enemyHP === -1) {
    const hpFill = document.getElementById('enemy-hp-fill');
    if (hpFill) {
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() * 0.004);
      hpFill.style.width = '100%';
      hpFill.style.background = `rgba(180,140,200,${0.4 + 0.2 * pulse})`;
    }
  }
  // 更新假装备
  roomFakeWeapons.forEach(f => { if (f.alive) f.update(); });
  roomFakeWeapons = roomFakeWeapons.filter(f => f.alive);
}

/** 生成金色装备字（对话结束后调用；12%概率为遗响） */
function spawnTreasureWord() {
  if (roomTreasureSpawned) return;
  roomTreasureSpawned = true;

  // ── 遗响·宝箱概率出（12%）──
  if (typeof ECHO_DEFS !== 'undefined' && typeof echoInventory !== 'undefined' && Math.random() < 0.12) {
    const pool = Object.keys(ECHO_DEFS).filter(k => !echoInventory.includes(k));
    if (pool.length) {
      const ekey = pool[Math.floor(Math.random() * pool.length)];
      const edef = ECHO_DEFS[ekey];
      const rr = ECHO_RARITY[edef.rarity] || ECHO_RARITY.common;
      buildTreasureWord({ itemType:'echo', itemKey:ekey, itemData:edef, color:rr.color, glow:rr.color });
      spawnFakeWeapons();
      return;
    }
  }

  // 随机选一件武器或防具（非初始装备）
  const wpnKeys = Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush');
  const armKeys = Object.keys(EQUIPMENT.armors).filter(k => k !== 'thin_silk');
  const talKeys = Object.keys(EQUIPMENT.talismans || {});
  const allKeys = [...wpnKeys.map(k => ({ key:k, type:'weapon' })), ...armKeys.map(k => ({ key:k, type:'armor' })), ...talKeys.map(k => ({ key:k, type:'talisman' }))];
  const pick = allKeys[Math.floor(Math.random() * allKeys.length)];

  const item = pick.type === 'weapon'
    ? EQUIPMENT.weapons[pick.key]
    : pick.type === 'talisman'
      ? EQUIPMENT.talismans[pick.key]
      : EQUIPMENT.armors[pick.key];
  // ⚠️ 深层掉落：武器有概率天生携带 buff（仅深层「遗憾」段，融合不产生）
  if (pick.type === 'weapon' && typeof rollWeaponBuff === 'function') {
    rollWeaponBuff(pick.key, (currentDiveRoom && currentDiveRoom.layer) || 1);
  }
  buildTreasureWord({ itemType:pick.type, itemKey:pick.key, itemData:item, color:'#ffdd44', glow:'#ccaa22' });
}

/** 构造金色装备/遗响字（共用模板；遗响走 collect 直接纳入） */
function buildTreasureWord(cfg) {
  const cx = typeof W !== 'undefined' ? W * 0.5 : 600;
  const cy = typeof H !== 'undefined' ? H * 0.45 : 400;

  roomTreasureWord = {
    x: cx, y: cy - 60,
    vx: (Math.random() - 0.5) * 0.6, vy: -0.2,
    size: 26, alpha: 0.9, targetAlpha: 0.9,
    phase: Math.random() * Math.PI * 2, alive: true,
    hovered: false, glowExtra: 0, cooldown: 80, // 短暂冷却防止误触
    cat: 'treasure',
    itemType: cfg.itemType,
    itemKey: cfg.itemKey,
    itemData: cfg.itemData,
    text: cfg.itemData.name,
    color: cfg.color,
    glow: cfg.glow,
    update() {
      if (this.cooldown > 0) this.cooldown--;
      this.phase += 0.025;
      this.x += this.vx;
      this.y += this.vy + Math.sin(this.phase) * 0.3;
      const m = 80;
      if (this.x < m) { this.x = m; this.vx *= -1; }
      if (this.x > (typeof W !== 'undefined' ? W - m : 1120)) { this.x = (typeof W !== 'undefined' ? W - m : 1120); this.vx *= -1; }
      if (this.y < m + 80) { this.y = m + 80; this.vy *= -1; }
      if (this.y > (typeof H !== 'undefined' ? H - m - 80 : 520)) { this.y = (typeof H !== 'undefined' ? H - m - 80 : 520); this.vy *= -1; }
      this.alpha += (this.targetAlpha - this.alpha) * 0.1;
    },
    draw(ctx) {
      if (this.alpha < 0.03) return;
      const pulse = 0.6 + 0.4 * Math.sin(this.phase * 2);
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.alpha);
      ctx.shadowColor = this.glow;
      ctx.shadowBlur = 14 + 8 * pulse;
      ctx.fillStyle = this.color;
      ctx.font = `${this.size + Math.sin(this.phase)*4}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.itemData.name, this.x, this.y);

      // 描述小字
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,220,150,0.6)';
      ctx.font = '12px "Noto Serif SC","SimSun",serif';
      ctx.fillText(this.itemData.desc || '', this.x, this.y + 22);

      // 提示
      if (this.cooldown <= 0) {
        const hint = 0.4 + 0.3 * Math.sin(this.phase * 3);
        ctx.fillStyle = `rgba(255,240,200,${hint})`;
        ctx.font = '11px "Noto Serif SC","SimSun",serif';
        ctx.fillText('点击拾取', this.x, this.y - 22);
      }
      ctx.restore();
    },
    hitTest(mx, my) {
      if (this.cooldown > 0) return false;
      const w = Math.max(this.itemData.name.length * this.size * 0.6, 80);
      const h = 40;
      return mx > this.x - w/2 && mx < this.x + w/2 &&
             my > this.y - h/2 && my < this.y + h/2;
    },
    collect() {
      // 拾取粒子
      if (typeof particles !== 'undefined') {
        for (let i = 0; i < 20; i++) {
          particles.push(new HitParticle(this.x, this.y, this.color, '·'));
        }
      }
      // 遗响：直接纳入，不走装备切换提示
      if (this.itemType === 'echo') {
        if (typeof grantEcho === 'function') grantEcho(this.itemKey);
        roomTreasureWord = null;
        roomDialogueIndex = 0;
        roomDialogueQueue = [
          { mode:'plain', text:'（一份记忆的余响融入意识。行囊里多了一枚「遗响」。）' },
        ];
        playRoomDialogue();
        return;
      }
      // 弹出切换提示（暂停游戏）
      showEquipPrompt(this.itemType, this.itemKey, this.itemData);
      this.alive = false; // 真装备从战场消失
    },
  };
}

/** 事件 — 随机抽取场景 */
/* ── 通用事件池（所有章节可用、可重复）── */
const GENERAL_EVENTS = [
  {
    id: 'crystal',
    dialogue: [
      { mode:'float', speaker:'零', text:'前面有一团不稳定的意识结晶。里面好像封着什么东西。' },
      { mode:'float', speaker:'零', text:'前任潜航者会把装备封存在这种结晶里。' },
      { mode:'plain', text:'（结晶在黑暗中脉动，裂痕里透出微弱的词元光芒。）' },
      { mode:'float', speaker:'零', text:'你来决定。' },
    ],
    options: [
      { text:'强行打开结晶', action:'force' },
      { text:'小心绕过去',   action:'skip' },
    ],
  },
  {
    id: 'water_mirror',
    dialogue: [
      { mode:'float', speaker:'零', text:'一面由记忆编织的水镜。映出的脸孔……不属于你自己。' },
      { mode:'plain', text:'（镜中浮现出一个装备更精良、伤痕也更深的身影，它开口了。）' },
      { mode:'float', speaker:'我', text:'「我可以借你一份记忆。」它说。「但水会记住每一滴血。」' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（水镜。镜中映出一个装备更精良、伤痕也更深的「我」。）' },
      { mode:'float', speaker:'我', text:'「我可以借你一份记忆。」它说。「但水会记住每一滴血。」' },
    ],
    options: [
      { text:'献出 30 点意识完整度', action:'echo_deal', costHp:30, echoRarity:'common' },
      { text:'离开水镜', action:'skip' },
    ],
  },
  {
    id: 'anchor_altar',
    dialogue: [
      { mode:'float', speaker:'零', text:'一座由沉锚与记忆凝成的祭坛……它在索取「一部分的你」。' },
      { mode:'plain', text:'（祭坛上的字迹闪烁着：留下无法挽回的，带走无法忘记的。）' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（沉锚与记忆凝成的祭坛。字迹闪烁：留下无法挽回的，带走无法忘记的。）' },
    ],
    options: [
      { text:'以 15 点最大意识上限为祭', action:'echo_altar', costMaxHp:15, echoRarity:'rare' },
      { text:'绕开祭坛', action:'skip' },
    ],
  },
  {
    id: 'echo_vortex',
    dialogue: [
      { mode:'float', speaker:'零', text:'记忆的碎片在漩涡里打着转。只要抛出足够的意识碎片，就能捞起一段完整的回声。' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（记忆的碎片在漩涡里打着转。抛出碎片，就能捞起一段完整的回声。）' },
    ],
    options: [
      { text:'用 40 碎片换取遗响', action:'echo_trade', costShards:40, echoRarity:null },
      { text:'离开漩涡', action:'skip' },
    ],
  },
  {
    id: 'wreck',
    dialogue: [
      { mode:'float', speaker:'零', text:'一艘沉没的潜航船骸。船体上爬满了意识腐蚀的痕迹。' },
      { mode:'plain', text:'（货舱里似乎还封着没被腐蚀的东西。但撬开它需要花费碎片。）' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（沉没的潜航船骸。货舱里隐约有词元光芒——但要撬开得花点碎片。）' },
    ],
    options: [
      { text:'花 35 碎片打捞', action:'wreck', costShards:35 },
      { text:'离开船骸', action:'skip' },
    ],
  },
  {
    id: 'exile',
    dialogue: [
      { mode:'float', speaker:'零', text:'一个意识残影蜷缩在角落。它太虚弱了，几乎要和背景融为一体。' },
      { mode:'plain', text:'（它抬起头，用尽力气开口：「给我一点碎片。作为交换，我把一段记忆留给你。」）' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（一个虚弱的意识残影。它乞求碎片，承诺回赠一段记忆。）' },
    ],
    options: [
      { text:'给它 25 碎片', action:'echo_trade', costShards:25, echoRarity:null },
      { text:'无视它，离开', action:'skip' },
    ],
  },
  {
    id: 'storm',
    dialogue: [
      { mode:'float', speaker:'零', text:'前方是记忆风暴。强行通过会被里面的执念纠缠……但风暴中心往往藏着好东西。' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（记忆风暴。硬闯危险，但风暴眼里的东西值得赌一把。）' },
    ],
    options: [
      { text:'硬闯风暴', action:'storm' },
      { text:'绕行', action:'skip' },
    ],
  },
  {
    id: 'rift',
    dialogue: [
      { mode:'float', speaker:'零', text:'一道意识裂隙，像海沟一样深不见底。裂隙深处有什么在闪闪发光。' },
      { mode:'plain', text:'（要拿到它，得把自己的一部分留在这里。裂隙会记住你付出的每一分。）' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（意识裂隙。深处有碎片闪光——但它要你的一部分作为代价。）' },
    ],
    options: [
      { text:'以 20 点最大意识上限为祭', action:'rift', costMaxHp:20 },
      { text:'离开裂隙', action:'skip' },
    ],
  },
  {
    id: 'spring',
    dialogue: [
      { mode:'float', speaker:'零', text:'一泓回响之泉。纯净的意识信息在这里缓慢循环，每一种回响都触手可及。' },
    ],
    ch1Dialogue: [
      { mode:'plain', text:'（回响之泉。三段记忆在此交汇，只能取其一。）' },
    ],
    options: [
      { text:'捧起治愈之泉', action:'heal_full' },
      { text:'净化浑浊之泉', action:'threat_clear' },
      { text:'盛取回响之水', action:'gain_shards' },
    ],
  },
];

/* ── 独特事件池（第一章专属、只触发一次、碎片化剧情）──
 * 碎片暗线：男主自愿反复失忆、只为回到深海找零。收录进图鉴「记忆」。
 */
const UNIQUE_EVENTS = [
  {
    id: 'name_echo', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（一节语音残片，在深海里孤独地循环。沙哑的男声，是你的声音。）' },
      { mode:'whisper', speaker:'我', text:'……记住她的名字。就算你忘了自己是谁，也别忘了她的名字。' },
      { mode:'plain', text:'（声音戛然而止。你的心口空了一下——零的名字就在舌尖，却怎么也想不起来。）' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
  {
    id: 'beacon', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（一座废弃的潜航信标，锈迹斑斑，却还在工作。屏幕上滚动着一行字。）' },
      { mode:'float', speaker:'我', text:'「信标：运转 10 年 3 个月零 7 天。最后一次标注——她还在下面。」' },
      { mode:'plain', text:'（你盯着那行字。信标的时间戳，和你醒来的日子，隔了整整十年。）' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
  {
    id: 'letter', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（一封由词元凝成的信，被水流托着，没有寄出。）' },
      { mode:'float', speaker:'我', text:'「如果读到这封信的人是我——那你又忘了一次。」' },
      { mode:'float', speaker:'我', text:'「别让遗憾把你留在这片海里。它不值得。」' },
      { mode:'plain', text:'（落款处没有名字，只有一个日期。那是你第一次潜航的日子。）' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
  {
    id: 'light', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（一段不属于你的记忆，像陈旧的录影。视角在黑暗的海底，数着日子。）' },
      { mode:'whisper', speaker:'零', text:'……第四年。第五年。第九年。' },
      { mode:'float', speaker:'零', text:'（一个光点从上方沉下来。她屏住呼吸看着它——但它又浮上去了。）' },
      { mode:'plain', text:'（记忆的末尾，她轻声说：再来一次吧。我会等的。）' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
  {
    id: 'fork', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（一块凝固的「遗憾」。它冰凉，像一块界碑，上面刻着分岔的路。）' },
      { mode:'float', speaker:'我', text:'（一条路通向海面，阳光和前程。一条路通向深海，黑暗和……她。）' },
      { mode:'plain', text:'（你看着自己无数次站在岔路口。每一次，都选了深潜。）' },
      { mode:'whisper', speaker:'我', text:'（你低声说：）我从来没后悔过这个选择。' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
  {
    id: 'return', unique: true,
    ch1Dialogue: [
      { mode:'plain', text:'（散落的词元碎片拼成一份潜航记录。密密麻麻，全部是你。）' },
      { mode:'float', speaker:'我', text:'「第 1 次：失忆。第 2 次：失忆。第 3 次……」' },
      { mode:'plain', text:'（记录没有结尾。每一次你都重新出发，每一次你都回到这片海。）' },
      { mode:'whisper', speaker:'我', text:'（你突然明白了什么，轻轻笑了一下。）原来我从来不是第一次来。' },
    ],
    options: [
      { text:'握住这段记忆', action:'unique_hold' },
      { text:'让它沉下去', action:'unique_drop' },
    ],
  },
];

// 独特事件一次性标记（局外持久：跨局保留，触发后不再出现）
let uniqueEventsDone = [];
function markUniqueEventDone(id) {
  if (!uniqueEventsDone.includes(id)) {
    uniqueEventsDone.push(id);
    if (typeof registerMemory === 'function') registerMemory('unique_' + id);
  }
}

// ═══════════════ 技能传承事件（第一章低概率：获得未拥有技能，单局不重复、不可升级）═══
const INHERIT_SKILL_IDS = ['eight_gates', 'kamehameha', 'guangzhi', 'jinitaimei', 'railgun'];
let skillInheritGiven = [];   // 本局已 offer 过的技能（防读档刷）
let skillInheritOffer = null; // 本次事件要给的技能 key

function skillInheritPool() {
  return INHERIT_SKILL_IDS.filter(k =>
    EQUIPMENT && EQUIPMENT.skills && EQUIPMENT.skills[k]
    && !(playerSkill && playerSkill.id === k)   // 当前未持有（单槽位）
    && !skillInheritGiven.includes(k));         // 本局未 offer 过
}

function buildSkillInheritScenario(key) {
  const s = EQUIPMENT.skills[key];
  return {
    id: 'skill_inherit',
    ch1Dialogue: [
      { mode:'plain', text:'（一段古老的心法在意识中浮现，闪着琥珀色的光。）' },
      { mode:'float', speaker:'我', text:`「${s.name}」……这是失传的技艺。要接下吗？` },
    ],
    options: [
      { text:`接受传承「${s.name}」`, action:'skill_inherit_accept' },
      { text:'让心法沉入海底', action:'skill_inherit_leave' },
    ],
  };
}

function handleSkillInheritChoice(opt) {
  if (opt.action === 'skill_inherit_accept' && skillInheritOffer && EQUIPMENT.skills[skillInheritOffer]) {
    if (typeof equipItem === 'function') equipItem('skill', skillInheritOffer, EQUIPMENT.skills[skillInheritOffer]);
  } else {
    // 离开：威胁-1 + 少量碎片（与 skip 一致）
    if (typeof threatLevel !== 'undefined') threatLevel = Math.max(0, threatLevel - 1);
    if (typeof grantShards === 'function') grantShards(SHARD_REWARDS.EVENT_SKIP, W*0.5, H*0.5);
  }
  skillInheritOffer = null;
  // 无怪物战斗，直接完成房间
  eventMonsterDefeated = true;
  eventMonsterWaves = 0;
  roomDialogueIndex = 0;
  roomDialogueQueue = [ opt.action === 'skill_inherit_accept'
    ? { mode:'plain', text:'（心法融入意识。技能栏涌起一股新的力量。）' }
    : { mode:'plain', text:'（心法缓缓沉入海底，像一粒沙。）' } ];
  playRoomDialogue();
}

function startEventRoom(room) {
  const inCh1 = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  let scenario;
  // ⚠️ 技能传承事件：第一章低概率（15%）优先触发，独立于独特/通用池，不消耗 unique 槽位
  const inheritPool = skillInheritPool();
  if (inCh1 && inheritPool.length > 0 && Math.random() < 0.15) {
    skillInheritOffer = inheritPool[Math.floor(Math.random() * inheritPool.length)];
    skillInheritGiven.push(skillInheritOffer); // offer 即标记，防读档刷
    scenario = buildSkillInheritScenario(skillInheritOffer);
  } else if (inCh1) {
    // 第一章：50% 出未触发的独特事件（碎片剧情优先），否则通用事件
    const uniques = (typeof UNIQUE_EVENTS !== 'undefined') ? UNIQUE_EVENTS.filter(e => !uniqueEventsDone.includes(e.id)) : [];
    if (uniques.length && Math.random() < 0.5) {
      scenario = uniques[Math.floor(Math.random() * uniques.length)];
    } else {
      scenario = GENERAL_EVENTS[Math.floor(Math.random() * GENERAL_EVENTS.length)];
    }
  } else {
    // 序章：只用通用池
    scenario = GENERAL_EVENTS[Math.floor(Math.random() * GENERAL_EVENTS.length)];
  }
  if (inCh1) {
    // 第一章肉鸽：零不在，男主独自面对；优先用场景自带的肉鸽对话
    roomDialogueQueue = (scenario.ch1Dialogue && scenario.ch1Dialogue.length)
      ? [...scenario.ch1Dialogue]
      : [
        { mode:'plain', text:'（意识结晶。里面封着前人留下的装备。）' },
        { mode:'float', speaker:'我', text:'……开，还是绕开？' },
      ];
  } else {
    roomDialogueQueue = [...scenario.dialogue];
  }
  // 保存场景引用供 spawnEventOptions 使用
  currentEventScenario = scenario;
  playRoomDialogue();
}

/** 生成漂浮选项（对话结束后调用） */
function spawnEventOptions() {
  if (!currentEventScenario || eventResolved) return;
  eventOptionsActive = true;
  eventOptionsSettled = false;

  const opts = currentEventScenario.options || [];
  eventOptions = opts.map((opt, i) => ({
    text: opt.text,
    x: W*0.5, y: H*0.65 + i * 0.1 * H,
    vx:0, vy:2, age:0, fadeIn: 1.2 + i * 0.3,
    dead:false, hovered:false,
    action: opt.action,
    costHp: opt.costHp, costMaxHp: opt.costMaxHp, costShards: opt.costShards, echoRarity: opt.echoRarity,
  }));
}

function updateEventOptions(dt) {
  if (!eventOptionsActive || eventOptionsSettled) return;
  eventOptions.forEach(opt => {
    opt.age += dt;
    if (opt.age < opt.fadeIn) {
      opt.alpha = opt.age / opt.fadeIn;
    } else {
      opt.alpha = 1;
    }
  });
  // 全部浮现后稳定
  if (eventOptions.every(o => o.age >= o.fadeIn)) {
    eventOptionsSettled = true;
  }
}

function drawEventOptions(ctx) {
  if (!eventOptionsActive) return;
  const now = performance.now();

  eventOptions.forEach(opt => {
    if (opt.dead) return;
    const pulse = eventOptionsSettled ? (0.6 + 0.4 * Math.sin(now * 0.002 + (opt.action==='force'?0:1.5))) : 1;
    const alpha = (opt.alpha || 0) * pulse;
    if (alpha < 0.03) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    const isHover = opt.hovered && eventOptionsSettled;
    ctx.fillStyle = isHover ? '#ffdd88' : 'rgba(200,210,240,0.85)';
    if (isHover) {
      ctx.shadowColor = 'rgba(255,200,120,0.6)';
      ctx.shadowBlur = 14;
    } else {
      ctx.shadowColor = 'rgba(150,180,220,0.3)';
      ctx.shadowBlur = 6;
    }
    ctx.font = `${isHover ? 21 : 18}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(opt.text, opt.x, opt.y);
    ctx.shadowBlur = 0;
    ctx.restore();
  });
}

function hitTestEventOptions(mx, my) {
  if (!eventOptionsActive) return null;
  for (let opt of eventOptions) {
    if (opt.dead) continue;
    opt.hovered = false;
    const w = opt.text.length * 18;
    const h = 28;
    if (mx > opt.x - w/2 && mx < opt.x + w/2 && my > opt.y - h/2 && my < opt.y + h/2) {
      opt.hovered = true;
      return opt;
    }
  }
  return null;
}

function handleEventChoice(opt) {
  eventOptionsActive = false;
  eventOptions = [];
  eventResolved = true; // 防止重复生成

  if (opt.action === 'force') {
    // 碎片奖励
    if (typeof grantShards === 'function') grantShards(SHARD_REWARDS.EVENT_FORCE, W*0.5, H*0.5);
    // 威胁+1
    if (typeof threatLevel !== 'undefined') threatLevel = Math.min(10, threatLevel + 1);
    if (Math.random() < 0.7) {
      // 70%：直接获得武器
      const wpnKeys = Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush');
      const key = wpnKeys[Math.floor(Math.random() * wpnKeys.length)];
      const item = EQUIPMENT.weapons[key];
      if (typeof particles !== 'undefined') {
        for (let i = 0; i < 25; i++) {
          particles.push(new HitParticle(W*0.5, H*0.5, '#ffdd44', '◆'));
        }
      }
      // 标记：无怪物战斗，直接完成
      eventMonsterDefeated = true;
      eventMonsterWaves = 0;
      showEquipPrompt('weapon', key, item);
    } else {
      // 30%：惊扰强化怪物，战胜得武器
      if (typeof particles !== 'undefined') {
        for (let i = 0; i < 30; i++) {
          particles.push(new HitParticle(W*0.5, H*0.5, '#ff4422', '◆'));
        }
      }
      if (typeof shakeAmount !== 'undefined') shakeAmount = 16;
      // 生成强化怪物
      enemyHP = enemyMaxHP = 80;
      enemyTimer = enemyInterval = 3.5; // 更快攻击
      if (typeof updateEnemyUI === 'function') updateEnemyUI();
      if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(true);
      if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);

      const enemyZone = document.getElementById('enemy-zone');
      if (enemyZone) enemyZone.style.opacity = '1';
      const enemyNameEl = document.getElementById('enemy-name');
      if (enemyNameEl) enemyNameEl.textContent = '被惊扰的残响';
      const stageHint = document.getElementById('stage-hint');
      if (stageHint) { stageHint.style.opacity = '1'; stageHint.textContent = '击败它获得装备！'; }
      if (typeof balanceWords === 'function') balanceWords();

      // 标记：2波怪物，击败后给武器
      eventMonsterDefeated = false;
      eventMonsterWaves = 2;
      eventMonsterReward = null;

      roomDialogueIndex = 0;
      const inCh1Force = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
      roomDialogueQueue = inCh1Force ? [
        { mode:'float', speaker:'我', text:'结晶里的东西醒了——是残响。击败它，装备就是我的。', speed:30 },
      ] : [
        { mode:'float', speaker:'零', text:'结晶里的东西醒了——是残响。击败它，装备就是你的。', speed:30 },
      ];
      playRoomDialogue();
    }
  } else if (opt.action === 'unique_hold' || opt.action === 'unique_drop') {
    // 独特事件：第一章一次性碎片剧情（握住 / 沉下去）
    handleUniqueEventChoice(opt);
  } else if (opt.action === 'wreck' || opt.action === 'storm' || opt.action === 'rift'
             || opt.action === 'heal_full' || opt.action === 'threat_clear' || opt.action === 'gain_shards') {
    // 新通用事件：沉船打捞 / 记忆风暴 / 意识裂隙 / 回响之泉
    handleNewGeneralEventChoice(opt);
  } else if (opt.action === 'echo_deal' || opt.action === 'echo_altar' || opt.action === 'echo_trade') {
    // 代价换遗响（水镜 / 锚点祭坛 / 回声漩涡）
    handleEchoEventChoice(opt);
  } else if (opt.action === 'skill_inherit_accept' || opt.action === 'skill_inherit_leave') {
    // 技能传承：接受替换技能 / 离开
    handleSkillInheritChoice(opt);
  } else {
    // 绕过去 — 威胁-1
    if (typeof threatLevel !== 'undefined') threatLevel = Math.max(0, threatLevel - 1);
    // 少量碎片
    if (typeof grantShards === 'function') grantShards(SHARD_REWARDS.EVENT_SKIP, W*0.5, H*0.5);
    if (typeof particles !== 'undefined') {
      for (let i = 0; i < 10; i++) {
        particles.push(new HitParticle(W*0.5, H*0.5, '#88aacc', '·'));
      }
    }
    // 关键：未生成怪物，视为"无怪可击"。否则 checkRoomComplete 会因 enemyHP=999 判定房间永不完成
    eventMonsterDefeated = true;
    eventMonsterWaves = 0;
    roomDialogueIndex = 0;
    const inCh1Skip = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
    roomDialogueQueue = inCh1Skip ? [
      { mode:'float', speaker:'我', text:'……还是算了。不值得为不确定的东西冒险。走吧。' },
    ] : [
      { mode:'float', speaker:'零', text:'……明智的选择。不值得为不确定的东西冒险。走吧。' },
    ];
    playRoomDialogue();
  }
}

/** 代价换遗响：先付代价，再 roll 遗响并纳入 */
function handleEchoEventChoice(opt) {
  // 先付代价（clamp 防止负值）
  if (opt.costHp && typeof playerHP !== 'undefined') {
    playerHP = Math.max(1, playerHP - opt.costHp);
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }
  if (opt.costMaxHp && typeof playerMaxHP !== 'undefined') {
    playerMaxHP = Math.max(20, playerMaxHP - opt.costMaxHp);
    playerHP = Math.min(playerHP, playerMaxHP);
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }
  if (opt.costShards && typeof shards !== 'undefined') {
    shards = Math.max(0, shards - opt.costShards);
    if (typeof updateShardsDisplay === 'function') updateShardsDisplay();
  }
  // 掷遗响
  const ekey = (typeof rollRandomEcho === 'function') ? rollRandomEcho(opt.echoRarity || null) : null;
  if (ekey && typeof grantEcho === 'function') grantEcho(ekey);
  // 无怪物战斗，直接完成房间
  eventMonsterDefeated = true;
  eventMonsterWaves = 0;
  roomDialogueIndex = 0;
  roomDialogueQueue = [
    { mode:'float', speaker:'我',
      text: ekey ? '（一段记忆的余响融入意识……行囊里多了一枚「遗响」。）' : '（什么也没能留下。）' },
  ];
  playRoomDialogue();
}

/** 独特事件：第一章一次性碎片剧情，无论选择都标记完成并收录图鉴 */
function handleUniqueEventChoice(opt) {
  if (currentEventScenario && typeof markUniqueEventDone === 'function') {
    markUniqueEventDone(currentEventScenario.id);
  }
  if (opt.action === 'unique_hold') {
    // 握住记忆：12 碎片 + 小幅回血
    if (typeof grantShards === 'function') grantShards(12, W*0.5, H*0.5);
    if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') {
      playerHP = Math.min(playerMaxHP, playerHP + 15);
      if (typeof updatePlayerUI === 'function') updatePlayerUI();
    }
  }
  // 无怪物战斗，直接完成房间
  eventMonsterDefeated = true;
  eventMonsterWaves = 0;
  roomDialogueIndex = 0;
  roomDialogueQueue = [{
    mode:'plain',
    text: opt.action === 'unique_hold'
      ? '（一段记忆沉入意识深处。它在这里，但你暂时还无法读取它。）'
      : '（你没有握住它。记忆缓缓沉下去，像一粒沙沉入海底。）',
  }];
  playRoomDialogue();
}

/** 新通用事件：沉船打捞 / 记忆风暴 / 意识裂隙 / 回响之泉 */
function handleNewGeneralEventChoice(opt) {
  if (opt.action === 'wreck') {
    // 沉船：花 35 碎片打捞，70% 得未拥有装备 / 30% 失败
    if (typeof shards !== 'undefined') { shards = Math.max(0, shards - 35); if (typeof updateShardsDisplay === 'function') updateShardsDisplay(); }
    if (Math.random() < 0.7) {
      const allEquip = [];
      Object.keys(EQUIPMENT.weapons || {}).forEach(k => { if (k!=='beginner_brush' && !(typeof unlockedWeapons!=='undefined'&&unlockedWeapons.has(k)) && !(typeof playerWeapon!=='undefined'&&playerWeapon&&playerWeapon.id===k)) allEquip.push({type:'weapon',key:k,data:EQUIPMENT.weapons[k]}); });
      Object.keys(EQUIPMENT.armors || {}).forEach(k => { if (k!=='thin_silk' && !(typeof playerArmor!=='undefined'&&playerArmor&&playerArmor.id===k)) allEquip.push({type:'armor',key:k,data:EQUIPMENT.armors[k]}); });
      Object.keys(EQUIPMENT.talismans || {}).forEach(k => { if (!(typeof playerTalisman!=='undefined'&&playerTalisman&&playerTalisman.id===k)) allEquip.push({type:'talisman',key:k,data:EQUIPMENT.talismans[k]}); });
      if (allEquip.length) {
        const pick = allEquip[Math.floor(Math.random()*allEquip.length)];
        if (typeof equipItem === 'function') equipItem(pick.type, pick.key, pick.data);
        if (typeof particles !== 'undefined') for (let i=0;i<20;i++) particles.push(new HitParticle(W*0.5,H*0.5,'#ffdd44','◆'));
      } else {
        if (typeof grantShards === 'function') grantShards(30, W*0.5, H*0.5); // 已全有 → 补偿碎片
      }
    } else {
      if (typeof particles !== 'undefined') {
        for (let i=0;i<10;i++) particles.push(new HitParticle(W*0.5,H*0.5,'#8899aa','×'));
        particles.push(new DamageText(W*0.5,H*0.42,'打捞失败','#8899aa'));
      }
    }
    roomDialogueQueue = [{ mode:'plain', text:'（船骸沉入更深处。你带着打捞到的东西离开。）' }];
  } else if (opt.action === 'storm') {
    // 记忆风暴：威胁+1，进事件怪物战，胜得 60 碎片 + 随机遗响
    if (typeof threatLevel !== 'undefined') threatLevel = Math.min(10, threatLevel + 1);
    enemyHP = enemyMaxHP = 80;
    enemyTimer = enemyInterval = 3.5;
    if (typeof updateEnemyUI === 'function') updateEnemyUI();
    if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(true);
    if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);
    document.getElementById('enemy-zone').style.opacity = '1';
    const enemyNameEl = document.getElementById('enemy-name');
    if (enemyNameEl) enemyNameEl.textContent = '风暴执念';
    const stageHint = document.getElementById('stage-hint');
    if (stageHint) { stageHint.style.opacity='1'; stageHint.textContent='穿越风暴！'; }
    if (typeof balanceWords === 'function') balanceWords();
    // 2 波怪物，胜利按 eventStormReward 结算（checkEventMonster）
    eventMonsterDefeated = false;
    eventMonsterWaves = 2;
    eventMonsterReward = null;
    eventStormReward = true;
    roomDialogueIndex = 0;
    roomDialogueQueue = [{ mode:'float', speaker:'我', text:'穿过它。风暴眼里的东西，值得。', speed:30 }];
    playRoomDialogue();
    return;
  } else if (opt.action === 'rift') {
    // 意识裂隙：以 20 最大上限换 80 碎片
    if (typeof playerMaxHP !== 'undefined') {
      playerMaxHP = Math.max(20, playerMaxHP - 20);
      playerHP = Math.min(playerHP, playerMaxHP);
      if (typeof updatePlayerUI === 'function') updatePlayerUI();
    }
    if (typeof grantShards === 'function') grantShards(80, W*0.5, H*0.5);
    roomDialogueQueue = [{ mode:'plain', text:'（裂隙记住了你付出的一部分。碎片在你掌心里凝聚。）' }];
  } else if (opt.action === 'heal_full' || opt.action === 'threat_clear' || opt.action === 'gain_shards') {
    // 回响之泉：三选一
    if (opt.action === 'heal_full') {
      if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') { playerHP = playerMaxHP; if (typeof updatePlayerUI === 'function') updatePlayerUI(); }
    } else if (opt.action === 'threat_clear') {
      if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined') threatLevel = THREAT.BASE[difficulty] || 2;
    } else {
      if (typeof grantShards === 'function') grantShards(40, W*0.5, H*0.5);
    }
    roomDialogueQueue = [{ mode:'plain', text:'（泉水在指尖回响，暖意顺着意识漫开。）' }];
  }
  eventMonsterDefeated = true;
  eventMonsterWaves = 0;
  roomDialogueIndex = 0;
  playRoomDialogue();
}

/** 检测事件房间的怪物是否被击败（支持多波次，帧计数器驱动） */
function checkEventMonster() {
  if (!currentDiveRoom || currentDiveRoom.type !== 'event') return;

  // 波次过渡中：帧计数器递减，到0时生成下一波
  if (typeof eventMonsterWavePending === 'number' && eventMonsterWavePending > 0) {
    eventMonsterWavePending--;
    if (eventMonsterWavePending <= 0) {
      // 过渡结束 → 生成下一波
      eventMonsterWavePending = false;
      if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);
      enemyHP = enemyMaxHP = 80 + Math.floor(Math.random() * 15);
      enemyTimer = enemyInterval = 3.2;
      if (typeof updateEnemyUI === 'function') updateEnemyUI();
      if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(true);
      document.getElementById('enemy-zone').style.opacity = '1';
      const enemyNameEl = document.getElementById('enemy-name');
      if (enemyNameEl) enemyNameEl.textContent = '被惊扰的残响';
      const stageHint = document.getElementById('stage-hint');
      if (stageHint) {
        const totalDone = 2 - eventMonsterWaves;
        stageHint.textContent = `残响再次凝聚……第${totalDone + 1}波`;
        stageHint.style.opacity = '1';
      }
      if (typeof particles !== 'undefined' && typeof W !== 'undefined') {
        const totalDone = 2 - eventMonsterWaves;
        for (let i = 0; i < 12; i++) {
          particles.push(new DamageText(W * 0.5, H * 0.3,
            `第${totalDone + 1}波`, '#ff8866'));
        }
      }
    }
    return;
  }
  // 守卫：必须 eventResolved（怪物被实际生成过），防止上一房间残留 enemyHP=0 误触发
  if (!eventResolved || eventMonsterDefeated || eventMonsterWavePending) return;

  if (enemyHP <= 0 && eventMonsterReward === null) {
    eventMonsterWaves--;
    if (eventMonsterWaves > 0) {
      // 启动帧计数过渡（~60帧 ≈ 1秒）
      eventMonsterWavePending = 60;
    } else {
      // 全部波次完成 → 结算奖励
      eventMonsterDefeated = true;
      if (typeof battleWords !== 'undefined') battleWords = [];
      if (eventStormReward) {
        // 记忆风暴奖励：60 碎片 + 随机遗响
        eventStormReward = false;
        if (typeof grantShards === 'function') grantShards(60, W*0.5, H*0.3);
        const ekey = (typeof rollRandomEcho === 'function') ? rollRandomEcho(null) : null;
        if (ekey && typeof grantEcho === 'function') grantEcho(ekey);
        roomDialogueIndex = 0;
        roomDialogueQueue = [{ mode:'float', speaker:'我', text:'（风暴散去。战利品在掌中凝聚成光。）' }];
        playRoomDialogue();
      } else {
        // 原逻辑：获得武器
        const wpnKeys = Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush');
        const key = wpnKeys[Math.floor(Math.random() * wpnKeys.length)];
        eventMonsterReward = EQUIPMENT.weapons[key];
        showEquipPrompt('weapon', key, eventMonsterReward);
      }
    }
  }
}

/** Boss 房间 — 按 room.bossKey 分发不同 Boss（遗憾主题：忆/执/遗憾等）*/
function startBossRoom(room) {
  if (!room.bossKey) return;

  // 图鉴：记录Boss遭遇
  if (typeof registerEnemy === 'function') {
    registerEnemy('boss_' + room.bossKey);
  }

  // 冻结普通敌人，清除前一个房间的敌人实体
  enemyHP = enemyMaxHP = 999;
  enemyTimer = enemyInterval = 99;
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  document.getElementById('enemy-zone').style.opacity = '0';

  // 从配置取Boss名/部件（通用化，避免硬编码遗）
  const bc = (typeof BOSS_CONFIG !== 'undefined') ? BOSS_CONFIG[room.bossKey] : null;
  const bossName = bc ? bc.name : (room.label || 'Boss');
  const lc = bc ? bc.left.char : '';
  const rc = bc ? bc.right.char : '';
  const lcDesc = lc ? (lc + '与' + rc) : '巨大汉字';

  // 入场对话（第一章肉鸽零不在 → 男主独白/环境叙事）
  const inCh1Boss = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  if (inCh1Boss) {
    // 第3层遗憾完全体：先「???」→ 剧情揭示 → 遗憾登场
    if (room.bossKey === 'regretful') {
      roomDialogueQueue = [
        { mode:'plain', text:'（深海的尽头，一片死寂。三个问号悬浮在黑暗中，微微脉动。）' },
        { mode:'float', speaker:'我', text:'……？？？' },
        { mode:'plain', text:'（零的能量在体内流转。有什么东西，在问号之后缓缓成形。）' },
        { mode:'shake', speaker:'我', text:'遗憾。真的是你。' },
      ];
    } else {
      // 忆/执/深层碎片态：按主题铺垫
      const ch1Lead = {
        recall: [
          { mode:'plain', text:'（没有零。意识海面浮着细碎的光点——像被撕碎的记忆。）' },
          { mode:'whisper', speaker:'我', text:'……这些，是我忘掉的东西吗。' },
          { mode:'shake', speaker:'我', text:'「忆」。来了。' },
        ],
        obsess: [
          { mode:'plain', text:'（脚下的海水忽然变稠。有什么东西从深处伸出来，想攥住你。）' },
          { mode:'whisper', speaker:'我', text:'放不下……就永远走不动。' },
          { mode:'shake', speaker:'我', text:'「执」。来了。' },
        ],
        regret_abyss: [
          { mode:'plain', text:'（一个偏旁与一个主体，在深海的暗流里膨胀成巨大的字形。）' },
          { mode:'whisper', speaker:'我', text:'憾。它还没拼完整。' },
          { mode:'shake', speaker:'我', text:'「憾」。来了。' },
        ],
        yi_abyss: [
          { mode:'plain', text:'（金色的碎片在深海中回响，每一次闪光都像一句没说完的话。）' },
          { mode:'whisper', speaker:'我', text:'遗。它还在等什么。' },
          { mode:'shake', speaker:'我', text:'「遗」。来了。' },
        ],
      };
      roomDialogueQueue = ch1Lead[room.bossKey] || [
        { mode:'shake', speaker:'我', text:'……「' + bossName + '」。来了。' },
      ];
    }
  } else {
    // 序章：零引导
    roomDialogueQueue = [
      { mode:'tremble', speaker:'零',
        text:'来了。那个波形……就是它。「' + bossName + '」。' },
      { mode:'plain',
        text:'（前方的空间开始扭曲。两个汉字部件从黑暗中凝聚成形——' + lcDesc + '。）' },
      { mode:'shake', speaker:'零',
        text: lc ? (lc + '为意象，' + rc + '为执念……小心！！') : '……小心！！' },
    ];
  }

  // BGM: Boss战（boss.js initBoss也会触发，这里提前切换）
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('boss', 1.5);

  // 播放对话，对话结束后初始化Boss
  roomDialogueQueue.push({
    mode:'float', speaker: inCh1Boss ? '我' : '零', text:'……',
    onComplete() {
      if (typeof initBoss === 'function') {
        initBoss(room.bossKey);
      }
      // 更新提示文字
      const hint = document.getElementById('stage-hint');
      if (hint) { hint.style.opacity = '1'; hint.textContent = bossName + ' · 深海守护者'; }
    }
  });
  playRoomDialogue();
}

/** 安全屋 — 零的领域 */
function startSafeHouseRoom(room) {
  // BGM: 安全屋温暖音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('safehouse', 2.0);

  // 重置威胁等级
  if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined') {
    threatLevel = THREAT.BASE[difficulty] || 2;
  }

  // 恢复玩家HP（象征性地）
  if (typeof playerHP !== 'undefined') {
    playerHP = playerMaxHP || 100;
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }

  const inCh1 = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  roomDialogueQueue = inCh1 ? [
    { mode:'plain', text:'（零的领域。零的投影虚弱得无法凝形，只剩一缕微光。）' },
    { mode:'whisper', speaker:'我', text:'……再撑一下。我一定会找到你。' },
  ] : [
    { mode:'plain',
      text:'（温暖的光。四周是由文字粒子编织的墙壁，柔软得像母亲的怀抱。）' },
    { mode:'plain',
      text:'（零靠在角落。她的形体极度稀薄，几乎透明。粒子时不时散开，又勉强聚拢。）' },
    { mode:'shake', speaker:'主角', text:'零！你——' },
    { mode:'whisper', speaker:'零',
      text:'（虚弱地笑了）别大呼小叫的。只是用多了点能量。' },
    { mode:'float', speaker:'零',
      text:'我的身体在深海底下。这里的我只是一个投影。消耗过度就会这样。休息几天就好了。' },
    { mode:'plain',
      text:'（她试图站起来。粒子哗地散开，又艰难地聚拢。她放弃了，靠回墙上。）' },
    { mode:'whisper', speaker:'零',
      text:'遗比我想象的强太多了。你的装备、你的词元锚点——全被震碎了。我们得从头来过。' },
    { mode:'float', speaker:'零',
      text:'但至少……你还活着。' },
    { mode:'plain',
      text:'（沉默。零的粒子在微光中轻轻明灭，像渐弱的星光。）' },
    { mode:'whisper', speaker:'零',
      text:'休息吧。等你恢复好了……前方的路还很长。' },
    { mode:'whisper', speaker:'零',
      text:'……不过，我给你的锚点已经修好了。' },
    { mode:'float', speaker:'零',
      text:'这缕光连着零的领域。只要它还在，无论你沉得多深，都能被拉回来。' },
  ];
  playRoomDialogue();
}

// ═══════════════ 商店房间 ═══════════════

let shopRoomEntered = false;

function startShopRoom(room) {
  // BGM: 安全屋音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('safehouse', 1.5);

  // 显示阶段提示
  const hint = document.getElementById('stage-hint');
  if (hint) { hint.style.opacity = '1'; hint.textContent = '意识市集 · 碎片共鸣点'; }

  // 隐藏战斗UI
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('player-zone').style.opacity = '1';
  if (typeof updatePlayerUI === 'function') updatePlayerUI();

  // 重置威胁等级
  if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined') {
    threatLevel = THREAT.BASE[difficulty] || 2;
  }

  // 满血
  if (typeof playerHP !== 'undefined') {
    playerHP = playerMaxHP || 100;
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
  }

  // 温暖粒子
  if (typeof particles !== 'undefined' && typeof W !== 'undefined' && typeof H !== 'undefined') {
    for (let i = 0; i < 20; i++) {
      const p = new HitParticle(W*0.5 + (Math.random()-0.5)*150, H*0.5 + (Math.random()-0.5)*100, '#ffcc88', '·');
      p.vx *= 0.2; p.vy *= 0.2; p.size = 4 + Math.random() * 8; p.life = 30 + Math.random() * 40;
      p.gravity = -0.01;
      particles.push(p);
    }
  }

  shopRoomEntered = true;

  // 入场对话（第一章肉鸽零不在 → 男主独白）
  const inCh1Shop = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  roomDialogueQueue = inCh1Shop ? [
    { mode:'plain', text:'（意识共鸣点。碎片可以换装备。）' },
  ] : [
    { mode:'float', speaker:'零',
      text:'这里有一个意识共鸣点……是前人留下的交易场。碎片在这里可以换取装备。' },
    { mode:'float', speaker:'零',
      text:'看看有什么好东西。别客气，这里的装备比你手上的好多了。' },
    { mode:'float', speaker:'零',
      text:'……不过碎片只在这一层有效。潜航结束就消失了。', speed:40 },
  ];
  playRoomDialogue();
}

// 推进商店房间对话（在 advanceRoomDialogue 中检测）

function playRoomDialogue() {
  if (roomDialogueIndex >= roomDialogueQueue.length) return;
  const entry = roomDialogueQueue[roomDialogueIndex];
  roomDialogueIndex++;

  Dialogue.show({
    mode: entry.mode || 'float',
    speaker: entry.speaker || '',
    text: entry.text || '',
    speed: entry.speed || 42,
    onComplete: entry.onComplete || null,
  });
}

/** 推进房间对话（每帧由main调用，仅在对话隐藏后推进） */
function advanceRoomDialogue() {
  if (!currentDiveRoom) return;
  // 对话仍在显示 → 等待玩家点击
  if (Dialogue.active) return;

  // 对话已隐藏（玩家点击了）→ 推进队列
  if (roomDialogueIndex < roomDialogueQueue.length) {
    playRoomDialogue();
    return;
  }

  // 对话全部结束 → 处理特殊逻辑
  if (roomDialogueIndex >= roomDialogueQueue.length) {
    // Shop房间：对话结束后打开商店
    if (currentDiveRoom.type === 'shop' && shopRoomEntered && !shopOpen) {
      shopRoomEntered = false;
      if (typeof openShop === 'function') {
        const hint = document.getElementById('stage-hint');
        if (hint) hint.style.opacity = '0';
        openShop();
      }
    }
    // Event房间：生成选择肢
    if (currentDiveRoom.type === 'event' && !eventOptionsActive && !eventResolved) {
      spawnEventOptions();
    }
    // Treasure房间：对话结束后生成真+假装备群
    if (currentDiveRoom.type === 'treasure' && !roomTreasureSpawned) {
      spawnTreasureWord(); // 创建真装备数据（不设 roomTreasureSpawned 阻止假装备）
      spawnFakeWeapons();  // 创建假装备群
    }
  }
}

// ═══════════════ 渲染 ═══════════════

function drawRoomElements(ctx) {
  if (!currentDiveRoom) return;
  // 假装备字
  roomFakeWeapons.forEach(f => { if (f.alive) f.draw(ctx); });
  // 真装备字
  if (roomTreasureWord && roomTreasureWord.alive) {
    roomTreasureWord.draw(ctx);
  }
}

function updateRoomElements() {
  // 假装备在 checkTreasureRoom 中更新
  if (roomTreasureWord && roomTreasureWord.alive) {
    roomTreasureWord.update();
  }
}

function hitTestRoomElements(mx, my) {
  if (!currentDiveRoom) return null;
  // 优先检测真装备
  if (roomTreasureWord && roomTreasureWord.alive && roomTreasureWord.hitTest(mx, my)) {
    return roomTreasureWord;
  }
  // 假装备
  for (let f of roomFakeWeapons) {
    if (f.alive && f.hitTest(mx, my)) return f;
  }
  return null;
}
