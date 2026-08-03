/* ═══════════════════ §C 粒子系统 + 导师文字形体 ═══════════════════
 *
 * 依赖：config.js (WORD_LIBRARY, MENTOR)
 * 全局变量：W, H (由 main.js 维护)
 */

function hexToRGB(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `${r},${g},${b}`;}

// ── 背景漂浮粒子 ──
class BGParticle {
  constructor() { this.reset(true); }
  reset(init=false) {
    this.x = Math.random()*W; this.y = init ? Math.random()*H : (Math.random()<0.5 ? -30 : H+30);
    this.vx = (Math.random()-0.5)*0.15; this.vy = -0.08-Math.random()*0.2;
    const pool='意识之海思绪碎片思维光芒量子虚空深度潜航觉醒';
    this.text = pool[Math.floor(Math.random()*pool.length)];
    this.size = 9+Math.random()*8; this.alpha = 0.03+Math.random()*0.05;
    this.life = 500+Math.random()*600; this.age = init ? Math.random()*this.life : 0;
    this.fp = Math.random()*Math.PI*2;
  }
  update() {
    this.x+=this.vx; this.y+=this.vy; this.age++; this.fp+=0.012;
    if(this.age>this.life) this.reset();
    if(this.x<-30) this.x=W+30; if(this.x>W+30) this.x=-30;
    if(this.y<-60 && this.vy<0) { this.y=H+30; this.x=Math.random()*W; }
  }
  draw(ctx) {
    const a=this.alpha*(0.5+0.5*Math.sin(this.fp));
    ctx.fillStyle=`rgba(140,160,210,${a})`;
    ctx.font=`${this.size}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(this.text,this.x,this.y);
  }
}

// ── 点击爆发粒子 ──
class HitParticle {
  constructor(x,y,color,text) {
    this.x=x; this.y=y; const a=Math.random()*Math.PI*2, s=1.5+Math.random()*5;
    this.vx=Math.cos(a)*s; this.vy=Math.sin(a)*s-2;
    this.text=text||'·'; this.size=10+Math.random()*14;
    this.alpha=0.8; this.life=25+Math.random()*30; this.age=0;
    this.color=color; this.gravity=0.07;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.vy+=this.gravity; this.age++; this.alpha=0.8*(1-this.age/this.life); }
  draw(ctx) {
    if(this.alpha<0.01||this.age>this.life) return;
    ctx.fillStyle=`rgba(${hexToRGB(this.color)},${this.alpha})`;
    ctx.font=`${this.size}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(this.text,this.x,this.y);
  }
  get dead(){return this.age>this.life;}
}

// ── 浮动伤害数字 ──
class DamageText {
  constructor(x,y,text,color) {
    this.x=x; this.y=y; this.text=text; this.color=color;
    this.vy=-2.5; this.alpha=1; this.life=45; this.age=0; this.size=22;
  }
  update() { this.y+=this.vy; this.vy*=0.97; this.age++; this.alpha=1-this.age/this.life; this.size+=0.08; }
  draw(ctx) {
    if(this.alpha<0.01||this.age>this.life) return;
    ctx.save();ctx.globalAlpha=this.alpha;
    ctx.fillStyle=this.color;
    ctx.font=`bold ${this.size}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(this.text,this.x,this.y);
    ctx.restore();
  }
  get dead(){return this.age>this.life;}
}

// ── 角色粒子 — 构成导师形体的单个文字 ──
class CharacterParticle {
  constructor(cx, cy, char, spread) {
    this.baseX = cx + (Math.random() - 0.5) * (spread || 16);
    this.baseY = cy + (Math.random() - 0.5) * (spread || 20);
    this.char = char || '·';
    this.x = this.baseX;
    this.y = this.baseY;
    this.angle = Math.random() * Math.PI * 2;
    this.orbitR = 0.5 + Math.random() * 3;
    this.orbitSpeed = 0.2 + Math.random() * 0.5;
    this.size = 9 + Math.random() * 7;
    this.alpha = 0.35 + Math.random() * 0.4;
    this.phase = Math.random() * Math.PI * 2;
    this.wanderAmp = 0.2 + Math.random() * 0.3;
  }
  update(time) {
    this.angle += this.orbitSpeed * 0.015;
    const wx = Math.cos(time * 0.0008 * this.wanderAmp + this.phase) * 2;
    const wy = Math.sin(time * 0.001 * this.wanderAmp + this.phase) * 1.8;
    this.x = this.baseX + Math.cos(this.angle) * this.orbitR + wx;
    this.y = this.baseY + Math.sin(this.angle) * this.orbitR * 0.6 + wy;
  }
  draw(ctx) {
    const pulse = 1 + Math.sin(Date.now() * 0.0015 + this.phase) * 0.12;
    ctx.fillStyle = `rgba(150,200,245,${this.alpha * pulse})`;
    ctx.font = `${this.size * pulse}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.char, this.x, this.y);
  }
}

// ── 导师形体：密集文字粒子云，沿女性轮廓分布 ──
class MentorForm {
  constructor() {
    this.x = 0; this.y = 0;
    this.particles = [];
    this.visible = false;
    this.targetAlpha = 0;
    this.currentAlpha = 0;
  }

  /** 定义轮廓采样点（相对坐标），返回 {x,y,spread} */
  _silhouette() {
    const pts = [];
    // 头部 — 圆形区域
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 16 + Math.random() * 6;
      pts.push({ x: Math.cos(a) * r, y: -58 + Math.sin(a) * r * 0.85, spread: 10 });
    }
    // 颈部
    for (let i = 0; i < 4; i++) pts.push({ x: 0, y: -40 + i * 5, spread: 9 });
    // 肩部
    for (let i = 0; i < 8; i++) pts.push({ x: -20 + i * 5.7, y: -20, spread: 10 });
    // 躯干 — 上
    for (let i = 0; i < 12; i++) pts.push({ x: -8 + Math.random() * 16, y: -14 + i * 3, spread: 14 });
    // 躯干 — 下
    for (let i = 0; i < 10; i++) pts.push({ x: -7 + Math.random() * 14, y: 22 + i * 3.5, spread: 12 });
    // 左臂
    for (let i = 0; i < 10; i++) pts.push({ x: -25 - i * 0.3, y: -16 + i * 7, spread: 8 });
    // 右臂
    for (let i = 0; i < 10; i++) pts.push({ x: 25 + i * 0.3, y: -16 + i * 7, spread: 8 });
    // 左腿
    for (let i = 0; i < 8; i++) pts.push({ x: -10, y: 55 + i * 7, spread: 10 });
    // 右腿
    for (let i = 0; i < 8; i++) pts.push({ x: 10, y: 55 + i * 7, spread: 10 });
    return pts;
  }

  init(cx, cy) {
    this.x = cx; this.y = cy;
    this.particles = [];
    const chars = MENTOR.formChars.split('·');
    const pts = this._silhouette();
    pts.forEach(p => {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      this.particles.push(new CharacterParticle(cx + p.x, cy + p.y, ch, p.spread));
    });
    this.visible = true;
  }

  update(time) {
    if (!this.visible) return;
    this.currentAlpha += (this.targetAlpha - this.currentAlpha) * 0.03;
    this.particles.forEach(p => p.update(time));
  }

  draw(ctx) {
    if (!this.visible || this.currentAlpha < 0.02) return;
    ctx.save();
    ctx.globalAlpha = this.currentAlpha;

    // 整体柔光
    const glow = ctx.createRadialGradient(this.x, this.y - 10, 10, this.x, this.y, 110);
    glow.addColorStop(0, `rgba(120,180,240,${0.08 * this.currentAlpha})`);
    glow.addColorStop(0.5, `rgba(100,150,220,${0.03 * this.currentAlpha})`);
    glow.addColorStop(1, 'rgba(80,120,200,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(this.x - 120, this.y - 140, 240, 300);

    // 粒子文字
    this.particles.forEach(p => p.draw(ctx));
    ctx.restore();
  }
}

// ── 战场漂浮文字 ──
class BattleWord {
  constructor(cat,text) {
    this.cat=cat; this.text=text;
    this.x=W*0.25+Math.random()*W*0.5;
    this.y=H*0.3+Math.random()*H*0.35;
    this.vx=(Math.random()-0.5)*1.2; this.vy=(Math.random()-0.5)*0.8;
    this.size=24+Math.random()*10; this.alpha=0.85; this.targetAlpha=0.85;
    this.hovered=false; this.glowExtra=0; this.phase=Math.random()*Math.PI*2;
    this.wobbleAmp=0.3+Math.random()*0.5;
    this.alive=true; this.cooldown=0; this.idleTime=0;
    this.isTutorial=false; // 教程文字不超时消失
    this.noiseLife = 1.0;
  }
  update(speedMul=1) {
    if(!this.alive){this.alpha+=(0-this.alpha)*0.1;return;}
    if(this.cooldown>0){this.cooldown--;this.targetAlpha=0.3;}else this.targetAlpha=0.85;
    if(!this.isTutorial){
      this.idleTime++;
      let maxIdle = this.cat==='乱'?250:380+Math.floor(Math.random()*120);
      if(this.idleTime>maxIdle){this.targetAlpha=0;if(this.alpha<0.03)this.alive=false;}
    }
    this.phase+=0.02;
    this.x+=this.vx*speedMul+Math.sin(this.phase)*this.wobbleAmp*0.5;
    this.y+=this.vy*speedMul+Math.cos(this.phase*1.3)*this.wobbleAmp*0.4;
    const m=40;if(this.x<m){this.x=m;this.vx*=-1;}if(this.x>W-m){this.x=W-m;this.vx*=-1;}
    if(this.y<m+60){this.y=m+60;this.vy*=-1;}if(this.y>H-m-60){this.y=H-m-60;this.vy*=-1;}
    // 伪装干扰字鼠标追踪
    if(this.cat==='乱' && this._trackMouse && typeof mx!=='undefined' && typeof my!=='undefined'){
      const dx = mx - this.x, dy = my - this.y;
      const dist = Math.sqrt(dx*dx+dy*dy) + 0.1;
      const strength = this._trackMouse * 0.04;
      this.vx += (dx/dist) * strength; this.vy += (dy/dist) * strength;
      this.vx = Math.max(-2.0, Math.min(2.0, this.vx));
      this.vy = Math.max(-1.5, Math.min(1.5, this.vy));
    }
    if(Math.random()<0.004){this.vx+=(Math.random()-0.5)*0.5;this.vy+=(Math.random()-0.5)*0.3;this.vx=Math.max(-1.5,Math.min(1.5,this.vx));this.vy=Math.max(-1,Math.min(1,this.vy));}
    this.alpha+=(this.targetAlpha-this.alpha)*0.08;
    const ts=this.cat==='乱'?22:28+Math.random()*4;this.size+=(ts+this.glowExtra-this.size)*0.1;
  }
  draw(ctx) {
    if(this.alpha<0.02) return;
    // 优先从装备配置获取颜色（支持动态词元池）
    const catData=(typeof getCatConfig==='function')?getCatConfig(this.cat):WORD_LIBRARY[this.cat];
    let clr,glow;
    if(this.cat==='乱'){
      // 伪装字：使用伪装目标类别的颜色
      if(this._noiseCatColor){clr=this._noiseCatColor;glow=this._noiseCatGlow||'#555555';}
      else{clr='#999999';glow='#555555';}
    }
    else if(catData){clr=catData.color;glow=catData.glow;}
    else{clr='#ccc';glow='#666';}
    ctx.save();ctx.globalAlpha=Math.min(1,this.alpha);
    if(this.hovered||this.glowExtra>2){ctx.shadowColor=glow;ctx.shadowBlur=12+this.glowExtra*0.5;}
    ctx.fillStyle=clr;
    ctx.font=`${this.size}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(this.text,this.x,this.y);
    ctx.shadowBlur=0;ctx.restore();
  }
  hitTest(mx,my) {
    // 噪点字缩小判定区，避免误触
    const minW = this.cat==='乱' ? 22 : 32;
    const w=Math.max(this.size*this.text.length*0.5, minW);
    return mx>this.x-w/2&&mx<this.x+w/2&&my>this.y-this.size*0.6&&my<this.y+this.size*0.6;
  }
}

// ── 飘浮文字碎片 — 主角的选择肢，无框无界，点击即选择 ──
class DriftTextParticle {
  constructor(x, y, text, index, total, affectionDelta) {
    this.text = text;
    this.baseX = x;
    this.baseY = y;
    this.x = x + (Math.random() - 0.5) * 60;
    this.y = y + (Math.random() - 0.5) * 40;
    this.affection = affectionDelta || 0;   // 选中后好感度变化
    // 每个碎片有不同的初始飘向
    const angle = (index / total) * Math.PI * 2 + Math.random() * 0.5;
    this.vx = Math.cos(angle) * 0.08;
    this.vy = Math.sin(angle) * 0.06 - 0.04;
    this.alpha = 0;
    this.targetAlpha = 0.55 + Math.random() * 0.15;
    this.size = 18 + Math.random() * 8;
    this.phase = Math.random() * Math.PI * 2;
    this.wobbleAmp = 6 + Math.random() * 14;
    this.age = 0;
    this.fading = false;
    this.hovered = false;
    this.selected = false;
    this._fadeInDur = 0.7 + index * 0.3; // 碎片逐个入场
  }

  update(dt) {
    this.age += dt;
    this.phase += dt * 0.5;

    // 缓入
    if (!this.selected && this.age < this._fadeInDur) {
      this.alpha = Math.min(this.targetAlpha, (this.age / this._fadeInDur) * this.targetAlpha);
    }
    // 选中时短暂高亮
    if (this.selected) {
      this.alpha = Math.min(1, this.alpha + dt * 2);
    }

    // 缓慢飘移 + 正弦摆动
    const speedMul = this.hovered ? 0.3 : 1;
    const wx = Math.cos(this.phase) * this.wobbleAmp * 0.06 * speedMul;
    const wy = Math.sin(this.phase * 0.7) * this.wobbleAmp * 0.04 * speedMul;
    this.x += (this.vx + wx) * speedMul;
    this.y += (this.vy + wy) * speedMul;

    // 柔和拉回基点
    const dx = this.x - this.baseX;
    const dy = this.y - this.baseY;
    this.x -= dx * 0.003;
    this.y -= dy * 0.003;

    // 淡出（未选中的碎片在选中后淡出）
    if (this.fading) {
      this.alpha -= dt * 1.5;
    }
  }

  draw(ctx) {
    if (this.alpha < 0.015) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, this.alpha);

    // 悬停时更亮
    const hoverGlow = this.hovered ? 1.6 : 1;
    const baseClr = this.selected ? '#e8e0ff' : (this.hovered ? '#e0e8ff' : '#c8d8f0');
    ctx.fillStyle = baseClr;
    ctx.shadowColor = this.hovered ? 'rgba(180,210,255,0.7)' : 'rgba(150,190,230,0.35)';
    ctx.shadowBlur = (6 + Math.sin(this.age * 1.5) * 3) * hoverGlow;
    const sz = this.hovered ? this.size * 1.08 : this.size;
    ctx.font = `${sz}px "Noto Serif SC", "SimSun", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.text, this.x, this.y);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  hitTest(mx, my) {
    const w = Math.max(this.text.length * this.size * 0.6, 40);
    const h = this.size * 1.2;
    return mx > this.x - w/2 && mx < this.x + w/2 &&
           my > this.y - h/2 && my < this.y + h/2;
  }

  get dead() { return this.fading && this.alpha < 0.015; }
}
