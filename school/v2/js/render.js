// ======================== UI 渲染 ========================

// 日志（底部临时消息）
let logTimer = null;
function addLog(msg) {
  // 简单的控制台日志，后续可加toast
  console.log('[校园]', msg);
}

// ==================== 页面切换 ====================
function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const pageMap = {
    home: 'pageHome', network: 'pageNetwork', characters: 'pageCharacters',
    memories: 'pageMemories', settings: 'pageSettings',
  };
  const pageEl = document.getElementById(pageMap[pageName]);
  if (pageEl) pageEl.classList.add('active');

  const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add('active');

  // 切换时刷新内容
  if (pageName === 'home') renderHome();
  else if (pageName === 'network') renderNetwork();
  else if (pageName === 'characters') renderCharacterList('important');
  else if (pageName === 'memories') renderMemories(1);
  else if (pageName === 'settings') renderSettings();

  // 清除新提醒
  if (pageName === 'network') { G.newCharacterAlert = false; updateBadges(); }
}

// ==================== 导航栏初始化 ====================
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      switchPage(page);
    });
  });
}

function updateBadges() {
  const badgeNetwork = document.getElementById('badgeNetwork');
  if (badgeNetwork) {
    badgeNetwork.style.display = G.newCharacterAlert ? 'block' : 'none';
  }
}

// ==================== 主页渲染 ====================
function renderHome() {
  // 顶部信息条（含剩余周数）
  const remaining = WEEKS_PER_SEMESTER - G.week;
  document.getElementById('topDate').textContent = `${getYearLabel()}·${getSemesterInfo().name}·第${G.week}周 / 剩余${remaining}周`;
  document.querySelector('.season-icon').textContent = getSeasonIcon();

  // HUD
  document.getElementById('hudGrade').textContent = G.grade;
  document.getElementById('hudEnergy').textContent = `${G.energy}/${G.maxEnergy || 100}`;
  document.getElementById('hudMood').textContent = G.mood;
  document.getElementById('hudMoney').textContent = G.money;

  // 行动按钮动态禁用
  document.querySelectorAll('.action-btn').forEach(btn => {
    const action = btn.dataset.action;
    if (action === 'study') btn.disabled = G.energy < 15;
    else if (action === 'club') btn.disabled = G.energy < 25;
    else if (action === 'work') btn.disabled = G.energy < 20;
    else if (action === 'seduce') btn.disabled = G.energy < 20;
    else if (action === 'peep') btn.disabled = G.energy < 15;
    else if (action === 'expose') btn.disabled = G.energy < 15;
    else if (action === 'masturbate') btn.disabled = G.energy < 10;
    // rest 永不禁用
  });

  // R18行动按钮显隐
  const r18Actions = document.getElementById('r18Actions');
  if (r18Actions) {
    r18Actions.style.display = G.contentRating === 'r18' ? 'grid' : 'none';
  }
  // R18模式标签
  const actionsLabel = document.getElementById('actionsLabel');
  if (actionsLabel && G.contentRating === 'r18') {
    actionsLabel.textContent = '🔞 这一周，你想做什么？（R18模式）';
  }

  // 邀约按钮显隐
  const btnInvite = document.getElementById('btnInviteAction');
  if (btnInvite) {
    const invitable = getInvitableCharacters().length > 0;
    btnInvite.style.display = (invitable && G.inviteCooldown <= 0 && G.money >= 80 && !G.roundInProgress) ? 'block' : 'none';
  }

  // HUD 颜色警示
  ['hudGrade','hudEnergy','hudMood','hudMoney'].forEach(id => {
    const maxE = G.maxEnergy || 100;
    const vals = { hudGrade: G.grade, hudEnergy: Math.round(G.energy / maxE * 100), hudMood: G.mood, hudMoney: G.money / 5 };
    const v = vals[id] || 0;
    const el = document.getElementById(id);
    if (!el) return;
    if (v < 30) el.style.color = '#d4787a';
    else if (v > 60) el.style.color = '#7ab890';
    else el.style.color = '';
  });

  // 检查毕业
  if (G.phase === 'graduated') {
    document.getElementById('homeActions').style.display = 'none';
  }
}

// ==================== 关系图渲染 ====================
function renderNetwork() {
  const canvas = document.getElementById('bubbleCanvas');
  const centerEl = document.getElementById('bubbleCenter');

  // 清除旧内容
  canvas.querySelectorAll('.char-bubble').forEach(el => el.remove());
  const oldSvg = canvas.querySelector('svg');
  if (oldSvg) oldSvg.remove();

  const chars = getAllCharacters();
  if (!chars.length) {
    centerEl.querySelector('.bubble-name').textContent = '还没有认识任何人...';
    return;
  }
  centerEl.querySelector('.bubble-name').textContent = G.player.name || '我';

  // 自动推断连接
  autoConnect(chars);

  // 计算泡泡位置
  const centerX = canvas.clientWidth / 2;
  const centerY = canvas.clientHeight / 2;
  const baseRadius = Math.min(centerX, centerY) * 0.5;

  const positions = {}; // 记录每个角色泡泡的位置

  chars.forEach((c, i) => {
    const isLover = G.lover === c.id;
    const affinity = c.affinity;
    const angle = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
    const distanceFactor = 1 - (affinity / 150);
    const radius = baseRadius * Math.max(0.3, distanceFactor);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    positions[c.id] = { x, y };

    // 泡泡大小：34~50px，角色越多越小，防止手机端挤在一起
    const maxChars = Math.max(chars.length, 5);
    const crowdScale = Math.min(1, 5 / maxChars);
    const bubbleSize = (34 + (affinity / 150) * 16) * crowdScale;
    const cssClass = getRelationCSS(c, isLover);

    const el = document.createElement('div');
    el.className = `char-bubble ${cssClass}`;
    el.style.left = `${x - bubbleSize/2}px`;
    el.style.top = `${y - bubbleSize/2 - 20}px`;
    el.innerHTML = `
      <div class="bubble-circle" style="width:${bubbleSize}px;height:${bubbleSize}px;">
        ${getCharacterEmoji(c)}
      </div>
      <div class="bubble-label">${esc(c.name)}</div>
    `;
    el.addEventListener('click', () => showCharCard(c));
    canvas.appendChild(el);

    // 主角到角色的连线
    const lineEl = drawLineToCenter(canvas, centerX, centerY, x, y, cssClass, c.affinity);
  });

  // 角色之间的连线
  const drawnPairs = new Set();
  for (const c of chars) {
    if (!c.connections) continue;
    for (const conn of c.connections) {
      const pairKey = [c.id, conn.targetId].sort().join('-');
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);

      const targetPos = positions[conn.targetId];
      const sourcePos = positions[c.id];
      if (!targetPos || !sourcePos) continue;

      drawInterCharLine(canvas, sourcePos.x, sourcePos.y, targetPos.x, targetPos.y, conn);
    }
  }
}

function drawLineToCenter(canvas, cx, cy, x, y, cssClass, affinity) {
  let svg = canvas.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
    canvas.appendChild(svg);
  }
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', cx); line.setAttribute('y1', cy);
  line.setAttribute('x2', x); line.setAttribute('y2', y);
  const opacity = 0.2 + (affinity / 150) * 0.4;
  line.setAttribute('stroke', cssClass.includes('lover') ? '#e890a0' : cssClass.includes('close') || cssClass.includes('crush') ? '#c898b0' : '#b8a8c8');
  line.setAttribute('stroke-width', cssClass.includes('lover') || cssClass.includes('close') ? '1.8' : '1.0');
  line.setAttribute('stroke-dasharray', cssClass.includes('stranger') ? '5,5' : 'none');
  line.setAttribute('opacity', opacity);
  svg.appendChild(line);
  return line;
}

function drawInterCharLine(canvas, x1, y1, x2, y2, conn) {
  let svg = canvas.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
    canvas.appendChild(svg);
  }
  const strength = conn.strength || 1;
  const lineColor = '#b098c8';
  const lineOpacity = Math.min(0.55, 0.25 + strength * 0.2);

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('stroke', lineColor);
  line.setAttribute('stroke-width', Math.min(2, 0.8 + strength * 0.5));
  line.setAttribute('stroke-dasharray', strength <= 1 ? '5,5' : 'none');
  line.setAttribute('opacity', lineOpacity);
  svg.appendChild(line);

  // 线中间加关系标签
  if (conn.label) {
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', '10');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('fill', '#8a7f90');
    text.setAttribute('opacity', '0.7');
    text.textContent = conn.label;
    svg.appendChild(text);

    // 白色背景让文字可读
    try {
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      const bbox = text.getBBox();
      bg.setAttribute('x', bbox.x - 4);
      bg.setAttribute('y', bbox.y - 1);
      bg.setAttribute('width', bbox.width + 8);
      bg.setAttribute('height', bbox.height + 2);
      bg.setAttribute('fill', '#fefaf6');
      bg.setAttribute('rx', '4');
      svg.insertBefore(bg, text);
    } catch(e) { /* getBBox may fail if not rendered yet, text still visible */ }
  }
}

// ==================== 角色卡片弹窗 ====================
function showCharCard(c) {
  const modal = document.getElementById('charModal');
  const isLover = G.lover === c.id;
  document.getElementById('charModalName').textContent = `${getCharacterEmoji(c)} ${c.name}`;
  document.getElementById('charModalBody').innerHTML = `
    <p><strong>身份：</strong>${c.grade} · ${c.club || '无社团'}</p>
    <p><strong>性格：</strong>${c.personality.join(' · ')}</p>
    <p><strong>外观：</strong>${c.appearance || '（暂无描述）'}</p>
    <p><strong>说话风格：</strong>${c.speakingStyle || '（暂无）'}</p>
    <div style="margin:12px 0;">
      <span style="font-size:0.85em;color:var(--text-light);">好感度 ${c.affinity}/150${c.lastAffinityChange > 0 ? '<span class="affinity-trend up">↑</span>' : c.lastAffinityChange < 0 ? '<span class="affinity-trend down">↓</span>' : ''}</span>
      <div class="affinity-bar" style="width:100%;margin-top:4px;">
        <div class="fill" style="width:${c.affinity/1.5}%;${isLover ? 'background:linear-gradient(90deg,var(--sakura),var(--peach));' : ''}"></div>
      </div>
      <span style="font-size:0.8em;color:var(--sakura-dark);">${getRelationLabel(c, isLover)}</span>
    </div>
    ${c.history.length ? `<details style="margin-top:8px;"><summary style="font-size:0.85em;color:var(--text-light);cursor:pointer;">📋 关系历程</summary>${c.history.map(h => `<p style="font-size:0.78em;color:var(--text-light);margin:4px 0;">· ${h.event}</p>`).join('')}</details>` : ''}
  `;

  // 操作按钮
  const actions = document.getElementById('charModalActions');
  actions.innerHTML = '';
  if (c.affinity >= 30 && G.inviteCooldown <= 0 && !G.roundInProgress) {
    const btn = document.createElement('button');
    btn.textContent = '💬 邀约';
    btn.className = 'primary';
    btn.onclick = () => { closeCharModal(); doInvite(c); };
    actions.appendChild(btn);
  }
  if (c.affinity >= 120 && !G.lover && !G.roundInProgress && isRomanceable(c)) {
    const btn = document.createElement('button');
    btn.textContent = '💌 告白';
    btn.onclick = () => { closeCharModal(); doConfess(c); };
    actions.appendChild(btn);
  }

  modal.style.display = 'flex';
}

function closeCharModal() {
  document.getElementById('charModal').style.display = 'none';
}

// ==================== 角色选择浮层（邀约用） ====================
function showCharSelectModal(title, characters, onSelect) {
  const modal = document.getElementById('charSelectModal');
  document.getElementById('charSelectTitle').textContent = title;
  const list = document.getElementById('charSelectList');

  if (!characters.length) {
    list.innerHTML = '<p class="char-select-empty">没有可以邀约的人……</p>';
  } else {
    list.innerHTML = characters.map(c => {
      const isLover = G.lover === c.id;
      return `
        <div class="char-item" data-char-id="${c.id}">
          <div class="char-icon">${getCharacterEmoji(c)}</div>
          <div class="char-info">
            <div class="name">${esc(c.name)}${isLover ? ' 💕' : ''}</div>
            <div class="meta">${c.grade} · ${getRelationLabel(c, isLover)}</div>
          </div>
          <div class="char-affinity">
            <div>❤️ ${c.affinity}</div>
          </div>
        </div>`;
    }).join('');

    list.querySelectorAll('.char-item').forEach(el => {
      el.addEventListener('click', () => {
        const c = getCharacter(el.dataset.charId);
        if (c) {
          closeCharSelectModal();
          if (onSelect) onSelect(c);
        }
      });
    });
  }

  modal.style.display = 'flex';
}

function closeCharSelectModal() {
  document.getElementById('charSelectModal').style.display = 'none';
}

// ==================== 角色列表渲染 ====================
function renderCharacterList(tab = 'important') {
  const list = document.getElementById('charList');
  // 更新tab
  document.querySelectorAll('.char-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.char-tab[data-tab="${tab}"]`)?.classList.add('active');

  const coreChars = getCoreCharacters();
  const npcs = getNPCs();

  if (tab === 'important' && coreChars.length === 0) {
    list.innerHTML = '<p class="char-empty">还没有重要的人……去邂逅吧！</p>';
    return;
  }

  let html = '';
  if (tab === 'important') {
    // 按好感度降序
    coreChars.sort((a, b) => b.affinity - a.affinity);
    for (const c of coreChars) {
      html += charItemHTML(c);
    }
    if (npcs.length) {
      html += '<div class="char-divider">── 👥 大家 ──</div>';
      for (const c of npcs) {
        html += charItemHTML(c);
      }
    }
  } else {
    const all = [...coreChars, ...npcs];
    if (!all.length) {
      list.innerHTML = '<p class="char-empty">还没有认识任何人……</p>';
      return;
    }
    for (const c of all) {
      html += charItemHTML(c);
    }
  }

  list.innerHTML = html;

  // 点击事件
  list.querySelectorAll('.char-item').forEach(el => {
    el.addEventListener('click', () => {
      const charId = el.dataset.charId;
      const c = getCharacter(charId);
      if (c) showCharCard(c);
    });
  });
}

function charItemHTML(c) {
  const isLover = G.lover === c.id;
  return `
    <div class="char-item" data-char-id="${c.id}">
      <div class="char-icon">${getCharacterEmoji(c)}</div>
      <div class="char-info">
        <div class="name">${esc(c.name)}${isLover ? ' 💕' : ''}</div>
        <div class="meta">${c.grade} · ${c.club || '无社团'}</div>
      </div>
      <div class="char-affinity">
        <div>${getRelationLabel(c, isLover)}</div>
        <div style="font-size:0.8em;color:var(--text-lighter);">${c.affinity}</div>
        <div class="affinity-bar"><div class="fill" style="width:${c.affinity/1.5}%"></div></div>
      </div>
    </div>`;
}

// 初始化角色列表tab
function initCharTabs() {
  document.querySelectorAll('.char-tab').forEach(tab => {
    tab.addEventListener('click', () => renderCharacterList(tab.dataset.tab));
  });
}

// ==================== 回忆渲染 ====================
function renderMemories(year = 1) {
  const list = document.getElementById('memList');
  document.querySelectorAll('.mem-year-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.mem-year-btn[data-year="${year}"]`)?.classList.add('active');

  const filtered = G.eventLog.filter(e => e.year === year);
  if (!filtered.length) {
    list.innerHTML = '<p class="mem-empty">这一年还没有回忆……</p>';
    return;
  }

  list.innerHTML = filtered.map(e => `
    <div class="mem-item${e.starred ? ' starred' : ''}">
      <div class="mem-date">${e.year}年·${e.semester === 1 ? '一' : e.semester === 2 ? '二' : '三'}学期·第${e.week}周</div>
      ${esc(e.text)}
    </div>
  `).join('');
}

// 初始化回忆年份按钮
function initMemYears() {
  document.querySelectorAll('.mem-year-btn').forEach(btn => {
    btn.addEventListener('click', () => renderMemories(parseInt(btn.dataset.year)));
  });
}

// ==================== 事件弹窗 ====================
function showEventModal(narrative, choices, onChoice) {
  const modal = document.getElementById('eventModal');
  document.getElementById('eventModalTitle').textContent = '🌸';
  document.getElementById('eventNarrative').textContent = narrative;
  const choicesEl = document.getElementById('eventChoices');

  if (!choices || !choices.length) {
    choicesEl.innerHTML = '<button onclick="closeEventModal()">继续</button>';
  } else {
    choicesEl.innerHTML = choices.map((ch, i) => `
      <button onclick="closeEventModal();handleChoice(${i})" data-idx="${i}">${esc(ch.text)}</button>
    `).join('');
  }

  // 存储回调数据
  modal._choices = choices;
  modal._onChoice = onChoice;

  modal.style.display = 'flex';
}

function closeEventModal() {
  document.getElementById('eventModal').style.display = 'none';
}

function handleChoice(idx) {
  const modal = document.getElementById('eventModal');
  const choices = modal._choices;
  if (choices && choices[idx] && modal._onChoice) {
    modal._onChoice(choices[idx]);
  }
}

// ==================== 确认弹窗 ====================
function showConfirm(text, callback) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmText').textContent = text;
  document.getElementById('confirmAction').onclick = () => {
    modal.style.display = 'none';
    if (callback) callback();
  };
  modal.style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
}

// ==================== 添加回忆 ====================
function addMemory(text, starred = false) {
  G.eventLog.push({
    year: G.year, semester: G.semester, week: G.week,
    text, starred,
  });
}

// ==================== 设置页面 ====================
function renderSettings() {
  document.getElementById('cfgURL').value = aiConfig.url || '';
  document.getElementById('cfgKey').value = aiConfig.key || '';
  document.getElementById('cfgModel').value = aiConfig.model || 'deepseek-v4-flash';
}

function saveSettings() {
  aiConfig.url = document.getElementById('cfgURL').value.trim();
  aiConfig.key = document.getElementById('cfgKey').value.trim();
  aiConfig.model = document.getElementById('cfgModel').value.trim() || 'deepseek-v4-flash';
  saveConfig();
  alert('✅ AI配置已保存！');
}

function exportSave() {
  const data = saveGame();
  const encoded = btoa(unescape(encodeURIComponent(data)));
  const io = document.getElementById('saveDataIO');
  io.style.display = 'block';
  io.value = encoded;
  document.getElementById('saveIORow').style.display = 'flex';
  document.getElementById('saveIOAction').textContent = '📋 复制导出码';
  document.getElementById('saveIOAction').onclick = () => {
    navigator.clipboard.writeText(encoded).then(() => addLog('📋 已复制'));
  };
}

function importSave() {
  const encoded = prompt('请粘贴导出的存档码：');
  if (!encoded) return;
  try {
    const data = decodeURIComponent(escape(atob(encoded)));
    const parsed = JSON.parse(data);
    if (!parsed.player || !parsed.characters) throw new Error('格式不对');
    Object.assign(G, parsed);
    saveGame();
    switchPage('home');
    renderHome();
    addLog('✅ 存档导入成功！');
  } catch(e) {
    alert('存档格式错误，导入失败');
  }
}

function hideSaveIO() {
  document.getElementById('saveDataIO').style.display = 'none';
  document.getElementById('saveIORow').style.display = 'none';
}

function resetGame() {
  showConfirm('确定要重新开始吗？所有回忆都会被清除……', () => {
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  });
}
