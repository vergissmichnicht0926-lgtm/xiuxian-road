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
let roomTreasureSpawned = false;
let roomTreasureWord = null; // 金色装备字对象

// ═══════════════ 入口 ═══════════════

function startRoom(room) {
  currentDiveRoom = room;
  roomDialogueQueue = [];
  roomDialogueIndex = 0;
  roomCombatWaves = 0;
  roomCombatWaveCleared = false;
  roomCombatAllDone = false;
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
  currentEventScenario = null;
  battleWords = typeof battleWords !== 'undefined' ? [] : battleWords;
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

/** 战斗 — 噪点波次 */
function startCombatRoom(room) {
  const waves = room.waves || 3;
  const baseStats = {
    enemyHP: room.enemyHP || 40,
    enemyInterval: room.enemyInterval || 6.0,
    enemyDmg: (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].enemyDmg : [5,8],
    noiseRate: (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].noiseRate : 0.15,
    speed: (typeof DIFFICULTY !== 'undefined' && typeof difficulty !== 'undefined') ? DIFFICULTY[difficulty].speed : 0.8,
  };
  // 应用威胁等级修正
  let modified;
  if (typeof applyThreatModifiers === 'function') {
    modified = applyThreatModifiers(baseStats);
  } else {
    modified = baseStats;
  }
  const hp = modified.enemyHP;
  const interval = modified.enemyInterval;
  const hard = room.hardMode || false;

  roomCombatWaves = waves;

  // 设置战斗参数
  if (typeof enemyMaxHP !== 'undefined') {
    enemyHP = enemyMaxHP = hp;
  }
  if (typeof enemyInterval !== 'undefined') {
    enemyTimer = enemyInterval = interval;
  }
  if (typeof updateEnemyUI === 'function') updateEnemyUI();
  // 重置敌人名称和HP条样式 + 生成敌人实体
  const enemyName = document.getElementById('enemy-name');
  if (enemyName) enemyName.textContent = hard ? '强化噪点' : '噪点';
  const enemyHPFill = document.getElementById('enemy-hp-fill');
  if (enemyHPFill) enemyHPFill.style.background = '';
  if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(hard);

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

  // 波次对话
  const hardText = hard ? '这里的噪点更加狂暴。别放松。' : '';
  roomDialogueQueue = [
    { mode:'float', speaker:'零', text:`${room.label}。${room.desc}一共${waves}波，集中精神。${hardText}` },
  ];
  playRoomDialogue();
}

/** 检查战斗波次：敌人被击败后生成下一波 */
function checkCombatWave() {
  if (!currentDiveRoom || currentDiveRoom.type !== 'combat') return;
  if (roomCombatWaves <= 0) return;

  // 敌人刚被击败 → 标记本波清完
  if (enemyHP <= 0 && !roomCombatWaveCleared) {
    roomCombatWaveCleared = true;
    roomCombatWaves--;

    if (roomCombatWaves > 0) {
      // 延迟刷新下一波
      setTimeout(() => {
        if (!currentDiveRoom || currentDiveRoom.type !== 'combat') return;
        const hp = currentDiveRoom.enemyHP || 40;
        enemyHP = enemyMaxHP = hp + Math.floor(Math.random() * 10);
        enemyTimer = enemyInterval = currentDiveRoom.enemyInterval || 6.0;
        if (typeof updateEnemyUI === 'function') updateEnemyUI();
        if (typeof balanceWords === 'function') balanceWords();
        if (typeof Tutorial !== 'undefined') Tutorial.enterPhase(PHASE.BATTLE);
        if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(currentDiveRoom.hardMode);
        roomCombatWaveCleared = false;
        // 波次提示
        if (typeof particles !== 'undefined' && typeof W !== 'undefined' && typeof H !== 'undefined') {
          for (let i = 0; i < 12; i++) {
            particles.push(new DamageText(W * 0.5, H * 0.3,
              `第${currentDiveRoom.waves - roomCombatWaves + 1}波`, '#ff8866'));
          }
        }
        if (typeof Sound !== 'undefined') Sound.anomaly();
      }, 1000);
    } else {
      // 全部波次完成 — 1秒等待后再进行奖励/返回判定
      roomCombatAllDone = false;
      // 冻结敌人，防止0血怪物继续攻击
      enemyTimer = enemyInterval = 999;
      document.getElementById('enemy-zone').style.opacity = '0';
      setTimeout(() => { roomCombatAllDone = true; }, 1000);
      // 胜利对话
      setTimeout(() => {
        roomDialogueIndex = 0;
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
        playRoomDialogue();
      }, 800);
    }
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

  roomDialogueQueue = [
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
let restBubbleActive = false;
let restBubbleTimer = 0;
const HEALING_CHARS = ['愈','复','愈','安','静','愈','暖','愈','愈','宁','息','愈','生','愈'];

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

  // 不生成战斗文字（此房间无攻/防/愈字）

  roomDialogueQueue = [
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

// 假装备池
let roomFakeWeapons = [];

// 装备切换提示
let equipPrompt = null; // { itemType, itemKey, itemData, x, y, options }

/** 显示装备切换提示（暂停游戏，二选一） */
function showEquipPrompt(itemType, itemKey, itemData) {
  equipPrompt = {
    itemType, itemKey, itemData,
    x: W*0.5, y: H*0.55,
    options: [
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
    if (p.itemType === 'weapon') {
      if (typeof playerWeapon !== 'undefined') playerWeapon = p.itemData;
      if (typeof unlockedWeapons !== 'undefined') unlockedWeapons.add(p.itemKey);
    } else if (p.itemType === 'armor') {
      if (typeof playerArmor !== 'undefined') {
        playerArmor = p.itemData;
        if (typeof playerDefense !== 'undefined') playerDefense = playerArmor.defense || 0;
      }
    }
    if (typeof updatePlayerUI === 'function') updatePlayerUI();
    if (typeof particles !== 'undefined') {
      for (let i = 0; i < 15; i++) particles.push(new HitParticle(equipPrompt.x, equipPrompt.y, '#ffdd44', '◆'));
      particles.push(new DamageText(equipPrompt.x, equipPrompt.y - 10, `装备: ${p.itemData.name}`, '#ffdd44'));
    }
  } else {
    if (typeof particles !== 'undefined') {
      particles.push(new DamageText(equipPrompt.x, equipPrompt.y, '已丢弃', '#888888'));
    }
  }
  hideEquipPrompt();
  // 继续房间流程
  if (roomTreasureWord) roomTreasureWord = null;
  roomDialogueQueue = [
    { mode:'float', speaker:'零', text: opt.action === 'replace' ? '不错的选择。继续前进吧。' : '也好。适合自己的才是最好的。' },
  ];
  roomDialogueIndex = 0;
  playRoomDialogue();
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

/** 生成金色装备字（对话结束后调用） */
function spawnTreasureWord() {
  if (roomTreasureSpawned) return;
  roomTreasureSpawned = true;

  // 随机选一件武器或防具（非初始装备）
  const wpnKeys = Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush');
  const armKeys = Object.keys(EQUIPMENT.armors).filter(k => k !== 'thin_silk');
  const allKeys = [...wpnKeys.map(k => ({ key:k, type:'weapon' })), ...armKeys.map(k => ({ key:k, type:'armor' }))];
  const pick = allKeys[Math.floor(Math.random() * allKeys.length)];

  const item = pick.type === 'weapon'
    ? EQUIPMENT.weapons[pick.key]
    : EQUIPMENT.armors[pick.key];

  const cx = typeof W !== 'undefined' ? W * 0.5 : 600;
  const cy = typeof H !== 'undefined' ? H * 0.45 : 400;

  // 创建一个特殊的金色文字对象
  roomTreasureWord = {
    x: cx, y: cy - 60,
    vx: (Math.random() - 0.5) * 0.6, vy: -0.2,
    size: 26, alpha: 0.9, targetAlpha: 0.9,
    phase: Math.random() * Math.PI * 2, alive: true,
    hovered: false, glowExtra: 0, cooldown: 80, // 短暂冷却防止误触
    cat: 'treasure',
    itemType: pick.type,
    itemKey: pick.key,
    itemData: item,
    text: item.name,
    color: '#ffdd44',
    glow: '#ccaa22',
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
      // 弹出切换提示（暂停游戏）
      showEquipPrompt(this.itemType, this.itemKey, this.itemData);
      this.alive = false; // 真装备从战场消失
    },
  };
}

/** 事件 — 随机抽取场景 */
const EVENT_SCENARIOS = [
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
  // 后续可扩展更多事件场景
];

function startEventRoom(room) {
  const scenario = EVENT_SCENARIOS[Math.floor(Math.random() * EVENT_SCENARIOS.length)];
  roomDialogueQueue = [...scenario.dialogue];
  // 保存场景引用供 spawnEventOptions 使用
  currentEventScenario = scenario;
  playRoomDialogue();
}

let currentEventScenario = null;

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
  }));
}

let eventOptionsActive = false;
let eventOptionsSettled = false;
let eventOptionTimer = 0;
let eventOptions = [];
let eventResolved = false;

function updateEventOptions(dt) {
  if (!eventOptionsActive || eventOptionsSettled) return;
  eventOptionTimer += dt;
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
      roomDialogueQueue = [
        { mode:'float', speaker:'零', text:'结晶里的东西醒了——是残响。击败它，装备就是你的。', speed:30 },
      ];
      playRoomDialogue();
    }
  } else {
    // 绕过去 — 威胁-1
    if (typeof threatLevel !== 'undefined') threatLevel = Math.max(0, threatLevel - 1);
    if (typeof particles !== 'undefined') {
      for (let i = 0; i < 10; i++) {
        particles.push(new HitParticle(W*0.5, H*0.5, '#88aacc', '·'));
      }
    }
    roomDialogueIndex = 0;
    roomDialogueQueue = [
      { mode:'float', speaker:'零', text:'……明智的选择。不值得为不确定的东西冒险。走吧。' },
    ];
    playRoomDialogue();
  }
}

let eventMonsterDefeated = false;
let eventMonsterWaves = 0;
let eventMonsterWavePending = false;
let eventMonsterReward = null;

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
      // 全部波次完成 → 获得武器
      eventMonsterDefeated = true;
      const wpnKeys = Object.keys(EQUIPMENT.weapons).filter(k => k !== 'beginner_brush');
      const key = wpnKeys[Math.floor(Math.random() * wpnKeys.length)];
      eventMonsterReward = EQUIPMENT.weapons[key];
      if (typeof battleWords !== 'undefined') battleWords = [];
      showEquipPrompt('weapon', key, eventMonsterReward);
    }
  }
}

/** Boss「遗」*/
function startBossRoom(room) {
  if (!room.bossKey) return;

  // 冻结普通敌人，清除前一个房间的敌人实体
  enemyHP = enemyMaxHP = 999;
  enemyTimer = enemyInterval = 99;
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  document.getElementById('enemy-zone').style.opacity = '0';

  // 入场对话
  roomDialogueQueue = [
    { mode:'tremble', speaker:'零',
      text:'来了。那个波形……就是它。「遗」。' },
    { mode:'plain',
      text:'（前方的空间开始扭曲。两个汉字部件从黑暗中凝聚成形——辶与贵，金光刺目。）' },
    { mode:'shake', speaker:'零',
      text:'辶为疾走，贵为珍宝。两者合一……小心！！' },
  ];

  // BGM: Boss战（boss.js initBoss也会触发，这里提前切换）
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('boss', 1.5);

  // 播放对话，对话结束后初始化Boss
  roomDialogueQueue.push({
    mode:'float', speaker:'零', text:'……',
    onComplete() {
      if (typeof initBoss === 'function') {
        initBoss('yi');
      }
      // 更新提示文字
      const hint = document.getElementById('stage-hint');
      if (hint) { hint.style.opacity = '1'; hint.textContent = '遗 · 深海守护者'; }
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

  roomDialogueQueue = [
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
  ];
  playRoomDialogue();
}

// ═══════════════ 对话序列 ═══════════════

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
