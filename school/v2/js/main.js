// ======================== 主控逻辑 ========================

let G = initGameState();

// ==================== 加载动画 ====================
const LOADING_MESSAGES = [
  '樱花飘落，故事正在发生……',
  '新的相遇即将到来……',
  '命运的线正在交织……',
  '青春的一页正在书写……',
  '校园的钟声轻轻响起……',
  '教室的窗边，阳光正好……',
  '社团活动室里，有人在等你……',
  '放学的路上，夕阳很美……',
];

let loadingMsgTimer = null;

function showLoading(msg = '正在生成……') {
  document.getElementById('loadingText').textContent = msg;
  document.getElementById('loadingOverlay').style.display = 'flex';

  // 轮播文案
  let idx = 0;
  if (loadingMsgTimer) clearInterval(loadingMsgTimer);
  loadingMsgTimer = setInterval(() => {
    idx = (idx + 1) % LOADING_MESSAGES.length;
    document.getElementById('loadingText').textContent = LOADING_MESSAGES[idx];
  }, 2000);
}

function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
  if (loadingMsgTimer) { clearInterval(loadingMsgTimer); loadingMsgTimer = null; }
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  initNav();
  initCharTabs();
  initMemYears();
  initTitleScreen();
  initPersonaChoice();
  initCustomizeScreen();

  // 主页行动按钮事件
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'invite') { handleInviteAction(); return; }
      if (action && !G.roundInProgress) doAction(action);
    });
  });
});

// ==================== 标题画面 ====================
function initTitleScreen() {
  const hasSave = hasSavedGame();
  const btnContinue = document.getElementById('btnContinue');
  const btnNewGame = document.getElementById('btnNewGame');

  // 加载已保存的配置到标题画面输入框
  if (aiConfig.url) document.getElementById('titleCfgURL').value = aiConfig.url;
  if (aiConfig.key) document.getElementById('titleCfgKey').value = aiConfig.key;
  if (aiConfig.model) document.getElementById('titleCfgModel').value = aiConfig.model;

  // 验证输入：必须URL和Key都填了才能开始
  function checkConfig() {
    const url = document.getElementById('titleCfgURL').value.trim();
    const key = document.getElementById('titleCfgKey').value.trim();
    btnNewGame.disabled = !url || !key;
    if (hasSave) btnContinue.disabled = !url || !key;
  }

  document.getElementById('titleCfgURL').addEventListener('input', checkConfig);
  document.getElementById('titleCfgKey').addEventListener('input', checkConfig);

  // 初始检查
  checkConfig();

  if (hasSave) {
    btnContinue.style.display = 'block';
    btnContinue.addEventListener('click', () => {
      // 先保存配置
      aiConfig.url = document.getElementById('titleCfgURL').value.trim();
      aiConfig.key = document.getElementById('titleCfgKey').value.trim();
      aiConfig.model = document.getElementById('titleCfgModel').value.trim() || 'deepseek-v4-flash';
      saveConfig();
      loadAndStart();
    });
  }

  btnNewGame.addEventListener('click', () => {
    aiConfig.url = document.getElementById('titleCfgURL').value.trim();
    aiConfig.key = document.getElementById('titleCfgKey').value.trim();
    aiConfig.model = document.getElementById('titleCfgModel').value.trim() || 'deepseek-v4-flash';
    saveConfig();
    showQuestionnaire();
  });
}

function loadAndStart() {
  const saved = loadGame();
  if (saved) {
    G = saved;
    // 强制使用当前版本的评级（防止全年龄/R18存档互相污染）
    G.contentRating = initGameState().contentRating;
    // 兼容旧存档
    if (!G.recentCharacterTags) G.recentCharacterTags = [];
    if (!G.eventLog) G.eventLog = [];
    if (!G.newCharacterAlert) G.newCharacterAlert = false;
    if (!G.roundInProgress) G.roundInProgress = false;
    if (!G.phase) G.phase = 'playing';
    if (!G.characterOrder) G.characterOrder = [];
    if (!G.npcOrder) G.npcOrder = [];
    if (!G.nextCharId) G.nextCharId = 1;
    // v0.4 人设兼容
    if (!G.player.appearance) G.player.appearance = '';
    if (!G.player.hobbies) G.player.hobbies = '';
    if (!G.player.talent) G.player.talent = '';
    if (!G.player.weakness) G.player.weakness = '';
    if (!G.player.clubPreference) G.player.clubPreference = '';
    if (!G.player.birthday) G.player.birthday = '';
    if (!G.player.bio) G.player.bio = '';
    if (G.turnsSinceStudy === undefined) G.turnsSinceStudy = 0;
    if (!G.maxEnergy) G.maxEnergy = 100;

    document.getElementById('titleScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'flex';
    switchPage('home');
    renderHome();
    addLog(`📖 欢迎回来，${G.player.name}～`);
  }
}

// ==================== 开局问卷 ====================
const QUESTIONS = [
  {
    id: 'name',
    title: '先告诉我你的名字吧～',
    desc: '',
    type: 'input',
    placeholder: '输入你的名字',
    field: 'player.name',
  },
  {
    id: 'gender',
    title: '你是……',
    desc: '',
    type: 'select',
    options: [
      { text: '🚹 男生', value: '男' },
      { text: '🚺 女生', value: '女' },
    ],
    field: 'player.gender',
  },
  {
    id: 'focus',
    title: '转学到新学校，你心里最期待的是——',
    desc: '（会影响游戏中的事件类型哦）',
    type: 'select',
    options: [
      { text: '📖 「先把成绩稳住再说」', value: 'academic', hint: '邂逅较少 · 学习为主 · 恋爱靠后' },
      { text: '👥 「当然要多交朋友啦！」', value: 'social', hint: '邂逅频繁 · 朋友圈大 · 恋爱线较浅' },
      { text: '💕 「说不定…能遇到那个人呢」', value: 'romance', hint: '邂逅偏恋爱向 · 爱神眷顾体质' },
      { text: '🍃 「顺其自然就好～」', value: 'balanced', hint: '各方面均衡发展' },
    ],
    field: 'player.focus',
  },
  {
    id: 'personality',
    title: '放学路上，前面走着让你心跳加速的人。你会——',
    desc: '',
    type: 'select',
    options: [
      { text: '🏃 「追上去搭话！」', value: 'outgoing', hint: '好感+15% · 主动性强' },
      { text: '👀 「保持距离，默默观察」', value: 'reserved', hint: '好感正常 · 慢慢被发现' },
      { text: '🌄 「……今天天气真好呢」', value: 'shy', hint: '好感-10% · 但对方更主动' },
      { text: '🏃‍♂️ 「（脸红着跑掉了）」', value: 'timid', hint: '好感-20% · 被攻略体质' },
    ],
    field: 'player.personality',
  },
  {
    id: 'orientation',
    title: '你希望和怎样的人共度放学时光？',
    desc: '',
    type: 'select',
    options: [
      { text: G.player.gender === '男' ? '「温柔的学姐」' : '「温柔的学长」', value: 'heterosexual' },
      { text: G.player.gender === '男' ? '「可爱的学弟」' : '「可爱的学妹」', value: 'homosexual' },
      { text: '「同班的那个TA就好」', value: 'heterosexual' },
      { text: '「其实……我还在寻找答案」', value: 'questioning', hint: 'AI根据互动自然发展' },
    ],
    field: 'player.orientation',
  },
  {
    id: 'transfer',
    title: '转校的原因是？',
    desc: '',
    type: 'select',
    options: [
      { text: '🏢 父母工作调动', value: '父母工作调动', hint: '初始心情60' },
      { text: '💨 之前学校有些不太好的回忆', value: '之前学校有些不太好的回忆', hint: '初始心情40 · 可能触发过去剧情' },
      { text: '🌸 只是想换个地方重新开始', value: '只是想换个地方重新开始', hint: '初始心情80' },
      { text: '🤫 ……秘密♪', value: '秘密', hint: '初始心情60 · AI可能在后期揭示' },
    ],
    field: 'player.transferReason',
  },
];

let qIndex = 0;
let qAnswers = { 'player.gender': '男' }; // 默认性别

function showQuestionnaire() {
  document.getElementById('titleScreen').style.display = 'none';
  document.getElementById('questionnaireScreen').style.display = 'flex';
  qIndex = 0;
  qAnswers = { 'player.gender': '男' };
  renderQuestion();

  document.getElementById('qNext').addEventListener('click', nextQuestion);
  document.getElementById('qPrev').addEventListener('click', prevQuestion);
}

function nextQuestion() {
  const q = QUESTIONS[qIndex];
  // 验证当前问题
  if (q.type === 'input') {
    const input = document.querySelector('#qBody input');
    if (!input || !input.value.trim()) return; // 不能为空
    qAnswers[q.field] = input.value.trim();
  } else if (q.type === 'select') {
    const sel = document.querySelector('.q-option.selected');
    if (!sel) {
      // 检查是否有直接点击（对于input类型后面是select）
      return;
    }
    qAnswers[q.field] = sel.dataset.value;
    // 如果选了性别，更新后续问题的选项文本
    if (q.field === 'player.gender') {
      updateOrientationOptions();
    }
  }

  if (qIndex < QUESTIONS.length - 1) {
    qIndex++;
    renderQuestion();
  } else {
    finishQuestionnaire();
  }
}

function prevQuestion() {
  if (qIndex > 0) {
    qIndex--;
    renderQuestion();
  }
}

function renderQuestion() {
  const q = QUESTIONS[qIndex];
  const body = document.getElementById('qBody');
  const progress = document.getElementById('qProgress');
  const prevBtn = document.getElementById('qPrev');
  const nextBtn = document.getElementById('qNext');

  progress.textContent = `${qIndex + 1}/${QUESTIONS.length}`;
  prevBtn.style.display = qIndex > 0 ? 'inline-block' : 'none';
  nextBtn.textContent = qIndex === QUESTIONS.length - 1 ? '🌸 完成！' : '下一题 →';

  let html = `<h3 class="q-title" style="font-size:1.2em;margin-bottom:8px;">${q.title}</h3>`;
  if (q.desc) html += `<p class="q-desc">${q.desc}</p>`;

  if (q.type === 'input') {
    const val = qAnswers[q.field] || '';
    html += `<input class="q-input" type="text" placeholder="${q.placeholder || ''}" value="${esc(val)}" id="qInput" autofocus>`;
  } else if (q.type === 'select') {
    html += '<div class="q-options">';
    const currentVal = qAnswers[q.field];
    for (const opt of q.options) {
      const selected = currentVal === opt.value ? ' selected' : '';
      html += `<button class="q-option${selected}" data-value="${opt.value}">${opt.text}</button>`;
    }
    html += '</div>';
  }

  body.innerHTML = html;

  // 绑定选项点击
  body.querySelectorAll('.q-option').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.q-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      qAnswers[q.field] = btn.dataset.value;
      // 如果选了性别，更新性取向问题选项
      if (q.field === 'player.gender') {
        updateOrientationOptions();
      }
    });
  });

  // 输入框回车
  const input = body.querySelector('#qInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') nextQuestion();
    });
  }
}

function updateOrientationOptions() {
  const gender = qAnswers['player.gender'] || '男';
  const q = QUESTIONS.find(q => q.id === 'orientation');
  if (q) {
    q.options[0].text = gender === '男' ? '「温柔的学姐」' : '「温柔的学长」';
    q.options[1].text = gender === '男' ? '「可爱的学弟」' : '「可爱的学妹」';
  }
}

function finishQuestionnaire() {
  // 应用问卷结果
  G.player.name = qAnswers['player.name'] || '无名';
  G.player.gender = qAnswers['player.gender'] || '男';
  G.player.focus = qAnswers['player.focus'] || 'balanced';
  G.player.personality = qAnswers['player.personality'] || 'reserved';
  G.player.orientation = qAnswers['player.orientation'] || 'heterosexual';
  G.player.transferReason = qAnswers['player.transferReason'] || '父母工作调动';

  // 初始心情
  switch(G.player.transferReason) {
    case '之前学校有些不太好的回忆': G.mood = 40; break;
    case '只是想换个地方重新开始': G.mood = 80; break;
    default: G.mood = 60;
  }

  // 进入人设选择（v0.4）
  document.getElementById('questionnaireScreen').style.display = 'none';
  document.getElementById('personaChoiceScreen').style.display = 'flex';
}

// ==================== 转学第一天 ====================
async function startFirstDay() {
  G.roundInProgress = true;
  addMemory('🌸 转学到了樱之丘高等学校。', true);

  showLoading('开学第一天，新学期的钟声……');
  await generateInitialCharacters();
  hideLoading();

  G.roundInProgress = false;
  renderHome();
  renderNetwork();
  saveGame();
}

async function generateInitialCharacters() {
  const sys = `你是校园恋爱游戏的叙事AI。转校生第一天来到学校，需要生成两个角色。

${buildWorldContext()}
${buildProfileContext()}
${getStyleGuide()}

【任务】生成转学第一天的场景 + 班主任 + 同桌。
- 叙事要有画面感：描写走进教室时的紧张感、黑板上的欢迎语、窗边洒入的阳光、同学们好奇的目光
- 同桌应有一个鲜明的第一印象——主动递来笔记帮你、低头不敢与你对视、偷偷在课本上画速写、或者第一时间和你搭话
- 纯JSON输出。

{
  "narrative": "转学第一天的场景叙述（100-150字）",
  "teacher": {
    "name": "班主任姓名", "gender": "男或女", "grade": "先生",
    "club": "", "personality": ["标签1","标签2"],
    "appearance": "外观描述", "speakingStyle": "说话风格",
    "emoji": "👨‍🏫或👩‍🏫", "tags": ["老师"],
    "isCore": false
  },
  "deskmate": {
    "name": "同桌姓名", "gender": "${G.player.orientation === 'homosexual' ? G.player.gender : G.player.gender === '男' ? '女' : '男'}",
    "grade": "同級生", "club": "所属社团",
    "personality": ["标签1","标签2","标签3"],
    "appearance": "外观描述", "speakingStyle": "说话风格",
    "emoji": "🌸或⭐",
    "tags": ["同桌", "标签2"],
    "isCore": true
  }
}`;

  try {
    const result = await aiCall(sys, '生成转学第一天', 45000, true, 2);
    const data = safeJsonParse(result.text);
    if (!data) throw new Error('格式错误');

    // 创建班主任
    if (data.teacher) {
      data.teacher.initialAffinity = 22;
      const teacher = createCharacter(data.teacher);
      addMemory(`认识了班主任${teacher.name}。`, false);
    }

    // 创建同桌
    if (data.deskmate) {
      data.deskmate.initialAffinity = 33;
      const mate = createCharacter(data.deskmate);
      addMemory(`✨ 认识了同桌${mate.name}！`, true);
    }

    // 显示叙事
    if (data.narrative) {
      document.getElementById('homeNarrative').innerHTML = `<p class="narr-text">${esc(data.narrative)}</p>`;
    }
  } catch(e) {
    hideLoading();
    console.error('初始化角色失败:', e.message);
    document.getElementById('homeNarrative').innerHTML = `<p class="narr-text" style="color:#d4787a;">⚠️ AI生成失败：${esc(e.message.slice(0, 100))}<br><small>请检查API配置后刷新重试</small></p>`;
    G.roundInProgress = false;
    return;
  }
}

// ==================== 人设系统（v0.4） ====================

// 自定义人设表单字段定义
const CUSTOMIZE_FIELDS = [
  { id: 'appearance', label: '👗 外观印象', type: 'textarea', placeholder: '例：黑色短发，深棕色瞳孔，娇小身材，戴圆框眼镜，文静书卷气……', hint: '发型、瞳色、身高、气质——别人第一眼看到的样子' },
  { id: 'hobbies', label: '🎮 兴趣爱好', type: 'textarea', placeholder: '例：在图书馆读轻小说、听J-POP、做手工甜点', hint: '放学后和周末喜欢做什么？' },
  { id: 'talent', label: '⭐ 擅长的事', type: 'textarea', placeholder: '例：语文写作、弹钢琴、记住别人的生日', hint: '你的闪光点，可能会在剧情中派上用场' },
  { id: 'weakness', label: '💦 不擅长的事', type: 'textarea', placeholder: '例：数学、球类运动、早起', hint: '小小的弱点让你更真实可爱' },
  { id: 'clubPreference', label: '🏫 社团倾向', type: 'select', options: ['还没想好', '文艺部', '运动部', '音乐部', '美术部', '料理部', '科学部', '学生会', '回家部'], hint: '想加入什么社团？（随时可以改）' },
  { id: 'birthday', label: '🎂 生日', type: 'input', placeholder: '例：6月15日', hint: '可能会有人记住哦～' },
];

let personaCache = null; // 缓存当前AI生成的人设

function initPersonaChoice() {
  document.getElementById('btnAIPersona').addEventListener('click', startAIPersona);
  document.getElementById('btnCustomPersona').addEventListener('click', showCustomizeScreen);
  document.getElementById('btnSkipPersona').addEventListener('click', () => {
    document.getElementById('personaChoiceScreen').style.display = 'none';
    startGameAfterPersona();
  });
}

// ==================== AI生成人设 ====================
async function startAIPersona() {
  document.getElementById('personaChoiceScreen').style.display = 'none';
  document.getElementById('personaResultScreen').style.display = 'flex';
  document.getElementById('personaResultCard').innerHTML = '<div class="persona-result-loading">⏳ AI正在构思你的形象……</div>';
  document.getElementById('btnAcceptPersona').style.display = 'none';
  document.getElementById('btnRegeneratePersona').style.display = 'none';

  await generateAndShowPersona();
}

async function generateAndShowPersona() {
  const card = document.getElementById('personaResultCard');
  card.innerHTML = '<div class="persona-result-loading">⏳ AI正在构思你的形象……</div>';
  document.getElementById('btnAcceptPersona').style.display = 'none';
  document.getElementById('btnRegeneratePersona').style.display = 'none';

  try {
    const data = await aiGeneratePersona();
    personaCache = data;
    displayPersonaResult(data);
    document.getElementById('btnAcceptPersona').style.display = 'block';
    document.getElementById('btnRegeneratePersona').style.display = 'block';
  } catch(e) {
    card.innerHTML = `<div class="persona-result-loading" style="color:#d4787a;">⚠️ AI生成失败：${esc(e.message.slice(0, 100))}<br><small>请检查API配置后重试，或返回选择自定义</small></div>`;
    document.getElementById('btnRegeneratePersona').style.display = 'block';
    document.getElementById('btnRegeneratePersona').textContent = '🔄 重试';
  }
}

function displayPersonaResult(data) {
  const card = document.getElementById('personaResultCard');
  card.innerHTML = `
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--sakura-light);padding:2px 10px;border-radius:10px;">👗 外观</span>
      <p style="margin-top:4px;">${esc(data.appearance || '（未生成）')}</p>
    </div>
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--peach-light);padding:2px 10px;border-radius:10px;">🎮 爱好</span>
      <p style="margin-top:4px;">${esc(data.hobbies || '（未生成）')}</p>
    </div>
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--green-light);padding:2px 10px;border-radius:10px;">⭐ 擅长</span>
      <p style="margin-top:4px;">${esc(data.talent || '（未生成）')}</p>
    </div>
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--sky-light);padding:2px 10px;border-radius:10px;">💦 不擅长</span>
      <p style="margin-top:4px;">${esc(data.weakness || '（未生成）')}</p>
    </div>
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--lavender-light);padding:2px 10px;border-radius:10px;">🏫 社团</span>
      <p style="margin-top:4px;">${esc(data.clubPreference || '还没想好')}</p>
    </div>
    <div style="margin-bottom:14px;">
      <span style="font-size:0.8em;color:var(--text-lighter);background:var(--gold-light);padding:2px 10px;border-radius:10px;">🎂 生日</span>
      <p style="margin-top:4px;">${esc(data.birthday || '（未生成）')}</p>
    </div>
    ${data.bio ? `
    <div style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--border);">
      <span style="font-size:0.8em;color:var(--sakura-dark);">📖 小传</span>
      <p style="margin-top:6px;line-height:1.9;font-style:italic;color:var(--text-light);">${esc(data.bio)}</p>
    </div>` : ''}
  `;
}

function acceptPersona() {
  if (!personaCache) return;
  const d = personaCache;
  G.player.appearance = d.appearance || '';
  G.player.hobbies = d.hobbies || '';
  G.player.talent = d.talent || '';
  G.player.weakness = d.weakness || '';
  G.player.clubPreference = d.clubPreference || '';
  G.player.birthday = d.birthday || '';
  G.player.bio = d.bio || '';

  document.getElementById('personaResultScreen').style.display = 'none';
  personaCache = null;
  startGameAfterPersona();
}

// 绑定AI结果画面按钮
document.getElementById('btnAcceptPersona').addEventListener('click', acceptPersona);
document.getElementById('btnRegeneratePersona').addEventListener('click', generateAndShowPersona);

// ==================== 自定义人设 ====================
function showCustomizeScreen() {
  document.getElementById('personaChoiceScreen').style.display = 'none';
  document.getElementById('customizeScreen').style.display = 'flex';
  renderCustomizeForm();
}

function initCustomizeScreen() {
  document.getElementById('btnCustomBack').addEventListener('click', () => {
    document.getElementById('customizeScreen').style.display = 'none';
    document.getElementById('personaChoiceScreen').style.display = 'flex';
  });
  document.getElementById('btnCustomDone').addEventListener('click', applyCustomPersona);
}

function renderCustomizeForm() {
  const body = document.getElementById('customizeBody');
  let html = '';
  for (const f of CUSTOMIZE_FIELDS) {
    html += `<div class="customize-field"><label><span class="field-icon"></span>${f.label}</label>`;
    if (f.type === 'textarea') {
      html += `<textarea id="cf_${f.id}" placeholder="${esc(f.placeholder)}" rows="2"></textarea>`;
    } else if (f.type === 'select') {
      html += `<select id="cf_${f.id}">`;
      for (const opt of f.options) {
        html += `<option value="${opt}">${opt}</option>`;
      }
      html += `</select>`;
    } else {
      html += `<input type="text" id="cf_${f.id}" placeholder="${esc(f.placeholder)}">`;
    }
    if (f.hint) html += `<div class="field-hint">${f.hint}</div>`;
    html += `</div>`;
  }
  body.innerHTML = html;
}

function applyCustomPersona() {
  for (const f of CUSTOMIZE_FIELDS) {
    const el = document.getElementById(`cf_${f.id}`);
    if (el) G.player[f.id] = el.value.trim();
  }

  document.getElementById('customizeScreen').style.display = 'none';
  startGameAfterPersona();
}

// ==================== 共同：开始游戏 ====================
function startGameAfterPersona() {
  document.getElementById('gameScreen').style.display = 'flex';
  switchPage('home');
  renderHome();
  saveGame();

  // 转学第一天！
  startFirstDay();
}

// ==================== 回合行动 ====================
async function doAction(action) {
  if (G.roundInProgress) return;
  G.roundInProgress = true;

  // 学习追踪：连续不学习会掉成绩
  if (action === 'study') {
    G.turnsSinceStudy = 0;
  } else {
    G.turnsSinceStudy++;
  }

  // 行动消耗
  const costs = {
    study: {energy: -10}, club: {energy: -15}, rest: {energy: 20, mood: 10}, work: {energy: -20},
    seduce: {energy: -20, mood: 5}, peep: {energy: -15, mood: 5}, expose: {energy: -15, mood: 5}, masturbate: {energy: -10, mood: 10},
  };
  if (costs[action]) {
    if (costs[action].energy) G.energy = Math.max(0, Math.min(G.maxEnergy || 100, G.energy + costs[action].energy));
    if (costs[action].money) G.money = Math.max(0, G.money + costs[action].money);
    if (costs[action].mood) G.mood = Math.max(0, Math.min(100, G.mood + costs[action].mood));
  }

  // 部活有概率提升体力上限
  if (action === 'club' && Math.random() < 0.35 && (G.maxEnergy || 100) < 150) {
    G.maxEnergy = Math.min(150, (G.maxEnergy || 100) + 3);
    G.energy = Math.min(G.maxEnergy, G.energy + 5);
    G.mood = Math.min(100, G.mood + 5); // 突破自己很开心
  }

  const narr = document.getElementById('homeNarrative');

  // 休息/打工：全年龄模式用预设事件池，R18模式用AI生成
  if (action === 'rest' && G.contentRating !== 'r18') {
    const eventText = getRandomEvent(REST_EVENTS);
    narr.innerHTML = `<p class="narr-text">${esc(eventText)}</p>`;
    addMemory(eventText, false);
    finishRound();
    return;
  }
  if (action === 'work' && G.contentRating !== 'r18') {
    // 邂逅检查
    if (shouldTriggerEncounter()) {
      showLoading('新的相遇正在发生……');
      try {
        const encounterData = await aiGenerateEncounter();
        hideLoading();
        if (encounterData && encounterData.character) {
          const newChar = createCharacter(encounterData.character);
          if (encounterData.connections) processConnections(newChar.id, encounterData.connections);
          addMemory(`✨ 邂逅了${newChar.name}！${encounterData.scene ? ' — ' + encounterData.scene.slice(0, 60) + '…' : ''}`, true);
          G.mood = Math.min(100, G.mood + 5);
          narr.innerHTML = `<p class="narr-text">${esc(encounterData.scene || '新的相遇……')}</p>`;
          G.roundInProgress = false;
          saveGame();
          renderHome();
          renderNetwork();
          updateBadges();
          return;
        }
      } catch(e) { hideLoading(); }
    }
    const eventText = getRandomEvent(WORK_EVENTS);
    const earned = 80 + Math.floor(Math.random() * 41); // 80~120
    G.money += earned;
    narr.innerHTML = `<p class="narr-text">${esc(eventText)}<br><small style="color:var(--text-lighter);">💰 获得 ${earned} 円</small></p>`;
    addMemory(eventText + `（+${earned}円）`, false);
    finishRound();
    return;
  }

  try {
    // 邂逅检查（部活）
    if (action === 'club' && shouldTriggerEncounter()) {
      showLoading('新的相遇正在发生……');
      const encounterData = await aiGenerateEncounter();
      hideLoading();
      if (encounterData && encounterData.character) {
        const newChar = createCharacter(encounterData.character);
        if (encounterData.connections) processConnections(newChar.id, encounterData.connections);
        addMemory(`✨ 邂逅了${newChar.name}！${encounterData.scene ? ' — ' + encounterData.scene.slice(0, 60) + '…' : ''}`, true);
        G.mood = Math.min(100, G.mood + 5); // 邂逅提心情
        narr.innerHTML = `<p class="narr-text">${esc(encounterData.scene || '新的相遇……')}</p>`;
        G.roundInProgress = false;
        saveGame();
        renderHome();
        renderNetwork();
        updateBadges();
        return;
      }
    }

    // 正常事件分发
    showLoading('这一周正在发生些什么……');
    const eventData = await dispatchEvent(action);
    hideLoading();

    if (eventData.connections) processConnections(eventData.involvedCharId, eventData.connections);

    // R18模式打工依然赚钱
    if (action === 'work' && G.contentRating === 'r18') {
      const earned = 80 + Math.floor(Math.random() * 41);
      G.money += earned;
      eventData.narrative = (eventData.narrative || '打工的一周。') + `\n💰 获得 ${earned} 円`;
    }

    narr.innerHTML = `<p class="narr-text">${esc(eventData.narrative || '普通的一周过去了。')}</p>`;

    if (eventData.choices && eventData.choices.length > 0) {
      showEventModal(eventData.narrative, eventData.choices, async (choice) => {
        applyChoiceEffect(choice.effect, eventData.involvedCharId || choice.involvedCharId);
        addMemory(choice.text, true);
        if (eventData._newNPC) addMemory(`认识了${eventData._newNPC.name}（${eventData._newNPC.grade}）`, false);

        // AI生成选择后续
        narr.innerHTML = '<p class="narr-text">⏳ 正在发生……</p>';
        showLoading('故事正在继续……');
        try {
          const followUp = await aiGenerateFollowUp(eventData.narrative, choice.text, eventData.involvedCharId);
          hideLoading();
          narr.innerHTML = `<p class="narr-text">${esc(followUp)}</p>`;
          addMemory(followUp, false);
        } catch(e) {
          hideLoading();
        }
        finishRound();
      });
    } else {
      addMemory(eventData.narrative || '普通的一周。', false);
      finishRound();
    }
  } catch(e) {
    hideLoading();
    console.error('事件错误:', e.message);
    narr.innerHTML = `<p class="narr-text" style="color:#d4787a;">⚠️ AI生成失败：${esc(e.message.slice(0, 80))}<br><small>请检查API配置后重试</small></p>`;
    G.roundInProgress = false;
    saveGame();
    renderHome();
  }
}

function finishRound() {
  // 成绩衰减：连续不学习
  if (G.turnsSinceStudy >= 3 && G.grade > 0) {
    const loss = Math.min(G.grade, 8);
    G.grade = Math.max(0, G.grade - loss);
  } else if (G.turnsSinceStudy >= 2 && G.grade > 80) {
    G.grade = Math.max(0, G.grade - 3);
  }

  // 成绩阶梯奖励
  if (G.grade >= 90 && Math.random() < 0.2) {
    G.mood = Math.min(100, G.mood + 10);
    G.money += 50;
    addMemory('📚 成绩优秀，得到了老师的表扬和奖学金！', true);
  } else if (G.grade >= 75 && Math.random() < 0.3) {
    const chars = getCoreCharacters().filter(c => c.affinity >= 20 && c.affinity < 120);
    if (chars.length) {
      const c = chars[Math.floor(Math.random() * chars.length)];
      changeAffinity(c, 3);
      addMemory(`📖 帮${c.name}辅导了功课，关系更近了一些。`, false);
    }
  }

  // 好感度冷落衰减
  const nowWeek = G.year * 100 + G.semester * 20 + G.week;
  for (const c of getAllCharacters()) {
    const weeksSince = nowWeek - (c.lastInteractionWeek || nowWeek);
    if (weeksSince > 8 && c.affinity > 0) {
      c.affinity = Math.max(0, c.affinity - 2);
    } else if (weeksSince > 4 && c.affinity > 80) {
      c.affinity = Math.max(0, c.affinity - 1);
    }
  }

  const node = advanceWeek();

  if (node === 'graduate') {
    // 毕业！
    startGraduation();
    return;
  }

  G.roundInProgress = false;
  saveGame();
  renderHome();
  renderNetwork();
}

// ==================== 邀约 ====================
function handleInviteAction() {
  const invitable = getInvitableCharacters();
  if (!invitable.length) { addLog('没有可以邀约的人……'); return; }
  showCharSelectModal('💬 选择和谁一起度过……', invitable, (c) => doInvite(c));
}

async function doInvite(c) {
  if (G.roundInProgress) return;
  G.roundInProgress = true;
  G.money = Math.max(0, G.money - 80);
  G.inviteCooldown = 3;
  G.mood = Math.min(100, G.mood + 10); // 邀约提心情
  markInteraction(c);

  const narr = document.getElementById('homeNarrative');

  try {
    showLoading(`正在和${c.name}一起……`);
    const eventData = await aiGenerateDailyEvent('invite');
    hideLoading();
    eventData.involvedCharId = c.id;
    const eventText = eventData.narrative.replace(/某人/g, c.name).replace(/那个/g, '这个');
    narr.innerHTML = `<p class="narr-text">${esc(eventText)}</p>`;

    if (eventData.choices && eventData.choices.length > 0) {
      showEventModal(eventText, eventData.choices, (choice) => {
        applyChoiceEffect(choice.effect, c.id);
        addMemory(`和${c.name}一起度过了一段时光：${choice.text}`, true);
        finishRound();
      });
    } else {
      changeAffinity(c, 5);
      addMemory(`和${c.name}一起度过了愉快的一周。`, true);
      finishRound();
    }
  } catch(e) {
    hideLoading();
    console.error('邀约错误:', e.message);
    narr.innerHTML = `<p class="narr-text" style="color:#d4787a;">⚠️ AI生成失败：${esc(e.message.slice(0, 80))}<br><small>请检查API配置后重试</small></p>`;
    G.roundInProgress = false;
    saveGame();
    renderHome();
  }
}

// ==================== 告白 ====================
function handleConfessAction() {
  const confessable = getConfessableCharacters();
  if (!confessable.length) { addLog('没有可以告白的对象……'); return; }
  showCharSelectModal('💌 向谁告白……', confessable, (c) => doConfess(c));
}

async function doConfess(c) {
  if (G.roundInProgress || G.lover) return;
  G.roundInProgress = true;
  markInteraction(c);

  const narr = document.getElementById('homeNarrative');

  // 判定成功率（好感>=120时基础60%，150时90%）
  const successRate = Math.min(0.95, 0.4 + (c.affinity - 100) / 100);
  const success = Math.random() < successRate;

  showLoading('心跳加速，正在鼓起勇气……');

  const sys = `你是校园恋爱游戏的叙事AI。${G.player.name}向${c.name}告白了。

${buildWorldContext()}
${buildProfileContext()}
角色：${c.name}，${c.gender}，性格${c.personality.join(',')}，对主角好感度${c.affinity}
${getStyleGuide()}

【任务】生成告白场景叙事。纯文本，不需要JSON。${G.contentRating === 'r18' ? '这是R18官能小说中最重要的H场景之一！' : '这是整个游戏最动人的时刻之一。'}
${success ? (
  G.contentRating === 'r18' ?
  `- 🔞 告白成功=直接进入初次性爱！这是完整的处男/处女初体验H场景（200-350字）：
  1. 告白成功后两人拥抱接吻→初吻的湿润触感——嘴唇的柔软、舌尖试探性的交缠、唾液交换的细微水声、呼吸变得急促
  2. 衣服被一件件脱下——纽扣解开时手指的颤抖、裙子/裤子滑落在地上、内衣被解开时乳房/胸膛第一次暴露在喜欢的人面前、对方说"好美…"
  3. 前戏——手指轻轻触碰对方的敏感部位、乳头被指尖拨弄时身体的轻颤和压抑的呻吟、手引导着摸到下体时"已经这么湿了/硬了"
  4. 第一次插入——"我要进去了…"→龟头抵在蜜穴/後穴入口时的灼热触感→一点点撑开肉壁的紧致→"疼的话告诉我"→整根没入时两人同时发出的喘息→开始缓慢抽插→逐渐加速→"要去了…"→第一次内射的滚烫感
  5. 事后——两人紧紧抱在一起喘息、精液从体内缓缓流出、"我爱你""我也是"的耳语、可能紧接着的第二轮
  描写要像官能小说一样直白详细！使用肉棒/蜜穴/龟头/爱液/乳房/乳头/陰茎等词汇。` :
  `- 告白成功！描写这一刻的细节——背景的光线与声音（夕阳、晚风、远处社团活动的喧闹）、对方的表情从惊讶到微笑的变化、告白后两人之间短暂沉默中的心跳声、以及牵手或拥抱的触感。150-250字。`
) : (
  G.contentRating === 'r18' ?
  `- 🔞 告白被婉拒。描写温柔但有距离感的拒绝（50字）。之后主角独自一人回家/在空教室/在厕所隔间——幻想和对方做爱的场景来自慰发泄（100-150字）：想象对方的裸体和身体反应、想象插入时的紧致和温暖、手淫越来越快直到射精/高潮→精液射在地上/纸巾上/内裤里→高潮后的空虚和对对方的渴望仍然灼热。直白描写自慰过程和幻想中的性爱画面。` :
  `- 告白被婉拒。描写温柔但有距离感的拒绝——不要让人感到羞耻或尴尬。对方真诚地感谢你的心意，也许微微低头避开目光。分别后一个人站着的余韵和那一点点酸涩。100-150字。`
)}
- 贴合角色性格和说话风格，让每一个反应都符合这个角色`;

  try {
    const result = await aiCall(sys, '告白', 45000, false, 1);
    hideLoading();
    const text = result.text || (success ? '「嗯。我也想和你在一起。」' : '「对不起……我还没有准备好。」');

    narr.innerHTML = `<p class="narr-text">${esc(text)}</p>`;

    if (success) {
      G.lover = c.id;
      changeAffinity(c, 10);
      addMemory(`💕 向${c.name}告白成功！两人成为了恋人。`, true);
    } else {
      changeAffinity(c, -10);
      addMemory(`向${c.name}告白了，但被温柔地拒绝了。`, true);
    }
  } catch(e) {
    hideLoading();
    narr.innerHTML = `<p class="narr-text" style="color:#d4787a;">⚠️ AI生成失败：${esc(e.message.slice(0, 80))}</p>`;
    G.roundInProgress = false;
    saveGame();
    renderHome();
    return;
  }

  G.roundInProgress = false;
  saveGame();
  renderHome();
  renderNetwork();
}

// ==================== 毕业 ====================
async function startGraduation() {
  G.phase = 'graduated';
  const narr = document.getElementById('homeNarrative');
  narr.innerHTML = '<p class="narr-text">🌸 毕业典礼……三年的时光，都留在了这些回忆里。</p>';

  // 生成毕业信
  const chars = getCoreCharacters().filter(c => c.affinity >= 45);
  const lover = G.lover ? getCharacter(G.lover) : null;

  let letterHTML = '<p class="narr-text">🌸 <strong>毕业典礼</strong></p>';

  for (const c of chars) {
    const sys = `你是${c.name}（${c.gender}，性格${c.personality.join(',')}，说话风格${c.speakingStyle || '普通'}）。
你和${G.player.name}是高中同学，三年来的关系是${getRelationLabel(c, G.lover === c.id)}，好感度${c.affinity}。
现在毕业了，请写一封简短的手写信给${G.player.name}。80-120字。
- 根据你们三年来的关系历程(history)写这封信——提及一个你们之间具体的小回忆，让信读起来真实、私人，而不是泛泛的祝福
- ${c.id === G.lover ? '恋人之间的信应有爱意和不舍——也许提到第一次牵手的地方、最难忘的那个约会。' : '好友之间的信应有感激和对未来的祝福——"到了大学也要常联系啊"这样的语气。'}
- ${G.contentRating === 'r18' ? `R18风格（100-150字）：这是你们高中最后的信，也是最后的性爱回忆！
- 详细回忆你们之间最激烈最难忘的一次性爱——在哪里、什么体位、对方的裸体和表情、高潮时的声音、精液/爱液的温度和气味
- 直白使用性器官词汇（肉棒、蜜穴、乳房、乳头、精液、爱液），像色情小说里的情书一样露骨
- 表达对毕业后继续这种身体关系的渴望——"到了大学，我还要你""不管在哪里，我想要的一直只有你"
- 如果不曾发生关系：写对TA身体的渴望和未实现的性幻想——"我无数次想象过你的身体""毕业前…可以吗？"` : '风格温暖、青春，贴合角色性格语气——就像毕业那天你会在纪念册里收到的那种信。'}纯文本。`;

    try {
      const result = await aiCall(sys, `写给${G.player.name}的毕业信`, 30000, false, 1);
      const letter = result.text || '';
      if (letter) {
        letterHTML += `<div class="mem-item starred"><div class="mem-date">💌 来自 ${c.name} 的信</div>${esc(letter)}</div>`;
        addMemory(`收到了${c.name}的毕业信。`, true);
      }
    } catch(e) {
      console.error(`毕业信生成失败(${c.name}):`, e.message);
    }
  }

  if (lover) {
    const loverSys = `你是${lover.name}，${G.player.name}的恋人。毕业典礼上，请写一封特别的话给TA。100-150字。
- 这是你们作为高中生的最后一封信。回忆你们第一次相遇的场景、这三年里最让你心动的瞬间、以及未来想要一起走下去的决心
${G.contentRating === 'r18' ? `- 🔞 回忆你们最激烈最难忘的一次性爱经历——详细描写：那天的场景、他/她脱衣服时你的心跳、插入时对方的表情和声音、高潮时他/她弓起的腰背和痉挛、内射时精液冲击子宫/体内的温度和快感、事后拥抱时说的情话
- 直白使用性器官词汇和淫语——"还想再被你填满""我每天晚上都在想你进入我时的感觉""无论在哪里我都会来找你"
- 表达对未来继续性关系的渴望——不只是谈恋爱，而是继续做爱的承诺
- 可以写毕业典礼后"最后一次在校园里做爱"的邀请` : '- 甜蜜温暖，可以是害羞的、坦率的、或者带着一点点笨拙的爱意——像毕业那天樱花树下的小声告白。'}纯文本。`;
    try {
      const loverResult = await aiCall(loverSys, `写给恋人的毕业信`, 30000, false, 1);
      if (loverResult.text) {
        letterHTML += `<div class="mem-item starred"><div class="mem-date">💕 ${lover.name} 的特别的话</div>${esc(loverResult.text)}</div>`;
      }
    } catch(e) {
      console.error('恋人毕业信生成失败:', e.message);
    }
  }

  // 统计
  letterHTML += `<div class="mem-item"><div class="mem-date">📊 三年统计</div>
    认识了 ${getCoreCharacters().length} 位重要的人 · ${G.eventLog.filter(e => e.starred).length} 个难忘的回忆 · 成绩 ${G.grade} 分
    ${G.lover ? '💕 找到了那个特别的人' : '🍃 独自走过三年青春'}
  </div>`;

  narr.innerHTML = letterHTML;
  document.getElementById('homeActions').style.display = 'none';
  G.roundInProgress = false;
  saveGame();
}
