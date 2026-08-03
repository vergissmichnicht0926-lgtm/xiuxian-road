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
    this._trail = []; // 轨迹尾迹
    this._waveAmp = 0;   // 正弦摆动幅度
    this._waveFreq = 0;  // 摆动频率
    this._wavePhase = 0; // 初始相位
    this._baseX = 0;     // 摆动基准X
  }

  update(dt) {
    this.age += dt;
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    // 正弦摆动
    if (this._waveAmp > 0) {
      this.x = this._baseX + Math.sin(this.age * this._waveFreq + this._wavePhase) * this._waveAmp;
    }

    const m = 80;
    if (this.x < -m || this.x > W + m || this.y < -m || this.y > H + m) {
      this.alive = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.shadowColor = this.glow;
    ctx.shadowBlur = 6;
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
    const spread = 720; // 覆盖更广的水平范围
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

/** 偏旁炮弹 — 高速飞向目标，带预警线 */
function spawnRadicalCannon(fromX, fromY, toX, toY, char, speed, damage, color) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const spd = speed || 12;
  return new Projectile(
    char, fromX, fromY,
    Math.cos(angle) * spd, Math.sin(angle) * spd,
    color || '#ff6644', damage || 20, 38
  );
}
