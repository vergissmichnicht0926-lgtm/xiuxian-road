/* ═══════════════════ §B 配置 — 词库、装备、技能、难度、对话数据 ═══════════════════ */

// 基础词库 — 愈字不受装备影响
const WORD_LIBRARY = {
  '愈': { words:['愈','生','复','疗','续','苏','润','养','补','安'], color:'#44dd88', glow:'#228844' }
};

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
      damage:8, wordCount:5, desc:'UCRB标准配发的词元笔，攻字5枚，稳定均衡。'
    },
    'star_shatter': {
      id:'star_shatter', name:'碎星之刃',
      words:['灭','碎','崩'], color:'#ff8866', glow:'#dd4422',
      damage:12, wordCount:4, desc:'攻字仅4枚，但一击碎星——重锤低速高伤。'
    },
    'blaze_heaven': {
      id:'blaze_heaven', name:'焚天',
      words:['焚','爆','燃','灼','炎','烧','焰'], color:'#ff7744', glow:'#ee5522',
      damage:5, wordCount:7, blaze:true, desc:'攻字7枚满屏烈焰，低伤高频，「炎」debuff灼烧。'
    },
    'frost_verse': {
      id:'frost_verse', name:'霜序',
      words:['刺','穿','凝','碎','寒','封'], color:'#99ccff', glow:'#4488bb',
      damage:7, wordCount:6, slow:true, desc:'攻字6枚凝寒而生，附带减速，控场致胜。'
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
    }
  },
  skills: {
    'concentration': {
      id:'concentration', name:'凝神',
      chars:['凝','神'], color:'#ffaa44', glow:'#cc7722',
      type:'sequence', effect:'nextAttackBoost',
      desc:'凝聚心神，下一次攻击威力倍增。'
    },
    'time_freeze': {
      id:'time_freeze', name:'时间暂停',
      chars:['时','间','暂','停'], color:'#44ddcc', glow:'#228888',
      type:'sequence', effect:'freezeTimer', freezeDuration:4,
      desc:'干扰噪点的时间感知，冻结敌人行动4秒。'
    },
    'excalibur': {
      id:'excalibur', name:'ex咖喱棒',
      chars:['e','x'], color:'#ffdd44', glow:'#ccaa22',
      type:'charge', effect:'chargedBurst',
      desc:'不断收集ex充能，由你决定何时释放。充能越高伤害越大。'
    }
  }
};

// 干扰虚词
const NOISE_WORDS = ['的','了','吗','吧','呢','啊','么','乎','矣','兮'];

// 伪装干扰词库 — 生僻字，伪装成攻/防/愈的外观，避开已有和未来装备字
const NOISE_FAKE_ATTACK  = ['刳','剚','劓','剡','劖','剜'];
const NOISE_FAKE_DEFENSE = ['阢','陴','堞','墉'];
const NOISE_FAKE_HEAL    = ['瘳','瘵','瘥','疕'];

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
