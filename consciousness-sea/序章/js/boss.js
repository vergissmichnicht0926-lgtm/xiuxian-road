/* ═══════════════════ §K Boss 系统 — 左右结构通用 ═══════════════════
 *
 * 依赖：projectile.js, battle.js, particles.js, main.js
 *
 * 通用配置模式（左小右大汉字）：
 *   left:  { char, color, glow }   — 偏旁/小部件（冲撞攻击）
 *   right: { char, color, glow }   — 主体/大部件（弹幕攻击）
 *
 * 阶段循环：split → charging → attack → vulnerable → split ...
 */

const BOSS_PHASE = { ENTRANCE:'entrance', SPLIT:'split', CHARGING:'charging', ATTACK:'attack', VULNERABLE:'vulnerable', DEFEATED:'defeated' };

// ═══════════════ Boss 配置 ═══════════════

const BOSS_CONFIG = {
  regret: {
    name: '憾', hp: 200,
    left:  { char:'忄', color:'#ff6655', glow:'#cc3322' },
    right: { char:'感', color:'#ff7766', glow:'#cc4433' },
    partSize: 90, splitDist: 180, minDist: 30,
    chargeTime: 7.0, vulnerableTime: 3.5, attackCooldown: 0.8,

    attacks: [
      // 偏旁冲撞 — 左部件"忄"飞向鼠标，弹跳追踪
      { type:'left_charge',  speed:15, maxSpeed:24, damage:36, color:'#ff5544', bounces:2 },
      // 引力场 + 螺旋弹幕 — 右部件"感"制造引力漩涡
      { type:'gravity_field', pattern:'spiral', count:10, speed:1.6, maxSpeed:2.8, damage:15, color:'#ff8877', gravityIntensity:0.7, duration:6.0, bulletSize:24, bulletInterval:0.32 },
      // 心锁 + 雨弹幕 — 左部件"忄"锚定锁链，雨帘正弦慢落
      { type:'heart_lock', pattern:'rain', count:6, speed:2.0, maxSpeed:3.0, damage:11, color:'#ff5544', lockRadius:180, duration:3.6, bulletSize:22, bulletInterval:0.42 },
    ]
  },
  yi: {
    name: '遗', hp: 600,
    left:  { char:'辶', color:'#ffcc44', glow:'#ddaa22' },
    right: { char:'贵', color:'#ffdd66', glow:'#ddbb33' },
    partSize: 80, splitDist: 160, minDist: 28,
    chargeTime: 6.0, vulnerableTime: 3.0, attackCooldown: 0.65,

    attacks: [
      // 技能1: 辶·残影追 — 3重瞬移+依次冲撞（间隔0.5s）
      { type:'left_charge', speed:20, maxSpeed:28, damage:32, color:'#ffcc44', bounces:0, afterimages:3, afterimageInterval:0.5 },
      // 技能2: 贵·雨金 — 金箔般的大范围雨弹幕，慢速坠落覆盖战场
      { type:'right_bullet', pattern:'rain', count:7, speed:2.2, maxSpeed:3.5, damage:14, color:'#ffdd44', duration:4.5, bulletSize:28, bulletInterval:0.38 },
      // 技能3: 遗·归尘爆 — 撒炸弹+延迟全屏引爆
      { type:'delayed_burst', bombs:6, burstCount:8, damage:13, color:'#ffdd44', layoutTime:2.0, warnTime:1.0, bombSpeed:1.5 },
    ]
  }
};

// ═══════════════ 运行时状态 ═══════════════

let bossActive = false, bossConfig = null, bossState = null;
let bossProjectiles = [], mouseHitRadius = 18;

function makePart(x, y, size) {
  return { x, y, size, phase:0, wobbleX:0, wobbleY:0, vx:0, vy:0, _isFlying:false, _bounces:0, alpha:1, targetAlpha:1 };
}

function initBoss(key) {
  bossConfig = BOSS_CONFIG[key];
  if (!bossConfig) return;
  if (typeof lastBossKey !== 'undefined') lastBossKey = key; // 记录当前Boss用于重试
  bossActive = true; bossProjectiles = [];
  if (typeof enemyEntity !== 'undefined') enemyEntity = null; // 清除普通敌人实体
  if (typeof Sound !== 'undefined' && Sound.setBGMIntensity) Sound.setBGMIntensity(0.7);
  const cx = W*0.5, cy = H*0.22, cfg = bossConfig;

  // 血量 = config基础值 × 难度倍率 [0.8, 1.0, 1.3]
  const diffMult = [0.8, 1.0, 1.3];
  const mult = (typeof difficulty !== 'undefined') ? (diffMult[difficulty] || 1.0) : 1.0;
  const hp = Math.floor(cfg.hp * mult);
  bossState = {
    phase: BOSS_PHASE.ENTRANCE, hp: hp, maxHP: hp, timer: 0,
    left:  makePart(cx - cfg.splitDist*0.5, -120, cfg.partSize),
    right: makePart(cx + cfg.splitDist*0.5, -140, cfg.partSize),
    chargeProgress: 0, currentAttack: null,
    attackWaveCount: 0, attackWaveTimer: 0, _attackMaxWaves: 1,
    _exposedPart: null, animTimer: 0,
    // 坠落
    _fallVel: 0, _landed: false,
    // 引力场
    _gravityActive: false, _gravityIntensity: 0,
    // 心锁
    _heartLock: null,
    // 受击抖动
    _hurtTimer: 0,
    _gradualRestore: 0,
    // 残影追
    _afterimages: [],
    _afterimageDelay: 0,
    // 归尘爆
    _burstBombs: [],
    _burstPhase: 'layout',
  };
  // 文字在坠落期间仍存在，撞击瞬间才震碎
}

// ═══════════════ 更新 ═══════════════

function updateBoss(dt) {
  if (!bossActive || !bossState) return;
  const s = bossState, cfg = bossConfig;
  s.animTimer += dt;
  if (s._hurtTimer > 0) s._hurtTimer -= dt;
  s.left.phase += dt*0.8; s.right.phase += dt*0.7;
  const cx = W*0.5, cy = H*0.2;

  switch (s.phase) {

    case BOSS_PHASE.ENTRANCE:
      // 坠落加速
      s._fallVel += 420 * dt;
      s.left.y  += s._fallVel * dt;
      s.right.y += s._fallVel * dt;

      // 到达目标高度 → 撞击
      const landY = cy;
      if (s.left.y >= landY - 10 && !s._landed) {
        s._landed = true;
        s.left.y = landY; s.right.y = landY + 8;
        // 撞击效果
        shakeAmount = 24;
        Sound.stun(); Sound.anomaly();
        // 震碎所有战场文字
        shatterPlayerWords();
        // 冲击波粒子
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * Math.PI * 2;
          const spd = 2 + Math.random() * 8;
          const p = new HitParticle(cx + (Math.random()-0.5)*60, landY, '#ff6644', '·');
          p.vx = Math.cos(a) * spd;
          p.vy = Math.sin(a) * spd - 3;
          p.size = 4 + Math.random() * 12;
          p.life = 25 + Math.random() * 45;
          p.gravity = 0.05;
          particles.push(p);
        }
        // 红色闪屏
        document.getElementById('stun-overlay').classList.add('active');
        setTimeout(() => document.getElementById('stun-overlay').classList.remove('active'), 500);
      }

      // 落地后短暂停顿 → 进入SPLIT
      if (s._landed) {
        s.left.y  += (landY - s.left.y)  * 0.2;
        s.right.y += (landY - s.right.y) * 0.2;
        if ((s.timer += dt) > 2.0) {
          s.phase = BOSS_PHASE.SPLIT; s.timer = 0;
          s._gradualRestore = 6; // 6周期×2词≈三四秒填满
        }
      }
      break;

    case BOSS_PHASE.SPLIT:
      wobblePart(s.left, 0); wobblePart(s.right, 1.2);
      s.left.x  = cx - cfg.splitDist*0.5 + s.left.wobbleX;
      s.left.y  = cy + s.left.wobbleY;
      s.right.x = cx + cfg.splitDist*0.5 + s.right.wobbleX;
      s.right.y = cy + s.right.wobbleY;

      // 部件周围微尘粒子（灵动感）
      if (Math.random() < 0.3) {
        const part = Math.random() < 0.5 ? s.left : s.right;
        const dp = new HitParticle(part.x+(Math.random()-0.5)*30, part.y+(Math.random()-0.5)*25, cfg.left.color, '·');
        dp.vx *= 0.15; dp.vy *= 0.15; dp.size = 3+Math.random()*5; dp.life = 25+Math.random()*30;
        dp.gravity = -0.01;
        particles.push(dp);
      }
      if ((s.timer+=dt) > 1.0) { s.timer=0; s.phase=BOSS_PHASE.CHARGING; s.chargeProgress=0; }
      break;

    case BOSS_PHASE.CHARGING:
      // 血量越低蓄力越快：chargeTime除以hpSpeedRatio（1.0→1.8）
      const chargeSpd = hpSpeedRatio();
      s.chargeProgress = Math.min(1, s.chargeProgress + dt/(cfg.chargeTime/chargeSpd));
      const t = s.chargeProgress, d = cfg.splitDist*(1 - t*0.85);
      s.left.x  = cx - d*0.5 + Math.sin(s.left.phase)*t*4;
      s.left.y  = cy + Math.cos(s.left.phase)*t*3;
      s.right.x = cx + d*0.5 + Math.sin(s.right.phase)*t*4;
      s.right.y = cy + Math.cos(s.right.phase)*t*3;

      // 蓄力能量粒子：进度越高密度越大，从两部件向中间汇聚
      if (Math.random() < t * 0.55) {
        const src = Math.random() < 0.5 ? s.left : s.right;
        const midX = cx, midY = cy;
        const angle = Math.atan2(midY - src.y, midX - src.x) + (Math.random() - 0.5) * 1.2;
        const spd = (1 + Math.random() * 3) * t;
        const p = new HitParticle(src.x, src.y, t > 0.65 ? '#ff5544' : '#ff8866', '·');
        p.vx = Math.cos(angle) * spd; p.vy = Math.sin(angle) * spd;
        p.size = 5 + Math.random() * 9; p.life = 18 + Math.random() * 20;
        p.gravity = 0.02;
        particles.push(p);
      }
      // 中心点汇聚闪光
      if (t > 0.4 && Math.random() < t * 0.25) {
        const p = new HitParticle(cx + (Math.random()-0.5)*25, cy + (Math.random()-0.5)*15, '#ffcc88', '·');
        p.vx *= 0.15; p.vy *= 0.15; p.size = 3 + Math.random() * 6; p.life = 10 + Math.random() * 12;
        particles.push(p);
      }

      if (s.chargeProgress>=1) { s.phase=BOSS_PHASE.ATTACK; s.timer=0; onBossChargeComplete(); }
      break;

    case BOSS_PHASE.ATTACK:
      if (!s.currentAttack) startAttack(s, cfg);
      updateAttackPhase(s, cfg, cx, cy, dt);

      if (shouldEndAttack(s, cfg, dt)) {
        bossProjectiles=[]; s.left._isFlying=s.right._isFlying=false; s._lastSpawn=undefined;
        // 清除特殊效果
        s._gravityActive=false; s._gravityIntensity=0; s._heartLock=null;
        // 清除新攻击类型状态
        s._afterimages=[]; s._burstBombs=[]; s._burstPhase='layout';
        // 暴露部件处理
        const isBoth = s._exposedPart === 'both';
        const isLeftAtk = s.currentAttack && s.currentAttack.type==='left_charge';
        if (isBoth) {
          // 合体技：两个部件都可见
          s.left.targetAlpha = 1; s.right.targetAlpha = 1;
          pullTo(s.left, cx, cy, 0.3); pullTo(s.right, cx, cy, 0.3);
        } else {
          const np = isLeftAtk ? s.right : s.left;
          const ap = isLeftAtk ? s.left : s.right;
          ap.targetAlpha = 0; ap.alpha = 0;
          np.targetAlpha = 1;
          np.x = cx; np.y = cy;
        }
        s.phase=BOSS_PHASE.VULNERABLE;
        // 合体技破绽更大：vulnerableTime +0.5s
        s.timer = isBoth ? -0.5 : 0;
        s.currentAttack=null; s._exposedPart=null;
        restorePlayerWords();
      }
      break;

    case BOSS_PHASE.VULNERABLE:
      // 两个部件都淡入到中心（活动方alpha=0保持消失）
      pullTo(s.left, cx, cy, 0.1); pullTo(s.right, cx, cy, 0.1);
      if ((s.timer+=dt) > cfg.vulnerableTime) {
        s.phase = BOSS_PHASE.SPLIT; s.timer = 0;
        // 恢复两个部件
        s.left.targetAlpha = 1; s.right.targetAlpha = 1;
        if (s.hp < s.maxHP*0.5) { cfg.splitDist=220; cfg.chargeTime=5.0; cfg.vulnerableTime=2.5; }
      }
      break;

    case BOSS_PHASE.DEFEATED:
      s.left.x+=(Math.random()-0.5)*4; s.left.y-=0.6;
      s.right.x+=(Math.random()-0.5)*4; s.right.y-=0.5;
      if (s._fusionPending) {
        // 假撤退：部件上飘但不清理，等憾冲入合体
        s.left.y -= 0.4; s.right.y -= 0.35;
      } else if ((s.timer+=dt)>3) {
        bossActive=false; bossState=null; bossProjectiles=[]; restorePlayerWords();
      }
      break;
  }

  // 攻击阶段持续微震（压迫感）
  if (s.phase===BOSS_PHASE.ATTACK) {
    shakeAmount = Math.max(shakeAmount, 1.0 + Math.abs(Math.sin(s.animTimer*8))*0.8);
  }

  // 低血量狂暴粒子（HP<50%时部件周围冒火星）
  const hpR = s.hp / s.maxHP;
  if (hpR < 0.5 && s.phase!==BOSS_PHASE.DEFEATED && Math.random() < (0.5 - hpR) * 0.6) {
    const part = Math.random() < 0.5 ? s.left : s.right;
    if (part.alpha > 0.3) {
      const spark = new HitParticle(part.x+(Math.random()-0.5)*40, part.y+(Math.random()-0.5)*35, '#ff4422', '·');
      spark.vx *= 0.3; spark.vy *= 0.3; spark.size = 3 + Math.random() * 6; spark.life = 10 + Math.random() * 15;
      spark.gravity = -0.02;
      particles.push(spark);
    }
  }

  // alpha平滑
  s.left.alpha += (s.left.targetAlpha - s.left.alpha) * 0.1;
  s.right.alpha += (s.right.targetAlpha - s.right.alpha) * 0.1;

  // 最小距离约束
  if (s.phase!==BOSS_PHASE.DEFEATED && !s.left._isFlying && !s.right._isFlying)
    enforceMinDist(s.left, s.right, cfg.minDist);

  // 弹幕更新+碰撞
  bossProjectiles.forEach(p=>p.update(dt));
  bossProjectiles = bossProjectiles.filter(p=>p.alive);
  if (s.phase===BOSS_PHASE.ATTACK) {
    for (let p of bossProjectiles) { if (p.alive && p.hitMouse(mx,my,mouseHitRadius)) { p.alive=false; onPlayerHitByProjectile(p); } }
  }
}

// ═══════════════ 攻击子逻辑 ═══════════════

function startAttack(s, cfg) {
  // 清除之前的特殊效果
  s._gravityActive = false; s._gravityIntensity = 0;
  s._heartLock = null;

  const idx = Math.floor(Math.random()*cfg.attacks.length);
  s.currentAttack = cfg.attacks[idx];
  s.timer = 0; s.attackWaveCount = 0; s.attackWaveTimer = 0; s._lastSpawn = undefined;
  s._spiralOffset = 0; s._attackMaxWaves = 1;
  // 默认暴露部件：左冲撞→右暴露，弹幕类→左暴露，合体技→both
  if (s.currentAttack.type === 'left_charge') {
    s._exposedPart = 'right';
  } else if (s.currentAttack.type === 'delayed_burst') {
    s._exposedPart = 'both';  // 合体技，两个部件都暴露（vulnerableTime+0.5s）
  } else {
    s._exposedPart = 'left';
  }
  s.left._bounces = 0; s.right._bounces = 0;

  // 引力场攻击 — 激活引力拖拽
  if (s.currentAttack.type === 'gravity_field') {
    s._gravityActive = true;
    s._gravityIntensity = s.currentAttack.gravityIntensity || 0.65;
    s._exposedPart = 'left'; // 右部件"感"是引力源，左部件暴露
  }
  // 心锁攻击 — 在屏幕中央锚定锁链
  if (s.currentAttack.type === 'heart_lock') {
    s._heartLock = {
      anchorX: W * 0.5,
      anchorY: H * 0.35,
      radius: s.currentAttack.lockRadius || 145,
    };
    s._exposedPart = 'right'; // 左部件"忄"射出心锁，右部件暴露
  }

  executeAttack(s.currentAttack, hpSpeedRatio());

  // 遗的辶：瞬移冲刺（仅非残影版，残影版在executeAttack中处理）
  if (s.currentAttack.type === 'left_charge' && cfg.name === '遗' && !s.currentAttack.afterimages) {
    const l = s.left;
    const pos = getEdgePos(Math.floor(Math.random() * 4), edgeMargin());
    l.x = pos.x; l.y = pos.y;
    for (let i = 0; i < 20; i++) {
      particles.push(new HitParticle(l.x, l.y, '#ffdd44', '◆'));
    }
  }

  // 攻击音效
  const atkType = s.currentAttack.type;
  if (atkType === 'gravity_field') { Sound.anomaly(); }
  else if (atkType === 'heart_lock') { Sound.stun(); Sound.anomaly(); }
  else if (atkType === 'left_charge') { Sound.enemyAtk(); }
}

function hpSpeedRatio() {
  if (!bossState) return 1;
  return 1 + (1 - bossState.hp/bossState.maxHP) * 0.8; // 1.0 ~ 1.8（血量越低攻速/蓄力越快）
}

function updateAttackPhase(s, cfg, cx, cy, dt) {
  const atk = s.currentAttack;
  const isLeftAtk = atk && (atk.type==='left_charge' || atk.type==='delayed_burst');
  const spdMul = hpSpeedRatio();

  // 归尘爆处理（独立于左右部件逻辑）
  if (atk && atk.type==='delayed_burst') {
    updateDelayedBurst(s, atk, cfg, dt);
    return;
  }

  // 活动方保持可见，非活动方淡出
  const ap = isLeftAtk ? s.left : s.right;
  const np = isLeftAtk ? s.right : s.left;
  ap.targetAlpha = 1; np.targetAlpha = 0;

  // 残影追：N个独立辶字弹丸，各自延迟→冲锋→命中消失
  if (isLeftAtk && s._afterimages && s._afterimages.length > 0) {
    const spd = Math.min(atk.speed * spdMul, atk.maxSpeed || 22);
    let anyPending = false;

    for (let ai of s._afterimages) {
      // 已结束（命中或出屏）→ 彻底跳过
      if (ai._done) continue;

      // 等待起飞
      if (!ai._flying) {
        ai._delay -= dt;
        ai.alpha = Math.min(1, ai.alpha + dt * 0.6);
        if (ai._delay <= 0) {
          ai._flying = true;
          Sound.enemyAtk();
        }
        anyPending = true;
        continue;
      }

      // 飞行中
      anyPending = true;
      ai.x += ai.vx * dt * 60;
      ai.y += ai.vy * dt * 60;

      // 拖尾粒子
      if (Math.random() < 0.45) {
        const tp = new HitParticle(ai.x, ai.y, atk.color, '·');
        tp.vx = -ai.vx * 0.1 + (Math.random() - 0.5) * 0.5;
        tp.vy = -ai.vy * 0.1 + (Math.random() - 0.5) * 0.5;
        tp.size = 4 + Math.random() * 5; tp.life = 10 + Math.random() * 12; tp.gravity = 0.02;
        particles.push(tp);
      }

      // 命中判定
      const d = Math.sqrt((ai.x - mx) ** 2 + (ai.y - my) ** 2);
      if (d < mouseHitRadius + cfg.partSize * 0.35) {
        onHitByLeftPart(atk.damage);
        ai._done = true; ai._flying = false; ai.alpha = 0;
        for (let j = 0; j < 10; j++) {
          const hp = new HitParticle(ai.x, ai.y, atk.color, '◆');
          hp.vx = (Math.random() - 0.5) * 4; hp.vy = (Math.random() - 0.5) * 4;
          hp.size = 4 + Math.random() * 5; hp.life = 10 + Math.random() * 10;
          particles.push(hp);
        }
      }

      // 飞出屏幕
      if (ai.x < -40 || ai.x > W + 40 || ai.y < -40 || ai.y > H + 40) {
        ai._done = true; ai._flying = false; ai.alpha = 0;
      }
    }

    // 全部完成 → 攻击结束
    if (!anyPending) s.attackWaveCount = s._attackMaxWaves;
  }

  // 左冲撞：本体飞行 + 边缘弹跳
  if (isLeftAtk && s.left._isFlying) {
    const l = s.left;
    const rawSpd = atk.speed * spdMul;
    const spd = Math.min(rawSpd, atk.maxSpeed || 22);
    const curSpd = Math.sqrt(l.vx*l.vx + l.vy*l.vy);
    if (curSpd > 0.01 && Math.abs(curSpd - spd) > 0.1) {
      const ratio = spd / curSpd;
      l.vx *= ratio; l.vy *= ratio;
    }
    l.x += l.vx*dt*60; l.y += l.vy*dt*60;

    // 飞行拖尾粒子
    if (Math.random() < 0.55) {
      const tp = new HitParticle(l.x, l.y, atk.color, '·');
      tp.vx = -l.vx * 0.15 + (Math.random() - 0.5) * 1.5;
      tp.vy = -l.vy * 0.15 + (Math.random() - 0.5) * 1.5;
      tp.size = 5 + Math.random() * 9; tp.life = 12 + Math.random() * 16;
      tp.gravity = 0.03;
      particles.push(tp);
    }

    // 碰撞鼠标
    const d = Math.sqrt((l.x-mx)**2 + (l.y-my)**2);
    if (d < mouseHitRadius + cfg.partSize*0.4) {
      l._isFlying = false; onHitByLeftPart(atk.damage);
      // 无残影时本体结束即攻击完成；有残影时等全部残影也结束
      if (!s._afterimages || s._afterimages.length === 0) s.attackWaveCount = s._attackMaxWaves;
    }

    // 边缘弹跳 → 重定向瞄准鼠标
    const m = 30;
    let bounced = false;
    if (l.x < m) { l.x=m; bounced=true; }
    if (l.x > W-m) { l.x=W-m; bounced=true; }
    if (l.y < m) { l.y=m; bounced=true; }
    if (l.y > H-m) { l.y=H-m; bounced=true; }
    if (bounced) {
      l._bounces = (l._bounces||0) + 1;
      const a = Math.atan2(my - l.y, mx - l.x);
      l.vx = Math.cos(a) * spd;
      l.vy = Math.sin(a) * spd;
      for (let i=0;i<8;i++) particles.push(new HitParticle(l.x,l.y,atk.color,'◆'));
      if (l._bounces > (atk.bounces||2)) {
        l._isFlying = false;
        // 无残影时本体结束即攻击完成；有残影时等全部残影也结束
        if (!s._afterimages || s._afterimages.length === 0) s.attackWaveCount = s._attackMaxWaves;
      }
    }
  }

  // 活动方不飞时移向攻击位，非活动方移出视野
  if (!ap._isFlying) pullTo(ap, cx, cy, 0.08);
  if (!np._isFlying) pullTo(np, cx+(Math.random()-0.5)*60, cy-120, 0.03);

  // 弹幕类攻击：持续生成子弹
  if (!isLeftAtk && atk && atk.duration) {
    s.attackWaveTimer += dt;
    if (s._lastSpawn === undefined) s._lastSpawn = 0;
    const interval = atk.bulletInterval || 0.25;
    while (s._lastSpawn + interval <= s.attackWaveTimer && s.attackWaveTimer < atk.duration) {
      s._lastSpawn += interval;
      if (atk.pattern === 'spiral') s._spiralOffset = (s._spiralOffset || 0) + 0.45;
      executeAttack(atk, spdMul, s._spiralOffset);
    }
    if (s.attackWaveTimer >= atk.duration + 0.5) s.attackWaveCount = s._attackMaxWaves;
  }
}

/** 归尘爆更新：layout→warn→detonate 三阶段 */
function updateDelayedBurst(s, atk, cfg, dt) {
  const l = s.left;
  const layoutTime = atk.layoutTime || 2.0;
  const warnTime = atk.warnTime || 1.0;

  if (s._burstPhase === 'layout') {
    s._burstBombTimer = (s._burstBombTimer || 0) + dt;
    // 辶沿屏幕边缘绕圈
    const progress = Math.min(1, s._burstBombTimer / layoutTime);
    s._burstAngle = (s._burstAngle || 0) + dt * (3.0 + progress * 2.0);
    const margin = edgeMargin();
    const perimeter = 2 * (W + H - margin * 2);
    const dist = (s._burstAngle * 180) % perimeter;
    if (dist < W - margin*2) { l.x = margin + dist; l.y = margin; }
    else if (dist < W + H - margin*2) { l.x = W - margin; l.y = margin + (dist - (W - margin*2)); }
    else if (dist < 2*W + H - margin*3) { l.x = W - margin - (dist - (W + H - margin*2)); l.y = H - margin; }
    else { l.x = margin; l.y = H - margin - (dist - (2*W + H - margin*3)); }
    l.targetAlpha = 1;
    // 拖尾
    if (Math.random() < 0.6) {
      const tp = new HitParticle(l.x, l.y, cfg.left.color, '·');
      tp.vx *= 0.2; tp.vy *= 0.2; tp.size = 3 + Math.random() * 5;
      tp.life = 15 + Math.random() * 20; tp.gravity = 0.01;
      particles.push(tp);
    }
    // 沿路撒炸弹
    const bombsPlaced = Math.floor(progress * s._burstBombs.length);
    for (let i = 0; i < s._burstBombs.length; i++) {
      const b = s._burstBombs[i];
      if (!b._placed && i < bombsPlaced) {
        b._placed = true; b.x = l.x; b.y = l.y; b.alpha = 0.7;
        for (let j = 0; j < 8; j++) particles.push(new HitParticle(b.x, b.y, atk.color, '·'));
      }
    }
    if (s._burstBombTimer >= layoutTime) {
      s._burstPhase = 'warn'; s._burstBombTimer = 0;
      Sound.anomaly();
    }
    return;
  }

  if (s._burstPhase === 'warn') {
    s._burstBombTimer += dt;
    // 炸弹脉动
    for (let b of s._burstBombs) {
      if (!b._placed) continue;
      b.pulsePhase = (b.pulsePhase || Math.random() * Math.PI * 2) + dt * 6;
      b.alpha = 0.6 + 0.2 * Math.sin(b.pulsePhase);
    }
    l.targetAlpha = 1;
    if (s._burstBombTimer >= warnTime) {
      s._burstPhase = 'detonate'; s._burstBombTimer = 0;
      // 引爆：每个炸弹向8方向发射弹幕
      for (let b of s._burstBombs) {
        if (!b._placed) continue;
        b._detonated = true;
        const count = atk.burstCount || 8;
        const spd = 2.5 * (hpSpeedRatio());
        for (let j = 0; j < count; j++) {
          const angle = (j / count) * Math.PI * 2;
          const p = new Projectile('贵', b.x, b.y,
            Math.cos(angle) * spd, Math.sin(angle) * spd,
            atk.color, atk.damage, 22 + Math.random() * 6);
          bossProjectiles.push(p);
        }
        // 爆炸粒子
        for (let j = 0; j < 15; j++) {
          const a = Math.random() * Math.PI * 2;
          const fp = new HitParticle(b.x, b.y, '#ffdd44', '·');
          fp.vx = Math.cos(a) * (2 + Math.random() * 5);
          fp.vy = Math.sin(a) * (2 + Math.random() * 5);
          fp.size = 4 + Math.random() * 9; fp.life = 15 + Math.random() * 20;
          particles.push(fp);
        }
      }
      shakeAmount = Math.max(shakeAmount, 14);
      Sound.enemyAtk();
    }
    return;
  }

  if (s._burstPhase === 'detonate') {
    s._burstBombTimer += dt;
    l.targetAlpha = 0;
    // 等所有弹幕消失
    if (bossProjectiles.length === 0 && s._burstBombTimer > 0.5) {
      s.attackWaveCount = s._attackMaxWaves;
    }
  }
}

function shouldEndAttack(s, cfg, dt) {
  s.timer += dt;
  const wavesDone = s.attackWaveCount >= s._attackMaxWaves;
  // 残影全部消失/命中
  const afterimagesDone = !s._afterimages || s._afterimages.length === 0 || s._afterimages.every(ai => ai._done);
  const allGone = bossProjectiles.length===0 && !s.left._isFlying && !s.right._isFlying && afterimagesDone;
  return wavesDone && (allGone || s.timer>8);
}

function executeAttack(attack, spdMul, spiralOffset) {
  const s = bossState;
  if (attack.type==='left_charge') {
    const l = s.left;
    // 遗的残影追：N个辶字独立弹丸，依次从不同边缘冲锋
    if (bossConfig && bossConfig.name==='遗' && attack.afterimages > 1) {
      s._afterimages = [];
      const margin = edgeMargin();
      const interval = attack.afterimageInterval || 0.5;
      const total = attack.afterimages; // 含"本体"，全部平等对待
      const spd = Math.min(attack.speed, attack.maxSpeed || 22);
      const usedEdges = new Set();
      for (let i = 0; i < total; i++) {
        let e;
        do { e = Math.floor(Math.random() * 4); } while (usedEdges.has(e) && usedEdges.size < 4);
        usedEdges.add(e);
        const pos = getEdgePos(e, margin);
        const angle = Math.atan2(my - pos.y, mx - pos.x);
        s._afterimages.push({
          x: pos.x, y: pos.y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd,
          _flying: false,   // 延迟结束后才起飞
          _done: false,     // 命中/出屏后标记完成
          _delay: i * interval,
          alpha: 0.35,
        });
        for (let j = 0; j < 10; j++) particles.push(new HitParticle(pos.x, pos.y, attack.color, '◇'));
      }
      // s.left 留在原位作为视觉锚点，不参与飞行
      Sound.enemyAtk();
      return;
    }
    // 标准左冲撞（憾）
    const spd = Math.min(attack.speed*(spdMul||1), attack.maxSpeed||22);
    const a = Math.atan2(my-l.y, mx-l.x);
    l.vx=Math.cos(a)*spd; l.vy=Math.sin(a)*spd; l._isFlying=true;
    for (let i=0;i<14;i++) particles.push(new HitParticle(l.x,l.y,attack.color,'·'));
    return;
  }

  // 归尘爆：沿屏幕边缘撒炸弹
  if (attack.type==='delayed_burst') {
    s._burstBombs = [];
    s._burstPhase = 'layout';
    s._burstBombTimer = 0;
    const margin = edgeMargin();
    const perimeter = 2 * (W + H - margin * 2);
    for (let i = 0; i < attack.bombs; i++) {
      const t = attack.bombs > 1 ? i / (attack.bombs - 1) : 0.5;
      const dist = (t * perimeter) % perimeter;
      let bx, by;
      if (dist < W - margin * 2) { bx = margin + dist; by = margin; }
      else if (dist < W + H - margin * 2) { bx = W - margin; by = margin + (dist - (W - margin * 2)); }
      else if (dist < 2*W + H - margin * 3) { bx = W - margin - (dist - (W + H - margin * 2)); by = H - margin; }
      else { bx = margin; by = H - margin - (dist - (2*W + H - margin * 3)); }
      s._burstBombs.push({
        x: bx, y: by, char: '贵',
        phase: 'layout', timer: 0, alpha: 0.7,
      });
    }
    for (let i = 0; i < 10; i++) particles.push(new HitParticle(s.left.x, s.left.y, attack.color, '◆'));
    Sound.anomaly();
    return;
  }

  // 弹幕类攻击：right_bullet / gravity_field / heart_lock
  if (attack.type==='right_bullet' || attack.type==='gravity_field' || attack.type==='heart_lock') {
    const r = bossState.right;
    const spd = Math.min(attack.speed*(spdMul||1), attack.maxSpeed||5);
    const sz = attack.bulletSize||30;
    const fn = BulletPattern[attack.pattern] || BulletPattern.radial;
    // 螺旋偏移 / 波浪方向
    const extraArg = attack.pattern==='spiral' ? (spiralOffset||0) : undefined;
    const projs = fn(r.x, r.y, '·', attack.count, spd, attack.color, attack.damage, sz, extraArg);
    bossProjectiles.push(...projs);
    for (let i=0;i<8;i++) particles.push(new HitParticle(r.x,r.y,attack.color,'·'));
    Sound.enemyAtk(); // 弹幕发射音效
  }
}

/** 计算安全边距（考虑Boss战1.4x缩放后仍可见 — 可见区域仅71%，每边损失14.3%）
 *  使用 Math.max(W,H) 而非 Math.min，确保宽屏下水平方向也不会跑出画面 */
function edgeMargin() {
  // 1.4x zoom → 可见区域 71.4%，每边需 margin ≥ max(W,H) * 0.15
  // 取 0.18 留余量，且不低于 150px
  return Math.max(150, Math.max(W, H) * 0.18);
}

/** 获取屏幕边缘随机位置 */
function getEdgePos(edge, margin) {
  switch (edge) {
    case 0: return { x: margin + Math.random() * (W - margin*2), y: margin };
    case 1: return { x: W - margin, y: margin + Math.random() * (H - margin*2) };
    case 2: return { x: margin + Math.random() * (W - margin*2), y: H - margin };
    case 3: return { x: margin, y: margin + Math.random() * (H - margin*2) };
    default: return { x: W*0.5, y: margin };
  }
}

// ═══════════════ 渲染 ═══════════════

function drawBoss(ctx) {
  if (!bossActive||!bossState) return;
  const s = bossState, cfg = bossConfig;

  // 进场压迫文字（暗角在main.js draw中先于文字绘制）
  if (s.phase === BOSS_PHASE.ENTRANCE && !s._landed) {
    const fallProgress = Math.min(1, (s.left.y + 120) / (H * 0.2 + 120));
    if (fallProgress > 0.3) {
      const alpha = (fallProgress - 0.3) * 0.5;
      ctx.fillStyle = `rgba(255,100,60,${alpha})`;
      ctx.font = 'bold 28px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center';
      ctx.fillText(cfg.name, W*0.5, H*0.35);
    }
  }

  // 暴露期光环
  if (s.phase===BOSS_PHASE.VULNERABLE) {
    const cx=W*0.5, cy=H*0.2, pulse=0.5+0.5*Math.sin(s.animTimer*4);
    ctx.save();
    ctx.strokeStyle=`rgba(255,200,100,${0.35*pulse})`; ctx.lineWidth=2.5;
    ctx.beginPath(); ctx.arc(cx,cy,70+Math.sin(s.animTimer*3)*8,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=`rgba(255,180,80,${0.55*pulse})`; ctx.font='15px "Noto Serif SC","SimSun",serif'; ctx.textAlign='center';
    ctx.fillText('破绽 · 1.5x',cx,cy-62);
    ctx.restore();
  }

  // 蓄力阶段画面暗角（进度>30%时渐显，增强压迫感）
  if (s.phase===BOSS_PHASE.CHARGING && s.chargeProgress>0.3) {
    const vi = (s.chargeProgress-0.3)/0.7; // 0→1
    const vignetteGrad = ctx.createRadialGradient(W*0.5, H*0.2, Math.min(W,H)*0.25, W*0.5, H*0.2, Math.max(W,H)*0.85);
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.4, `rgba(25,5,0,${0.08*vi})`);
    vignetteGrad.addColorStop(1, `rgba(20,0,0,${0.35*vi})`);
    ctx.save();
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, W, H);
    // 蓄力提示文字（闪烁）
    ctx.fillStyle = `rgba(255,150,120,${0.35+0.25*Math.sin(s.animTimer*3)})`;
    ctx.font = '13px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText('蓄力中 · 0.8x', W*0.5, H*0.2 - 70 - s.chargeProgress*15);
    ctx.restore();
  }

  // 受击抖动偏移
  const hurtShake = s._hurtTimer > 0 ? Math.sin(s._hurtTimer * 40) * s._hurtTimer * 12 : 0;
  ctx.save();
  if (hurtShake !== 0) { ctx.translate(hurtShake, Math.abs(hurtShake) * 0.4); }
  drawPart(ctx, s.left, cfg.left);
  drawPart(ctx, s.right, cfg.right);
  ctx.restore();

  // 残影追渲染 — 半透明辶字副本
  if (s._afterimages && s._afterimages.length > 0) {
    for (let ai of s._afterimages) {
      if (ai.alpha < 0.03) continue;
      ctx.save();
      ctx.globalAlpha = ai.alpha;
      ctx.shadowColor = cfg.left.glow;
      ctx.shadowBlur = 14 * ai.alpha;
      ctx.fillStyle = cfg.left.color;
      ctx.font = `${cfg.partSize * 0.85}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cfg.left.char, ai.x + hurtShake, ai.y + (hurtShake ? Math.abs(hurtShake) * 0.4 : 0));
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // 攻击阶段脉冲扩散光环（压迫感）
  if (s.phase===BOSS_PHASE.ATTACK && s.currentAttack) {
    const atk = s.currentAttack;
    const isLeftAtk = atk.type==='left_charge';
    const src = isLeftAtk ? s.left : s.right;
    if (src.alpha > 0.3) {
      const pulsePhase = (s.animTimer * 2.5) % 1;
      const ringR = 30 + pulsePhase * 140;
      const ringAlpha = (1 - pulsePhase) * 0.3;
      ctx.save();
      ctx.strokeStyle = `rgba(255,100,70,${ringAlpha})`;
      ctx.lineWidth = 1.5 * (1 - pulsePhase * 0.6);
      ctx.beginPath(); ctx.arc(src.x, src.y, ringR, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  // 引力场渲染 — 屏幕中央引力漩涡
  if (s._gravityActive && s._gravityIntensity > 0 && s.phase !== BOSS_PHASE.DEFEATED) {
    const gx = W * 0.5, gy = H * 0.32;
    const pulse = 0.5 + 0.5 * Math.sin(s.animTimer * 2.8);
    const intensity = s._gravityIntensity;
    ctx.save();
    // 外圈引力波（三层，向外扩散）
    for (let r = 0; r < 3; r++) {
      const ringR = 40 + r * 65 + Math.sin(s.animTimer * 1.4 + r * 2.2) * 20;
      const rippleR = ringR + ((s.animTimer * 30 + r * 40) % 120);
      const alpha = (0.15 - r * 0.04) * pulse * intensity;
      ctx.strokeStyle = `rgba(255,130,90,${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gx, gy, rippleR, 0, Math.PI * 2); ctx.stroke();
    }
    // 中心辉光
    const glow = ctx.createRadialGradient(gx, gy, 6, gx, gy, 130);
    glow.addColorStop(0, `rgba(255,80,40,${0.25 * intensity * pulse})`);
    glow.addColorStop(0.4, `rgba(255,50,20,${0.1 * intensity})`);
    glow.addColorStop(1, 'rgba(255,20,5,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(gx, gy, 130, 0, Math.PI * 2); ctx.fill();
    // 核心"感"字（引力源标识）
    const coreBreathe = 1 + Math.sin(s.animTimer * 3.5) * 0.12;
    ctx.shadowColor = 'rgba(255,80,40,0.9)';
    ctx.shadowBlur = 22 * pulse * coreBreathe;
    ctx.fillStyle = `rgba(255,140,100,${0.5 + 0.2 * pulse})`;
    ctx.font = `${24 * coreBreathe}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('感', gx, gy);
    ctx.shadowBlur = 0;
    // 吸入粒子（模拟物质被引力吞噬）
    for (let i = 0; i < 5; i++) {
      const a = s.animTimer * 2 + i * Math.PI * 0.4;
      const r = 50 + (s.animTimer * 35 + i * 70) % 100;
      const px = gx + Math.cos(a) * r;
      const py = gy + Math.sin(a) * r * 0.7;
      ctx.fillStyle = `rgba(255,150,110,${0.25 + 0.15 * (1 - r/100)})`;
      ctx.font = `${4 + (1 - r/100) * 6}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center';
      ctx.fillText('·', px, py);
    }
    // 标签
    ctx.fillStyle = `rgba(255,160,130,${0.4 + 0.2 * pulse})`;
    ctx.font = '12px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText('引力场', gx, gy - 140);
    ctx.restore();
  }

  // 心锁渲染 — 锁链 + 边界圈
  if (s._heartLock && s.phase !== BOSS_PHASE.DEFEATED) {
    const lock = s._heartLock;
    const dist = Math.sqrt((mx - lock.anchorX) ** 2 + (my - lock.anchorY) ** 2);
    const nearEdge = dist > lock.radius * 0.7;
    ctx.save();
    // 锁链虚线
    ctx.strokeStyle = nearEdge
      ? `rgba(255,80,60,${0.5 + 0.2 * Math.sin(s.animTimer * 8)})`
      : 'rgba(255,100,80,0.35)';
    ctx.lineWidth = nearEdge ? 2.5 : 1.5;
    ctx.setLineDash([10, 7]);
    ctx.beginPath(); ctx.moveTo(lock.anchorX, lock.anchorY); ctx.lineTo(mx, my); ctx.stroke();
    ctx.setLineDash([]);
    // 边界圈 — 接近边缘时闪烁警告
    const edgeFlicker = nearEdge ? 0.6 + 0.3 * Math.sin(s.animTimer * 10) : 0.3;
    ctx.strokeStyle = `rgba(255,70,50,${edgeFlicker})`;
    ctx.lineWidth = nearEdge ? 2.2 : 1.2;
    ctx.beginPath(); ctx.arc(lock.anchorX, lock.anchorY, lock.radius, 0, Math.PI * 2); ctx.stroke();
    // 锚点 — 左部件"忄"的印记
    const anchorPulse = 0.6 + 0.4 * Math.sin(s.animTimer * 5);
    ctx.fillStyle = `rgba(255,100,70,${0.7 * anchorPulse})`;
    ctx.shadowColor = '#ff4422';
    ctx.shadowBlur = 16 * anchorPulse;
    ctx.font = '28px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('忄', lock.anchorX, lock.anchorY);
    ctx.shadowBlur = 0;
    // 锁链上的小粒子
    const steps = Math.floor(dist / 18);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = lock.anchorX + (mx - lock.anchorX) * t;
      const py = lock.anchorY + (my - lock.anchorY) * t;
      ctx.fillStyle = `rgba(255,120,90,${0.35 + 0.15 * Math.sin(s.animTimer * 7 + i)})`;
      ctx.font = '9px "Noto Serif SC","SimSun",serif';
      ctx.fillText('·', px, py);
    }
    // 标签
    ctx.fillStyle = `rgba(255,140,110,${0.4 + 0.2 * Math.sin(s.animTimer * 3)})`;
    ctx.font = '12px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText('心锁', lock.anchorX, lock.anchorY - lock.radius - 18);
    ctx.restore();
  }

  // 归尘爆炸弹渲染
  if (s._burstBombs && s._burstBombs.length > 0 && s.phase !== BOSS_PHASE.DEFEATED) {
    for (let b of s._burstBombs) {
      if (!b._placed || b._detonated) continue;
      ctx.save();
      b.pulsePhase = b.pulsePhase || Math.random() * Math.PI * 2;
      const pulse = 0.5 + 0.5 * Math.sin(b.pulsePhase);
      if (s._burstPhase === 'warn') {
        // 预警环
        const ringR = 24 + Math.sin(b.pulsePhase * 1.5) * 14;
        ctx.strokeStyle = `rgba(255,150,80,${0.25 + 0.25 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, ringR, 0, Math.PI * 2); ctx.stroke();
        // 更大预警环
        ctx.strokeStyle = `rgba(255,120,60,${0.15 + 0.1 * pulse})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(b.x, b.y, ringR * 1.6, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = b.alpha || 0.7;
      ctx.shadowColor = cfg.right.glow;
      ctx.shadowBlur = s._burstPhase === 'warn' ? 16 + 8 * pulse : 10;
      ctx.fillStyle = cfg.right.color;
      ctx.font = `${30 + Math.sin(b.pulsePhase) * 6}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.char || '贵', b.x, b.y);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // HP条 — 长条美化
  const hpShake = s._hurtTimer > 0 ? Math.cos(s._hurtTimer * 35) * s._hurtTimer * 8 : 0;
  const hpW=Math.min(W*0.7,680), hpH=6, hx=W*0.5-hpW/2 + hpShake, hy=24;
  const hpR=s.hp/s.maxHP;
  // 底色
  ctx.fillStyle='rgba(20,10,8,0.6)'; roundRect(ctx,hx-1,hy-1,hpW+2,hpH+2,4); ctx.fill();
  // 残血闪烁
  const flicker=hpR<0.25?(0.7+0.3*Math.sin(s.animTimer*10)):1;
  // 渐变
  const grad=ctx.createLinearGradient(hx,0,hx+hpW*hpR,0);
  if(hpR<0.25){ grad.addColorStop(0,'#ff2222'); grad.addColorStop(1,'#ff5544'); }
  else if(hpR<0.5){ grad.addColorStop(0,'#ee5511'); grad.addColorStop(1,'#ff8844'); }
  else{ grad.addColorStop(0,'#cc4422'); grad.addColorStop(1,'#ee6644'); }
  ctx.fillStyle=grad; ctx.globalAlpha=flicker;
  roundRect(ctx,hx,hy,hpW*hpR,hpH,3); ctx.fill();
  ctx.globalAlpha=1;
  // 边框
  ctx.strokeStyle='rgba(255,150,100,0.4)'; ctx.lineWidth=1;
  roundRect(ctx,hx,hy,hpW,hpH,3); ctx.stroke();
  // Boss名
  ctx.fillStyle='rgba(255,170,140,0.8)'; ctx.font='bold 20px "Noto Serif SC","SimSun",serif';
  ctx.textAlign='center'; ctx.fillText(cfg.name,W*0.5,hy-8);
  // HP数字
  ctx.fillStyle='rgba(255,200,170,0.6)'; ctx.font='11px "Noto Serif SC","SimSun",serif';
  ctx.fillText(`${Math.ceil(s.hp)} / ${s.maxHP}`,W*0.5,hy+hpH+14);

  bossProjectiles.forEach(p=>p.draw(ctx));

  // 鼠标受击框
  if (s.phase===BOSS_PHASE.ATTACK) {
    ctx.save();
    ctx.strokeStyle='rgba(255,200,150,0.55)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(mx,my,mouseHitRadius,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='rgba(255,220,180,0.7)'; ctx.beginPath(); ctx.arc(mx,my,2,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
}

// ═══════════════ 工具函数 ═══════════════

function wobblePart(p, offset) {
  p.wobbleX = Math.sin(p.phase+offset)*8; p.wobbleY = Math.cos(p.phase*0.7+offset)*5;
}

function pullTo(p, tx, ty, speed) {
  p.x += (tx-p.x)*speed; p.y += (ty-p.y)*speed;
}

function enforceMinDist(a, b, min) {
  const dx=b.x-a.x, dy=b.y-a.y, dist=Math.sqrt(dx*dx+dy*dy);
  if (dist<min && dist>0.01) {
    const push=(min-dist)/2, nx=dx/dist, ny=dy/dist;
    a.x-=nx*push; a.y-=ny*push; b.x+=nx*push; b.y+=ny*push;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

function drawPart(ctx, part, cfg) {
  if (part.alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = part.alpha;

  // 呼吸缩放 + 低血量加剧
  const hpRatio = bossState ? bossState.hp/bossState.maxHP : 1;
  const rageMul = hpRatio < 0.5 ? 1 + (0.5-hpRatio)*1.6 : 1;
  const breatheScale = 1 + Math.sin(part.phase*1.8)*0.04*rageMul;
  const sz = part.size * breatheScale;

  ctx.shadowColor=cfg.glow;
  ctx.shadowBlur=(18+Math.sin(part.phase)*8) * (hpRatio<0.3?1.6:1);
  ctx.fillStyle=cfg.color;
  ctx.font=`${sz}px "Noto Serif SC","SimSun",serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(cfg.char,part.x,part.y);
  ctx.shadowBlur=0; ctx.restore();
}

// ═══════════════ Boss 行为 ═══════════════

function onBossChargeComplete() {
  Sound.phaseChange();
  shakeAmount=18;
  // 震碎所有战场文字（包括技能字），弹幕攻击期间清场
  battleWords.forEach(bw=>{if(bw.alive) for(let i=0;i<6;i++) particles.push(new HitParticle(bw.x,bw.y,'#ff6644',bw.text));});
  battleWords=[];
  document.getElementById('stun-overlay').classList.add('active');
  setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'),400);
}

function shatterPlayerWords() {
  battleWords.forEach(bw=>{if(bw.alive) for(let i=0;i<4;i++) particles.push(new HitParticle(bw.x,bw.y,'#aa8888',bw.text));});
  battleWords=[];
}

function restorePlayerWords() { if(typeof balanceWords==='function') balanceWords(); }

function onPlayerHitByProjectile(proj) {
  // Boss战受击重置连击
  if(typeof comboPenalty==='function') comboPenalty(); else{if(typeof combo!=='undefined'){combo=0;comboTimer=0;comboWords=[];if(typeof elComboDisplay!=='undefined')elComboDisplay.classList.remove('show');}}
  const diffDmgMult = [0.85, 1.0, 1.2];
  const dmgMult = (typeof difficulty!=='undefined') ? (diffDmgMult[difficulty] || 1.0) : 1.0;
  const result = typeof applyDamageToPlayer==='function' ? applyDamageToPlayer(Math.floor(proj.damage * dmgMult)) : {dmg:Math.floor(proj.damage * dmgMult), absorbed:0};
  shakeAmount=Math.max(shakeAmount,4);
  if (result.absorbed > 0) {
    particles.push(new DamageText(proj.x,proj.y-10,`盾-${result.absorbed}`,'#66aaff'));
    for(let i=0;i<5;i++) particles.push(new HitParticle(proj.x,proj.y,'#66aaff','□'));
  }
  if (result.dmg > 0) {
    particles.push(new DamageText(proj.x,proj.y,`-${result.dmg}`,'#ff4444'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(proj.x,proj.y,'#ff3333','×'));
  }
  if(playerHP<=0 && typeof handlePlayerDeath==='function') handlePlayerDeath();
}

function onHitByLeftPart(dmg) {
  // Boss战受击重置连击
  if(typeof comboPenalty==='function') comboPenalty(); else{if(typeof combo!=='undefined'){combo=0;comboTimer=0;comboWords=[];if(typeof elComboDisplay!=='undefined')elComboDisplay.classList.remove('show');}}
  const diffDmgMult = [0.85, 1.0, 1.2];
  const dmgMult = (typeof difficulty!=='undefined') ? (diffDmgMult[difficulty] || 1.0) : 1.0;
  const result = typeof applyDamageToPlayer==='function' ? applyDamageToPlayer(Math.floor(dmg * dmgMult)) : {dmg:Math.floor(dmg * dmgMult), absorbed:0};
  shakeAmount=Math.max(shakeAmount,8);
  if (result.absorbed > 0) {
    particles.push(new DamageText(mx,my-15,`盾-${result.absorbed}`,'#66aaff'));
    for(let i=0;i<5;i++) particles.push(new HitParticle(mx,my,'#66aaff','□'));
  }
  if (result.dmg > 0) {
    particles.push(new DamageText(mx,my,`-${result.dmg}`,'#ff3322'));
    for(let i=0;i<14;i++) particles.push(new HitParticle(mx,my,'#ff3311',bossConfig.left.char));
  }
  if(playerHP<=0 && typeof handlePlayerDeath==='function') handlePlayerDeath();
}

function hitBossPart(mx, my) {
  if (!bossActive||!bossState) return null;
  // 暴露期1.5倍，蓄力期0.8倍（取消蓄力无敌）
  if (bossState.phase===BOSS_PHASE.VULNERABLE) return {multiplier:1.5};
  if (bossState.phase===BOSS_PHASE.CHARGING) return {multiplier:0.8};
  return null;
}

function damageBoss(dmg, multiplier) {
  if (!bossActive||!bossState) return false;

  // 憾：20%血量逃跑
  if (bossConfig && bossConfig.name==='憾' && !bossState._fled) {
    const newHP = bossState.hp - Math.floor(dmg * (multiplier || 1));
    if (newHP <= bossState.maxHP * 0.2) {
      bossState.hp = Math.floor(bossState.maxHP * 0.2);
      bossState._fled = true;
      bossState._hurtTimer = 0.3;
      triggerHanFlee();
      return true;
    }
  }

  // 遗：20%血量触发假撤退 → 憾遗合体
  if (bossConfig && bossConfig.name==='遗' && !bossState._fusionTriggered) {
    const newHP = bossState.hp - Math.floor(dmg * (multiplier || 1));
    if (newHP <= bossState.maxHP * 0.2) {
      bossState.hp = Math.floor(bossState.maxHP * 0.2);
      bossState._fusionTriggered = true;
      bossState._fusionPending = true; // 防止DEFEATED阶段清除bossActive
      bossState.phase = BOSS_PHASE.DEFEATED;
      bossState.timer = 0;
      bossProjectiles = [];
      bossState._afterimages = [];
      bossState._burstBombs = [];
      bossState._gravityActive = false;
      bossState._heartLock = null;
      shakeAmount = 10;
      if (typeof Sound !== 'undefined' && Sound.setBGMIntensity) Sound.setBGMIntensity(0);
      // 粒子 — 遗的部件飘散（假死）
      const cx = W*0.5, cy = H*0.2;
      for (let i = 0; i < 40; i++) {
        const p = new HitParticle(cx + (Math.random()-0.5)*120, cy + (Math.random()-0.5)*60, '#ffdd44', '·');
        p.vx = (Math.random()-0.5)*3; p.vy = (Math.random()-0.5)*3 - 1;
        p.size = 3+Math.random()*8; p.life = 25+Math.random()*35;
        particles.push(p);
      }
      // 1.5秒后零警觉 → 2秒后憾冲入合体
      setTimeout(() => {
        if (typeof Dialogue !== 'undefined') {
          Dialogue.show({
            mode:'shake', speaker:'零',
            text:'等等……不对。那个波形——它没有消失。它——',
            speed:50
          });
        }
      }, 1500);
      setTimeout(() => {
        if (typeof Dialogue !== 'undefined') Dialogue.hide();
        triggerRegretFusion();
      }, 2800);
      return true;
    }
  }

  // 憾逃跑后：无法造成伤害
  if (bossState._fled) {
    const cx=W*0.5,cy=H*0.2;
    for(let i=0;i<5;i++) particles.push(new HitParticle(cx,cy,'#888888','×'));
    particles.push(new DamageText(cx,cy-10,'无效','#888888'));
    return false;
  }
  const mult=multiplier||1;
  bossState.hp-=Math.floor(dmg*mult); if(bossState.hp<0) bossState.hp=0;
  bossState._hurtTimer = 0.18; // 受击抖动
  const cx=W*0.5,cy=H*0.2;
  for(let i=0;i<10;i++) particles.push(new HitParticle(cx,cy,'#ffcc88','·'));
  particles.push(new DamageText(cx,cy-10,`-${Math.floor(dmg*mult)}`,mult>1?'#ffdd44':'#ffcc44'));
  if(bossState.hp<=0) defeatBoss();
  return true;
}

/** 憾：20%血量逃跑演出 */
function triggerHanFlee() {
  bossState.phase = BOSS_PHASE.DEFEATED;
  bossState.timer = 0;
  bossProjectiles = [];
  battleWords = [];
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  // 完整清理所有攻击特效状态
  bossState._gravityActive = false; bossState._gravityIntensity = 0;
  bossState._heartLock = null;
  bossState._afterimages = [];
  bossState._burstBombs = []; bossState._burstPhase = 'layout';
  shakeAmount = 20;
  if (typeof lastBossKey !== 'undefined') lastBossKey = null; // 憾逃跑，清除重试记录
  if (typeof Sound !== 'undefined' && Sound.setBGMIntensity) Sound.setBGMIntensity(0);

  const cx = W*0.5, cy = H*0.2;

  // 暗红逃逸粒子
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 8;
    const p = new HitParticle(cx + (Math.random()-0.5)*80, cy + (Math.random()-0.5)*40, '#ff5544', '·');
    p.vx = Math.cos(a) * spd;
    p.vy = Math.sin(a) * spd - 2;
    p.size = 4 + Math.random() * 12;
    p.life = 25 + Math.random() * 45;
    p.gravity = 0.03;
    particles.push(p);
  }

  // 零的对话
  Dialogue.show({
    mode:'float', speaker:'零',
    text:'它要逃了。憾在濒死时会本能地逃向深层。追不上了。',
    speed:35
  });

  Sound.anomaly();

  // Boss清理由 DEFEATED 阶段自动完成（updateBoss 3秒后 bossActive=false）
  // main.js 中 wasBossActive→!bossActive 检测会触发 startPreDiveTransition，不在此处重复设置 prologuePhase
}

/** 遗：震碎所有装备 */
function shatterAllEquipment() {
  // 屏幕碎裂特效
  shakeAmount = 30;
  document.getElementById('stun-overlay').classList.add('active');
  setTimeout(() => document.getElementById('stun-overlay').classList.remove('active'), 1200);

  // 碎片粒子 — 从屏幕中央爆开
  const cx = W*0.5, cy = H*0.35;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 3 + Math.random() * 10;
    const p = new HitParticle(cx + (Math.random()-0.5)*100, cy + (Math.random()-0.5)*60, '#ffdd44', '◆');
    p.vx = Math.cos(a) * spd;
    p.vy = Math.sin(a) * spd;
    p.size = 5 + Math.random() * 16;
    p.life = 30 + Math.random() * 50;
    p.gravity = 0.04;
    particles.push(p);
  }

  // 重置所有装备为基础
  if (typeof playerWeapon !== 'undefined') playerWeapon = EQUIPMENT.weapons['beginner_brush'];
  if (typeof playerArmor !== 'undefined') {
    playerArmor = EQUIPMENT.armors['thin_silk'];
    playerDefense = playerArmor.defense || 0;
  }
  if (typeof playerSkill !== 'undefined') playerSkill = EQUIPMENT.skills['concentration'];
  if (typeof skillState !== 'undefined') skillState = { collected:[], chargeLevel:0, ready:false };
  if (typeof unlockedWeapons !== 'undefined') unlockedWeapons = new Set(['beginner_brush']);
  if (typeof nextAttackBoost !== 'undefined') nextAttackBoost = false;

  // 清空战场文字
  if (typeof battleWords !== 'undefined') battleWords = [];

  // 更新UI
  if (typeof updatePlayerUI === 'function') updatePlayerUI();
  if (typeof updateSkillUI === 'function') updateSkillUI();

  // 零的惊呼对话
  if (typeof Dialogue !== 'undefined') {
    Dialogue.show({
      mode:'tremble', speaker:'零',
      text:'他把你的词元锚点……全震碎了。你的装备、你的词元池——全都没了。',
      speed:38, locked:false
    });
  }

  Sound.anomaly();
  Sound.stun();
}

function defeatBoss() {
  bossState.phase=BOSS_PHASE.DEFEATED; bossState.timer=0;
  bossProjectiles=[]; battleWords=[];
  // 清理新攻击类型状态
  bossState._afterimages=[]; bossState._burstBombs=[];
  bossState._gravityActive=false; bossState._heartLock=null;
  if(typeof enemyEntity!=='undefined')enemyEntity=null; shakeAmount=16;
  if (typeof lastBossKey !== 'undefined') lastBossKey = null; // Boss已击败，清除重试记录
  if (typeof Sound !== 'undefined' && Sound.setBGMIntensity) Sound.setBGMIntensity(0);
  const cx=W*0.5,cy=H*0.2;
  for(let i=0;i<100;i++) particles.push(new HitParticle(cx,cy,'#ffcc88','·'));
  Sound.victory();
}

/* ═══════════════ §K 遗憾合体·溯洄 — 剧情演出 ═══════════════
 *
 * 触发：遗HP≤20%
 * 阶段：凝时 → 溯洄 → 碎忆 → 白屏 → 剧情推进
 * 接管全屏渲染，冻结战斗，摧毁全部装备
 */

// 遗憾合体阶段：憾撞入→融合→静默→白屏死字→台词
const FUSION = { CONVERGE:0, FREEZE:1, PAUSE:2, RECKONING:3, DIALOGUE:4, DONE:5 };
let fusionActive = false;
let fusionState = null;

function triggerRegretFusion() {
  fusionActive = true;
  // 捕获遗部件当前漂浮位置（假撤退后上飘了约2.8秒）
  const yiX = bossState ? (bossState.left.x + bossState.right.x) * 0.5 : W*0.5;
  const yiY = bossState ? (bossState.left.y + bossState.right.y) * 0.5 - 30 : H*0.3;
  // 冻结Boss战斗
  bossActive = false; bossState = null; bossProjectiles = [];
  if (typeof Sound !== 'undefined' && Sound.setBGMIntensity) Sound.setBGMIntensity(0);
  if (typeof lastBossKey !== 'undefined') lastBossKey = null;

  // 快照当前战场文字
  const frozen = [];
  if (typeof battleWords !== 'undefined') {
    battleWords.forEach(bw => {
      if (bw.alive && bw.cat !== '乱') {
        frozen.push({ x:bw.x, y:bw.y, vx:bw.vx*0.1, vy:bw.vy*0.1, text:bw.text, size:bw.size||20, alpha:bw.alpha||0.8 });
      }
    });
    battleWords = [];
  }

  fusionState = {
    phase: FUSION.CONVERGE,
    timer: 0,
    // 憾撞入
    hanX: -180, hanY: H*0.30,
    yiX: yiX, yiY: yiY,
    targetCX: W*0.5, targetCY: H*0.38,
    shockwaveR: 0,
    shockwaveMax: Math.max(W,H) * 0.8,
    vignetteAlpha: 0,
    // 文字
    frozenWords: frozen,
    playerCX: W*0.5, playerCY: H*0.75,
    // 白屏+死字
    whiteAlpha: 0,
    grayAlpha: 0,
    deathChars: [],
    deathTimer: 0,
    shakeBase: 0,
    equipmentShattered: false,
    // 台词
    dialogueDone: false,
  };
}

function updateFusion(dt) {
  if (!fusionActive || !fusionState) return;
  const fs = fusionState;
  fs.timer += dt;

  switch (fs.phase) {

    case FUSION.CONVERGE: {
      // 憾从左侧猛冲撞向漂浮的遗
      const t = Math.min(1, fs.timer / 1.2); // 1.2秒快速冲入
      const eased = 1 - Math.pow(1-t, 3);    // ease-out — 越靠近越减速然后撞击
      // 憾：从左外高速冲入
      fs.hanX = -180 + (fs.targetCX - 20) * eased;
      fs.hanY = fs.targetCY - 10 + Math.sin(t*Math.PI*0.6) * 50;
      // 遗：在漂浮位置微微晃动（等待撞击）
      fs.yiX += (fs.targetCX + 25 - fs.yiX) * 0.03;
      fs.yiY += (fs.targetCY - fs.yiY) * 0.02;

      // 憾的拖尾粒子（高速冲撞感）
      if (t < 0.9 && Math.random() < 0.7) {
        const tp = new HitParticle(fs.hanX + 40, fs.hanY, '#ff5544', '·');
        tp.vx = (Math.random()-0.5)*2; tp.vy = (Math.random()-0.5)*2;
        tp.size = 4+Math.random()*8; tp.life = 12+Math.random()*18;
        particles.push(tp);
      }

      if (t >= 1) {
        fs.phase = FUSION.FREEZE;
        fs.timer = 0;
        fs.shockwaveR = 20;
        fs.vignetteAlpha = 0;
        // 憾撞遗 → 碰撞粒子爆发
        for (let i=0;i<80;i++) {
          const a=Math.random()*Math.PI*2;
          const p=new HitParticle(fs.targetCX,fs.targetCY,i%2?'#ff5544':'#ffdd44','·');
          p.vx=Math.cos(a)*(3+Math.random()*10); p.vy=Math.sin(a)*(3+Math.random()*10);
          p.size=3+Math.random()*8; p.life=20+Math.random()*35;
          particles.push(p);
        }
        shakeAmount = 30;
        Sound.anomaly();
        Sound.stun();
      }
      break;
    }

    case FUSION.FREEZE: {
      // 冲击波扩散
      fs.shockwaveR += (fs.shockwaveMax - fs.shockwaveR) * 0.08;
      // 暗角渐深
      fs.vignetteAlpha = Math.min(0.65, fs.timer / 1.8);
      // 冻结的文字微微颤动
      fs.frozenWords.forEach(fw => {
        fw.x += (Math.random()-0.5)*0.3;
        fw.y += (Math.random()-0.5)*0.3;
      });

      if (fs.timer > 2.0) {
        fs.phase = FUSION.PAUSE;
        fs.timer = 0;
      }
      break;
    }

    case FUSION.PAUSE: {
      // 2秒静默：遗憾二字悬浮，文字微颤，玩家感受这一刻
      fs.vignetteAlpha = 0.65;
      fs.frozenWords.forEach(fw => {
        fw.x += (Math.random()-0.5)*0.15;
        fw.y += (Math.random()-0.5)*0.15;
      });

      if (fs.timer > 2.0) {
        fs.phase = FUSION.RECKONING;
        fs.timer = 0;
        fs.whiteAlpha = 0;
        fs.grayAlpha = 0;
        fs.shakeBase = 1;
      }
      break;
    }

    case FUSION.RECKONING: {
      const progress = fs.timer / 8.0; // 8秒慢节奏

      // 白屏缓慢渗入（0→3s到达0.7，之后保持）
      fs.whiteAlpha = Math.min(0.75, fs.timer / 4.0);
      // 灰幕叠加
      fs.grayAlpha = Math.min(0.55, progress * 0.8);

      // 文字缓慢飘向玩家（0→6秒完成）
      if (fs.timer < 6.0) {
        const pullStrength = (fs.timer / 6.0) * 4;
        fs.frozenWords.forEach(fw => {
          const dx = fs.playerCX - fw.x;
          const dy = fs.playerCY - fw.y;
          const dist = Math.sqrt(dx*dx+dy*dy) + 1;
          const force = pullStrength * 60 / dist;
          fw.x += dx * force * dt;
          fw.y += dy * force * dt;
          fw.alpha = Math.max(0.15, 0.8 - (fs.timer/6.0)*0.7);
        });
      } else if (fs.timer >= 6.0 && fs.frozenWords.length > 0) {
        // 6秒后文字全部消散
        fs.frozenWords = [];
      }

      // 窗口抖动逐渐加剧（4→8秒最剧烈）
      if (fs.timer > 3.0) {
        const shakeProg = (fs.timer - 3.0) / 5.0;
        fs.shakeBase = 1 + shakeProg * 26;
        shakeAmount = Math.max(shakeAmount, fs.shakeBase + Math.sin(fs.timer*25)*shakeProg*10);
      }

      // "悔"字涌现（0→8秒全程，先稀后密）
      fs.deathTimer += dt;
      const deathInterval = 0.5 - progress * 0.38; // 0.5s→0.12s
      if (fs.deathTimer > Math.max(0.08, deathInterval)) {
        fs.deathTimer = 0;
        const dx = Math.random()*W*0.85 + W*0.075;
        const dy = Math.random()*H*0.65 + H*0.1;
        fs.deathChars.push({
          x:dx, y:dy, alpha:0, targetAlpha:0.25+progress*0.7,
          size:28+Math.random()*55,
        });
        if (fs.deathChars.length > 30) fs.deathChars.shift();
      }
      fs.deathChars.forEach(dc => {
        dc.alpha += (dc.targetAlpha - dc.alpha) * 0.10;
      });

      // 3.5秒时男主难受的台词（自动继续）
      if (fs.timer > 3.5 && !fs._protagonistLineDone) {
        fs._protagonistLineDone = true;
        if (typeof Dialogue !== 'undefined') {
          Dialogue.show({
            mode:'tremble', speaker:'主角',
            text:'这就是……遗憾的重量吗……',
            speed:55, locked:true,
            onComplete() {
              setTimeout(() => { if (typeof Dialogue !== 'undefined') Dialogue.hide(); }, 1800);
            }
          });
        }
      }

      // 5秒时震碎装备
      if (fs.timer > 5.0 && !fs.equipmentShattered) {
        fs.equipmentShattered = true;
        shatterAllEquipmentSilent();
        if (typeof Sound !== 'undefined' && Sound.stopBGM) Sound.stopBGM(2.0);
      }

      // 8秒后进入台词
      if (fs.timer > 8.0) {
        fs.phase = FUSION.DIALOGUE;
        fs.timer = 0;
        fs.frozenWords = [];
        fs.deathChars = [];
        shakeAmount = 30;
      }
      break;
    }

    case FUSION.DIALOGUE: {
      // 白屏保持，抖动衰减
      fs.whiteAlpha = Math.min(1, 0.75 + fs.timer / 1.5);
      shakeAmount = Math.max(0, 30 * (1 - fs.timer/2.0));
      // 台词出现，等玩家点击
      if (!fs.dialogueDone) {
        fs.dialogueDone = true;
        if (typeof Dialogue !== 'undefined') {
          Dialogue.show({
            mode:'float', speaker:'零',
            text:'……怎么能在这里倒下。',
            speed:50,
            onComplete() {
              fs.phase = FUSION.DONE;
              fs.timer = 0;
            }
          });
        }
      }
      break;
    }

    case FUSION.DONE:
      // 等待外部处理（safe house过渡）
      break;
  }
}

/** 静默震碎装备（无对话、无音效，用于融合演出中） */
function shatterAllEquipmentSilent() {
  // 碎片粒子
  const cx=W*0.5, cy=H*0.45;
  for (let i=0;i<100;i++) {
    const a=Math.random()*Math.PI*2;
    const spd=3+Math.random()*12;
    const p=new HitParticle(cx+(Math.random()-0.5)*120,cy+(Math.random()-0.5)*80,'#ffdd44','◆');
    p.vx=Math.cos(a)*spd; p.vy=Math.sin(a)*spd;
    p.size=5+Math.random()*16; p.life=30+Math.random()*50; p.gravity=0.04;
    particles.push(p);
  }
  // 重置装备为基础
  if (typeof playerWeapon !== 'undefined') playerWeapon = EQUIPMENT.weapons['beginner_brush'];
  if (typeof playerArmor !== 'undefined') {
    playerArmor = EQUIPMENT.armors['thin_silk'];
    playerDefense = playerArmor.defense || 0;
  }
  if (typeof playerSkill !== 'undefined') playerSkill = EQUIPMENT.skills['concentration'];
  if (typeof skillState !== 'undefined') skillState = { collected:[], chargeLevel:0, ready:false };
  if (typeof unlockedWeapons !== 'undefined') unlockedWeapons = new Set(['beginner_brush']);
  if (typeof nextAttackBoost !== 'undefined') nextAttackBoost = false;
  if (typeof updatePlayerUI === 'function') updatePlayerUI();
  if (typeof updateSkillUI === 'function') updateSkillUI();
  if (typeof hasShield !== 'undefined') { hasShield = false; shieldHP = 0; }
}

function drawFusion(ctx) {
  if (!fusionActive || !fusionState) return;
  const fs = fusionState;

  if (fs.phase === FUSION.CONVERGE) {
    // 憾从左侧猛冲（大尺寸 + 拖尾感），遗在画面中漂浮等待
    const hanSz = 90 + Math.sin(fs.timer*8) * 5; // 憾微微脉动
    const yiSz = 70;
    ctx.save();
    // 憾 — 红色，大号，从左侧冲入
    ctx.shadowColor='#cc3322'; ctx.shadowBlur=35;
    ctx.fillStyle='#ff5544';
    ctx.font=`bold ${hanSz}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('憾',fs.hanX,fs.hanY);
    // 遗 — 金色，在画面中漂浮
    ctx.shadowColor='#ddaa22'; ctx.shadowBlur=20;
    ctx.fillStyle='#ffcc44';
    ctx.font=`bold ${yiSz}px "Noto Serif SC","SimSun",serif`;
    ctx.fillText('遗',fs.yiX,fs.yiY);
    ctx.shadowBlur=0;
    ctx.restore();
  }

  // FREEZE / PAUSE：遗憾融合 + 冲击波 + 暗角
  if (fs.phase === FUSION.FREEZE || fs.phase === FUSION.PAUSE) {
    // 中央"遗憾"
    const pulse=1+Math.sin(fs.timer*2.5)*0.06;
    const sz=110*pulse;
    ctx.save();
    ctx.shadowColor='#ffffff'; ctx.shadowBlur=40;
    ctx.fillStyle='#eeddcc';
    ctx.font=`bold ${sz}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('遗憾',fs.targetCX,fs.targetCY);
    ctx.shadowBlur=0;
    ctx.restore();

    // 冲击波环
    if (fs.shockwaveR > 0 && fs.shockwaveR < fs.shockwaveMax) {
      ctx.save();
      const alpha=Math.max(0,1-fs.shockwaveR/fs.shockwaveMax)*0.5;
      ctx.strokeStyle=`rgba(200,200,200,${alpha})`;
      ctx.lineWidth=3*(1-fs.shockwaveR/fs.shockwaveMax);
      ctx.beginPath(); ctx.arc(fs.targetCX,fs.targetCY,fs.shockwaveR,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // 径向暗角
    if (fs.vignetteAlpha > 0) {
      const grad=ctx.createRadialGradient(fs.targetCX,fs.targetCY,H*0.15,fs.targetCX,fs.targetCY,Math.max(W,H)*0.9);
      grad.addColorStop(0,`rgba(20,15,10,0)`);
      grad.addColorStop(0.35,`rgba(10,5,0,${fs.vignetteAlpha*0.3})`);
      grad.addColorStop(1,`rgba(0,0,0,${fs.vignetteAlpha})`);
      ctx.save();
      ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
  }

  // 冻结文字（FREEZE / PAUSE / RECKONING前6秒）
  if ((fs.phase === FUSION.FREEZE || fs.phase === FUSION.PAUSE || fs.phase === FUSION.RECKONING) && fs.frozenWords.length > 0) {
    fs.frozenWords.forEach(fw => {
      if (fw.alpha < 0.03) return;
      ctx.save();
      ctx.globalAlpha = fw.alpha;
      ctx.fillStyle = '#ccbbaa';
      ctx.font = `${fw.size}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fw.text, fw.x, fw.y);
      ctx.restore();
    });
  }

  // RECKONING：白屏 + 灰幕 + 悔字
  if (fs.phase === FUSION.RECKONING) {
    // 白屏
    if (fs.whiteAlpha > 0) {
      ctx.save();
      ctx.fillStyle=`rgba(240,240,245,${fs.whiteAlpha})`;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
    // 灰幕叠加
    if (fs.grayAlpha > 0) {
      ctx.save();
      ctx.fillStyle=`rgba(20,15,20,${fs.grayAlpha})`;
      ctx.fillRect(0,0,W,H);
      ctx.restore();
    }
    // 悔字
    fs.deathChars.forEach(dc => {
      ctx.save();
      ctx.globalAlpha=dc.alpha;
      ctx.fillStyle='#884444';
      ctx.font=`bold ${dc.size}px "Noto Serif SC","SimSun",serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('悔',dc.x,dc.y);
      ctx.restore();
    });
  }

  // DIALOGUE：白屏保持
  if (fs.phase === FUSION.DIALOGUE && fs.whiteAlpha > 0) {
    ctx.save();
    ctx.fillStyle=`rgba(240,240,245,${fs.whiteAlpha})`;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }
}
