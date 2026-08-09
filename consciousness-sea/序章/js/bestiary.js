/* ═══════════════════ §BESTIARY 图鉴系统 — 小萤记录 ═══════════════════
 *
 * 依赖：hub.js (通过小萤菜单打开)
 *       sound.js (Sound)
 *       main.js (W, H, mx, my)
 *
 * 收录：敌人 / 装备 / 记忆碎片 / 遗响
 * 数据用 localStorage 持久化（key: consciousness_sea_bestiary）
 * 遇到就自动记录，无需手动操作
 */

// ═══════════════ 图鉴状态 ═══════════════
let bestiaryOpen = false;
let bestiaryTab = 'enemies';    // 'enemies' | 'equipment' | 'memories'
let bestiaryData = null;        // 内存中的图鉴数据
let bestiaryAlpha = 0;
let bestiaryScrollY = 0;
let bestiaryMaxScroll = 0;
const BESTIARY_KEY = 'consciousness_sea_bestiary';

// ═══════════════ 图鉴条目模板 ═══════════════

// 敌人图鉴定义（所有可收录的敌人）
const BESTIARY_ENEMY_DEFS = {
  'noise_shard': {
    id: 'noise_shard', name: '残响碎片',
    category: '普通噪点',
    desc: '被遗弃的记忆碎片化作了噪点。最低等的意识污染物，但数量众多。',
    icon: '碎', iconColor: '#ff6644',
  },
  'noise_volley': {
    id: 'noise_volley', name: '齐射噪点',
    category: '普通噪点',
    desc: '会朝潜航者齐射意识弹幕的噪点。弹道如矢，逼你离开原地。',
    icon: '矢', iconColor: '#66aaff',
  },
  'noise_rain': {
    id: 'noise_rain', name: '雨幕噪点',
    category: '普通噪点',
    desc: '降下漫天意识之雨的噪点。雨幕无死角，考验走位。',
    icon: '雨', iconColor: '#55ccdd',
  },
  'noise_track': {
    id: 'noise_track', name: '追踪残响',
    category: '精英噪点',
    desc: '发射追踪弹的残响。它不会停下，直到追上你的光标。',
    icon: '追', iconColor: '#aa77ff',
  },
  'noise_shield': {
    id: 'noise_shield', name: '护壁残响',
    category: '精英噪点',
    desc: '外层覆盖意识护壁的残响。直接攻击伤害减半，先破壁再破心。',
    icon: '壁', iconColor: '#ddcc88',
  },
  'noise_split': {
    id: 'noise_split', name: '分裂残响',
    category: '普通噪点',
    desc: '被击败时会分裂成两个更小的噪点。野火烧不尽。',
    icon: '裂', iconColor: '#ff9966',
  },
  'strengthened_noise': {
    id: 'strengthened_noise', name: '强化噪点',
    category: '精英噪点',
    desc: '更深的意识层中，噪点变得更加狂暴。据说它们吞噬了太多潜航者的悔恨。',
    icon: '恨', iconColor: '#ff4422',
  },
  'echo_shadow': {
    id: 'echo_shadow', name: '残响之影',
    category: '守护者',
    desc: '守护遗落装备的无敌残影。不会主动攻击，但任何触碰都会造成严重的意识震荡。',
    icon: '影', iconColor: '#8866aa',
  },
  'boss_regret': {
    id: 'boss_regret', name: '憾',
    category: 'Boss',
    desc: '执念凝聚的噪点。忄为冲撞之势，感为弹幕之雨。在回应深海的信号时被吸引而来。',
    icon: '憾', iconColor: '#ff3333',
  },
  'boss_yi': {
    id: 'boss_yi', name: '遗',
    category: 'Boss',
    desc: '深海的守护者。辶为疾走，贵为珍宝——两者合一，便是永恒的遗憾。震碎了你的全部装备。',
    icon: '遗', iconColor: '#cc3333',
  },
  'boss_recall': {
    id: 'boss_recall', name: '忆',
    category: 'Boss',
    desc: '遗失的记忆碎片在浅海回响。忄为追忆，乙为余音——它困在过去，不愿离开。',
    icon: '忆', iconColor: '#2e86c1',
  },
  'boss_obsess': {
    id: 'boss_obsess', name: '执',
    category: 'Boss',
    desc: '放不下的遗憾化作了执念。扌为紧握，丸为执念的核心——它不愿松手。',
    icon: '执', iconColor: '#cc5522',
  },
  'boss_regretful': {
    id: 'boss_regretful', name: '遗憾',
    category: 'Boss',
    desc: '遗憾本身的具现化。心为追忆，贵为遗失的珍宝——它已无法回头。',
    icon: '憾', iconColor: '#cc3322',
  },
};

// 装备图鉴定义
const BESTIARY_EQUIP_DEFS = {
  // 武器
  'beginner_brush': { id:'beginner_brush', name:'初学者之笔', category:'武器', desc:'UCRB标准配发的词元笔。稳定均衡，陪伴你走过了最初的潜航。', icon:'笔' },
  'star_shatter':    { id:'star_shatter', name:'碎星之刃', category:'武器', desc:'攻字仅4枚，但一击碎星。重锤低速高伤。', icon:'碎' },
  'blaze_heaven':    { id:'blaze_heaven', name:'焚天', category:'武器', desc:'攻字7枚满屏烈焰，低伤高频，附「炎」debuff灼烧。', icon:'焚' },
  'frost_verse':     { id:'frost_verse', name:'霜序', category:'武器', desc:'攻字6枚凝寒而生，附带减速，控场致胜。', icon:'霜' },
  // 防具
  'thin_silk':       { id:'thin_silk', name:'薄绢', category:'防具', desc:'轻薄的意识纤维编织。减伤1，每字3盾，上限15。', icon:'绢' },
  'mind_wall':       { id:'mind_wall', name:'意识壁垒', category:'防具', desc:'防字仅1枚却坚不可摧。减伤4，每字8盾，上限30。', icon:'壁' },
  'light_veil':      { id:'light_veil', name:'流光之纱', category:'防具', desc:'防字3枚如流光掠影。减伤2，每字2盾，上限8，20%闪避。', icon:'纱' },
  // 技能
  'concentration':   { id:'concentration', name:'凝神', category:'技能', desc:'凝聚心神，下一次攻击威力倍增。', icon:'凝' },
  'time_freeze':     { id:'time_freeze', name:'时间暂停', category:'技能', desc:'干扰噪点的时间感知，冻结敌人行动4秒。', icon:'停' },
  'excalibur':       { id:'excalibur', name:'ex咖喱棒', category:'技能', desc:'不断收集ex充能，由你决定何时释放。充能越高伤害越大。', icon:'e' },
  // 护符
  'vitality_charm':  { id:'vitality_charm', name:'回春符', category:'护符', desc:'符字×2，点击回复4~7点。均衡稳定，入门首选。', icon:'春' },
  'nectar_charm':    { id:'nectar_charm', name:'甘露符', category:'护符', desc:'符字×1，低频但大额回复12~18点。危急时刻的救赎。', icon:'露' },
  'ward_charm':      { id:'ward_charm', name:'护身符', category:'护符', desc:'符字×1，回复3~5点并附加3点护盾。攻守兼备。', icon:'护' },
};

// 记忆碎片定义（Boss击败后解锁）
const BESTIARY_MEMORY_DEFS = {
  'memory_first_dive': {
    id: 'memory_first_dive', name: '初次潜航',
    desc: '睁开眼睛的那一刻，你看到的是深蓝色的海。零的声音从远处传来——那是你第一次听到她的声音。虽然你不记得她是谁。',
    source: '序章 · 觉醒',
  },
  'memory_regret_defeated': {
    id: 'memory_regret_defeated', name: '憾的退却',
    desc: '憾逃向了深层。零说它被更深的信号吸引了。那信号到底是什么？零的眼神里有一种你不理解的悲伤。',
    source: '击败憾',
  },
  'memory_yi_defeated': {
    id: 'memory_yi_defeated', name: '遗的终结',
    desc: '遗崩塌的那一刻，憾从黑暗中冲了出来。两个存在合为一体，然后消散。零的投影在那一刻亮得刺眼——你看到了什么，但很快就忘了。',
    source: '击败遗',
  },
  'memory_white_room': {
    id: 'memory_white_room', name: '白色的房间',
    desc: '……白色的房间。有人在说话。「你会忘掉一切，但你一定会找到她。」这句话是什么意思？说话的人是谁？',
    source: '???',
  },
  'memory_recall_defeated': {
    id: 'memory_recall_defeated', name: '忆的消散',
    desc: '忆崩塌成无数记忆碎片的那一刻，零说了一句话：「遗忘……有时候也是一种慈悲。」那些碎片亮了一瞬，然后沉入深海。',
    source: '击败忆',
  },
  'memory_obsess_defeated': {
    id: 'memory_obsess_defeated', name: '执的松手',
    desc: '执消散时，紧紧攥住的东西终于松开了。那是一个模糊的轮廓——像是一个人，又像是某个再也回不去的时刻。',
    source: '击败执',
  },
  'memory_regretful_defeated': {
    id: 'memory_regretful_defeated', name: '遗憾的安息',
    desc: '遗憾消散时，深海里只剩一片寂静。零站在你身边，很久很久没有说话。最后她说：「走吧。有些遗憾，注定无法弥补。」',
    source: '击败遗憾',
  },
  // ── 第一章独特事件碎片（一次性）──
  'unique_name_echo': {
    id: 'unique_name_echo', name: '名字的回声',
    desc: '一段语音残片：沙哑的男声叮嘱「记住她的名字，就算你忘了自己是谁」。零的名字就在舌尖，却怎么也抓不住。',
    source: '第一章 · 记忆碎片',
  },
  'unique_beacon': {
    id: 'unique_beacon', name: '沉锚信标',
    desc: '废弃的潜航信标在此运转了整整十年，最后一行标注是「她还在下面」。时间戳和你醒来的日子隔了十年。',
    source: '第一章 · 记忆碎片',
  },
  'unique_letter': {
    id: 'unique_letter', name: '未寄出的信',
    desc: '一封字迹属于你的信：「如果读到这封信的人是我——那你又忘了一次。别让遗憾把你留在这片海里。」落款只有一个日期。',
    source: '第一章 · 记忆碎片',
  },
  'unique_light': {
    id: 'unique_light', name: '第十年的光',
    desc: '零的记忆：在黑暗底部数着日子，一个光点沉下来，又浮上去。她轻声说：再来一次吧，我会等的。',
    source: '第一章 · 记忆碎片',
  },
  'unique_fork': {
    id: 'unique_fork', name: '歧路',
    desc: '一块凝固的遗憾。一条路通向海面，一条路通向深海。你无数次站在岔路口，每一次都选了深潜。',
    source: '第一章 · 记忆碎片',
  },
  'unique_return': {
    id: 'unique_return', name: '归途',
    desc: '散落的词元拼出你的潜航记录——第1次失忆，第2次失忆，第3次……每一次都重新出发。你从来不是第一次来。',
    source: '第一章 · 记忆碎片',
  },
};

// 遗响图鉴定义（从 ECHO_DEFS 动态生成，单一数据源，避免重复维护）
const BESTIARY_RELIC_DEFS = {};
if (typeof ECHO_DEFS !== 'undefined' && typeof ECHO_RARITY !== 'undefined') {
  Object.entries(ECHO_DEFS).forEach(([key, d]) => {
    const rr = ECHO_RARITY[d.rarity] || ECHO_RARITY.common;
    BESTIARY_RELIC_DEFS[key] = {
      id: key, name: d.name, category: rr.label + '遗响',
      desc: d.desc, icon: d.icon || '忆', iconColor: rr.color,
    };
  });
}

// ═══════════════ 数据持久化 ═══════════════

function loadBestiary() {
  try {
    const raw = localStorage.getItem(BESTIARY_KEY);
    if (raw) {
      bestiaryData = JSON.parse(raw);
    } else {
      bestiaryData = {};
    }
  } catch(e) {
    bestiaryData = {};
  }
  // 确保子键存在（兼容旧存档格式）
  if (!bestiaryData.enemies) bestiaryData.enemies = {};
  if (!bestiaryData.equipment) bestiaryData.equipment = {};
  if (!bestiaryData.memories) bestiaryData.memories = {};
  if (!bestiaryData.relics) bestiaryData.relics = {};
}

function saveBestiary() {
  try {
    localStorage.setItem(BESTIARY_KEY, JSON.stringify(bestiaryData));
  } catch(e) {}
}

/** 记录敌人遭遇 */
function registerEnemy(enemyId) {
  if (!bestiaryData) loadBestiary();
  if (!bestiaryData.enemies[enemyId]) {
    bestiaryData.enemies[enemyId] = { discovered: true, timestamp: Date.now() };
    saveBestiary();
  }
}

/** 记录装备获得 */
function registerEquipment(equipId) {
  if (!bestiaryData) loadBestiary();
  if (!bestiaryData.equipment[equipId]) {
    bestiaryData.equipment[equipId] = { discovered: true, timestamp: Date.now() };
    saveBestiary();
  }
}

/** 记录记忆碎片解锁 */
function registerMemory(memoryId) {
  if (!bestiaryData) loadBestiary();
  if (!bestiaryData.memories[memoryId]) {
    bestiaryData.memories[memoryId] = { discovered: true, timestamp: Date.now() };
    saveBestiary();
  }
}

/** 记录遗响获得 */
function registerRelic(relicId) {
  if (!bestiaryData) loadBestiary();
  if (!bestiaryData.relics) bestiaryData.relics = {};
  if (!bestiaryData.relics[relicId]) {
    bestiaryData.relics[relicId] = { discovered: true, timestamp: Date.now() };
    saveBestiary();
  }
}

// ═══════════════ 图鉴界面 ═══════════════

function openBestiary() {
  loadBestiary();
  bestiaryOpen = true;
  bestiaryTab = 'enemies';
  bestiaryAlpha = 0;
  bestiaryScrollY = 0;
  if (typeof Sound !== 'undefined') Sound.uiOpen();
}

function closeBestiary() {
  bestiaryOpen = false;
  bestiaryAlpha = 0;
  if (typeof Sound !== 'undefined') Sound.uiClose();
}

/** 更新（由main.js update调用） */
function updateBestiary(dt) {
  if (!bestiaryOpen) return;
  bestiaryAlpha = Math.min(1, bestiaryAlpha + dt * 3.0);
}

/** 渲染 */
function drawBestiary(ctx) {
  if (!bestiaryOpen || bestiaryAlpha < 0.02) return;

  const now = performance.now();
  ctx.save();
  ctx.globalAlpha = bestiaryAlpha;

  // 遮罩背景
  ctx.fillStyle = 'rgba(2,2,18,0.95)';
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = 'rgba(180,210,240,0.6)';
  ctx.font = '20px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('意识图鉴', W * 0.5, H * 0.08);

  // 标签栏
  const tabs = [
    { key: 'enemies', label: '敌人' },
    { key: 'equipment', label: '装备' },
    { key: 'memories', label: '记忆' },
    { key: 'relics', label: '遗响' },
  ];
  const tabW = 80, tabH = 32, tabGap = 12;
  const tabStartX = W * 0.5 - (tabs.length * tabW + (tabs.length - 1) * tabGap) / 2 + tabW / 2;
  const tabY = H * 0.14;

  tabs.forEach((tab, i) => {
    const tx = tabStartX + i * (tabW + tabGap);
    const isActive = bestiaryTab === tab.key;
    const hovered = mx > tx - tabW/2 && mx < tx + tabW/2 && my > tabY - tabH/2 && my < tabY + tabH/2;

    ctx.fillStyle = isActive ? 'rgba(180,210,255,0.12)' : 'rgba(255,255,255,0.03)';
    ctx.strokeStyle = isActive ? 'rgba(180,210,255,0.4)' : (hovered ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)');
    ctx.lineWidth = isActive ? 1.5 : 0.5;
    roundRect(ctx, tx - tabW/2, tabY - tabH/2, tabW, tabH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isActive ? '#c8ddf8' : 'rgba(200,210,230,0.4)';
    ctx.font = '14px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tab.label, tx, tabY);
  });

  // 内容区
  const contentY = H * 0.2;
  const contentH = H * 0.65;
  const marginX = W * 0.1;
  const contentW = W * 0.8;

  // 内容区背景
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  roundRect(ctx, marginX, contentY, contentW, contentH, 8);
  ctx.fill();
  ctx.stroke();

  // 根据标签渲染内容
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, marginX, contentY, contentW, contentH, 8);
  ctx.clip();

  if (bestiaryTab === 'enemies') {
    drawBestiaryTab(ctx, BESTIARY_ENEMY_DEFS, bestiaryData.enemies, marginX, contentY, contentW, contentH);
  } else if (bestiaryTab === 'equipment') {
    drawBestiaryTab(ctx, BESTIARY_EQUIP_DEFS, bestiaryData.equipment, marginX, contentY, contentW, contentH);
  } else if (bestiaryTab === 'memories') {
    drawBestiaryTab(ctx, BESTIARY_MEMORY_DEFS, bestiaryData.memories, marginX, contentY, contentW, contentH);
  } else if (bestiaryTab === 'relics') {
    drawBestiaryTab(ctx, BESTIARY_RELIC_DEFS, bestiaryData.relics, marginX, contentY, contentW, contentH);
  }

  ctx.restore();

  // 统计
  let total = 0, discovered = 0;
  let defs;
  if (bestiaryTab === 'enemies') { defs = BESTIARY_ENEMY_DEFS; }
  else if (bestiaryTab === 'equipment') { defs = BESTIARY_EQUIP_DEFS; }
  else if (bestiaryTab === 'memories') { defs = BESTIARY_MEMORY_DEFS; }
  else { defs = BESTIARY_RELIC_DEFS; }
  total = Object.keys(defs).length;
  const data = bestiaryTab === 'enemies' ? bestiaryData.enemies :
    bestiaryTab === 'equipment' ? bestiaryData.equipment :
    bestiaryTab === 'memories' ? bestiaryData.memories : bestiaryData.relics;
  discovered = Object.keys(data).filter(k => data[k] && data[k].discovered).length;

  ctx.fillStyle = 'rgba(180,200,220,0.3)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText(`已收录: ${discovered}/${total}`, W * 0.5, contentY + contentH + 16);

  // 底部提示
  ctx.fillStyle = 'rgba(150,170,200,0.25)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.fillText('点击标签页切换 · 点击空白关闭', W * 0.5, H * 0.92);

  ctx.restore();
}

/** 渲染单个标签页内容 */
function drawBestiaryTab(ctx, defs, data, marginX, contentY, contentW, contentH) {
  const itemH = 52, gap = 6;
  const startY = contentY + 10;
  const entries = Object.values(defs);
  bestiaryMaxScroll = Math.max(0, entries.length * (itemH + gap) - (contentH - 20));

  entries.forEach((entry, i) => {
    const y = startY + i * (itemH + gap) - bestiaryScrollY;
    if (y + itemH < contentY || y > contentY + contentH) return; // 裁剪

    const discovered = data[entry.id] && data[entry.id].discovered;
    const cx = marginX + 16;

    // 行背景
    if (discovered && mx > marginX && mx < marginX + contentW && my > y && my < y + itemH) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(marginX + 4, y, contentW - 8, itemH);
    }

    if (discovered) {
      // 图标
      const iconColor = entry.iconColor || '#8899bb';
      ctx.fillStyle = iconColor;
      ctx.font = '18px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(entry.icon || '?', cx, y + itemH / 2);

      // 名称 + 分类
      ctx.fillStyle = '#c8ddf8';
      ctx.font = '14px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'left';
      ctx.fillText(entry.name, cx + 28, y + 14);

      ctx.fillStyle = 'rgba(200,210,230,0.35)';
      ctx.font = '10px "Noto Serif SC","SimSun",serif';
      ctx.fillText(entry.category || '', cx + 28, y + 32);

      // 描述（右侧）
      ctx.fillStyle = 'rgba(180,190,210,0.45)';
      ctx.font = '10px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'left';
      const descMaxW = contentW - 160;
      ctx.fillText(truncateText(ctx, entry.desc || '', descMaxW), cx + 130, y + itemH / 2);

    } else {
      // 未解锁：???
      ctx.fillStyle = 'rgba(150,150,170,0.2)';
      ctx.font = '18px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, y + itemH / 2);

      ctx.fillStyle = 'rgba(150,150,170,0.25)';
      ctx.font = '14px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'left';
      ctx.fillText('???', cx + 28, y + 18);

      ctx.fillStyle = 'rgba(150,150,170,0.15)';
      ctx.font = '10px "Noto Serif SC","SimSun",serif';
      ctx.fillText('尚未发现', cx + 28, y + 34);
    }
  });
}

/** 截断文本以适应宽度 */
function truncateText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let truncated = text;
  while (ctx.measureText(truncated + '…').width > maxW && truncated.length > 1) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '…';
}

// ═══════════════ 交互 ═══════════════

function handleBestiaryClick(cx, cy) {
  if (!bestiaryOpen) return;

  // 标签栏点击
  const tabs = [
    { key: 'enemies', label: '敌人' },
    { key: 'equipment', label: '装备' },
    { key: 'memories', label: '记忆' },
    { key: 'relics', label: '遗响' },
  ];
  const tabW = 80, tabH = 32, tabGap = 12;
  const tabStartX = W * 0.5 - (tabs.length * tabW + (tabs.length - 1) * tabGap) / 2 + tabW / 2;
  const tabY = H * 0.14;

  for (let i = 0; i < tabs.length; i++) {
    const tx = tabStartX + i * (tabW + tabGap);
    if (cx > tx - tabW/2 && cx < tx + tabW/2 && cy > tabY - tabH/2 && cy < tabY + tabH/2) {
      bestiaryTab = tabs[i].key;
      if (typeof Sound !== 'undefined') Sound.uiClick();
      return;
    }
  }

  // 内容区外 → 关闭
  const contentY = H * 0.2;
  const contentH = H * 0.65;
  const marginX = W * 0.1;
  const contentW = W * 0.8;
  if (!(cx > marginX && cx < marginX + contentW && cy > contentY && cy < contentY + contentH)) {
    closeBestiary();
  }
}

// 初始化加载（安全包裹，隐私模式下localStorage不可用时静默降级）
try { loadBestiary(); } catch(e) { bestiaryData = { enemies:{}, equipment:{}, memories:{}, relics:{} }; }

// 图鉴滚动支持（滚轮 / 触控板）
window.addEventListener('wheel', e => {
  if (!bestiaryOpen) return;
  e.preventDefault();
  bestiaryScrollY = Math.max(0, Math.min(bestiaryMaxScroll, bestiaryScrollY + e.deltaY));
}, { passive: false });
