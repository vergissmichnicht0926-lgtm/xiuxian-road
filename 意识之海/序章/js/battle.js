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
let playerHP=100, playerMaxHP=100;
let hasShield=false, shieldHP=0;
let playerDefense=0; // 当前防具减伤值
let playerHurtTimer=0; // 玩家血条受击抖动
let nextAttackBoost=false;
let combo=0, comboTimer=0, comboWords=[];

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
  if (cat==='愈') return WORD_LIBRARY['愈'];
  // 技能字 — 由技能配置提供
  if (cat==='skill' && typeof playerSkill!=='undefined' && playerSkill) {
    return { words:playerSkill.chars, color:playerSkill.color, glow:playerSkill.glow };
  }
  return null;
}

/** 刷新敌人实体（根据难度/房间类型） */
function spawnEnemyEntity(hardMode) {
  const chars = hardMode
    ? ['恨','悔','惜','怅']
    : ['敌','噪','乱','扰','侵'];
  enemyEntity = {
    x: W*0.5, y: H*0.26,
    char: chars[Math.floor(Math.random()*chars.length)],
    color: hardMode ? '#dd9988' : '#cc8866',
    glow: hardMode ? '#994433' : '#884422',
    size: hardMode ? 56 : 44,
    phase: Math.random()*Math.PI*2,
    hurtFlash: 0,
    wobbleX: 0, wobbleY: 0,
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

/** 敌人攻击 */
function enemyAttack() {
  if(Tutorial.phase!==PHASE.BATTLE) return;

  // 闪避判定（独立于防御/护盾，完全避开）
  if(playerArmor && playerArmor.dodgeChance && Math.random()<playerArmor.dodgeChance){
    Sound.shieldBlock();
    particles.push(new DamageText(W*0.5,H*0.65,'闪避!','#88ccff'));
    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.7,'#88ccff','◇'));
    combo=0;comboTimer=0;comboWords=[];elComboDisplay.classList.remove('show');
    enemyTimer=enemyInterval;
    return;
  }

  const diff=DIFFICULTY[difficulty];
  let rawDmg=diff.enemyDmg[0]+Math.floor(Math.random()*(diff.enemyDmg[1]-diff.enemyDmg[0]));
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
  combo=0;comboTimer=0;comboWords=[];elComboDisplay.classList.remove('show');

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
  battleWords=battleWords.filter(bw=>bw.alive);

  const atkCount = (typeof playerWeapon!=='undefined' && playerWeapon && playerWeapon.wordCount) ? playerWeapon.wordCount : 5;
  const defCount = (typeof playerArmor!=='undefined' && playerArmor && playerArmor.wordCount) ? playerArmor.wordCount : 2;
  const targets={攻:atkCount,防:defCount,愈:2};
  const current={攻:0,防:0,愈:0};
  battleWords.forEach(bw=>{if(current[bw.cat]!==undefined) current[bw.cat]++;});

  // 渐进恢复：每个周期只补1个词，缓慢充盈
  const gradual = bossActive && bossState && bossState._gradualRestore > 0;
  let addedThisCall = 0;
  const maxPerCall = gradual ? 2 : 99;

  // 补字 — 使用装备词元池
  for(const cat of ['攻','防','愈']){
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

  // 干扰字
  const playerCount=battleWords.filter(bw=>bw.alive&&bw.cat!=='乱').length;
  const noiseTarget=Math.min(6,Math.floor(playerCount*diff.noiseRate)+1);
  const noiseCurrent=battleWords.filter(bw=>bw.alive&&bw.cat==='乱').length;

  if(noiseCurrent<noiseTarget && addedThisCall < maxPerCall){
    const text=NOISE_WORDS[Math.floor(Math.random()*NOISE_WORDS.length)];
    const nw=new BattleWord('乱',text);
    nw.size=18+Math.random()*8;nw.alpha=0.55;
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
  if(combo>=7) clr='#ffdd00';
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
      returnToMap('boss_yi');
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
    const bonus=combo>=7?3:combo>=5?2:combo>=3?1.5:1;
    const boostMult=nextAttackBoost?2:1;
    if(nextAttackBoost){nextAttackBoost=false;skillState.ready=false;particles.push(new DamageText(bw.x,bw.y-14,'倍击!','#ffaa44'));}
    const baseDmg=playerWeapon?playerWeapon.damage:10;
    const dmg=Math.floor((baseDmg+Math.random()*6)*bonus*boostMult);

    // Boss战：攻击判定（蓄力期0.8x / 暴露期1.5x / 其他无效）
    if(bossActive && typeof hitBossPart==='function'){
      const hit = hitBossPart(mx, my);
      if(hit || (bossState && bossState.phase===BOSS_PHASE.VULNERABLE)){
        const mult = hit ? hit.multiplier : 1.5;
        Sound.attack();
        damageBoss(dmg, mult);

        // Boss战连击数
        if([3,5,7].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
        combo++;comboTimer=1.5;comboWords.push(bw.text);
        if(comboWords.length>5) comboWords.shift();
        elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
      } else {
        // 非蓄力/暴露期点击无效
        particles.push(new DamageText(bw.x,bw.y-8,'无效','#888888'));
        for(let i=0;i<3;i++) particles.push(new HitParticle(bw.x,bw.y,'#888888','×'));
      }
      bw.alive=false;bw.targetAlpha=0;
      refreshWords();
      return;
    }
    // 普通敌人
    dealDamage(dmg,combo>=3);

    if([3,5,7].includes(combo+1)) Sound.comboMilestone(combo+1); else Sound.attack();
    combo++;comboTimer=1.5;comboWords.push(bw.text);
    if(comboWords.length>5) comboWords.shift();
    elComboDisplay.classList.add('show');elComboCount.textContent=`×${combo}`;updateComboColors();
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
    combo=0;comboTimer=0;comboWords=[];elComboDisplay.classList.remove('show');
    const cfg=getCatConfig('防');
    for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#66aaff','□'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${shieldHP - oldShield}盾`,cfg?cfg.color:'#66aaff'));
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='愈'){
    const healAmt=2+Math.floor(Math.random()*2);
    playerHP=Math.min(100,playerHP+healAmt);updatePlayerUI();Sound.heal();
    for(let i=0;i<6;i++) particles.push(new HitParticle(bw.x,bw.y,'#44dd88','+'));
    particles.push(new DamageText(bw.x,bw.y-8,`+${healAmt}`,'#44dd88'));
    bw.alive=false;bw.targetAlpha=0;refreshWords();
    return;
  }
  if(bw.cat==='乱'){
    Sound.noise();Sound.stun();
    document.getElementById('stun-overlay').classList.add('active');
    setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'),650);
    combo=0;comboTimer=0;comboWords=[];elComboDisplay.classList.remove('show');
    particles.push(new DamageText(bw.x,bw.y,'混乱','#ff4444'));
    for(let i=0;i<5;i++) particles.push(new HitParticle(bw.x,bw.y,'#ff4444','×'));
    bw.alive=false;bw.targetAlpha=0;
    return;
  }
}
