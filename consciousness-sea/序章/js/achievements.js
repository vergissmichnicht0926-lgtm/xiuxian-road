/* ═══════════════ §ACHIEVEMENTS 成就系统 — 深海足迹 ═══════════════
 * 依赖：bestiary.js（getBestiaryContentRect/forEachBestiaryRow/computeBestiaryMaxScroll/truncateText）
 *       particles.js（roundRect）、sound.js
 * 从 hub 小萤菜单打开；解锁持久化进主存档（saveGame 字段 achievements）
 * 收录：5 个 Boss 首次击退成就（拆字哲学文案）
 */
let achievements = {};              // { id: { unlocked:true, timestamp } }
let achievementsOpen = false;
let achievementsAlpha = 0;
let achievementsScrollY = 0;
let achievementsMaxScroll = 0;

const ACHIEVEMENT_DEFS = {
  ach_regret: {
    id:'ach_regret', name:'憾的退却', icon:'憾', iconColor:'#ff3333', source:'击退「憾」',
    desc:'忄为心，感为知觉。纠缠的知觉散了——它逃向更深的海，把谜底留给了你。',
  },
  ach_yi: {
    id:'ach_yi', name:'遗的终结', icon:'遗', iconColor:'#cc3333', source:'见证「遗」的终结',
    desc:'辶为走，贵为珍宝。它想留下最珍贵的东西，却在你的眼前与憾合为一体。',
  },
  ach_recall: {
    id:'ach_recall', name:'追忆的消散', icon:'忆', iconColor:'#2e86c1', source:'击败「忆」',
    desc:'忄为心，乙为余音。浅海的第一缕回响被你击散，余音却还沉在深处。',
  },
  ach_obsess: {
    id:'ach_obsess', name:'执念的松手', icon:'执', iconColor:'#cc5522', source:'击败「执」',
    desc:'扌为紧握，丸为执念。攥了太久的东西，终于松开了手。',
  },
  ach_regretful: {
    id:'ach_regretful', name:'遗憾的安息', icon:'悔', iconColor:'#cc3322', source:'击败「遗憾」',
    desc:'心为追忆，贵为珍宝。最深处的遗憾，终于可以安静地睡去。',
  },
};

/** 解锁成就：写状态 + 存档 + toast 提示（幂等） */
function unlockAchievement(id) {
  if (!ACHIEVEMENT_DEFS[id]) return;
  if (achievements[id] && achievements[id].unlocked) return;
  achievements[id] = { unlocked: true, timestamp: Date.now() };
  if (typeof saveGame === 'function') saveGame();
  const t = document.getElementById('save-toast');
  if (t) {
    t.textContent = '🏆 成就解锁 · ' + ACHIEVEMENT_DEFS[id].name;
    t.classList.add('show');
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => t.classList.remove('show'), 2200);
  }
  if (typeof Sound !== 'undefined' && Sound.boost) Sound.boost();
}

function openAchievements() {
  achievementsOpen = true;
  achievementsAlpha = 0;
  achievementsScrollY = 0;
  if (typeof Sound !== 'undefined' && Sound.uiOpen) Sound.uiOpen();
}

function closeAchievements() {
  achievementsOpen = false;
  achievementsAlpha = 0;
  if (typeof Sound !== 'undefined' && Sound.uiClose) Sound.uiClose();
}

function updateAchievements(dt) {
  if (achievementsOpen) achievementsAlpha = Math.min(1, achievementsAlpha + dt * 3.0);
}

function drawAchievements(ctx) {
  if (!achievementsOpen || achievementsAlpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = achievementsAlpha;

  // 遮罩背景
  ctx.fillStyle = 'rgba(2,2,18,0.95)';
  ctx.fillRect(0, 0, W, H);

  // 标题
  ctx.fillStyle = 'rgba(180,210,240,0.6)';
  ctx.font = '20px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('深海足迹 · 成就', W * 0.5, H * 0.08);

  const { marginX, contentY, contentW, contentH } = getBestiaryContentRect();

  // 内容区背景
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  roundRect(ctx, marginX, contentY, contentW, contentH, 8);
  ctx.fill();
  ctx.stroke();

  // 内容（clip）
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, marginX, contentY, contentW, contentH, 8);
  ctx.clip();

  const rows = Object.values(ACHIEVEMENT_DEFS).map(d => ({ type: 'entry', def: d }));
  achievementsMaxScroll = computeBestiaryMaxScroll(rows, contentH);
  forEachBestiaryRow(rows, contentY, (row, y, h) => {
    const yy = y - achievementsScrollY;
    if (yy + h < contentY || yy > contentY + contentH) return;
    drawAchievementRow(ctx, row.def, marginX, contentW, yy, h);
  });
  ctx.restore();

  // 统计
  const total = Object.keys(ACHIEVEMENT_DEFS).length;
  const unlocked = Object.keys(achievements).filter(k => achievements[k] && achievements[k].unlocked).length;
  ctx.fillStyle = 'rgba(180,200,220,0.3)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText(`已解锁: ${unlocked}/${total}`, W * 0.5, contentY + contentH + 16);

  // 底部提示
  ctx.fillStyle = 'rgba(150,170,200,0.25)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.fillText('点击空白关闭', W * 0.5, H * 0.92);

  ctx.restore();
}

/** 渲染单条成就行（解锁/未解锁） */
function drawAchievementRow(ctx, def, marginX, contentW, y, itemH) {
  const unlocked = achievements[def.id] && achievements[def.id].unlocked;
  const cx = marginX + 16;

  if (unlocked && mx > marginX && mx < marginX + contentW && my > y && my < y + itemH) {
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(marginX + 4, y, contentW - 8, itemH);
  }

  if (unlocked) {
    // 图标（带光晕）
    ctx.save();
    ctx.shadowColor = def.iconColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = def.iconColor;
    ctx.font = '18px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.icon || '?', cx, y + itemH / 2);
    ctx.restore();

    // 名称 + 来源
    ctx.fillStyle = '#ffdd88';
    ctx.font = '14px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'left';
    ctx.fillText(def.name, cx + 28, y + 14);

    ctx.fillStyle = 'rgba(200,210,230,0.35)';
    ctx.font = '10px "Noto Serif SC","SimSun",serif';
    ctx.fillText(def.source || '', cx + 28, y + 32);

    // 描述（右侧，截断）
    ctx.fillStyle = 'rgba(180,190,210,0.45)';
    ctx.font = '10px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'left';
    const descMaxW = contentW - 200;
    ctx.fillText(truncateText(ctx, def.desc || '', descMaxW), cx + 150, y + itemH / 2);
  } else {
    // 未解锁：? + ???
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
    ctx.fillText('未解锁', cx + 28, y + 34);
  }
}

function handleAchievementsClick(cx, cy) {
  if (!achievementsOpen) return;
  const r = getBestiaryContentRect();
  const inPanel = cx > r.marginX && cx < r.marginX + r.contentW && cy > r.contentY && cy < r.contentY + r.contentH;
  if (!inPanel) {
    closeAchievements();
  }
  // 内容区内点击暂不响应（5 个成就一屏尽览）
}

// 滚轮滚动（仿 bestiary；同一时间只开一个面板，preventDefault 不冲突）
window.addEventListener('wheel', (e) => {
  if (!achievementsOpen) return;
  e.preventDefault();
  achievementsScrollY = Math.max(0, Math.min(achievementsMaxScroll, achievementsScrollY + e.deltaY));
}, { passive: false });
