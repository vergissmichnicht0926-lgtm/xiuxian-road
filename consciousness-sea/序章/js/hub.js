/* ═══════════════════ §HUB 零的领域 — 常驻主页面 ═══════════════════
 *
 * 依赖：config.js (HUB_ZERO_DIALOGUES)
 *       particles.js (mentor, bgParticles, HitParticle)
 *       dialogue.js (Dialogue)
 *       sound.js (Sound)
 *       main.js (W, H, mx, my, canvasZoom等全局)
 *
 * Hub是Canvas渲染的互动空间：
 *   - 零的投影（点击对话）
 *   - 小萤光团（点击打开功能菜单：图鉴/工坊/成就）
 *   - 肉鸽按钮（开始潜航）
 */

// ═══════════════ Hub 状态 ═══════════════
let hubActive = false;
let hubPhase = 'idle';          // 'entering' | 'idle' | 'talking_zero' | 'xiaoying_menu' | 'exiting'
let hubAlpha = 0;
let hubZeroTalkIndex = 0;       // 零对话进度（暂未使用，预留）
let hubXiaoyingActivated = false; // 小萤是否已激活
let hubRunNumber = 0;           // 当前是第几次潜航（从hub出发的次数）
let hubMenuOpen = false;        // 小萤功能菜单是否打开
let hubMenuHovered = null;      // 悬停的菜单项
let hubMenuItems = [];          // 菜单项对象数组
let hubParticles = [];          // Hub环境粒子
let hubXiaoying = null;         // 小萤光团状态
let hubRoguelikeHovered = false;// 肉鸽按钮悬停
let _hubZeroTalkTimer = null;   // 零对话定时器
let _hubMenuCloseTimer = null;  // 菜单关闭延迟定时器
let _hubRestartTimer1 = null;   // 重新开始确认定时器1
let _hubRestartTimer2 = null;   // 重新开始确认定时器2

// ⚠️ 首次潜航剧情（小萤出场）
let hubFirstDiveStoryActive = false;  // 剧情是否在播放
let hubFirstDiveStoryIdx = 0;         // 当前对话序号
let hubFirstDiveStoryDone = false;    // 剧情是否已完成（防止重复触发）
let _hubXiaoyingRushTargetX = null;   // 小萤入场动画目标X
let _hubXiaoyingTargetAlpha = null;   // 小萤入场动画目标alpha

// ═══════════════ 进入/退出 Hub ═══════════════

function enterHub() {
  hubActive = true;
  hubPhase = 'entering';
  hubAlpha = 0;
  hubZeroTalkIndex = (typeof hubZeroTalkIndex !== 'undefined') ? hubZeroTalkIndex : 0;
  hubMenuOpen = false;
  hubMenuHovered = null;
  hubMenuItems = [];
  hubParticles = [];
  hubRoguelikeHovered = false;

  // ⚠️ 首次进入Hub：重置小萤出场剧情标记
  if ((hubRunNumber || 0) === 0) {
    hubFirstDiveStoryDone = false;
  }
  hubFirstDiveStoryActive = false;
  hubFirstDiveStoryIdx = 0;

  // 隐藏战斗UI
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';
  document.getElementById('combo-display').classList.remove('show');
  document.getElementById('skill-display').style.opacity = '0';
  document.getElementById('player-zone').style.opacity = '0';
  document.getElementById('shards-display').style.opacity = '0';

  // 隐藏菜单层
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('difficulty-screen').classList.add('hidden');

  // BGM：安全屋温暖音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('safehouse', 2.0);

  // 零的投影 — 半透明悬浮
  if (typeof mentor !== 'undefined') {
    if (!mentor.visible || mentor.alpha < 0.01) mentor.init(W * 0.5, H * 0.28);
    mentor.targetAlpha = 0.3;
  }

  // 初始化小萤光团
  initXiaoying();

  // 初始化Hub环境粒子
  initHubParticles();

  // 清理地图/战斗/肉鸽状态（防止残留绘制）
  if (typeof mapActive !== 'undefined') mapActive = false;
  if (typeof currentDiveRoom !== 'undefined') currentDiveRoom = null;
  if (typeof mapTransitionDir !== 'undefined') mapTransitionDir = 0;
  if (typeof battleWords !== 'undefined') battleWords = [];
  if (typeof particles !== 'undefined') particles = [];
  if (typeof bossActive !== 'undefined') bossActive = false;
  if (typeof bossState !== 'undefined') bossState = null;
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  if (typeof clearEnemyList === 'function') clearEnemyList(); // ⚠️ 清空多敌人编队，防重新潜航浮现残留敌人
  if (typeof enemyProjectiles !== 'undefined') enemyProjectiles = [];
  if (typeof isRoguelikeMap !== 'undefined') isRoguelikeMap = false;
  if (typeof dynamicRoomData !== 'undefined') dynamicRoomData = null;
  if (typeof dynamicBaseConnections !== 'undefined') dynamicBaseConnections = null;

  // ⚠️ 回到零的领域：重置玩家装备为空（下一局潜航由小萤 rollStartGear 随机提供）
  if (typeof playerWeapon !== 'undefined') playerWeapon = null;
  if (typeof playerArmor !== 'undefined') { playerArmor = null; playerDefense = 0; }
  if (typeof playerTalisman !== 'undefined') playerTalisman = null;

  // 隐藏战败覆盖层（如果从肉鸽战败进入Hub）
  const defeatOverlay = document.getElementById('defeat-overlay');
  if (defeatOverlay) defeatOverlay.classList.remove('show');

  // 存档
  if (typeof saveGame === 'function') saveGame();
}

/** 清除所有Hub定时器 */
function _clearHubTimers() {
  if (_hubZeroTalkTimer) { clearInterval(_hubZeroTalkTimer); _hubZeroTalkTimer = null; }
  if (_hubMenuCloseTimer) { clearTimeout(_hubMenuCloseTimer); _hubMenuCloseTimer = null; }
  if (_hubRestartTimer1) { clearInterval(_hubRestartTimer1); _hubRestartTimer1 = null; }
  if (_hubRestartTimer2) { clearInterval(_hubRestartTimer2); _hubRestartTimer2 = null; }
  // 首次潜航剧情清理
  hubFirstDiveStoryActive = false;
}

/** 完成退出动画后由 updateHub 调用 */
function _finishExitHub() {
  _clearHubTimers();
  hubActive = false;
  hubPhase = 'idle';
  hubAlpha = 0;
  hubMenuOpen = false;
  hubMenuItems = [];
  hubParticles = [];
  if (typeof mentor !== 'undefined') mentor.targetAlpha = 0;
}

// ═══════════════ 小萤光团 ═══════════════

function initXiaoying() {
  // ⚠️ 首次Hub访问（潜航前）：小萤隐藏，首次潜航剧情中才出场
  const isHidden = (hubRunNumber || 0) === 0;
  hubXiaoying = {
    x: isHidden ? W + 100 : W * 0.5 + 60,
    y: H * 0.35,
    baseX: isHidden ? W + 100 : W * 0.5 + 60,
    baseY: H * 0.35,
    radius: 12,
    glowRadius: 28,
    phase: Math.random() * Math.PI * 2,
    hovered: false,
    alpha: isHidden ? 0 : 0.85,
    particles: [],
  };
  // 首次激活标记
  if (!hubXiaoyingActivated) hubXiaoyingActivated = true;
}

// ═══════════════ Hub 环境粒子 ═══════════════

function initHubParticles() {
  hubParticles = [];
  for (let i = 0; i < 25; i++) {
    hubParticles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      size: 0.5 + Math.random() * 2,
      alpha: 0.1 + Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3 - 0.1,
      life: 200 + Math.random() * 400,
      age: Math.random() * 300,
      color: Math.random() < 0.7 ? '140,180,220' : '180,200,140',
    });
  }
}

// ═══════════════ 小萤功能菜单 ═══════════════

function openXiaoyingMenu() {
  // 清除上一次关闭的延迟定时器，防止300ms内重开菜单被自动关闭
  if (_hubMenuCloseTimer) { clearTimeout(_hubMenuCloseTimer); _hubMenuCloseTimer = null; }
  hubMenuOpen = true;
  const cx = hubXiaoying.x;
  const cy = hubXiaoying.y + 50;

  hubMenuItems = [
    { id: 'bestiary', label: '图鉴',    desc: '意识之海中遇到的一切', x: cx, y: cy,       baseX: cx, baseY: cy, alpha: 0, targetAlpha: 0.9, color: '#88ccff', glow: '#4488cc', hovered: false },
    { id: 'workshop', label: '工坊',    desc: '用灵魂结晶强化意识',   x: cx, y: cy + 40,  baseX: cx, baseY: cy + 40, alpha: 0, targetAlpha: 0.9, color: '#ffcc88', glow: '#cc8844', hovered: false },
    { id: 'achievements', label: '成就', desc: '深海中的足迹（施工中）', x: cx, y: cy + 80, baseX: cx, baseY: cy + 80, alpha: 0, targetAlpha: 0.6, color: '#999999', glow: '#666666', hovered: false },
  ];
}

function closeXiaoyingMenu() {
  hubMenuItems.forEach(item => { item.targetAlpha = 0; });
  if (_hubMenuCloseTimer) clearTimeout(_hubMenuCloseTimer);
  _hubMenuCloseTimer = setTimeout(() => {
    hubMenuOpen = false;
    hubMenuItems = [];
    hubMenuHovered = null;
    _hubMenuCloseTimer = null;
  }, 300);
}

// ═══════════════ 更新 ═══════════════

function updateHub(dt) {
  if (!hubActive) return;

  // 缓入动画
  if (hubPhase === 'entering') {
    hubAlpha += dt * 2.0;
    if (hubAlpha >= 1) { hubAlpha = 1; hubPhase = 'idle'; }
  }

  // 缓出动画
  if (hubPhase === 'exiting') {
    hubAlpha -= dt * 2.5;
    if (hubAlpha <= 0) { _finishExitHub(); return; }
  }

  // ⚠️ 首次潜航剧情：用户点击推进对话（!Dialogue.active表示上一句已被用户点击关闭）
  if (hubFirstDiveStoryActive && typeof Dialogue !== 'undefined' && !Dialogue.active) {
    advanceFirstDiveStory();
  }

  // 小萤浮动
  if (hubXiaoying) {
    hubXiaoying.phase += dt * 1.8;
    hubXiaoying.x = hubXiaoying.baseX + Math.sin(hubXiaoying.phase) * 18;
    hubXiaoying.y = hubXiaoying.baseY + Math.cos(hubXiaoying.phase * 0.7) * 10;
    // 光粒子
    if (hubXiaoying.particles.length < 8 && Math.random() < 0.3) {
      hubXiaoying.particles.push({
        x: hubXiaoying.x, y: hubXiaoying.y,
        vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8 - 0.5,
        size: 1 + Math.random() * 2.5, alpha: 0.6, life: 30 + Math.random() * 40, age: 0,
      });
    }
    hubXiaoying.particles = hubXiaoying.particles.filter(p => { p.age++; p.x += p.vx; p.y += p.vy; p.alpha *= 0.96; return p.age < p.life; });

    // ⚠️ 小萤入场动画（首次潜航剧情用）
    if (_hubXiaoyingRushTargetX !== null) {
      hubXiaoying.baseX += (_hubXiaoyingRushTargetX - hubXiaoying.baseX) * 0.06;
      if (Math.abs(_hubXiaoyingRushTargetX - hubXiaoying.baseX) < 1) {
        hubXiaoying.baseX = _hubXiaoyingRushTargetX;
        _hubXiaoyingRushTargetX = null;
      }
    }
    if (_hubXiaoyingTargetAlpha !== null) {
      hubXiaoying.alpha += (_hubXiaoyingTargetAlpha - hubXiaoying.alpha) * 0.08;
      if (Math.abs(_hubXiaoyingTargetAlpha - hubXiaoying.alpha) < 0.01) {
        hubXiaoying.alpha = _hubXiaoyingTargetAlpha;
        _hubXiaoyingTargetAlpha = null;
      }
    }
  }

  // 小萤菜单项缓入
  if (hubMenuOpen) {
    hubMenuItems.forEach(item => {
      item.alpha += (item.targetAlpha - item.alpha) * 0.12;
    });
  }

  // Hub环境粒子
  hubParticles.forEach(p => {
    p.age++;
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = W;
    if (p.x > W) p.x = 0;
    if (p.y < 0) p.y = H;
    if (p.y > H) p.y = 0;
  });
  // 补充粒子
  if (hubParticles.length < 25 && Math.random() < 0.5) {
    hubParticles.push({
      x: Math.random() * W, y: H + 5,
      size: 0.5 + Math.random() * 2, alpha: 0.1 + Math.random() * 0.2,
      vx: (Math.random() - 0.5) * 0.3, vy: -0.1 - Math.random() * 0.3,
      life: 200 + Math.random() * 400, age: 0,
      color: Math.random() < 0.7 ? '140,180,220' : '180,200,140',
    });
  }

  // 菜单项悬停
  if (hubMenuOpen) {
    hubMenuHovered = null;
    hubMenuItems.forEach(item => {
      item.hovered = false;
      const w = 160, h = 36;
      if (mx > item.x - w/2 && mx < item.x + w/2 && my > item.y - h/2 && my < item.y + h/2) {
        item.hovered = true;
        hubMenuHovered = item;
      }
    });
  }

  // 小萤悬停
  if (hubXiaoying) {
    const dx = mx - hubXiaoying.x, dy = my - hubXiaoying.y;
    hubXiaoying.hovered = Math.sqrt(dx*dx + dy*dy) < hubXiaoying.glowRadius;
  }

  // 肉鸽按钮悬停
  const btnX = W * 0.5, btnY = H * 0.72;
  hubRoguelikeHovered = mx > btnX - 90 && mx < btnX + 90 && my > btnY - 22 && my < btnY + 22;
}

// ═══════════════ 渲染 ═══════════════

function drawHub(ctx) {
  if (!hubActive || hubAlpha < 0.01) return;

  ctx.save();
  ctx.globalAlpha = hubAlpha;

  // ── 背景 ──
  const grad = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.35, Math.max(W, H) * 0.8);
  grad.addColorStop(0, '#0c0c28');
  grad.addColorStop(0.4, '#08081e');
  grad.addColorStop(1, '#020212');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Hub环境粒子
  hubParticles.forEach(p => {
    const lifeRatio = 1 - p.age / p.life;
    ctx.fillStyle = `rgba(${p.color},${p.alpha * lifeRatio})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });

  // ── 标题 ──
  ctx.fillStyle = 'rgba(180,200,240,0.5)';
  ctx.font = '22px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('零的领域', W * 0.5, H * 0.1);

  // ── 零的投影 ──
  // 在hub背景上绘制mentor（因为hub背景会遮住main.js中绘制的mentor）
  if (typeof mentor !== 'undefined' && mentor.visible && mentor.alpha > 0.01) {
    mentor.draw(ctx);
  }

  // 零周围微光粒子
  const zx = W * 0.5, zy = H * 0.28;
  const now = performance.now();
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 + now * 0.0003;
    const r = 45 + Math.sin(now * 0.002 + i) * 8;
    const px = zx + Math.cos(angle) * r;
    const py = zy + Math.sin(angle) * r * 0.6;
    ctx.fillStyle = `rgba(140,180,240,${0.12 + 0.06 * Math.sin(now * 0.003 + i)})`;
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
  }

  // ── "零"的标签 ──
  ctx.fillStyle = 'rgba(160,200,240,0.3)';
  ctx.font = '12px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('点击对话', zx, zy + 55);

  // ── 小萤光团 ──
  if (hubXiaoying) {
    drawXiaoying(ctx);
  }

  // ── 小萤功能菜单 ──
  if (hubMenuOpen) {
    drawXiaoyingMenu(ctx);
  }

  // ── 肉鸽按钮 ──
  drawRoguelikeButton(ctx);

  // ── 底部提示 ──
  ctx.fillStyle = 'rgba(150,170,200,0.25)';
  ctx.font = '12px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  const hint = hubMenuOpen ? '点击选项 · 点击空白关闭' : 'Tab 行囊 · F5 存档';
  ctx.fillText(hint, W * 0.5, H * 0.92);

  // ── 右下角"重新开始" ──
  const resetX = W - 60, resetY = H - 20;
  const resetHovered = mx > resetX - 40 && mx < resetX + 40 && my > resetY - 12 && my < resetY + 12;
  ctx.fillStyle = resetHovered ? 'rgba(255,120,100,0.5)' : 'rgba(150,150,170,0.2)';
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.fillText('重新开始', resetX, resetY);

  ctx.restore();
}

// ═══════════════ 小萤渲染 ═══════════════

function drawXiaoying(ctx) {
  const xy = hubXiaoying;
  const now = performance.now();
  const pulse = 0.7 + 0.3 * Math.sin(now * 0.004);

  // 外层光晕
  const haloGrad = ctx.createRadialGradient(xy.x, xy.y, xy.radius * 0.3, xy.x, xy.y, xy.glowRadius * (xy.hovered ? 1.5 : 1));
  haloGrad.addColorStop(0, `rgba(255,220,150,${0.5 * pulse})`);
  haloGrad.addColorStop(0.4, `rgba(240,200,120,${0.2 * pulse})`);
  haloGrad.addColorStop(1, 'rgba(200,150,80,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath(); ctx.arc(xy.x, xy.y, xy.glowRadius * (xy.hovered ? 1.5 : 1), 0, Math.PI * 2); ctx.fill();

  // 光粒子轨迹
  xy.particles.forEach(p => {
    ctx.fillStyle = `rgba(255,220,150,${p.alpha * 0.7})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  });

  // 内核
  const coreGrad = ctx.createRadialGradient(xy.x, xy.y, 0, xy.x, xy.y, xy.radius);
  coreGrad.addColorStop(0, 'rgba(255,240,210,0.95)');
  coreGrad.addColorStop(0.5, 'rgba(255,210,140,0.7)');
  coreGrad.addColorStop(1, 'rgba(220,170,100,0)');
  ctx.fillStyle = coreGrad;
  ctx.beginPath(); ctx.arc(xy.x, xy.y, xy.radius, 0, Math.PI * 2); ctx.fill();

  // 萤火虫翅膀般的微光丝
  ctx.strokeStyle = `rgba(255,230,180,${0.2 * pulse})`;
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    const a = now * 0.002 + i * Math.PI * 2 / 3;
    ctx.beginPath();
    ctx.moveTo(xy.x, xy.y);
    ctx.quadraticCurveTo(
      xy.x + Math.cos(a) * xy.radius * 1.8, xy.y + Math.sin(a) * xy.radius * 1.8,
      xy.x + Math.cos(a + 0.4) * xy.radius * 2.5, xy.y + Math.sin(a + 0.4) * xy.radius * 2.5
    );
    ctx.stroke();
  }

  // 标签
  if (xy.hovered && !hubMenuOpen) {
    ctx.fillStyle = 'rgba(255,230,180,0.6)';
    ctx.font = '12px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText('小萤', xy.x, xy.y - xy.glowRadius - 8);
  }
}

// ═══════════════ 小萤菜单渲染 ═══════════════

function drawXiaoyingMenu(ctx) {
  const now = performance.now();

  hubMenuItems.forEach(item => {
    if (item.alpha < 0.03) return;
    const isHovered = item.hovered;
    const isDisabled = item.id === 'achievements';

    ctx.save();
    ctx.globalAlpha = item.alpha * (isDisabled ? 0.5 : 1);

    const w = 160, h = 36, r = 6;
    const cx = item.x, cy = item.y;

    // 卡片背景
    const bgAlpha = isHovered && !isDisabled ? 0.15 : 0.06;
    ctx.fillStyle = `rgba(255,220,180,${bgAlpha})`;
    if (isHovered && !isDisabled) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = item.glow;
    } else {
      ctx.globalAlpha = item.alpha * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    }
    ctx.lineWidth = isHovered && !isDisabled ? 1.5 : 0.5;
    roundRect(ctx, cx - w/2, cy - h/2, w, h, r);
    ctx.fill();
    ctx.stroke();

    // 光晕
    if (isHovered && !isDisabled) {
      ctx.shadowColor = item.glow;
      ctx.shadowBlur = 12;
      ctx.fillStyle = item.color;
      ctx.font = '16px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.label, cx, cy - 4);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = isDisabled ? '#666' : item.color;
      ctx.font = '15px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(item.label, cx, cy - 4);
    }

    // 描述
    ctx.fillStyle = isDisabled ? 'rgba(150,150,150,0.3)' : 'rgba(180,190,210,0.35)';
    ctx.font = '9px "Noto Serif SC","SimSun",serif';
    ctx.fillText(isDisabled ? '施工中…' : item.desc, cx, cy + 14);

    ctx.restore();
  });
}

// ═══════════════ 肉鸽按钮 ═══════════════

function drawRoguelikeButton(ctx) {
  const now = performance.now();
  const cx = W * 0.5, cy = H * 0.72;
  const w = 180, h = 44, r = 22;
  const pulse = 0.7 + 0.3 * Math.sin(now * 0.003);
  const hovered = hubRoguelikeHovered;

  ctx.save();

  // 外层光晕
  const haloGrad = ctx.createRadialGradient(cx, cy, h * 0.3, cx, cy, h * 1.2);
  haloGrad.addColorStop(0, `rgba(140,200,255,${0.2 * pulse})`);
  haloGrad.addColorStop(1, 'rgba(100,160,220,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath(); ctx.arc(cx, cy, h * 1.2, 0, Math.PI * 2); ctx.fill();

  // 按钮主体
  const bgAlpha = hovered ? 0.2 : 0.08;
  ctx.fillStyle = `rgba(160,210,255,${bgAlpha})`;
  ctx.strokeStyle = hovered ? `rgba(180,220,255,${0.6 * pulse})` : `rgba(140,200,240,${0.3 * pulse})`;
  ctx.lineWidth = hovered ? 2 : 1;
  roundRect(ctx, cx - w/2, cy - h/2, w, h, r);
  ctx.fill();
  ctx.stroke();

  // 发光文字
  if (hovered) {
    ctx.shadowColor = 'rgba(180,220,255,0.6)';
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = '#c8ddf8';
  ctx.font = '18px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('开始潜航', cx, cy);
  ctx.shadowBlur = 0;

  // hover时的小粒子
  if (hovered && Math.random() < 0.4) {
    hubParticles.push({
      x: cx + (Math.random() - 0.5) * w, y: cy + (Math.random() - 0.5) * h,
      size: 1 + Math.random() * 2, alpha: 0.4, vx: (Math.random() - 0.5) * 0.5,
      vy: -0.3 - Math.random() * 0.5, life: 30 + Math.random() * 20, age: 0,
      color: '180,220,255',
    });
  }

  ctx.restore();
}

// ═══════════════ 交互处理 ═══════════════

/** 检测零的投影点击 */
function hitTestZeroForm(mx, my) {
  const zx = W * 0.5, zy = H * 0.28;
  const dist = Math.sqrt((mx - zx) ** 2 + (my - zy) ** 2);
  return dist < 60;
}

/** 检测肉鸽按钮点击 */
function hitTestRoguelikeButton(mx, my) {
  const cx = W * 0.5, cy = H * 0.72;
  return mx > cx - 90 && mx < cx + 90 && my > cy - 22 && my < cy + 22;
}

/** 检测"重新开始"点击 */
function hitTestResetButton(mx, my) {
  const rx = W - 60, ry = H - 20;
  return mx > rx - 40 && mx < rx + 40 && my > ry - 12 && my < ry + 12;
}

/** Hub点击处理（由main.js click handler调用） */
function handleHubClick(cx, cy) {
  if (!hubActive || hubAlpha < 0.9) return;

  // 如果对话正在进行中，让对话系统处理
  if (typeof Dialogue !== 'undefined' && Dialogue.active) {
    if (typeof Sound !== 'undefined') Sound.dialogueAdvance();
    if (hubFirstDiveStoryActive) {
      // ⚠️ 首次潜航剧情对话：点击推进（不下放给Tutorial）
      if (!Dialogue.complete) Dialogue.skip();
      else Dialogue.hide();
    } else if (hubPhase === 'talking_zero') {
      // 零对话中：直接skip/hide，由定时器推进
      if (!Dialogue.complete) Dialogue.skip();
      else Dialogue.hide();
    } else {
      if (!Dialogue.complete) Dialogue.skip();
      else Dialogue.hide();
    }
    return;
  }

  // 小萤菜单打开时
  if (hubMenuOpen) {
    if (hubMenuHovered) {
      if (hubMenuHovered.id === 'bestiary') {
        // 打开图鉴
        closeXiaoyingMenu();
        if (typeof openBestiary === 'function') openBestiary();
        return;
      } else if (hubMenuHovered.id === 'workshop') {
        // 打开灵魂工坊
        closeXiaoyingMenu();
        if (typeof openSoulShop === 'function') openSoulShop();
        return;
      } else if (hubMenuHovered.id === 'achievements') {
        // 成就——占位，不执行任何操作
        if (typeof Sound !== 'undefined') Sound.stun();
        return;
      }
    } else {
      // 点击空白关闭菜单
      closeXiaoyingMenu();
      return;
    }
  }

  // 图鉴模式——由bestiary.js处理
  if (typeof bestiaryOpen !== 'undefined' && bestiaryOpen) {
    if (typeof handleBestiaryClick === 'function') handleBestiaryClick(cx, cy);
    return;
  }

  // 点击小萤 → 打开功能菜单
  if (hubXiaoying && hubXiaoying.hovered) {
    if (typeof Sound !== 'undefined') Sound.uiOpen();
    openXiaoyingMenu();
    return;
  }

  // 点击零 → 对话
  if (hitTestZeroForm(cx, cy)) {
    if (typeof Sound !== 'undefined') Sound.dialogueAdvance();
    startHubZeroTalk();
    return;
  }

  // 点击肉鸽按钮 → 开始潜航
  if (hitTestRoguelikeButton(cx, cy)) {
    if (typeof Sound !== 'undefined') Sound.mapNode();
    // ⚠️ 首次潜航：触发小萤出场剧情（而非直接潜航）
    if ((hubRunNumber || 0) === 0 && !hubFirstDiveStoryDone) {
      startFirstDiveStory();
    } else {
      startRoguelikeDive();
    }
    return;
  }

  // 点击"重新开始"
  if (hitTestResetButton(cx, cy)) {
    if (typeof Sound !== 'undefined') Sound.stun();
    confirmRestart();
    return;
  }
}

// ═══════════════ 零的对话 ═══════════════

function startHubZeroTalk() {
  // 根据进度选择对话池
  let poolIdx = 0;
  if (hubRunNumber >= 2) poolIdx = 2;       // 多次潜航后
  else if (hubRunNumber >= 1) poolIdx = 1;  // 一次潜航后

  const pool = HUB_ZERO_DIALOGUES[Math.min(poolIdx, HUB_ZERO_DIALOGUES.length - 1)];

  // 用Tutorial的对话队列机制？不，直接用Dialogue系统手动播放
  // 随机选一段开始（循环池）
  const dialogues = [...pool];
  let idx = 0;

  function playNext() {
    if (idx >= dialogues.length) return;
    const d = dialogues[idx];
    idx++;
    if (typeof Dialogue !== 'undefined') {
      Dialogue.show({
        mode: d.mode || 'float',
        speaker: d.speaker || '',
        text: d.text,
        speed: d.speed || 40,
      });
    }
  }

  // 覆盖Dialogue.hide后的行为（通过设置hubPhase让updateHub处理）
  hubPhase = 'talking_zero';
  playNext();

  // 用定时器监测对话结束 → 播放下一句
  if (_hubZeroTalkTimer) clearInterval(_hubZeroTalkTimer);
  _hubZeroTalkTimer = setInterval(() => {
    if (!Dialogue.active) {
      if (idx < dialogues.length) {
        playNext();
      } else {
        clearInterval(_hubZeroTalkTimer);
        _hubZeroTalkTimer = null;
        hubPhase = 'idle';
      }
    }
  }, 200);
}

// ═══════════════ 首次潜航：小萤出场剧情 ═══════════════

/** 触发小萤首次出场剧情（仅 hubRunNumber===0 时调用） */
function startFirstDiveStory() {
  hubFirstDiveStoryActive = true;
  hubFirstDiveStoryIdx = 0;
  hubPhase = 'first_dive_story';

  // ⚠️ 小萤从右侧冲入画面
  if (hubXiaoying) {
    hubXiaoying.baseX = W + 100;
    hubXiaoying.alpha = 0;
    // 动画目标：飞到正常位置
    _hubXiaoyingRushTargetX = W * 0.5 + 60;
    _hubXiaoyingTargetAlpha = 0.85;
    // 入场粒子
    if (typeof particles !== 'undefined') {
      for (let i = 0; i < 15; i++) {
        particles.push(new HitParticle(W + 50, H * 0.35, '#ffdd88', '·'));
      }
    }
  }

  // 播放第一句对话
  if (typeof HUB_FIRST_DIVE_STORY === 'undefined' || !HUB_FIRST_DIVE_STORY.length) {
    // fallback：如果没有配置对话池，直接开始潜航
    hubFirstDiveStoryActive = false;
    hubFirstDiveStoryDone = true;
    startRoguelikeDive();
    return;
  }

  const entry = HUB_FIRST_DIVE_STORY[0];
  if (typeof Dialogue !== 'undefined') {
    Dialogue.show({
      mode: entry.mode || 'float',
      speaker: entry.speaker || '',
      text: entry.text || '',
      speed: entry.speed || 42,
    });
  }
  hubFirstDiveStoryIdx = 1;
}

/** 推进首次剧情对话（由 updateHub 在 !Dialogue.active 时调用） */
function advanceFirstDiveStory() {
  if (!hubFirstDiveStoryActive) return;

  if (hubFirstDiveStoryIdx < HUB_FIRST_DIVE_STORY.length) {
    const entry = HUB_FIRST_DIVE_STORY[hubFirstDiveStoryIdx];
    if (typeof Dialogue !== 'undefined') {
      Dialogue.show({
        mode: entry.mode || 'float',
        speaker: entry.speaker || '',
        text: entry.text || '',
        speed: entry.speed || 42,
      });
    }
    hubFirstDiveStoryIdx++;
  } else {
    // 剧情结束 → 给装备 → 开始潜航
    finishFirstDiveStory();
  }
}

/** 首次剧情结束：装备恢复 + 开始潜航 */
function finishFirstDiveStory() {
  hubFirstDiveStoryActive = false;
  hubFirstDiveStoryDone = true;

  // 粒子特效（行囊位置金色爆发）
  if (typeof particles !== 'undefined' && typeof W !== 'undefined' && typeof H !== 'undefined') {
    for (let i = 0; i < 25; i++) {
      const p = new HitParticle(W * 0.5 + (Math.random() - 0.5) * 100, H * 0.45 + (Math.random() - 0.5) * 60, '#ffdd44', '·');
      p.vx = (Math.random() - 0.5) * 4;
      p.vy = (Math.random() - 0.5) * 4;
      p.size = 4 + Math.random() * 10;
      p.life = 30 + Math.random() * 40;
      particles.push(p);
    }
  }

  if (typeof updatePlayerUI === 'function') updatePlayerUI();
  if (typeof Sound !== 'undefined') Sound.itemGet();

  // 开始潜航（startRoguelikeDive内部重置装备为基础套）
  startRoguelikeDive();
}

// ═══════════════ 肉鸽潜航 ═══════════════

function startRoguelikeDive() {
  hubRunNumber = (hubRunNumber || 0) + 1;
  hubPhase = 'exiting';

  // 重置局内货币
  if (typeof shards !== 'undefined') shards = 0;
  if (typeof updateShardsDisplay === 'function') updateShardsDisplay();

  // 重置遗响（每局潜航的局内构筑清空）
  if (typeof clearEchoes === 'function') clearEchoes();

  // 重置局内装备状态（融合等级 equipmentLevels / buff weaponBuffs / 熟练度 equipProficiency 跨局保留）
  if (typeof resetRunEquipmentState === 'function') resetRunEquipmentState(); // 局内防具/护符解锁集合清空
  if (typeof resetRunStats === 'function') resetRunStats(); // 本局统计 + 装备获得计数
  // 小萤随机提供装备（从解锁池：基础件+熟练度达标件；技能固有不随机）
  if (typeof rollStartGear === 'function') {
    rollStartGear();
  } else if (typeof EQUIPMENT !== 'undefined') {
    if (typeof playerWeapon !== 'undefined') playerWeapon = EQUIPMENT.weapons['beginner_brush'];
    if (typeof playerArmor !== 'undefined') { playerArmor = EQUIPMENT.armors['thin_silk']; if (typeof playerDefense !== 'undefined') playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : (playerArmor.defense || 0); }
    if (typeof playerTalisman !== 'undefined') playerTalisman = EQUIPMENT.talismans['vitality_charm'];
  }
  if (typeof playerSkill !== 'undefined') playerSkill = (typeof EQUIPMENT !== 'undefined') ? EQUIPMENT.skills['concentration'] : playerSkill;
  if (playerArmor && typeof unlockedArmors !== 'undefined') unlockedArmors.add(playerArmor.id);
  if (playerTalisman && typeof unlockedTalismans !== 'undefined') unlockedTalismans.add(playerTalisman.id);

  // 重置技能状态
  if (typeof skillState !== 'undefined') skillState = { collected: [], chargeLevel: 0, ready: false };
  if (typeof updateSkillUI === 'function') updateSkillUI();

  // 重置基础HP，然后应用永久升级（会在此基础上叠加HP加成）
  if (typeof playerMaxHP !== 'undefined') playerMaxHP = 100;
  if (typeof playerHP !== 'undefined') playerHP = 100;
  if (typeof applyPermanentUpgrades === 'function') applyPermanentUpgrades();
  if (typeof updatePlayerUI === 'function') updatePlayerUI();

  // 退出Hub → 生成肉鸽地图 → 进入潜航
  // 先清定时器防竞态，再统一在setTimeout中完成退出
  _clearHubTimers();
  setTimeout(() => {
    if (hubActive) _finishExitHub(); // 仅当updateHub还没退出时手动清理
    if (typeof generateRoguelikeMap === 'function') {
      generateRoguelikeMap();
    } else if (typeof initMap === 'function') {
      initMap();
    }
    // 设置游戏阶段：潜航中
    if (typeof setGameToDiving === 'function') setGameToDiving();
  }, 500);
}

// ═══════════════ 重新开始 ═══════════════

function confirmRestart() {
  // 防止重复触发
  if (_hubRestartTimer1) return;
  // 用对话系统做确认
  if (typeof Dialogue !== 'undefined') {
    Dialogue.show({
      mode: 'float',
      speaker: '零',
      text: '……你确定要重新开始吗？所有的潜航记录都会被清除。',
      speed: 35,
    });
  }
  // 等待对话被点击后，显示确认
  _hubRestartTimer1 = setInterval(() => {
    if (!Dialogue.active) {
      clearInterval(_hubRestartTimer1);
      _hubRestartTimer1 = null;
      Dialogue.show({
        mode: 'float',
        speaker: '零',
        text: '如果这是你的选择……我会在这里等你回来。',
        speed: 40,
      });
      _hubRestartTimer2 = setInterval(() => {
        if (!Dialogue.active) {
          clearInterval(_hubRestartTimer2);
          _hubRestartTimer2 = null;
          if (typeof SAVE_KEY !== 'undefined') {
            localStorage.removeItem(SAVE_KEY);
          }
          location.reload();
        }
      }, 200);
    }
  }, 200);
}

// roundRect 使用 shop.js 中的定义
