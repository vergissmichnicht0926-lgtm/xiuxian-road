// ======================== 角色系统 ========================

// 关系阶段
const RELATION_STAGES = {
  stranger:  { min: 0,  max: 30, label: '陌生人', cssClass: 'bubble-stranger' },
  acquaintance: { min: 30, max: 55, label: '相识', cssClass: 'bubble-acquaintance' },
  friend:    { min: 55, max: 85, label: '朋友', cssClass: 'bubble-friend' },
  close:     { min: 85, max: 120, label: '亲密好友', cssClass: 'bubble-close' },
  crush:     { min: 120, max: 150, label: '心动', cssClass: 'bubble-crush' },
  lover:     { min: 120, max: 150, label: '恋人', cssClass: 'bubble-lover' },
};

function getRelationStage(affinity) {
  if (affinity < 30) return RELATION_STAGES.stranger;
  if (affinity < 55) return RELATION_STAGES.acquaintance;
  if (affinity < 85) return RELATION_STAGES.friend;
  if (affinity < 120) return RELATION_STAGES.close;
  return RELATION_STAGES.crush;
}

function getRelationCSS(c, isLover) {
  if (isLover) return RELATION_STAGES.lover.cssClass;
  return getRelationStage(c.affinity).cssClass;
}

function getRelationLabel(c, isLover) {
  if (isLover) return RELATION_STAGES.lover.label;
  return getRelationStage(c.affinity).label;
}

// 创建角色
function createCharacter(data) {
  const id = `c${G.nextCharId++}`;
  const c = {
    id, name: data.name, gender: data.gender || '女',
    grade: data.grade || '同級生', club: data.club || '',
    personality: data.personality || ['普通'],
    appearance: data.appearance || '',
    speakingStyle: data.speakingStyle || '',
    affinity: data.initialAffinity || 18,  // 初始好感（AI可覆盖）
    isCore: data.isCore !== false, // 是否核心角色
    encounterWeek: G.week,      // 在哪周认识的
    encounterSemester: G.semester,
    encounterYear: G.year,
    history: [],               // 关系历史
    lastInteractionWeek: G.year * 100 + G.semester * 20 + G.week,
    lastAffinityChange: 0,
  };

  // 加入角色列表
  if (c.isCore) {
    G.characterOrder.push(id);
  } else {
    G.npcOrder.push(id);
  }
  G.characters[id] = c;

  // 追踪标签避免重复
  if (data.tags && data.tags.length) {
    G.recentCharacterTags.push(...data.tags);
    if (G.recentCharacterTags.length > 10) {
      G.recentCharacterTags = G.recentCharacterTags.slice(-10);
    }
  }

  G.newCharacterAlert = true;
  return c;
}

function getCharacter(id) {
  return G.characters[id] || null;
}

function getCoreCharacters() {
  return G.characterOrder.map(id => G.characters[id]).filter(Boolean);
}

function getNPCs() {
  return G.npcOrder.map(id => G.characters[id]).filter(Boolean);
}

function getAllCharacters() {
  return [...getCoreCharacters(), ...getNPCs()];
}

function getCharacterEmoji(c) {
  if (c.emoji) return c.emoji;
  const defaults = { '男': '⭐', '女': '🌸' };
  return defaults[c.gender] || '👤';
}

// 修改好感度
function changeAffinity(c, delta) {
  // 应用personality修正
  const p = G.player.personality;
  if (delta > 0) {
    if (p === 'outgoing') delta = Math.round(delta * 1.15);
    else if (p === 'shy') delta = Math.round(delta * 0.9);
    else if (p === 'timid') delta = Math.round(delta * 0.8);
    // 心情影响好感获取
    if (G.mood >= 70) delta = Math.round(delta * 1.1);
    else if (G.mood <= 30) delta = Math.round(delta * 0.8);
  }
  c.affinity = Math.max(0, Math.min(150, c.affinity + delta));
  c.lastAffinityChange = delta;
  c.lastInteractionWeek = G.year * 100 + G.semester * 20 + G.week; // 编码为数值

  // 记录历史
  const oldStage = getRelationStage(c.affinity - delta);
  const newStage = getRelationStage(c.affinity);
  if (oldStage.label !== newStage.label) {
    c.history.push({
      week: G.week, semester: G.semester, year: G.year,
      event: `关系变化：${oldStage.label} → ${newStage.label}`,
    });
  }

  return c.affinity;
}

// 标记角色互动（用于衰减追踪）
function markInteraction(c) {
  c.lastInteractionWeek = G.year * 100 + G.semester * 20 + G.week;
}

// 获取可以邀约的角色
function getInvitableCharacters() {
  return getCoreCharacters().filter(c => c.affinity >= 30);
}

// 获取可以告白的角色
function getConfessableCharacters() {
  return getCoreCharacters().filter(c => c.affinity >= 120 && G.lover !== c.id);
}

// 检查是否可攻略（受性取向影响）
function isRomanceable(c) {
  const o = G.player.orientation;
  const playerGender = G.player.gender;
  const charGender = c.gender;

  if (o === 'heterosexual') return charGender !== playerGender;
  if (o === 'homosexual') return charGender === playerGender;
  if (o === 'bisexual') return true;
  return true;
}

// 处理角色间关系连接（来自AI返回）
function processConnections(sourceCharId, connections) {
  if (!connections || !Array.isArray(connections)) return;
  const source = getCharacter(sourceCharId);
  if (!source) return;
  if (!source.connections) source.connections = [];

  for (const conn of connections) {
    const targetId = conn.targetId || conn.target_id || conn.id;
    const target = getCharacter(targetId);
    if (!target || targetId === sourceCharId) continue;

    // 更新或添加连接
    const existing = source.connections.find(c => c.targetId === targetId);
    if (existing) {
      existing.label = conn.label || existing.label;
      existing.strength = Math.max(existing.strength || 1, conn.strength || 1);
    } else {
      source.connections.push({
        targetId,
        label: conn.label || '认识',
        strength: conn.strength || 1,
      });
    }

    // 双向添加
    if (!target.connections) target.connections = [];
    const targetExisting = target.connections.find(c => c.targetId === sourceCharId);
    if (!targetExisting) {
      target.connections.push({
        targetId: sourceCharId,
        label: conn.label || '认识',
        strength: conn.strength || 1,
      });
    }
  }
}

// 自动推断角色间连接
function autoConnect(chars) {
  for (let i = 0; i < chars.length; i++) {
    for (let j = i + 1; j < chars.length; j++) {
      const a = chars[i], b = chars[j];
      // 同年级角色默认为"同学"
      const sameGrade = a.grade === b.grade ||
        (a.grade && b.grade && (a.grade.includes('同') && b.grade.includes('同'))) ||
        (a.grade && b.grade && (a.grade.includes('級') && b.grade.includes('級')));
      if (sameGrade) {
        if (!a.connections) a.connections = [];
        if (!b.connections) b.connections = [];
        if (!a.connections.find(c => c.targetId === b.id)) {
          const label = (a.club && b.club && a.club === b.club) ? '同社团' : '同学';
          a.connections.push({ targetId: b.id, label, strength: 1 });
        }
        if (!b.connections.find(c => c.targetId === a.id)) {
          const label = (a.club && b.club && a.club === b.club) ? '同社团' : '同学';
          b.connections.push({ targetId: a.id, label, strength: 1 });
        }
      }
    }
  }
}
