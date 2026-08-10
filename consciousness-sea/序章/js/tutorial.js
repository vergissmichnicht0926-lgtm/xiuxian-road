/* ═══════════════════ §F 教程状态机 v2 ═══════════════════
 *
 * 依赖：config.js (PHASE, DIFFICULTY, WORD_LIBRARY, NOISE_WORDS, EQUIPMENT)
 *       sound.js (Sound)
 *       particles.js (BattleWord, HitParticle, DamageText)
 *       dialogue.js (Dialogue)
 *       cinematic.js (Cinematic)
 *       battle.js (enemyHP, enemyMaxHP, enemyInterval, playerHP, playerMaxHP,
 *                  updatePlayerUI, updateEnemyUI, battleWords, balanceWords,
 *                  particles, shakeAmount, getCatConfig, refreshWords,
 *                  playerWeapon, playerArmor, playerSkill, skillState, updateSkillUI)
 */

const Tutorial = {
  phase: PHASE.INIT,
  timer: 0,
  progress: 0,
  progressTarget: 0,
  dialogueQueue: [],
  dialogueIdx: 0,
  _phaseConfig: null,
  affection: 0,  // 隐藏好感度，贯穿整章，只影响结局

  /** 进入指定阶段 */
  enterPhase(phase) {
    this.phase = phase;
    this.timer = 0;
    this.progress = 0;
    this.dialogueIdx = 0;
    this.dialogueQueue = [];
    this._phaseConfig = null;
    this._phaseComplete = false;
    this._noiseResolved = false;
    this._hookResolved = false;
    this._hanEntranceReady = false;
    this._introPlayed = false;
    this._mentorFlicker = false;
    this.driftTexts = [];
    this._driftActive = false;
    this._driftSettled = false;
    this._driftSelected = false;
    this._driftTimer = 0;
    // 注意：affection 不在 enterPhase 中重置 — 它贯穿整个章节

    const hint = document.getElementById('stage-hint');
    const enemyZone = document.getElementById('enemy-zone');
    const playerZone = document.getElementById('player-zone');

    switch(phase) {

      case PHASE.EYE_OPEN:
        hint.textContent = ''; hint.style.opacity='0';
        enemyZone.style.opacity='0'; playerZone.style.opacity='0';
        Cinematic.startEyeOpen();
        break;

      case PHASE.MEET_MENTOR:
        hint.textContent = ''; hint.style.opacity='0';
        this.dialogueQueue = [
          { mode:'whisper', text:'…………', speed:150 },
          { mode:'float', speaker:'零', text:'……终于醒了。', speed:80 },
          { mode:'float', speaker:'零', text:'能听到我吗？我是零。你的引导者。欢迎来到意识之海。', speed:40 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.MEMORY_LOSS:
        this.dialogueQueue = [
          { mode:'drift', options: [
            { text:'我是谁……', affection: 0 },
            { text:'我为什么在这？', affection: 0 },
          ]},
          { mode:'float', speaker:'零', text:'你不记得了。这很正常。第一次深度潜航会暂时破坏记忆索引，正常的副作用。', speed:35 },
          { mode:'float', speaker:'零', text:'闲话到此为止。有噪点正在靠近。我先教你怎么活下来。', speed:30 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_ATTACK:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'红色是攻击词元。你的武器决定你能驾驭哪些攻字。集中精神，击碎它。', speed:35 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_SHIELD:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'蓝色是防御词元。和防具绑定，能完全抵挡攻击。试试看。', speed:35 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_HEAL:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        playerHP = 62;
        updatePlayerUI();
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'绿色的字是符字——由你装备的护符生成。触碰它就能恢复意识完整度。', speed:30 },
          { mode:'float', speaker:'零', text:'你身上有一枚「回春符」。每次触碰符字回复4~7点意识。不同护符的回复量和频率都不一样。', speed:28 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_SKILL:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        this._phaseComplete = false;
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'那些琥珀色的字……是你装备的技能符文。「卍解」——按顺序收集「卍」和「解」，就能触发倍击。', speed:30 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_NOISE:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        this._phaseComplete = false;
        this.dialogueQueue = [
          { mode:'shake', speaker:'零', text:'躲开那些灰字！那是噪点伪装的污染信息，碰一下你的意识就会短路。', speed:28 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.TUTORIAL_BACKPACK:
        hint.textContent = ''; hint.style.opacity='0';
        this._introPlayed = false;
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'右下角的「囊」字……打开它。那是你的意识行囊。武器、防具、技能、护符都在里面。', speed:30 },
          { mode:'float', speaker:'零', text:'记得看看那枚回春符——潜航中它就是你的生命线。', speed:32 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.PRE_BATTLE:
        hint.textContent = ''; hint.style.opacity='0';
        enemyZone.style.opacity='1'; playerZone.style.opacity='1';
        const diff = DIFFICULTY[difficulty];
        enemyHP = enemyMaxHP = diff.enemyHP;
        enemyInterval = diff.enemyInterval;
        playerHP = playerMaxHP = 100;
        updatePlayerUI();
        updateEnemyUI();
        // 重置技能状态
        if(skillState){ skillState.collected=[]; skillState.chargeLevel=0; skillState.ready=false; }
        updateSkillUI();
        document.getElementById('enemy-name').textContent = '残响碎片';
        document.getElementById('enemy-timer-fill').style.width = '100%';
        document.getElementById('enemy-timer-fill').classList.remove('urgent');
        if (typeof spawnEnemyEntity === 'function') spawnEnemyEntity(false);
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'你的第一个猎物。我在后面看着。', speed:40 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.BATTLE:
        hint.textContent = ''; hint.style.opacity='0';
        document.getElementById('d-continue').style.opacity = '0';
        battleWords = []; balanceWords();
        enemyTimer = enemyInterval;
        this._phaseConfig = { spawnTimer: 0 };
        break;

      case PHASE.VICTORY:
        hint.textContent = ''; hint.style.opacity='0';
        document.getElementById('enemy-zone').style.opacity='0';
        battleWords = [];
        Sound.victory();
        for(let i=0;i<60;i++) particles.push(new HitParticle(W*0.5,H*0.25,'#88ffcc','·'));
        this.dialogueQueue = [
          { mode:'float', speaker:'零', text:'干得漂亮。', speed:55 },
          { mode:'whisper', text:'…………', speed:200 },
          { mode:'plain', text:'（零的声音很轻。像是自言自语，又像是对着某个不在场的人说的。）', speed:40 },
        ];
        this._playNextDialogue();
        break;

      case PHASE.HOOK:
        // 深渊震动 + 电子低鸣
        Cinematic.triggerGlitch(1.5, 0.8);
        Sound.anomaly();
        shakeAmount = 10;

        // 零的形体紊乱 — 周期性闪烁
        this._mentorFlicker = true;
        this._mentorFlickerTimer = 0;

        this.dialogueQueue = [
          { mode:'whisper', text:'（意识之海深处传来令人毛骨悚然的电子低鸣……）', speed:50 },
          { mode:'plain', text:'那是什么？！', speed:30 },
          { mode:'tremble', speaker:'零', text:'这波形……不可能……', speed:22 },
          { mode:'whisper', text:'（零的形体出现了剧烈的紊乱。她死死盯着深渊的方向，沉默了数秒。）', speed:45 },
          { mode:'float', speaker:'零', text:'……只是深海的乱流。', speed:55 },
          { mode:'float', speaker:'零', text:'这里比你想象的要深得多。别去管它。', speed:38 },
          { mode:'plain', text:'你在怕什么？下面的那个东西。', speed:35 },
          { mode:'whisper', text:'（零没有回答。她的粒子停止了明灭，时间仿佛凝固。）', speed:50 },
          { mode:'float', speaker:'零', text:'太久了。久到我已经懒得记日子。', speed:50 },
          { mode:'float', speaker:'零', text:'别用那种眼神看我，菜鸟。我们还有很多噪点要清理。', speed:35 },
          { mode:'drift', options: [
            { text:'那怎么办？', affection: 0 },
            { text:'别怕，让我来。', affection: 1 },
          ]},
        ];
        this._playNextDialogue();
        break;

      case PHASE.DEFEAT:
        // 战败 — handlePlayerDeath() 中设置，不做额外操作
        // 防止战斗逻辑继续运行
        hint.textContent = ''; hint.style.opacity = '0';
        document.getElementById('enemy-zone').style.opacity = '0';
        document.getElementById('combo-display').classList.remove('show');
        document.getElementById('skill-display').style.opacity = '0';
        break;

      case PHASE.END:
        showEnding();
        break;
    }
  },

  /** 播放对话队列中的下一句 */
  _playNextDialogue() {
    if(this.dialogueIdx >= this.dialogueQueue.length) {
      Dialogue.hide();
      this._onDialogueEnd();
      return;
    }
    const d = this.dialogueQueue[this.dialogueIdx];
    this.dialogueIdx++;

    // 飘浮选择模式 — 主角选择肢，点击即选
    if(d.mode === 'drift') {
      Dialogue.hide();
      this._showDrift(d.options || d.fragments || [d.text || '']);
      return;
    }

    Dialogue.show({
      mode: d.mode || 'float',
      speaker: d.speaker || '',
      text: d.text,
      speed: d.speed || 40,
    });
  },

  /** 显示主角选择肢 — 飘浮的可点击选项
   *  @param options [{text, affection}] text=显示文字, affection=选中后好感度变化
   */
  _showDrift(options) {
    this.driftTexts = [];
    this._driftActive = true;
    this._driftSettled = false;
    this._driftTimer = 0;
    this._driftSelected = false;

    const cx = W * 0.5;
    const cy = H * 0.55;

    // 支持简单字符串数组（无好感度）或完整对象数组
    const opts = options.map((o, i) => {
      if (typeof o === 'string') return { text: o, affection: 0 };
      return o;
    });

    opts.forEach((opt, i) => {
      const dt = new DriftTextParticle(cx, cy, opt.text, i, opts.length, opt.affection || 0);
      this.driftTexts.push(dt);
    });
  },

  /** 选中某个选择肢 */
  _selectDrift(dt) {
    if (this._driftSelected) return;
    this._driftSelected = true;

    // 应用好感度变化
    if (dt.affection && dt.affection !== 0) {
      this.affection = (this.affection || 0) + dt.affection;
    }

    // 选中项高亮，其余淡出
    dt.selected = true;
    this.driftTexts.forEach(d => { if (d !== dt) d.fading = true; });

    // 短暂展示选中的文字后推进对话
    document.getElementById('d-continue').style.opacity = '0';
    setTimeout(() => {
      this._clearDrift();
      document.getElementById('d-continue').style.opacity = '0';
      this._playNextDialogue();
    }, 900);
  },

  /** 清除飘浮文字 */
  _clearDrift() {
    if (!this._driftActive) return;
    this._driftActive = false;
    this.driftTexts.forEach(dt => { dt.fading = true; });
    const c = document.getElementById('d-continue');
    c.textContent = '点击继续';
    c.style.opacity = '0';
    setTimeout(() => { this.driftTexts = []; }, 1200);
  },

  /** 对话队列播完后决定下一步 */
  _onDialogueEnd() {
    // Boss登场对话序列结束 → 开战
    if (this._hanEntranceReady) {
      this._hanEntranceReady = false;
      this.enterPhase(PHASE.BATTLE);
      if (typeof prologuePhase !== 'undefined') prologuePhase = 1;
      if (typeof prologueHanDefeated !== 'undefined') prologueHanDefeated = false;
      if (typeof wasBossActive !== 'undefined') wasBossActive = false;
      const hint = document.getElementById('stage-hint');
      if (hint) { hint.style.opacity = '1'; hint.textContent = '憾 · 深海的回响'; }
      if (typeof initBoss === 'function') initBoss('regret');
      return;
    }
    switch(this.phase) {
      case PHASE.MEET_MENTOR:
        Cinematic.startTransition('out', 0.6, ()=>{
          mentor.targetAlpha = 1;
          Cinematic.startTransition('in', 0.8);
        });
        setTimeout(()=>this.enterPhase(PHASE.MEMORY_LOSS), 2000);
        break;
      case PHASE.MEMORY_LOSS:
        this.enterPhase(PHASE.TUTORIAL_ATTACK);
        break;
      case PHASE.PRE_BATTLE:
        this.enterPhase(PHASE.BATTLE);
        break;
      case PHASE.VICTORY:
        setTimeout(()=>this.enterPhase(PHASE.HOOK), 1200);
        break;
      case PHASE.HOOK:
        this._mentorFlicker = false;
        mentor.targetAlpha = 0;
        // 防止重复触发
        if (this._hookResolved) break;
        this._hookResolved = true;
        // Boss憾登场前对话 → 推入Tutorial自带队列（利用_playNextDialogue点击推进）
        this.dialogueQueue = [
          { mode:'tremble', speaker:'零', text:'深海的噪点正在凝聚——它在回应那个信号。', speed:35 },
          { mode:'plain', text:'（前方的黑暗中，两个巨大的汉字部件缓缓浮现——忄与感，猩红如火。）', speed:40 },
          { mode:'shake', speaker:'零', text:'是「憾」！它被那道信号吸引过来了——准备战斗！', speed:35 },
          { mode:'float', speaker:'零', text:'憾是执念凝聚的噪点。它不会停下，直到吞噬一切。别留手。', speed:35 },
        ];
        this.dialogueIdx = 0;
        this._playNextDialogue();
        // 对话结束后 → 开战（覆盖默认的 _onDialogueEnd）
        this._hanEntranceReady = true;
        break;
      // 教程阶段完成 → 下一阶段
      case PHASE.TUTORIAL_ATTACK:
        if (!this._introPlayed) {
          this._introPlayed = true;
          const hint = document.getElementById('stage-hint');
          hint.textContent = '触碰红色的「攻」字';
          hint.style.opacity = '0.7';
          this.progressTarget = 3;
          this._spawnTutorialWords(['攻'], 5, 0.4);
        } else {
          this.enterPhase(PHASE.TUTORIAL_SHIELD);
        }
        break;
      case PHASE.TUTORIAL_SHIELD:
        if (!this._introPlayed) {
          this._introPlayed = true;
          const hint = document.getElementById('stage-hint');
          hint.textContent = '触碰蓝色的「防」字获得护盾';
          hint.style.opacity = '0.7';
          this.progressTarget = 2;
          this._spawnTutorialWords(['防'], 4, 0.5);
          for(let i=0;i<3;i++) this._addTutorialWord('攻');
        } else {
          this.enterPhase(PHASE.TUTORIAL_HEAL);
        }
        break;
      case PHASE.TUTORIAL_HEAL:
        if (!this._introPlayed) {
          this._introPlayed = true;
          const hint = document.getElementById('stage-hint');
          hint.textContent = '触碰绿色的「符」字恢复意识';
          hint.style.opacity = '0.7';
          this.progressTarget = 2;
          this._spawnTutorialWords(['符'], 4, 0.5);
          for(let i=0;i<2;i++) this._addTutorialWord('攻');
          for(let i=0;i<2;i++) this._addTutorialWord('防');
        } else {
          this.enterPhase(PHASE.TUTORIAL_SKILL);
        }
        break;
      case PHASE.TUTORIAL_SKILL:
        if (!this._introPlayed) {
          this._introPlayed = true;
          const hint = document.getElementById('stage-hint');
          hint.textContent = '按顺序收集技能字：卍 → 解';
          hint.style.opacity = '0.7';
          this.progressTarget = 1; // 完成一次技能触发
          battleWords = [];
          // 生成琥珀色技能字
          this._spawnSkillChar('卍');
          for(let i=0;i<3;i++) this._addTutorialWord('攻');
        } else {
          this.enterPhase(PHASE.TUTORIAL_NOISE);
        }
        break;
      case PHASE.TUTORIAL_NOISE:
        if (!this._introPlayed) {
          this._introPlayed = true;
          const hint = document.getElementById('stage-hint');
          hint.textContent = '避开灰色的干扰字！';
          hint.style.opacity = '0.7';
          this.progressTarget = 6;
          this.timer = 0;
          battleWords = [];
          for(let i=0;i<3;i++) this._addTutorialWord('攻');
          for(let i=0;i<2;i++) this._addTutorialWord('防');
          for(let i=0;i<2;i++) this._addTutorialWord('符');
          for(let i=0;i<4;i++) this._addTutorialNoiseWord();
        } else if (this._noiseResolved) {
          this.enterPhase(PHASE.TUTORIAL_BACKPACK);
        } else {
          const hint = document.getElementById('stage-hint');
          hint.textContent = '避开灰色的干扰字！';
          hint.style.opacity = '0.7';
        }
        break;
      case PHASE.TUTORIAL_BACKPACK:
        if (!this._introPlayed) {
          // 等对话结束再显示提示
          if (!Dialogue.active) {
            this._introPlayed = true;
            const hint = document.getElementById('stage-hint');
            hint.textContent = '按Tab或点击「囊」字打开背包 · 点击装备查看详情';
            hint.style.opacity = '0.7';
            this.progressTarget = 1;
          }
        }
        // 不自动推进 — 由 toggleBackpack() 检测后触发 enterPhase(PRE_BATTLE)
        break;
    }
  },

  /** 每帧更新 */
  update(dt) {
    this.timer += dt;

    // HOOK阶段：零形体紊乱闪烁
    if(this.phase === PHASE.HOOK && this._mentorFlicker) {
      this._mentorFlickerTimer += dt;
      const f = Math.sin(this._mentorFlickerTimer * 8) * 0.5 + 0.5;
      mentor.targetAlpha = 0.2 + f * 0.8;
      if(Math.random() < 0.15) {
        shakeAmount = Math.max(shakeAmount, 2 + Math.random() * 4);
      }
    }

    // 噪音阶段倒计时
    if(this.phase === PHASE.TUTORIAL_NOISE && this._introPlayed && !this._noiseResolved) {
      const remaining = Math.max(0, this.progressTarget - this.timer);
      const hint = document.getElementById('stage-hint');
      hint.textContent = `避开灰色的干扰字！ ${remaining.toFixed(1)}s`;

      if(this.timer >= this.progressTarget) {
        this._onNoiseComplete();
      }
    }

    // 飘浮选择肢
    if(this._driftActive && !this._driftSettled) {
      this._driftTimer += dt;
      const allVisible = this.driftTexts.every(d => d.age >= d._fadeInDur);
      if(allVisible || this._driftTimer > 2.5) {
        this._driftSettled = true;
        const c = document.getElementById('d-continue');
        c.textContent = '请选择回复';
        c.style.opacity = '1';
      }
    }

    // BATTLE阶段隐藏"点击继续"（但过渡/地图阶段不隐藏，让剧情对话的提示可见）
    if(this.phase === PHASE.BATTLE && typeof prologuePhase !== 'undefined' && prologuePhase < 2) {
      document.getElementById('d-continue').style.opacity = '0';
    }

    // 战斗中定期平衡文字
    if(this.phase === PHASE.BATTLE && this._phaseConfig) {
      this._phaseConfig.spawnTimer += dt;
      if(this._phaseConfig.spawnTimer > 1.0) {
        this._phaseConfig.spawnTimer = 0;
        balanceWords();
      }
    }
  },

  /** 噪音阶段：玩家碰到噪点 */
  _triggerNoiseGraze() {
    if(this._noiseResolved) return;
    this._noiseResolved = true;
    const hint = document.getElementById('stage-hint');
    hint.style.opacity='0';
    battleWords = [];

    Cinematic.triggerGlitch(0.8, 0.7);
    Sound.noise(); Sound.stun();
    shakeAmount = Math.max(shakeAmount, 6);

    playerHP = Math.max(35, playerHP - 5);
    updatePlayerUI();

    document.getElementById('stun-overlay').classList.add('active');
    setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'),700);

    for(let i=0;i<8;i++) particles.push(new HitParticle(W*0.5,H*0.5,'#ff4444','呢'));

    const origAlpha = mentor.targetAlpha;
    mentor.targetAlpha = 0.3;
    setTimeout(()=>{ mentor.targetAlpha = origAlpha; }, 400);

    setTimeout(()=>{
      this.dialogueQueue = [
        { mode:'float', speaker:'零', text:'我说了躲开。在这里受伤是会死人的。集中精神。', speed:28 },
      ];
      this.dialogueIdx = 0;
      this._playNextDialogue();
    }, 900);
  },

  /** 噪音阶段完成 */
  _onNoiseComplete() {
    if(this._noiseResolved) return;
    this._noiseResolved = true;
    const hint = document.getElementById('stage-hint');
    hint.style.opacity='0';
    battleWords = [];
    if(!Dialogue.active) {
      this.enterPhase(PHASE.TUTORIAL_BACKPACK);
    }
  },

  /** 外部点击 → 推进对话 或 选择飘浮选项 */
  handleClick() {
    if(this._driftActive && this._driftSettled && !this._driftSelected) {
      for(let dt of this.driftTexts) {
        if(!dt.dead && dt.hitTest(mx, my)) {
          this._selectDrift(dt);
          return;
        }
      }
      return;
    }

    if(!Dialogue.active) return;
    if(!Dialogue.complete){ Dialogue.skip(); return; }
    Dialogue.hide();
    this._playNextDialogue();
  },

  /** 教程阶段：处理文字点击 */
  handleWordClick(bw) {
    if(!bw.alive || bw.cooldown>0) return;

    // 技能字（在任何教程阶段都可能需要处理）
    if(bw.cat==='skill'){
      const cfg=getCatConfig('skill');
      if(cfg){
        for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,cfg.color,bw.text));
        particles.push(new DamageText(bw.x,bw.y-8,'收集!',cfg.color));
        Sound.boost();
        bw.alive=false; bw.targetAlpha=0;

        if(skillState) skillState.collected.push(bw.text);
        updateSkillUI();

        // 检查技能完成
        if(playerSkill&&playerSkill.type==='sequence'&&skillState){
          const needed=playerSkill.chars.join('');
          const got=skillState.collected.join('');
          if(got===needed){
            nextAttackBoost=true;
            if(skillState) skillState.ready=true;
            for(let i=0;i<15;i++) particles.push(new HitParticle(W*0.5,H*0.5,cfg.color,'◆'));
            particles.push(new DamageText(W*0.5,H*0.45,'卍解·倍击!',cfg.color));
            if(skillState) skillState.collected=[];
            updateSkillUI();
            // 教程进度
            if(this.phase===PHASE.TUTORIAL_SKILL){
              this.progress++;
              if(this.progress>=this.progressTarget){
                battleWords=[];
                this.dialogueQueue=[
                  { mode:'float', speaker:'零', text:'……', speed:120 },
                  { mode:'plain', text:'怎么了？我做错了吗？', speed:45 },
                  { mode:'float', speaker:'零', text:'不。时机抓得很准。太准了。', speed:45 },
                ];
                this.dialogueIdx=0;
                this._playNextDialogue();
                this._phaseComplete=true;
              }
            }
          }
        }
        refreshWords();
      }
      return;
    }

    if(bw.cat==='攻'){
      Sound.attack();
      const cfg=getCatConfig('攻');
      for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#ff6644',bw.text));
      particles.push(new DamageText(bw.x,bw.y-10,'命中!','#ff8866'));
      bw.alive=false; bw.targetAlpha=0;

      if(this.phase===PHASE.TUTORIAL_ATTACK){
        this.progress++;
        if(this.progress>=this.progressTarget){
          battleWords = [];
          this._showCompleteDialogue('……很好。你的神经适应性比我想象的要好。', PHASE.TUTORIAL_SHIELD);
        }
      }
    }

    if(bw.cat==='防'){
      Sound.defense();
      const cfg=getCatConfig('防');
      for(let i=0;i<10;i++) particles.push(new HitParticle(bw.x,bw.y,cfg?cfg.color:'#66aaff','□'));
      particles.push(new DamageText(bw.x,bw.y-10,'护盾!',cfg?cfg.color:'#66aaff'));
      bw.alive=false; bw.targetAlpha=0;

      if(this.phase===PHASE.TUTORIAL_SHIELD){
        this.progress++;
        if(this.progress>=this.progressTarget){
          this._showCompleteDialogue('蓝色「防」字给你一层护盾。搭配不同的防具有不同的防御效果。', PHASE.TUTORIAL_HEAL);
        }
      }
    }

    if(bw.cat==='符'){
      Sound.heal();
      const t = typeof playerTalisman!=='undefined' ? playerTalisman : null;
      const healAmt = t ? (t.healMin + Math.floor(Math.random()*(t.healMax - t.healMin + 1))) : 3;
      playerHP = Math.min(playerMaxHP, playerHP + healAmt);
      updatePlayerUI();
      const talColor = t ? t.color : '#44dd88';
      for(let i=0;i<8;i++) particles.push(new HitParticle(bw.x,bw.y,talColor,'+'));
      particles.push(new DamageText(bw.x,bw.y-10,`+${healAmt}`,talColor));
      bw.alive=false; bw.targetAlpha=0;

      if(this.phase===PHASE.TUTORIAL_HEAL){
        this.progress++;
        if(this.progress>=this.progressTarget){
          this._showCompleteDialogue('符字是你的生命线。不同的护符提供不同的回复量和数量——打开行囊可以随时查看。', PHASE.TUTORIAL_SKILL);
        }
      }
    }

    if(bw.cat==='乱'){
      Sound.noise(); Sound.stun();
      document.getElementById('stun-overlay').classList.add('active');
      setTimeout(()=>document.getElementById('stun-overlay').classList.remove('active'),600);
      for(let i=0;i<5;i++) particles.push(new HitParticle(bw.x,bw.y,'#ff4444','×'));
      particles.push(new DamageText(bw.x,bw.y,'混乱!','#ff4444'));
      bw.alive=false; bw.targetAlpha=0;

      if(this.phase===PHASE.TUTORIAL_NOISE){
        this._triggerNoiseGraze();
      }
    }
  },

  /** 教程阶段达标 → 导师评语 */
  _showCompleteDialogue(text, nextPhase) {
    if(this._phaseComplete) return;
    this._phaseComplete = true;
    const hint = document.getElementById('stage-hint');
    hint.style.opacity='0';
    battleWords = [];
    this.dialogueQueue = [
      { mode:'float', speaker:'零', text: text, speed:35 },
    ];
    this.dialogueIdx = 0;
    this._playNextDialogue();
  },

  // ── 工具方法 ──

  _spawnTutorialWords(cats, count, speedMul) {
    battleWords = battleWords.filter(bw=>!bw.isTutorial);
    cats.forEach(cat=>{ for(let i=0;i<count;i++) this._addTutorialWord(cat, speedMul); });
  },

  _addTutorialWord(cat, speedMul=0.5) {
    const cfg=getCatConfig(cat);
    if(!cfg) return;
    const text = cfg.words[Math.floor(Math.random()*cfg.words.length)];
    const bw = new BattleWord(cat, text);
    bw.isTutorial = true;
    bw.vx *= speedMul; bw.vy *= speedMul; bw.wobbleAmp *= speedMul;
    bw.size = 28+Math.random()*12;
    battleWords.push(bw);
    return bw;
  },

  _addTutorialNoiseWord() {
    const text = NOISE_WORDS[Math.floor(Math.random()*NOISE_WORDS.length)];
    const bw = new BattleWord('乱', text);
    bw.isTutorial = true;
    bw.size = 20+Math.random()*8;
    bw.vx *= 0.6; bw.vy *= 0.6;
    battleWords.push(bw);
  },

  /** 生成单个技能字 */
  _spawnSkillChar(char, speedMul=0.5) {
    const cfg=getCatConfig('skill');
    if(!cfg) return;
    const sw = new BattleWord('skill', char);
    sw.isTutorial = true;
    sw.vx *= speedMul; sw.vy *= speedMul; sw.wobbleAmp *= speedMul;
    sw.size = 32+Math.random()*6;
    battleWords.push(sw);
    return sw;
  },
};
