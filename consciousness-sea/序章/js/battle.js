/* ═══════════════════ §G 战斗系统 v2 ═══════════════════
 *
 * 依赖：config.js (WORD_LIBRARY, EQUIPMENT, DIFFICULTY, NOISE_WORDS)
 *       sound.js (Sound)
 *       particles.js (HitParticle, DamageText, BattleWord)
 *       main.js (playerWeapon, playerArmor, playerSkill, skillState)
 *       tutorial.js (Tutorial)
 *
 * 全局状态：战斗相关的HP、计时器、技能收集
 */

let enemyHP=40, enemyMaxHP=40, enemyTimer=0, enemyInterval=6;
let enemyEntity = null; // 战场中的敌人视觉实体 { x, y, char, color, size, phase, hurtFlash }
let currentEnemyType = 'bash';   // 当前敌人攻击类型（房间设置：bash/volley/rain/track/shield/split）
let enemyProjectiles = [];       // 普通敌人弹幕（弹幕型敌人发射）
let playerHP=100, playerMaxHP=100;
let hasShield=false, shieldHP=0;
let playerDefense=0; // 当前防具减伤值
let playerHurtTimer=0; // 玩家血条受击抖动
let nextAttackBoost=false;
let combo=0, comboTimer=0, comboWords=[];
let shieldDecayTimer=0; // 护盾衰减计时器
let blazeProgress=0;    // 焚天「炎」debuff进度 0~100
let blazeActive=false;  // 炎爆是否激活
let blazeTimer=0;       // 炎爆剩余时间
let blazeCooldown=0;    // 炎爆冷却
let threatLevel=0;      // 威胁等级 0~10

// DOM引用（main.js中赋值）
let elComboDisplay, elComboCount, elComboWords;

/** 根据装备获取指定类别的词元配置 */
function getCatConfig(cat) {
  if (cat==='攻' && typeof playerWeapon!=='undefined' && playerWeapon) {
    return { words:playerWeapon.words, color:playerWeapon.color, glow:playerWeapon.glow };
  }
  if (cat==='防' && typeof playerArmor!=='undefined' && playerArmor) {
    return { words:playerArmor.words, color:playerArmor.color, glow:playerArmor.glow };
  }
  // 符字 — 由护符配置提供（战场治疗来源）
  if (cat==='符' && typeof playerTalisman!=='undefined' && playerTalisman) {
    return { words:playerTalisman.words, color:playerTalisman.color, glow:playerTalisman.glow };
  }
  // 技能字 — 由技能配置提供
  if (cat==='skill' && typeof playerSkill!=='undefined' && playerSkill) {
    return { words:playerSkill.chars, color:playerSkill.color, glow:playerSkill.glow };
  }
  return null;
}

/** combo保护：降级而非清零 */
function comboPenalty(levels) {
  levels = levels || 2;
  combo = Math.max(0, combo - levels);
  comboTimer = Math.max(0, comboTimer - 0.3);
  if (combo === 0) { comboWords = []; elComboDisplay.classList.remove('show'); }
  else { comboWords = comboWords.slice(-Math.min(combo, 5)); updateComboColors(); }
}

/** 刷新敌人实体（根据难度/房间类型/攻击类型） */
function spawnEnemyEntity(hardMode, enemyType) {
  currentEnemyType = enemyType || 'bash';
  // 不同攻击类型的敌人视觉特征（名字对应攻击方式）
  const VIS = {
    bash:   { chars:['敌','噪','乱','扰','侵'], color:'#cc8866', glow:'#884422', size:44 },
    volley: { chars:['矢','射','齐','迸'],       color:'#66aaff', glow:'#3366cc', size:48 },
    rain:   { chars:['雨','滴','滂','霖'],       color:'#55ccdd', glow:'#2288aa', size:48 },
    track:  { chars:['追','逐','缠','觅'],       color:'#aa77ff', glow:'#6633cc', size:50 },
    shield: { chars:['壁','护','盾','御'],       color:'#ddcc88', glow:'#aa9933', size:52 },
    split:  { chars:['裂','散','分','崩'],       color:'#ff9966', glow:'#cc5522', size:46 },
  };
  const v = VIS[enemyType] || VIS.bash;
  const hardChars = ['恨','悔','惜','怅'];
  enemyEntity = {
    x: W*0.5, y: H*0.26,
    char: hardMode ? hardChars[Math.floor(Math.random()*hardChars.length)] : v.chars[Math.floor(Math.random()*v.chars.length)],
    color: hardMode ? '#dd9988' : v.color,
    glow: hardMode ? '#994433' : v.glow,
    size: hardMode ? 56 : v.size,
    phase: Math.random()*Math.PI*2,
    hurtFlash: 0,
    wobbleX: 0, wobbleY: 0,
    enemyType: currentEnemyType,
  };
}

/** 更新敌人实体动画 */
function updateEnemyEntity(dt) {
  if (!enemyEntity) return;
  enemyEntity.phase += dt * 1.6;
  enemyEntity.wobbleX = Math.sin(enemyEntity.phase) * 6;
  enemyEntity.wobbleY = Math.cos(enemyEntity.phase * 0.7) * 4;
  if (enemyEntity.hurtFlash > 0) enemyEntity.hurtFlash -= dt;
}

/** 绘制敌人实体 */
function drawEnemyEntity(ctx) {
  if (!enemyEntity || enemyHP <= 0) return;
  const e = enemyEntity;
  const breathe = 1 + Math.sin(e.phase) * 0.06;
  const sz = e.size * breathe;
  const hurtShake = e.hurtFlash > 0 ? Math.sin(e.hurtFlash * 45) * e.hurtFlash * 8 : 0;

  ctx.save();
  // 脉动圆环
  const ringR = sz * 0.95 + Math.sin(e.phase * 1.3) * 3;
  ctx.strokeStyle = `rgba(200,140,100,${0.25 + 0.1 * Math.sin(e.phase * 1.3)})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(e.x + hurtShake, e.y + hurtShake*0.5, ringR, 0, Math.PI*2); ctx.stroke();

  // 暗影光环
  const glowGrad = ctx.createRadialGradient(e.x, e.y, sz*0.3, e.x, e.y, sz*1.6);
  glowGrad.addColorStop(0, `rgba(200,120,80,${0.18 + 0.06*Math.sin(e.phase)})`);
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(e.x + hurtShake, e.y + hurtShake*0.5, sz*1.6, 0, Math.PI*2); ctx.fill();

  // 主字
  ctx.shadowColor = e.glow;
  ctx.shadowBlur = 12 + Math.sin(e.phase)*4;
  ctx.fillStyle = e.color;
  ctx.font = `${sz}px "Noto Serif SC","SimSun",serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e.char, e.x + hurtShake + e.wobbleX*0.3, e.y + hurtShake*0.5 + e.wobbleY*0.3);
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** 对敌人造成伤害 */
function dealDamage(dmg,isCombo) {
  // 护壁残响：直接攻击伤害减半
  if (currentEnemyType === 'shield') dmg = Math.max(1, Math.floor(dmg * 0.5));
  enemyHP-=dmg;
  if(enemyHP<0) enemyHP=0;
  updateEnemyUI();
  // 受击粒子在敌人实体位置
  const ex = enemyEntity ? enemyEntity.x : W*0.5;
  const ey = enemyEntity ? enemyEntity.y : H*0.22;
  particles.push(new DamageText(ex,ey-20,`-${dmg}`,isCombo?'#ffcc44':'#ff8866'));
  for(let i=0;i<8;i++) particles.push(new HitParticle(ex,ey,isCombo?'#ffcc44':'#ff6644'));
  // 敌人实体受击闪烁
  if (enemyEntity) enemyEntity.hurtFlash = 0.18;
  shakeAmount=Math.max(shakeAmount,dmg*0.3);

  // 受控房间（combat/treasure/event）不进入全局VICTORY，由各自check函数处理
  const inControlledRoom = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && (currentDiveRoom.type === 'combat' || currentDiveRoom.type === 'treasure' || currentDiveRoom.type === 'event');
  if(enemyHP<=0&&Tutorial.phase===PHASE.BATTLE && !inControlledRoom){
    Tutorial.enterPhase(PHASE.VICTORY);
    document.getElementById('enemy-timer-fill').style.width='100%';
    document.getElementById('enemy-timer-fill').classList.remove('urgent');
  }
}

/** 应用武器特殊效果（焚天炎debuff / 霜序减速） */
function applyWeaponEffects() {
  if (!playerWeapon) return;

  // 焚天「炎」debuff
  if (playerWeapon.blaze && blazeCooldown <= 0) {
    // Boss CHARGING/ATTACK阶段冻结进度
    const bossFreeze = bossActive && bossState &&
      (bossState.phase === BOSS_PHASE.CHARGING || bossState.phase === BOSS_PHASE.ATTACK);
    if (!bossFreeze) {
      blazeProgress = Math.min(100, blazeProgress + 20);
      // 炎爆触发
      if (blazeProgress >= 100 && !blazeActive) {
        blazeActive = true; blazeTimer = 6.0; blazeProgress = 100;
        for (let i = 0; i < 15; i++) {
          const p = new HitParticle(W * 0.5, H * 0.35, '#ff6600', '炎');
          p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3 - 1;
          p.size = 8 + Math.random() * 14; p.life = 20 + Math.random() * 25;
          particles.push(p);
        }
        particles.push(new DamageText(W * 0.5, H * 0.28, '炎爆!', '#ff6600'));
        Sound.anomaly();
      }
    }
  }

  // 霜序减速
  if (playerWeapon.slow) {
    enemyTimer = Math.min(enemyTimer + 0.25, enemyInterval * 1.5);
    // 冰霜粒子
    if (Math.random() < 0.5) {
      const ex = enemyEntity ? enemyEntity.x : W * 0.5;
      const ey = enemyEntity ? enemyEntity.y : H * 0.26;
      const fp = new HitParticle(ex, ey, '#99ccff', '❄');
      fp.vx *= 0.3; fp.vy *= 0.3; fp.size = 6 + Math.random() * 8;
      fp.life = 15 + Math.random() * 15; fp.gravity = -0.03;
      particles.push(fp);
    }
  }
}

/** 对玩家施加伤害：防御减伤 → 护盾吸收 → HP扣除，返回实际HP损失 */
function applyDamageToPlayer(rawDmg) {
  // 防御减伤
  let dmg = Math.max(1, rawDmg - playerDefense);
  let absorbed = 0;
  // 护盾吸收
  if (hasShield && shieldHP > 0) {
    absorbed = Math.min(shieldHP, dmg);
    shieldHP -= absorbed;
    dmg -= absorbed;
    if (shieldHP <= 0) { hasShield = false; shieldHP = 0; }
  }
  playerHP -= dmg;
  if (playerHP < 0) playerHP = 0;
  if (dmg > 0) playerHurtTimer = 0.2;
  updatePlayerUI();
  return { dmg, absorbed, shieldBroken: hasShield === false && absorbed > 0 };
}

/** 敌人攻击 — 按攻击类型分发：弹幕型发射弹幕，近战型直接扣血 */
function enemyAttack() {
  if(Tutorial.phase!==PHASE.BATTLE) return;

  // 闪避判定（独立于防御/护盾，完全避开）
  if(playerArmor && playerArmor.dodgeChance && Math.random()<playerArmor.dodgeChance){
    Sound.shieldBlock();
    particles.push(new DamageText(W*0.5,H*0.65,'闪避!','#88ccff'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.7,'#88ccff','◇'));
    comboPenalty();
    enemyTimer=enemyInterval;
    return;
  }

  if (currentEnemyType==='volley' || currentEnemyType==='rain' || currentEnemyType==='track') {
    enemyLaunchProjectiles();
  } else {
    enemyAttackMelee();
  }

  comboPenalty();

  // 玩家死亡判定
  if(playerHP<=0){
    if(typeof Tutorial!=='undefined' && Tutorial.phase && Tutorial.phase.toString().startsWith('tutorial_')){
      playerHP=30;
      updatePlayerUI();
      Dialogue.show({mode:'shake',speaker:'零',text:'……你需要再来一次。集中精神！',speed:30});
      enemyTimer=enemyInterval;
      refreshWords();
      return;
    }
    handlePlayerDeath();
    return;
  }
  enemyTimer=enemyInterval;
  refreshWords();
}

/** 近战攻击：直接对玩家造成伤害（bash/shield/split 类型） */
function enemyAttackMelee() {
  const diff=DIFFICULTY[difficulty];
  const dmgMult=(typeof currentDiveRoom!=='undefined'&&currentDiveRoom&&currentDiveRoom.enemyDmgMult)?currentDiveRoom.enemyDmgMult:1;
  let rawDmg=Math.round((diff.enemyDmg[0]+Math.floor(Math.random()*(diff.enemyDmg[1]-diff.enemyDmg[0])))*dmgMult);
  // 残响之影：波纹攻击伤害翻倍
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'treasure') {
    rawDmg = 16 + Math.floor(Math.random() * 12); // 16-27，很高
    shakeAmount = Math.max(shakeAmount, 14);
    // 波纹粒子
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 80;
      const p = new HitParticle(W*0.5 + Math.cos(a)*r, H*0.5 + Math.sin(a)*r, '#c8a0d8', '~');
      p.vx = Math.cos(a) * 2; p.vy = Math.sin(a) * 2;
      p.size = 4 + Math.random() * 8; p.life = 20 + Math.random() * 20;
      particles.push(p);
    }
  }
  const result = applyDamageToPlayer(rawDmg);

  Sound.enemyAtk();
  shakeAmount=Math.max(shakeAmount,rawDmg*0.5);

  // 伤害反馈粒子
  if (result.absorbed > 0) {
    Sound.shieldBlock();
    particles.push(new DamageText(W*0.5,H*0.62,`盾-${result.absorbed}`,'#66aaff'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.68,'#66aaff','□'));
  }
  if (result.dmg > 0) {
    const defInfo = playerDefense > 0 ? ` (防-${Math.min(rawDmg-1, playerDefense)})` : '';
    particles.push(new DamageText(W*0.5,H*0.65,`-${result.dmg}${defInfo}`,'#ff4444'));
    for(let i=0;i<10;i++) particles.push(new HitParticle(W*0.5,H*0.7,'#ff3333','×'));
  }
}

/** 弹幕型敌人：发射弹幕（玩家被击中时扣血） */
function enemyLaunchProjectiles() {
  const e = enemyEntity;
  const cx = e ? e.x : W*0.5;
  const cy = e ? e.y : H*0.26;
  const diff = DIFFICULTY[difficulty];
  const dmgMult=(typeof currentDiveRoom!=='undefined'&&currentDiveRoom&&currentDiveRoom.enemyDmgMult)?currentDiveRoom.enemyDmgMult:1;
  const dmg = Math.round((diff.enemyDmg[0] + Math.floor(Math.random()*(diff.enemyDmg[1]-diff.enemyDmg[0]))) * dmgMult);
  let projs = [];
  if (currentEnemyType === 'volley') {
    projs = BulletPattern.radial(cx, cy, '·', 8, 2.0, '#66aaff', dmg, 14);
  } else if (currentEnemyType === 'rain') {
    projs = BulletPattern.rain(cx, cy, '·', 6, 1.6, '#55ccdd', dmg, 16);
  } else if (currentEnemyType === 'track') {
    // aimed 签名是位置参数 (cx,cy,toX,toY,char,count,speed,color,damage,size,spreadAngle)
    projs = BulletPattern.aimed(cx, cy, mx, my, '·', 1, 3.2, '#aa77ff', dmg, 14, 0);
  }
  enemyProjectiles.push(...projs);
  Sound.enemyAtk();
}

/** 普通敌人弹幕更新（位移 + 鼠标碰撞扣血） */
function updateEnemyProjectiles(dt) {
  if (enemyProjectiles.length === 0) return;
  enemyProjectiles.forEach(p => {
    p.update(dt);
    if (p.alive && p.hitMouse(mx, my, 18)) {
      p.alive = false;
      const result = applyDamageToPlayer(p.damage);
      particles.push(new DamageText(p.x, p.y - 10, `-${result.dmg}`, '#ff4444'));
      for (let i = 0; i < 6; i++) particles.push(new HitParticle(p.x, p.y, '#ff3333', '·'));
      comboPenalty();
      if (playerHP <= 0 && typeof handlePlayerDeath === 'function') {
        if (typeof Tutorial !== 'undefined' && Tutorial.phase && Tutorial.phase.toString().startsWith('tutorial_')) {
          playerHP = 30; updatePlayerUI();
          Dialogue.show({ mode:'shake', speaker:'零', text:'……你需要再来一次。集中精神！', speed:30 });
        } else {
          handlePlayerDeath();
        }
      }
    }
  });
  enemyProjectiles = enemyProjectiles.filter(p => p.alive);
}

/** 绘制普通敌人弹幕 */
function drawEnemyProjectiles(ctx) {
  enemyProjectiles.forEach(p => p.draw(ctx));
}

/** 更新敌人HP条 */
function updateEnemyUI() {
  document.getElementById('enemy-hp-fill').style.width=`${(enemyHP/enemyMaxHP)*100}%`;
}

/** 更新玩家HP条 */
function updatePlayerUI() {
  document.getElementById('player-hp-fill').style.width=`${(playerHP/playerMaxHP)*100}%`;
  if(playerHP<playerMaxHP*0.25) document.getElementById('player-hp-fill').classList.add('low');
  else document.getElementById('player-hp-fill').classList.remove('low');
  let info = `潜航者 · 意识完整度 ${Math.round(playerHP)}%`;
  if (playerDefense > 0) info += ` · 防${playerDefense}`;
  if (hasShield && shieldHP > 0) info += ` · 盾${Math.ceil(shieldHP)}`;
  if (typeof playerTalisman !== 'undefined' && playerTalisman) info += ` · ${playerTalisman.name}`;
  document.getElementById('player-info').textContent = info;
}

/** 动态平衡战场文字数量 */
function balanceWords() {
  // ═══ 统一守卫：非战斗区域不生成任何词元 ═══
  if (typeof mapActive !== 'undefined' && mapActive) return;
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom) {
    const t = currentDiveRoom.type;
    // 纯对话/休息区：静流、起点、安全屋、遗落装备
    if (t === 'rest' || t === 'start' || t === 'safe_house' || t === 'treasure') return;
    // 记忆涟漪(事件)：怪物已消灭或无怪物时不生成
    if (t === 'event') {
      if (typeof eventResolved === 'undefined' || !eventResolved) return; // 选项未出现
      if (typeof eventMonsterDefeated !== 'undefined' && eventMonsterDefeated) return; // 怪物已消灭
      if (typeof enemyHP !== 'undefined' && enemyHP <= 0 && typeof eventMonsterWaves !== 'undefined' && eventMonsterWaves <= 0) return;
    }
    // Boss房间：boss活跃时由boss.js控制，不活跃时不生成
    if (t === 'boss' && (typeof bossActive === 'undefined' || !bossActive)) return;
  }
  // 序章过渡期 / 结局
  if (typeof PROLOGUE !== 'undefined' && typeof prologuePhase !== 'undefined') {
    if (prologuePhase === PROLOGUE.PRE_DIVE || prologuePhase === PROLOGUE.END) return;
  }

  // Boss战中，攻击阶段不生成文字（玩家需点击暴露部件），其他阶段正常
  if(bossActive && bossState){
    if(bossState.phase === BOSS_PHASE.ENTRANCE || bossState.phase === BOSS_PHASE.ATTACK || bossState.phase === BOSS_PHASE.DEFEATED) return;
  }

  const diff=DIFFICULTY[difficulty];
  battleWords=battleWords.filter(bw=>bw.alive||bw.alpha>0.03); // 保留淡出中的字，避免突消失

  const atkCount = (typeof playerWeapon!=='undefined' && playerWeapon && playerWeapon.wordCount) ? playerWeapon.wordCount : 5;
  const defCount = (typeof playerArmor!=='undefined' && playerArmor && playerArmor.wordCount) ? playerArmor.wordCount : 2;
  const talismanCount = (typeof playerTalisman!=='undefined' && playerTalisman && playerTalisman.wordCount) ? playerTalisman.wordCount : 0;
  const targets={攻:atkCount,防:defCount,符:talismanCount};
  const current={攻:0,防:0,符:0};
  battleWords.forEach(bw=>{if(current[bw.cat]!==undefined) current[bw.cat]++;});

  // 渐进恢复：每个周期只补1个词，缓慢充盈
  const gradual = bossActive && bossState && bossState._gradualRestore > 0;
  let addedThisCall = 0;
  const maxPerCall = gradual ? 2 : 99;

  // 补字 — 使用装备词元池
  for(const cat of ['攻','防','符']){
    const cfg=getCatConfig(cat);
    if(!cfg) continue;
    while(current[cat]<targets[cat] && addedThisCall < maxPerCall){
      const text=cfg.words[Math.floor(Math.random()*cfg.words.length)];
      const bw=new BattleWord(cat,text);
      bw.vx*=diff.speed;bw.vy*=diff.speed;bw.wobbleAmp*=diff.speed;
      battleWords.push(bw);
      current[cat]++; addedThisCall++;
    }
  }

  // 技能字 — 只在战斗中、有技能装备时生成
  if(typeof playerSkill!=='undefined' && playerSkill && typeof skillState!=='undefined'){
    const skillCfg=getCatConfig('skill');
    if(skillCfg){
      const skillOnField=battleWords.filter(bw=>bw.alive&&bw.cat==='skill').length;
      // 序列型：只生成下一个需要的字
      if(playerSkill.type==='sequence' && skillOnField<1 && skillState && addedThisCall < maxPerCall){
        const nextIdx=skillState.collected.length;
        if(nextIdx<playerSkill.chars.length){
          const neededChar=playerSkill.chars[nextIdx];
          const sw=new BattleWord('skill',neededChar);
          sw.vx*=diff.speed;sw.vy*=diff.speed;sw.wobbleAmp*=diff.speed;
          sw.size=32+Math.random()*6;
          battleWords.push(sw); addedThisCall++;
        }
      }
      // 蓄力型：持续生成e/x
      if(playerSkill.type==='charge' && skillOnField<2 && skillState && addedThisCall < maxPerCall){
        const char=playerSkill.chars[Math.floor(Math.random()*playerSkill.chars.length)];
        const sw=new BattleWord('skill',char);
        sw.vx*=diff.speed;sw.vy*=diff.speed;sw.wobbleAmp*=diff.speed;
        sw.size=30+Math.random()*8;
        battleWords.push(sw); addedThisCall++;
      }
    }
  }

  // 干扰字（增强版：随威胁等级增加数量+追踪+伪装）
  const playerCount=battleWords.filter(bw=>bw.alive&&bw.cat!=='乱').length;
  const noiseBoost = Math.min(0.16, (threatLevel || 0) * 0.02);
  const noiseActualRate = Math.min(0.45, diff.noiseRate + noiseBoost);
  const noiseTarget=Math.min(8, Math.floor(playerCount*noiseActualRate)+1);
  const noiseCurrent=battleWords.filter(bw=>bw.alive&&bw.cat==='乱').length;

  if(noiseCurrent<noiseTarget && addedThisCall < maxPerCall){
    const tl = threatLevel || 0;
    // 伪装比例：威胁0~1→0%, 2~3→20%, 4~5→35%, 6~7→50%, 8+→65%
    const fakeRate = tl <= 1 ? 0 : tl <= 3 ? 0.20 : tl <= 5 ? 0.35 : tl <= 7 ? 0.50 : 0.65;
    let text, catColor, catGlow, isFake=false;

    if (Math.random() < fakeRate) {
      // 伪装字：随机选攻/防/符伪装
      const catRoll = Math.random();
      if (catRoll < 0.5) {
        text = NOISE_FAKE_ATTACK[Math.floor(Math.random()*NOISE_FAKE_ATTACK.length)];
        const cfg = getCatConfig('攻'); catColor = cfg ? cfg.color : '#ff6644'; catGlow = cfg ? cfg.glow : '#cc3311';
      } else if (catRoll < 0.8) {
        text = NOISE_FAKE_DEFENSE[Math.floor(Math.random()*NOISE_FAKE_DEFENSE.length)];
        const cfg = getCatConfig('防'); catColor = cfg ? cfg.color : '#66aaff'; catGlow = cfg ? cfg.glow : '#3366cc';
      } else {
        text = NOISE_FAKE_TALISMAN[Math.floor(Math.random()*NOISE_FAKE_TALISMAN.length)];
        catColor = '#44dd88'; catGlow = '#228844';
      }
      isFake = true;
    } else {
      text = NOISE_WORDS[Math.floor(Math.random()*NOISE_WORDS.length)];
    }

    const nw=new BattleWord('乱',text);
    nw._isFakeNoise = isFake;
    nw._noiseCatColor = isFake ? catColor : null;
    nw._noiseCatGlow = isFake ? catGlow : null;
    // 追踪强度：威胁0~1→0, 2~3→0.3, 4~5→0.5, 6~7→0.7, 8+→1.0
    nw._trackMouse = tl <= 1 ? 0 : tl <= 3 ? 0.3 : tl <= 5 ? 0.5 : tl <= 7 ? 0.7 : 1.0;
    nw.size = isFake ? (20+Math.random()*8) : (18+Math.random()*8);
    nw.alpha = isFake ? 0.72 : 0.55;
    nw.vx*=diff.speed;nw.vy*=diff.speed;nw.wobbleAmp*=diff.speed;
    nw.noiseLife=diff.noiseLife;
    battleWords.push(nw); addedThisCall++;
  }

  // 渐进恢复递减
  if (gradual && bossState._gradualRestore > 0) bossState._gradualRestore--;
}

function refreshWords() { balanceWords(); }

/** 更新连击颜色 */
function updateComboColors() {
  let clr='#ffffff';
  if(combo>=10) clr='#ff4400';
  else if(combo>=7) clr='#ffdd00';
  else if(combo>=5) clr='#ff88ff';
  else if(combo>=3) clr='#ffaa44';
  elComboCount.style.color=clr;
  if(combo>=3){
    elComboWords.textContent=comboWords.slice(-3).join('·'); elComboWords.style.color=clr;
  } else {
    elComboWords.textContent=''; elComboWords.style.color='#ffffff';
  }
}

/** 收集技能字 */
function collectSkillChar(bw) {
  if(!skillState) return;
  const cfg=getCatConfig('skill');
  if(!cfg) return;

  skillState.collected.push(bw.text);
  for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,cfg.color,bw.text));
  particles.push(new DamageText(bw.x,bw.y-8,'收集!',cfg.color));
  Sound.boost();
  bw.alive=false;bw.targetAlpha=0;

  // 更新技能UI
  updateSkillUI();

  // 序列型：检查是否全部收集完成
  if(playerSkill.type==='sequence'){
    const needed=playerSkill.chars.join('');
    const got=skillState.collected.join('');
    if(got===needed){
      triggerSkill();
    }
  }
  // 蓄力型：增加充能
  if(playerSkill.type==='charge'){
    skillState.chargeLevel=(skillState.chargeLevel||0)+1;
    updateSkillUI();
  }

  refreshWords();
}

/** 触发技能效果 */
function triggerSkill() {
  if(!playerSkill||!skillState) return;
  const cfg=getCatConfig('skill');

  if(playerSkill.effect==='nextAttackBoost'){
    nextAttackBoost=true;
    skillState.ready=true;
    for(let i=0;i<15;i++) particles.push(new HitParticle(W*0.5,H*0.5,cfg.color,'◆'));
    particles.push(new DamageText(W*0.5,H*0.45,'凝神·倍击!',cfg.color));
    Sound.boost();
  }
  if(playerSkill.effect==='freezeTimer'){
    enemyTimer=Math.min(enemyInterval,enemyTimer+playerSkill.freezeDuration);
    for(let i=0;i<20;i++) particles.push(new HitParticle(W*0.5,H*0.3,cfg.color,'❄'));
    particles.push(new DamageText(W*0.5,H*0.25,'时间暂停!',cfg.color));
    Sound.boost();
  }

  // 重置收集
  skillState.collected=[];
  updateSkillUI();
}

/** 释放蓄力技能（快捷键调用） */
function releaseChargedSkill() {
  if(!playerSkill||playerSkill.type!=='charge'||!skillState) return;
  const lv=skillState.chargeLevel||0;
  if(lv<=0) return;
  const cfg=getCatConfig('skill');
  const dmg=5+lv*3;
  dealDamage(dmg,true);
  for(let i=0;i<20;i++) particles.push(new HitParticle(W*0.5,H*0.3,cfg.color,'★'));
  particles.push(new DamageText(W*0.5,H*0.25,`EX·${lv}!`,cfg.color));
  Sound.comboMilestone(Math.min(lv,7));
  skillState.chargeLevel=0;
  skillState.collected=[];
  updateSkillUI();
}

/** 玩家死亡处理 */
function handlePlayerDeath() {
  // 阻止重复触发
  if (Tutorial.phase === PHASE.DEFEAT) return;

  // 战斗房间：直接重试当前房间
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'combat') {
    playerHP = playerMaxHP || 100;
    updatePlayerUI();
    enemyHP = enemyMaxHP = currentDiveRoom.enemyHP || 40;
    enemyTimer = enemyInterval = currentDiveRoom.enemyInterval || 6.0;
    updateEnemyUI();
    if (typeof balanceWords === 'function') balanceWords();
    shakeAmount = 12;
    Dialogue.show({ mode:'shake', speaker:'零', text:'集中精神！再来一次！', speed:30 });
    return;
  }

  Tutorial.enterPhase(PHASE.DEFEAT);

  // 清空战场
  battleWords.forEach(bw => { if (bw.alive) for (let i = 0; i < 8; i++) particles.push(new HitParticle(bw.x, bw.y, '#ff2222', bw.text)); });
  battleWords = [];

  // Boss战清理 — 立即清除bossActive防止残留渲染
  if (bossActive && bossState) {
    // 清理遗假撤退的挂起定时器，防止死亡后融合演出残留
    if (bossState._fusionTimers) { bossState._fusionTimers.forEach(clearTimeout); bossState._fusionTimers = null; }
    bossProjectiles.forEach(p => { for (let i = 0; i < 4; i++) particles.push(new HitParticle(p.x, p.y, '#ff3333', '·')); });
    bossProjectiles = [];
    bossState._gravityActive = false;
    bossState._heartLock = null;
    bossState._afterimages = []; bossState._burstBombs = [];
    // 立即清除boss状态（粒子已生成，不再需要DEFEATED动画）
    bossActive = false; bossState = null;
  }

  // 强烈震动
  shakeAmount = 22;

  // 红色粒子爆发
  const cx = W * 0.5, cy = H * 0.5;
  for (let i = 0; i < 60; i++) {
    const p = new HitParticle(cx + (Math.random() - 0.5) * 200, cy + (Math.random() - 0.5) * 300, '#ff3322', '×');
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = (Math.random() - 0.5) * 6 - 2;
    p.size = 4 + Math.random() * 14;
    p.life = 40 + Math.random() * 60;
    p.gravity = 0.04;
    particles.push(p);
  }

  Sound.defeat();

  // 延迟显示战败画面
  setTimeout(() => {
    if (typeof showDefeat === 'function') showDefeat();
  }, 1200);
}

/** 遗的剧情杀：零牺牲 → 瞬移至安全屋 */
function triggerYiSacrifice() {
  Tutorial.enterPhase(PHASE.DEFEAT);

  // 清除Boss战场 — 立即清除状态防止残留，粒子留存做视觉演出
  if (bossActive && bossState) {
    // 清理遗假撤退的挂起定时器
    if (bossState._fusionTimers) { bossState._fusionTimers.forEach(clearTimeout); bossState._fusionTimers = null; }
    bossProjectiles.forEach(p => { for (let i = 0; i < 3; i++) particles.push(new HitParticle(p.x, p.y, '#aaeeff', '·')); });
    bossProjectiles = [];
    bossState._gravityActive = false;
    bossState._heartLock = null;
    bossState._afterimages = []; bossState._burstBombs = [];
    bossActive = false; bossState = null;
  }
  battleWords = [];

  const cx = W * 0.5, cy = H * 0.5;

  // 白色冲击波 — 零的能量爆发
  shakeAmount = 45;
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const spd = 2 + Math.random() * 12;
    const p = new HitParticle(cx, cy, '#aaccff', '·');
    p.vx = Math.cos(a) * spd;
    p.vy = Math.sin(a) * spd;
    p.size = 4 + Math.random() * 18;
    p.life = 40 + Math.random() * 80;
    p.gravity = 0.02;
    particles.push(p);
  }

  // 零的粒子形体爆散
  for (let i = 0; i < 40; i++) {
    const p = new HitParticle(cx + (Math.random()-0.5)*100, cy + (Math.random()-0.5)*100, '#88bbee', '零');
    p.vx = (Math.random()-0.5)*4;
    p.vy = (Math.random()-0.5)*4;
    p.size = 8 + Math.random() * 20;
    p.life = 50 + Math.random() * 70;
    particles.push(p);
  }

  Sound.anomaly();

  // 闪白 → 对话 → 传送
  document.getElementById('stun-overlay').classList.add('active');
  setTimeout(() => {
    document.getElementById('stun-overlay').classList.remove('active');
    Dialogue.show({
      mode:'shake', speaker:'零',
      text:'我不会让你死在这里。绝对不会！！',
      speed:35, locked:false
    });
  }, 600);

  // 2.5秒后进入安全屋
  setTimeout(() => {
    Dialogue.hide();
    document.getElementById('stun-overlay').classList.remove('active');
    if (typeof returnToMap === 'function') {
      // 用真实房间id（肉鸽动态id如boss_0），硬编码'boss_yi'会导致boss房完成不了、肉鸽卡住
      const id = (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.id) || 'boss_yi';
      returnToMap(id);
    }
  }, 3000);
}

/** 更新技能收集UI */
function updateSkillUI() {
  const el=document.getElementById('skill-display');
  if(!el||!playerSkill||!skillState) return;
  // 只在战斗或教程阶段显示
  const ph=Tutorial.phase;
  const show=(ph===PHASE.BATTLE||(typeof ph==='string'&&ph.startsWith('tutorial_')));
  if(!show){ el.style.opacity='0'; return; }

  if(playerSkill.type==='sequence'){
    const needed=playerSkill.chars;
    const got=skillState.collected;
    let html='';
    for(let i=0;i<needed.length;i++){
      const collected=i<got.length;
      html+=`<span style="color:${collected?playerSkill.color:'rgba(255,255,255,0.15)'};font-size:20px;margin:0 2px;">${needed[i]}</span>`;
    }
    el.innerHTML=html;
    el.style.opacity='1';
  }
  if(playerSkill.type==='charge'){
    const lv=skillState.chargeLevel||0;
    el.innerHTML=`<span style="color:${playerSkill.color};font-size:16px;">EX充能: ${lv}</span>`;
    el.style.opacity='1';
  }
}

/** 战斗中点击文字的处理 */
function handleBattleClick(bw) {
  // 技能字
  if(bw.cat==='skill'){
    collectSkillChar(bw);
    return;
  }

  if(bw.cat==='攻'){
    // 无敌敌人（残响之影等）→ 攻击无效
    if (enemyHP === -1) {
      particles.push(new DamageText(bw.x,bw.y-8,'无效','#888888'));
      for(let i=0;i<4;i++) particles.push(new HitParticle(bw.x,bw.y,'#998899','◇'));
      bw.alive=false;bw.targetAlpha=0;
      Sound.stun();
      refreshWords();
      return;
    }
    // 敌人已死 → 不再造成伤害，避免"空血条还要补刀"
    if (enemyHP <= 0 && !bossActive) {
      particles.push(new DamageText(bw.x,bw.y-8,'已消灭','#888888'));
      bw.alive=false;bw.targetAlpha=0;
      refreshWords();
      return;
    }
    const bonus=combo>=10?2.5:combo>=7?2.0:combo>=5?1.5:combo>=3?1.2:1;
    const boostMult=nextAttackBoost?2:1;
    const baseDmg=playerWeapon?playerWeapon.damage:10;
    const dmg=Math.floor((baseDmg+Math.random()*3)*bonus*boostMult);

    // Boss战：攻击判定（蓄力期0.8x / 暴露期1.5x / 其他无效）
    if(bossActive && typeof hitBossPart==='function'){
      const hit = hitBossPart(mx, my);
      if(hit || (bossState && bossState.phase===BOSS_PHASE.VULNERABLE)){
        // 命中才消耗凝神倍击（无效点击不吞）
        if(nextAttackBoost){nextAttackBoost=false;skillState.ready=false;particles.push(new DamageText(bw.x,bw.y-14,'倍击!','#ffaa44'));}
        const mult = hit ? hit.multiplier : 1.5;
        Sound.attack();
        damageBoss(dmg, mult);

        // Boss战连击数
        if([3,5,7,10].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
        combo++;comboTimer=2.0;comboWords.push(bw.text);
        if(comboWords.length>5) comboWords.shift();
        elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
        applyWeaponEffects();
      } else {
        // 非蓄力/暴露期点击无效
        particles.push(new DamageText(bw.x,bw.y-8,'无效','#888888'));
        for(let i=0;i<3;i++) particles.push(new HitParticle(bw.x,bw.y,'#888888','×'));
      }
      bw.alive=false;bw.targetAlpha=0;
      refreshWords();
      return;
    }
    // 普通敌人（走到这里必命中，消耗凝神倍击）
    if(nextAttackBoost){nextAttackBoost=false;skillState.ready=false;particles.push(new DamageText(bw.x,bw.y-14,'倍击!','#ffaa44'));}
    dealDamage(dmg,combo>=3);

    if([3,5,7,10].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
    combo++;comboTimer=2.0;comboWords.push(bw.text);
    if(comboWords.length>5) comboWords.shift();
    elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
    applyWeaponEffects();
    const cfg=getCatConfig('攻');
    for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#ff6644',bw.text));
    bw.alive=false;bw.targetAlpha=0;
    refreshWords();
    return;
  }
  if(bw.cat==='防'){
    const perWord = playerArmor&&playerArmor.shieldPerWord ? playerArmor.shieldPerWord : 2;
    const maxShield = playerArmor&&playerArmor.maxShield ? playerArmor.maxShield : 10;
    const oldShield = hasShield ? shieldHP : 0;
    shieldHP = Math.min(oldShield + perWord, maxShield);
    hasShield = true;
    updatePlayerUI();Sound.defense();
    comboPenalty();
    const cfg=getCatConfig('防');
    for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#66aaff','□'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${shieldHP - oldShield}盾`,cfg?cfg.color:'#66aaff'));
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='符'){
    const t = typeof playerTalisman!=='undefined' ? playerTalisman : null;
    if(!t){ bw.alive=false; bw.targetAlpha=0; refreshWords(); return; }
    const healAmt = t.healMin + Math.floor(Math.random()*(t.healMax - t.healMin + 1));
    playerHP=Math.min(playerMaxHP,playerHP+healAmt);updatePlayerUI();Sound.heal();
    for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,t.color,'+'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${healAmt}`,t.color));
    // 护身符：额外附加护盾
    if(t.shieldOnHeal){
      const maxShield = (typeof playerArmor!=='undefined' && playerArmor && playerArmor.maxShield) ? playerArmor.maxShield : 15;
      const added = t.shieldOnHeal;
      shieldHP = Math.min(maxShield, (hasShield ? shieldHP : 0) + added);
      hasShield = true;
      updatePlayerUI();
    }
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='乱'){
    Sound.noise();Sound.stun();
    const tl = threatLevel || 0;
    // 惩罚随威胁升级：低威胁→轻, 高威胁→重
    const flashDur = tl <= 2 ? 500 : tl <= 5 ? 400 : 300;
    const comboLoss = tl <= 2 ? 2 : tl <= 5 ? 3 : 99; // 99 = full reset
    const hpLoss = tl <= 2 ? 0 : tl <= 5 ? (1+Math.floor(Math.random()*2)) : (2+Math.floor(Math.random()*3));

    document.getElementById('stun-overlay').classList.add('active');
    setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'), flashDur);

    if (comboLoss >= 99) { combo = 0; comboTimer = 0; comboWords = []; elComboDisplay.classList.remove('show'); }
    else comboPenalty(comboLoss);

    if (hpLoss > 0) {
      playerHP = Math.max(0, playerHP - hpLoss);
      updatePlayerUI();
      particles.push(new DamageText(bw.x, bw.y - 10, `-${hpLoss}`, '#ff4444'));
    }

    const label = bw._isFakeNoise ? '伪装!' : '混乱';
    particles.push(new DamageText(bw.x,bw.y,label,'#ff4444'));
    for(let i=0;i<5;i++) particles.push(new HitParticle(bw.x,bw.y,'#ff4444','×'));
    bw.alive=false;bw.targetAlpha=0;
    return;
  }
}

/** 应用威胁等级修正到战斗数值 */
function applyThreatModifiers(baseStats) {
  const t = threatLevel || 0;
  const dl = difficulty || 1;
  const diff = DIFFICULTY[dl];
  return {
    enemyHP:       Math.floor((baseStats.enemyHP || diff.enemyHP) * (1 + t * 0.06)),
    enemyDmg:      [
      Math.floor((baseStats.enemyDmg ? baseStats.enemyDmg[0] : diff.enemyDmg[0]) * (1 + t * 0.05)),
      Math.floor((baseStats.enemyDmg ? baseStats.enemyDmg[1] : diff.enemyDmg[1]) * (1 + t * 0.05))
    ],
    enemyInterval: Math.max(2.5, (baseStats.enemyInterval || diff.enemyInterval) * (1 - t * 0.03)),
    noiseRate:     Math.min(0.45, (baseStats.noiseRate || diff.noiseRate) + t * 0.02),
    speed:         (baseStats.speed || diff.speed) + t * 0.06,
  };
}
