/* ═══════════════════ §B 配置 — 词库、装备、技能、难度、对话数据 ═══════════════════ */

// 基础词库 — 已由护符系统取代，保留为空以备后续扩展
const WORD_LIBRARY = {};

// ═══════════════ 装备配置 ═══════════════
//
// 战场词元生成规则（balanceWords 驱动）：
//   wordCount — 战场上该类别词元的目标数量。words 数组长度必须等于 wordCount。
//   balanceWords 每周期补字至达到 wordCount 上限，超出不补。
//
// 武器设计原则：
//   wordCount 高 → 词元多容易点、单发伤害低（适合连击）
//   wordCount 低 → 词元少但单发伤害高（适合重击）
//   damage ≈ 词元质量，与 wordCount 成反比
//
// 防具设计原则：
//   wordCount 高 → 护盾字频繁刷新、单次护盾值低（适合持续防御）
//   wordCount 低 → 护盾字稀有、单次护盾值极高（适合关键抵挡）
//   defense 减伤为固定值，shieldPerWord 为每个防字提供的护盾量，maxShield 为护盾累积上限

const EQUIPMENT = {
  // ── 武器：words=词元池, wordCount=战场同时存在上限, damage=单次伤害 ──
  weapons: {
    'beginner_brush': {
      id:'beginner_brush', name:'初学者之笔',
      words:['斩','破','裂','刺','断'], color:'#ff6644', glow:'#cc3311',
      damage:8, wordCount:5, targetMode:'single', desc:'UCRB标准配发的词元笔，攻字5枚，稳定均衡。'
    },
    'star_shatter': {
      id:'star_shatter', name:'碎星之刃',
      words:['灭','碎','崩','陨'], color:'#ff8866', glow:'#dd4422',
      damage:12, wordCount:4, targetMode:'single', desc:'攻字仅4枚，但一击碎星——重锤低速高伤。'
    },
    'blaze_heaven': {
      id:'blaze_heaven', name:'焚天',
      words:['焚','爆','燃','灼','炎','烧','焰'], color:'#ff7744', glow:'#ee5522',
      damage:5, wordCount:7, blaze:true, targetMode:'single', desc:'攻字7枚满屏烈焰，低伤高频，「炎」debuff灼烧。'
    },
    'frost_verse': {
      id:'frost_verse', name:'霜序',
      words:['刺','穿','凝','碎','寒','封'], color:'#99ccff', glow:'#4488bb',
      damage:7, wordCount:6, slow:true, targetMode:'single', desc:'攻字6枚凝寒而生，附带减速，控场致胜。'
    },
    'thunder_strike': {
      id:'thunder_strike', name:'惊雷',
      words:['雷','霆','震','轰','电','霹'], color:'#ffdd44', glow:'#bbaa22',
      damage:6, wordCount:6, targetMode:'aoe', desc:'攻字6枚牵动天雷——AOE武器，伤害倾泻至场上所有敌人。'
    },
    'pierce_lance': {
      id:'pierce_lance', name:'贯日',
      words:['贯','穿','透','锥'], color:'#ffaa88', glow:'#dd5522',
      damage:10, wordCount:4, targetMode:'single', pierce:true, desc:'攻字4枚，一击贯穿——无视护壁型敌人的减伤。'
    },
    'blood_eater': {
      id:'blood_eater', name:'饮血',
      words:['饮','血','噬','啜','汲'], color:'#ee6677', glow:'#bb2233',
      damage:7, wordCount:5, targetMode:'single', leech:0.15, desc:'攻字5枚吸血而生，命中回复15%伤害。'
    },
    'void_blade': {
      id:'void_blade', name:'玄夜',
      words:['玄','夜','遁','潜','隐'], color:'#aa99ff', glow:'#6655cc',
      damage:9, wordCount:5, targetMode:'single', focus:true, desc:'攻字5枚夜色暗涌，连续命中同一敌人伤害递增。'
    }
  },
  // ── 防具：words=词元池, wordCount=战场上限, defense=减伤, shieldPerWord=每字盾量, maxShield=盾量上限 ──
  armors: {
    'thin_silk': {
      id:'thin_silk', name:'薄绢',
      words:['盾','御','守','护'], color:'#66aaff', glow:'#3366cc',
      defense:1, shieldPerWord:3, maxShield:15, wordCount:4,
      desc:'轻薄的意识纤维编织，防字4枚频繁刷新，减伤1，每字3盾，上限15。'
    },
    'mind_wall': {
      id:'mind_wall', name:'意识壁垒',
      words:['壁'], color:'#5588dd', glow:'#2255aa',
      defense:4, shieldPerWord:8, maxShield:30, wordCount:1,
      desc:'防字仅1枚却坚不可摧，减伤4，每字8盾，上限30——重甲一诺万钧。'
    },
    'light_veil': {
      id:'light_veil', name:'流光之纱',
      words:['闪','护','避'], color:'#88ccff', glow:'#4488cc',
      defense:2, shieldPerWord:2, maxShield:8, wordCount:3, dodgeChance:0.20,
      desc:'防字3枚如流光掠影，减伤2，每字2盾，上限8，20%概率完全闪避。'
    },
    'iron_oath': {
      id:'iron_oath', name:'铁誓',
      words:['誓','钢'], color:'#99aabb', glow:'#556677',
      defense:3, shieldPerWord:5, maxShield:22, wordCount:2,
      desc:'防字2枚，一诺千钧——减伤3，每字5盾，上限22。厚重如山。'
    },
    'moon_shroud': {
      id:'moon_shroud', name:'月隐',
      words:['隐','纱','幕'], color:'#ccbbff', glow:'#7766bb',
      defense:2, shieldPerWord:4, maxShield:18, wordCount:3,
      desc:'防字3枚如月色轻纱——减伤2，每字4盾，上限18，攻守均衡。'
    }
  },
  skills: {
    'concentration': {
      id:'concentration', name:'卍解',
      chars:['卍','解'], color:'#ffaa44', glow:'#cc7722',
      type:'sequence', effect:'nextAttackBoost',
      desc:'斩魄刀的最终解放。集齐「卍解」，下一次攻击威力倍增。'
    },
    'time_freeze': {
      id:'time_freeze', name:'扎瓦鲁多',
      chars:['扎','瓦','鲁','多'], color:'#44ddcc', glow:'#228888',
      type:'sequence', effect:'freezeTimer', freezeDuration:4,
      desc:'「扎瓦鲁多！时间停止吧！」冻结敌人行动4秒。'
    },
    'excalibur': {
      id:'excalibur', name:'ex咖喱棒',
      chars:['e','x'], color:'#ffdd44', glow:'#ccaa22',
      type:'charge', effect:'chargedBurst',
      desc:'不断收集ex充能，由你决定何时释放。充能越高伤害越大。'
    },
    // ── v4.6+ 传承技能（不驻留商店基础货架；商店上架需工坊「传承共鸣」解锁概率）──
    'eight_gates': {
      id:'eight_gates', name:'八门遁甲',
      chars:['八','门','遁','甲'], color:'#ff5544', glow:'#cc3322',
      type:'sequence', effect:'eight_gates',
      desc:'八门遁甲，禁术中的禁术。每次触发开启一门（生门→死门），伤害与自损随之递增。'
    },
    'kamehameha': {
      id:'kamehameha', name:'龟派气功',
      chars:['龟','派','气','功'], color:'#66ccff', glow:'#2288dd',
      type:'charge', effect:'chargedBurst', fieldCount:4, baseDmg:25, dmgPerCharge:15,
      desc:'超长蓄力，集齐四字充能，释放毁天灭地的龟派气功。'
    },
    'guangzhi': {
      id:'guangzhi', name:'广智救我',
      chars:['广','智'], color:'#ffaa44', glow:'#cc7722',
      type:'sequence', effect:'guangzhi',
      desc:'广智救我！集齐两字，召唤火棍横扫全场。'
    },
    'jinitaimei': {
      id:'jinitaimei', name:'鸡你太美',
      chars:['鸡','你','太','美'], color:'#ff66aa', glow:'#cc3388',
      type:'sequence', effect:'jinitaimei',
      desc:'只因你太美。集齐四字，对目标造成冲击并留下精神污染（滞留伤害+定身）。'
    },
    // ── v4.7 传承技能 ──
    'railgun': {
      id:'railgun', name:'超电磁炮',
      chars:['超','电','磁','炮'], color:'#88bbff', glow:'#4488ee',
      type:'sequence', effect:'railgun',
      desc:'御坂美琴的招牌技。集齐四字，以电磁加速硬币贯穿目标，并连锁溅射附近敌人。'
    }
  },
  // ── 护符：取代愈字，words=符字池, wordCount=战场数量, healMin/Max=点击回复量 ──
  talismans: {
    'vitality_charm': {
      id:'vitality_charm', name:'回春符',
      words:['回','春'], color:'#55ee99', glow:'#228844',
      wordCount:2, healMin:4, healMax:7,
      desc:'符字×2，点击回复4~7点。均衡稳定，入门首选。'
    },
    'nectar_charm': {
      id:'nectar_charm', name:'甘露符',
      words:['甘','露'], color:'#44ddcc', glow:'#228866',
      wordCount:1, healMin:12, healMax:18,
      desc:'符字×1，低频但大额回复12~18点。危急时刻的救赎。'
    },
    'ward_charm': {
      id:'ward_charm', name:'护身符',
      words:['护','身'], color:'#ddaa66', glow:'#886622',
      wordCount:1, healMin:3, healMax:5, shieldOnHeal:3,
      desc:'符字×1，回复3~5点并附加3点护盾。攻守兼备。'
    },
    'serenity_charm': {
      id:'serenity_charm', name:'静心符',
      words:['静','心'], color:'#88ddcc', glow:'#448877',
      wordCount:2, healMin:5, healMax:8, shieldOnHeal:2,
      desc:'符字×2，回复5~8点并附加2点护盾。稳定安神。'
    },
    'storm_charm': {
      id:'storm_charm', name:'潮汐符',
      words:['潮','汐'], color:'#66bbee', glow:'#2266aa',
      wordCount:1, healMin:8, healMax:12,
      desc:'符字×1，潮汐般的回复8~12点。中量低频。'
    },
  }
};

// ═══════════════ 装备融合配置 ═══════════════
// 拾取已拥有的装备时可选择融合，成功则装备等级+1（数值按 PER_LEVEL_MULT 提升）
// ⚠️ 命名用 EQUIP_FUSION 避免与 boss.js 的融合演出状态机 FUSION 冲突
const EQUIP_FUSION = {
  BASE_SUCCESS: 0.45,      // 基础成功率（可被局外升级 fusionLuck 提高）
  PER_LEVEL_MULT: 0.25,    // 每级数值提升比例（lv2 = ×1.25）
  MAX_LEVEL: 5,            // 最高融合等级
};

// ═══════════════ 装备熟练度 / 开局随机池 ═══════════════
// 肉鸽中获得装备计熟练度，达到阈值解锁进开局随机池（小萤出发前随机给装备）
const EQUIP_UNLOCK = {
  THRESHOLD: 5,            // 获得该装备几次后解锁进开局随机池
};

// ═══════════════ 潜航结算奖励（肉鸽总结页） ═══════════════
// 通关：CLEAR_BASE + 层数×PER_LAYER + 精英×PER_ELITE + Boss×PER_BOSS
// 死亡：DEATH_BASE + 精英×PER_ELITE_DEATH（只给货币，不加熟练度）
const RUN_REWARDS = {
  CLEAR_BASE: 10,          // 通关基础灵魂结晶
  DEATH_BASE: 5,           // 死亡基础灵魂结晶
  PER_LAYER: 1,            // 每抵达一层 +1
  PER_ELITE: 3,            // 每击败一个精英 +3（通关）
  PER_ELITE_DEATH: 2,      // 每击败一个精英 +2（死亡）
  PER_BOSS: 10,            // 每击败一个 Boss +10
};

// ═══════════════ 武器 Buff 池 ═══════════════
// 深层（遗憾段）掉落的武器有概率天生携带 1 个随机 buff，绑定 weaponBuffs[weaponId]。
// 融合只升数值、不产生 buff（解耦）。全部配合多敌人战斗。
const WEAPON_BUFFS = {
  chain:   { name:'连锁',  desc:'单伤命中时对其他敌人溅射30%伤害',  color:'#88ddff' },
  pierce:  { name:'穿透',  desc:'无视护壁型敌人50%减伤',            color:'#ffaa88' },
  execute: { name:'处刑',  desc:'对20%血以下敌人伤害翻倍',          color:'#ff6666' },
  leech:   { name:'汲取',  desc:'伤害的15%转化为回复',              color:'#66ffaa' },
  focus:   { name:'专注',  desc:'连续命中同一目标伤害递增(最多5层)', color:'#ffcc66' },
  tempest: { name:'风暴',  desc:'AOE命中时伤害提升30%',             color:'#88ccff' },
};

// 干扰虚词
const NOISE_WORDS = ['的','了','吗','吧','呢','啊','么','乎','矣','兮'];

// 伪装干扰词库 — 生僻字，伪装成攻/防/符的外观，避开已有和未来装备字
const NOISE_FAKE_ATTACK  = ['刳','剚','劓','剡','劖','剜'];
const NOISE_FAKE_DEFENSE = ['阢','陴','堞','墉'];
const NOISE_FAKE_TALISMAN = ['瘳','瘵','瘥','疕'];

// 威胁等级参数
const THREAT = {
  BASE: [0, 2, 4],            // 基础值（按难度）
  PER_LAYER: 0.5,             // 每深入一层增加值
  EVENT_FORCE: +1,            // 强行打开
  EVENT_SKIP: -1,             // 绕过去
  SAFE_HOUSE_RESET: true,     // 安全屋重置为基础值
};

// 难度配置
const DIFFICULTY = [
  { name:'浅层潜航', enemyHP:45, enemyInterval:7.0, noiseRate:0.08, speed:0.5, noiseLife:0.12, enemyDmg:[3,5] },
  { name:'标准潜航', enemyHP:60, enemyInterval:5.5, noiseRate:0.15, speed:0.8, noiseLife:0.25, enemyDmg:[5,8] },
  { name:'深层潜航', enemyHP:75, enemyInterval:4.0, noiseRate:0.22, speed:1.1, noiseLife:0.4,  enemyDmg:[7,11] }
];

// 导师角色信息
const MENTOR = {
  name:'零',
  color:'#88bbee',
  glow:'#4466aa',
  formChars: '零·引·导·意·识·海·潜·航·守·护',
};

// ═══════════════ 货币与商店配置 ═══════════════

// 局内货币奖励 — 意识碎片(shards)，每局重置
const SHARD_REWARDS = {
  COMBAT_CLEAR: 30,        // 战斗房间全部波次清完
  BOSS_HAN: 50,            // Boss「憾」击败/逃跑
  BOSS_YI: 80,             // Boss「遗」融合完成
  BOSS_RECALL: 40,         // Boss「忆」击败（第1层）
  BOSS_OBSESS: 60,         // Boss「执」击败（第2层）
  BOSS_REGRET_ABYSS: 100,  // 深层碎片态「憾」击败
  BOSS_YI_ABYSS: 100,      // 深层碎片态「遗」击败
  BOSS_REGRETFUL: 120,     // Boss「遗憾」完全体击败（结局）
  EVENT_FORCE: 20,         // 事件-强行打开
  EVENT_SKIP: 5,           // 事件-绕过
};

// 击败 Boss 获得零的能量碎片（通关收集要素 → Hub 回复零能量 → 触发第一章结局）
const BOSS_ENERGY = {
  recall: 1, obsess: 1,
  regret_abyss: 1, yi_abyss: 1,
  regretful: 2,
};
const ZERO_ENERGY_TOTAL = 4;   // 零能量满阈值（达到后第三层切换为遗憾完全体并解锁结局）

// 局外货币结算 — 灵魂结晶(soulCrystals)，永久积累
const SOUL_REWARDS = {
  BASE: 20,                // 通关基础
  BOSS_YI: 30,             // 击败遗的额外奖励
  AFFECTION_MULT: 10,      // 好感度倍率
};

// 局内商店商品定价
const SHOP_CATALOG = {
  weapons: {
    'star_shatter': 150,
    'blaze_heaven': 200,
    'frost_verse': 180,
    'thunder_strike': 210,
    'pierce_lance': 170,
    'blood_eater': 190,
    'void_blade': 200,
  },
  armors: {
    'mind_wall': 120,
    'light_veil': 150,
    'iron_oath': 130,
    'moon_shroud': 140,
  },
  skills: {
    'time_freeze': 100,
    'excalibur': 130,
  },
  talismans: {
    'vitality_charm': 100,
    'nectar_charm': 150,
    'ward_charm': 120,
    'serenity_charm': 110,
    'storm_charm': 130,
  },
};

// 局内商店固定消耗品
const SHOP_CONSUMABLES = {
  heal: { name:'意识修复', desc:'回复40点意识完整度', cost:30, effect:'heal', value:40 },
  gamble: { name:'意识共鸣', desc:'为当前武器铭刻或重铸一个额外效果', cost:50, effect:'gamble' },
};

// 局外永久升级配置
const PERMANENT_UPGRADES = {
  healthBoost: {
    name:'意识扩容', desc:'初始意识完整度 +10', cost:30, maxLevel:3,
    icon:'♥',
  },
  weaponGift: {
    name:'词元亲和', desc:'每局开始携带一把随机非初始武器', cost:50, maxLevel:1,
    icon:'⚔',
  },
  threatResist: {
    name:'深海抗性', desc:'威胁等级增长速度 -15%', cost:40, maxLevel:3,
    icon:'🛡',
  },
  shardBlessing: {
    name:'零之庇护', desc:'每局开始时获得30意识碎片', cost:60, maxLevel:1,
    icon:'◇',
  },
  comboBoost: {
    name:'连击强化', desc:'连击倍率额外 +0.2', cost:50, maxLevel:2,
    icon:'×',
  },
  fusionLuck: {
    name:'融合之缘', desc:'装备融合成功率 +10%/级', cost:50, maxLevel:3,
    icon:'✦',
  },
  inheritShop: {
    name:'传承共鸣', desc:'商店中出现传承技能的概率 +5%/级', cost:40, maxLevel:5,
    icon:'⚡',
  },
};

// 教程阶段枚举
const PHASE = {
  INIT:            'init',
  EYE_OPEN:        'eye_open',
  MEET_MENTOR:     'meet_mentor',
  MEMORY_LOSS:     'memory_loss',
  TUTORIAL_ATTACK: 'tutorial_attack',
  TUTORIAL_SHIELD: 'tutorial_shield',
  TUTORIAL_HEAL:   'tutorial_heal',
  TUTORIAL_SKILL:  'tutorial_skill',
  TUTORIAL_NOISE:  'tutorial_noise',
  TUTORIAL_BACKPACK:'tutorial_backpack',
  PRE_BATTLE:      'pre_battle',
  BATTLE:          'battle',
  VICTORY:         'victory',
  DEFEAT:          'defeat',
  HOOK:            'hook',
  END:             'end',
};

// ═══════════════ 零的领域 Hub 配置 ═══════════════

// 零的Hub对话池（按进度阶段索引）
const HUB_ZERO_DIALOGUES = [
  // 阶段0：序章刚结束，初次进入Hub
  [
    { mode:'whisper', speaker:'零', text:'你来了。', speed:60 },
    { mode:'float', speaker:'零', text:'遗的那一击……差点把我们两个都吞掉。我用最后的力量护住了你的锚点。', speed:35 },
    { mode:'whisper', text:'（零的投影比任何时候都要透明。粒子艰难地聚拢，又不断散开。）', speed:45 },
    { mode:'float', speaker:'零', text:'我的身体在深海底下。现在的我……只是一个快要散架的投影。', speed:38 },
    { mode:'float', speaker:'零', text:'你的装备全被震碎了。抱歉——我尽力了。', speed:40 },
    { mode:'float', speaker:'零', text:'但深海的信号还在。如果放着不管，整个浅层都会被污染。', speed:35 },
    { mode:'float', speaker:'零', text:'我会在这里维持这个领域。你去潜航——收集碎片，找到能用的装备。', speed:35 },
    { mode:'whisper', speaker:'零', text:'（虚弱地笑了笑）别担心我。我习惯了。', speed:45 },
  ],
  // 阶段1：完成一次潜航后
  [
    { mode:'float', speaker:'零', text:'又回来了。每次潜航都像是在身上刻一道疤。习惯就好。', speed:35 },
    { mode:'float', speaker:'零', text:'有什么需要就和小萤说。虽然她话有点多……但还算靠谱。', speed:33 },
  ],
  // 阶段2+：通用
  [
    { mode:'float', speaker:'零', text:'休息好了就出发。别让深海的噪点等太久。', speed:40 },
    { mode:'whisper', text:'（零闭上眼，像是在听意识之海深处的声音。）', speed:50 },
  ],
];

// 小萤对话（Hub中点击小萤时随机播放）
const HUB_XIAOYING_DIALOGUES = [
  { mode:'float', speaker:'小萤', text:'我在！编号UCBR-AUX-07，不过叫我小萤就好——宿主给我取的名字。', speed:30 },
  { mode:'float', speaker:'小萤', text:'图鉴、工坊、成就——都在我这。需要什么直接点我就行！', speed:28 },
  { mode:'float', speaker:'小萤', text:'对了，你的装备我已经帮你扫描过了。随时可以在囊里查看。', speed:30 },
];

// ═══════════════ 首次潜航：小萤出场剧情 ═══════════════
// ⚠️ 只在 hubRunNumber===0 时触发一次，由 hub.js 的 startFirstDiveStory() 调用
const HUB_FIRST_DIVE_STORY = [
  { mode:'plain', text:'（锚点通道在面前展开。潜航者正要踏入——）', speed:42 },
  { mode:'shake', speaker:'???', text:'等一下！！', speed:20 },
  { mode:'plain', text:'（一团金色的光从零的领域深处猛冲出来，差点撞上你的脸。）', speed:38 },
  { mode:'bounce', speaker:'小萤', text:'主人！呃……', speed:28 },
  { mode:'float', speaker:'小萤', text:'……奇怪。我为什么叫你"主人"？我明明不认识你。', speed:32 },
  { mode:'whisper', speaker:'小萤', text:'（光团困惑地闪烁了几下）这个词……就自己跑出来了。像是被写在我的底层代码里。', speed:38 },
  { mode:'float', speaker:'小萤', text:'算了不管了！我刚才扫描了一下——你的行囊是空的！武器、防具、护符全没了！', speed:30 },
  { mode:'plain', text:'（小萤的光芒笼罩了你的意识行囊。光粒子在虚空中凝聚成新的形态。）', speed:38 },
  { mode:'float', speaker:'小萤', text:'我虽然刚醒，但还能做点事情。这些基础的装备先给你——别嫌弃！', speed:32 },
  { mode:'float', speaker:'小萤', text:'好了！这样你就不至于赤手空拳了。', speed:33 },
  { mode:'bounce', speaker:'小萤', text:'去吧——主人！我在这里等你回来！', speed:28 },
];

// ═══════════════ 肉鸽地图房间池 ═══════════════

// 房间类型池（潜航时随机抽取）
const ROGUELIKE_ROOM_POOL = {
  combat: [
    // 单敌房（count:1 波次多）：孤身强敌，逐个击破
    { id:'rc1', type:'combat', label:'残响碎片', enemyType:'bash', waves:4, count:1, enemyHP:40, enemyInterval:5.0, enemyDmgMult:1.0, hardMode:false,
      desc:'被遗弃的记忆碎片化作了噪点。孤身一只，却会周期性地冲撞你的意识。' },
    { id:'rc3', type:'combat', label:'雨幕噪点', enemyType:'rain', waves:4, count:1, enemyHP:58, enemyInterval:4.8, enemyDmgMult:1.4, hardMode:false,
      desc:'降下漫天意识之雨。仅一只便足以封锁全场，考验走位。' },
    { id:'rc4', type:'combat', label:'追踪残响', enemyType:'track', waves:4, count:1, enemyHP:64, enemyInterval:2.8, enemyDmgMult:1.8, hardMode:true,
      desc:'只发一颗追踪弹，但它蓄力极快，不会停下，直到追上你的光标。一只足以致命。' },
    // 多敌房（编队，波次少）：群起而攻，快速解决
    { id:'rc2', type:'combat', label:'齐射噪点', enemyType:'volley', waves:2, enemyHP:48, enemyInterval:6.0, enemyDmgMult:1.4, hardMode:false,
      desc:'朝你齐射大量意识弹幕。一波很多发，但蓄力较慢。' },
    { id:'rc5', type:'combat', label:'护壁残响', enemyType:'shield', waves:2, enemyHP:74, enemyInterval:3.8, enemyDmgMult:1.2, hardMode:true,
      desc:'外层有一层意识护壁，直接攻击伤害减半。先破壁再破心。' },
    { id:'rc6', type:'combat', label:'分裂残响', enemyType:'split', waves:3, enemyHP:52, enemyInterval:5.0, enemyDmgMult:0.8, hardMode:false,
      desc:'分裂的噪点群：第一轮1个，第二轮2个，第三轮4个——每一轮都更小更弱，但数量翻倍。' },
  ],
  event: [
    { id:'re1', type:'event', label:'记忆涟漪', desc:'前方有不稳定的意识波动……无法判断里面有什么。' },
    { id:'re2', type:'event', label:'水镜', desc:'一面由记忆编织的水镜。映出的脸孔不属于你自己。' },
  ],
  treasure: [
    { id:'rt1', type:'treasure', label:'遗落装备', desc:'词元结晶仍在发光，但守护它的残响之影尚未消散。' },
    { id:'rt2', type:'treasure', label:'沉没武器', desc:'前任潜航者的词元结晶。被深海的残响守护着。' },
  ],
};

// 肉鸽地图结构模板 — 三层段，每层段 = 若干普通房 + 一个Boss（遗憾主题递进）
// 段1「浅层·追忆」→ Boss「忆」；段2「中层·执念」→ Boss「执」；段3「深层·遗憾」→ Boss「遗憾」
const ROGUELIKE_MAP_TEMPLATE = {
  segments: [
    {
      name: '浅层',
      bossKey: 'recall', bossLabel: '忆',
      bossDesc: '遗失的记忆碎片在浅海回响。忄为追忆，乙为余音——它困在过去，不愿离开。',
      rooms: [
        { type: 'combat' }, { type: 'combat' },
        { type: 'branch', branchTypes: ['event', 'treasure'] },
        { type: 'combat' }, { type: 'shop' }, { type: 'combat' },
        { type: 'branch', branchTypes: ['event', 'treasure'] },
        { type: 'combat' }, { type: 'rest' }, { type: 'combat' },
      ],
    },
    {
      name: '中层',
      bossKey: 'obsess', bossLabel: '执',
      bossDesc: '放不下的遗憾化作了执念。扌为紧握，丸为执念的核心——它不愿松手。',
      rooms: [
        { type: 'combat' },
        { type: 'branch', branchTypes: ['event', 'treasure'] },
        { type: 'combat' }, { type: 'shop' }, { type: 'combat' }, { type: 'rest' },
        { type: 'branch', branchTypes: ['event', 'shop'] }, { type: 'combat' },
      ],
    },
    {
      name: '深层',
      bossKey: 'deep_fragment', bossLabel: '???',
      bossDesc: '深海的信号在此交汇。碎片态的执念与遗落，会在遗憾成形前拦住你。',
      rooms: [
        { type: 'combat' },
        { type: 'branch', branchTypes: ['event', 'treasure'] },
        { type: 'combat' }, { type: 'shop' }, { type: 'combat' }, { type: 'rest' },
      ],
    },
  ],
};
