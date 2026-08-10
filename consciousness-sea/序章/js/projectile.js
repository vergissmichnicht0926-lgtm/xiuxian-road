/* ═══════════════════ §J 通用弹幕/炮弹系统 ═══════════════════
 *
 * 依赖：W, H (由 main.js 维护)
 *
 * Projectile — 单个飞行文字弹
 * BulletPattern — 弹幕模式生成器（圆形/螺旋/波浪）
 * spawnRadicalCannon — 偏旁炮弹（高速飞向目标）
 *
 * 全局数组 bossProjectiles 在 boss.js 或 main.js 中声明
 */

class Projectile {
  constructor(char, x, y, vx, vy, color, damage, size) {
    this.char = char;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.color = color || '#ff6644';
    this.glow = '#cc3311';
    this.damage = damage || 5;
    this.size = size || (18 + Math.random() * 10);
    this.alive = true;
    this.alpha = 0.9;
    this.phase = Math.random() * Math.PI * 2;
    this.age = 0;
    this._waveAmp = 0;   // 正弦摆动幅度
    this._waveFreq = 0;  // 摆动频率
    this._wavePhase = 0; // 初始相位
    this._baseX = 0;     // 摆动基准X
    this._trail = [];    // 拖尾轨迹（表现强化）
    this._homing = null;    // 追尾 { speed, turnRate }：每帧 re-aim 向鼠标（回声弹/锁链头）
    this._echoSource = null;// 记忆弹标记 { delay, echoDamage, echoSpeed }：命中留余音
  }

  update(dt) {
    this.age += dt;
    // 记录拖尾（保留最近 6 帧位置）
    this._trail.push({ x: this.x, y: this.y });
    if (this._trail.length > 6) this._trail.shift();
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    // 正弦摆动
    if (this._waveAmp > 0) {
      this.x = this._baseX + Math.sin(this.age * this._waveFreq + this._wavePhase) * this._waveAmp;
    }
    // 追尾（回声弹/锁链头）：每帧 re-aim 向当前鼠标，限角速度防瞬移
    if (this._homing && typeof mx !== 'undefined' && typeof my !== 'undefined') {
      const ta = Math.atan2(my - this.y, mx - this.x);
      const ca = Math.atan2(this.vy, this.vx);
      let da = ta - ca;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const turn = (this._homing.turnRate || 3.0) * dt;
      const a = ca + Math.max(-turn, Math.min(turn, da));
      const spd = this._homing.speed || Math.hypot(this.vx, this.vy);
      this.vx = Math.cos(a) * spd;
      this.vy = Math.sin(a) * spd;
    }

    const m = 80;
    if (this.x < -m || this.x > W + m || this.y < -m || this.y > H + m) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    // ── 拖尾（渐隐历史轨迹，强化弹道可见性）──
    for (let i = 0; i < this._trail.length; i++) {
      const t = this._trail[i];
      const trailAlpha = this.alpha * ((i + 1) / (this._trail.length + 1)) * 0.3;
      if (trailAlpha < 0.02) continue;
      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = this.color;
      ctx.font = `${this.size * 0.45}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.char, t.x, t.y);
    }
    // ── 径向光晕（脉冲呼吸，收敛不放大）──
    const pulse = 0.9 + 0.1 * Math.sin(this.phase + this.age * 8);
    const haloR = this.size * 1.25 * pulse;
    const halo = ctx.createRadialGradient(this.x, this.y, this.size * 0.15, this.x, this.y, haloR);
    halo.addColorStop(0, this.color);
    halo.addColorStop(0.6, this.color);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = this.alpha * 0.18;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(this.x, this.y, haloR, 0, Math.PI * 2); ctx.fill();
    // ── 主体（发光脉冲，阴影收窄）──
    ctx.globalAlpha = this.alpha;
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = 9 + Math.sin(this.phase + this.age * 8) * 5;
    ctx.fillStyle = this.color;
    ctx.font = `${this.size}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.char, this.x, this.y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** 检测是否撞到鼠标受击框 */
  hitMouse(mx, my, radius) {
    const dx = this.x - mx;
    const dy = this.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist < (radius + this.size * 0.6);
  }
}

// ═══════════════ 弹幕生成器 ═══════════════

const BulletPattern = {

  /** 圆形扩散 — 从中心向四周均匀发射 */
  radial(centerX, centerY, char, count, speed, color, damage, size) {
    const projs = [];
    const baseAngle = (performance.now() * 0.001) % (Math.PI * 2); // 时间驱动旋转，每波微小偏移
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i / count) * Math.PI * 2;
      projs.push(new Projectile(
        char || '·', centerX, centerY,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        color, damage, size
      ));
    }
    return projs;
  },

  /** 螺旋 — 从中心旋转扩散 */
  spiral(centerX, centerY, char, count, speed, color, damage, size, offsetAngle) {
    const projs = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (offsetAngle || 0);
      projs.push(new Projectile(
        char || '·', centerX, centerY,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        color, damage, size
      ));
    }
    return projs;
  },

  /** 波浪 — 水平/垂直波浪 */
  wave(centerX, centerY, char, count, speed, color, damage, size, direction) {
    const projs = [];
    const isH = direction !== 'v';
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) - 0.5; // -0.5 ~ 0.5
      const spread = 120 + Math.random() * 80;
      const x = isH ? centerX + t * spread : centerX;
      const y = isH ? centerY : centerY + t * spread;
      projs.push(new Projectile(
        char || '·', x, y,
        isH ? 0 : ((Math.random() - 0.5) * speed),
        isH ? speed : 0,
        color, damage, size
      ));
    }
    return projs;
  },

  /** 雨帘 — 整体正弦摆动下落，幅度匹配心锁圈直径 */
  rain(centerX, centerY, char, count, speed, color, damage, size) {
    const projs = [];
    const spread = Math.max(520, W * 0.50); // 中等宽度，不过散
    const sharedFreq = 2.8;
    const sharedPhase = performance.now() * 0.001 * 2.0; // 时间驱动，每波相位自然偏移
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) - 0.5;
      const x = centerX + t * spread;
      const p = new Projectile(char || '·', x, centerY - 40, 0, speed, color, damage, size);
      p._waveAmp = 55;          // 统一幅度
      p._waveFreq = sharedFreq;  // 统一频率 → 整体摆动
      p._wavePhase = sharedPhase; // 统一相位 → 雨帘一致
      p._baseX = x;
      projs.push(p);
    }
    return projs;
  },

  /** 追踪 — 瞄准目标位置 */
  aimed(centerX, centerY, toX, toY, char, count, speed, color, damage, size, spreadAngle) {
    const projs = [];
    const baseAngle = Math.atan2(toY - centerY, toX - centerX);
    const spread = spreadAngle || 0.3;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i - (count - 1) / 2) * spread;
      const spd = speed * (0.85 + Math.random() * 0.3);
      projs.push(new Projectile(
        char || '·', centerX, centerY,
        Math.cos(angle) * spd, Math.sin(angle) * spd,
        color, damage, size
      ));
    }
    return projs;
  }
};
