// ======================== 存档 & 配置 ========================
const SAVE_KEY = 'school_save';
const CFG_KEY = 'school_cfg';

// AI 配置
let aiConfig = { url: '', key: '', model: 'deepseek-v4-flash' };

function loadConfig() {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) { const d = JSON.parse(raw); aiConfig.url = d.url || ''; aiConfig.key = d.key || ''; aiConfig.model = d.model || 'deepseek-v4-flash'; }
  } catch(e) { console.warn('读取AI配置失败'); }
}

function saveConfig() {
  localStorage.setItem(CFG_KEY, JSON.stringify(aiConfig));
}

function saveGame() {
  const data = JSON.stringify(G);
  localStorage.setItem(SAVE_KEY, data);
  return data;
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function hasSavedGame() {
  return !!localStorage.getItem(SAVE_KEY);
}

function quickSave() {
  saveGame();
  addLog('💾 已保存');
}

function initGameState() {
  return {
    // 玩家档案
    player: {
      name: '', gender: '', focus: '', personality: '', orientation: '', transferReason: '',
      // 人设（v0.4）
      appearance: '',     // 外观描述
      hobbies: '',        // 兴趣爱好
      talent: '',         // 擅长的事
      weakness: '',       // 不擅长的事
      clubPreference: '', // 社团倾向
      birthday: '',       // 生日
      bio: '',            // AI生成的完整人设小传
    },
    // 时间
    year: 1, semester: 1, week: 1,
    // 数值
    grade: 50, energy: 80, maxEnergy: 100, mood: 60, money: 500,
    // 角色
    characters: {},        // { id: { 完整档案 } }
    characterOrder: [],    // 核心角色ID顺序
    npcOrder: [],          // 衍生角色ID顺序
    nextCharId: 1,
    // 角色生成追踪
    recentCharacterTags: [],
    // 事件
    currentEvent: null,    // 当前进行中的事件
    eventLog: [],          // 回忆 { year, semester, week, text, starred }
    // 恋爱
    lover: null,           // 恋人角色ID
    // 冷却
    inviteCooldown: 0,     // 邀约冷却剩余回合
    // 新提醒
    newCharacterAlert: false,
    // 回合状态
    roundInProgress: false, // 是否在回合中（已选行动但未完成事件）
    contentRating: 'all-ages',  // 'all-ages' | 'r18'
    phase: 'init',         // 'init' | 'playing' | 'graduated'
    turnsSinceStudy: 0,    // 连续未学习回合数，>=3开始掉成绩
  };
}
