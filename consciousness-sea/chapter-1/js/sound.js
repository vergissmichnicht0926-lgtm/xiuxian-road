/* ═══════════════════ §A 音效引擎 — Web Audio 纯合成 ═══════════════════
 *
 * 零外部依赖，可直接复制到任意章节复用。
 * 首次用户手势后自动初始化 AudioContext。
 */

const Sound = (()=>{
  let ctx=null, _masterGain=null;
  function ac(){ if(!ctx) ctx=new(window.AudioContext||window.webkitAudioContext)(); if(ctx.state==='suspended') ctx.resume(); return ctx; }
  const master = ()=> {
    if(!_masterGain||_masterGain.context!==ac()){ _masterGain=ac().createGain();_masterGain.gain.value=0.2;_masterGain.connect(ac().destination); }
    return _masterGain;
  };

  // v5.2 音量控制：SFX 独立音量 + 全局静音（BGM 走现有 setBGMVolume）
  let _sfxVolume = 0.8;
  let _muted = false;
  function _sfx(v){ return Math.max(0, Math.min(1, (v || 0) * _sfxVolume)); }

  function blip(freq,type,noiseMix,dur,vol=1){
    vol = _sfx(vol);
    const a=ac(), m=master(), now=a.currentTime;
    const g=a.createGain(); g.connect(m);
    g.gain.setValueAtTime(0.01,now); g.gain.linearRampToValueAtTime(vol*0.2,now+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,now+dur);
    if(noiseMix>0){
      const buf=a.createBuffer(1,a.sampleRate*dur,a.sampleRate);
      const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*noiseMix;
      const s=a.createBufferSource(); s.buffer=buf;
      const ng=a.createGain();ng.gain.setValueAtTime(noiseMix*0.4,now);ng.gain.exponentialRampToValueAtTime(0.001,now+dur);
      ng.connect(m); s.connect(ng); s.start(now); s.stop(now+dur);
    }
    if(freq){ const o=a.createOscillator();o.type=type||'sine';o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*0.3,now+dur);o.connect(g);o.start(now);o.stop(now+dur); }
  }
  function sweep(fr,to,dur,type='sine',vol=1){
    vol = _sfx(vol);
    const a=ac(), m=master(), now=a.currentTime;
    const g=a.createGain();g.connect(m);g.gain.setValueAtTime(vol*0.18,now);g.gain.exponentialRampToValueAtTime(0.001,now+dur);
    const o=a.createOscillator();o.type=type;o.frequency.setValueAtTime(fr,now);o.frequency.linearRampToValueAtTime(to,now+dur);o.connect(g);o.start(now);o.stop(now+dur);
  }
  function heartbeat(){
    const a=ac(), m=master(), now=a.currentTime;
    const sv = _sfxVolume;
    [0,0.12].forEach(d=>{
      const g=a.createGain();g.connect(m);g.gain.setValueAtTime(0.01*sv,now+d);g.gain.linearRampToValueAtTime(0.25*sv,now+d+0.04);g.gain.exponentialRampToValueAtTime(0.001,now+d+0.2);
      const o=a.createOscillator();o.type='sine';o.frequency.setValueAtTime(45,now+d);o.frequency.linearRampToValueAtTime(30,now+d+0.18);o.connect(g);o.start(now+d);o.stop(now+d+0.25);
    });
  }

  // ═══════════ BGM 音乐系统（双缓冲无缝循环 + 合成嗡鸣垫底）═══════════
  let _bgmTracks = {};        // { key: { a:Audio, b:Audio, active:null|'a'|'b', fadeTimer } }
  let _bgmCurrent = null;
  let _bgmVolume = 0.2;       // BGM音量 (0~1) — 较低，不盖过音效（以攻击音效0.8为基准统一）
  let _bgmCrossfade = 0.45;   // 无缝循环交叉渐变秒数
  let _bgmLoaded = false;

  // 合成垫底层（Web Audio振荡器，不受CORS影响）
  let _synthActive = false, _synthGain = null, _synthNodes = [];

  const BGM_TRACKS = {
    explore:   'MUSIC/探索.ogg',
    battle:    'MUSIC/普通战斗.ogg',
    boss:      'MUSIC/boss战.ogg',
    safehouse: 'MUSIC/安全屋.ogg',
  };

  /** 初始化BGM：每个音轨创建双缓冲Audio元素实现无缝循环 */
  function _bgmInit() {
    if (_bgmLoaded) return;

    let loadOk = 0, loadFail = 0;
    for (const [key, url] of Object.entries(BGM_TRACKS)) {
      const a = new Audio(url);
      a.preload = 'auto'; a.volume = 0;
      const b = new Audio(url);
      b.preload = 'auto'; b.volume = 0;

      // 检测 file:// 下 Audio 是否加载成功
      a.addEventListener('error', () => { loadFail++; });
      a.addEventListener('canplaythrough', () => { loadOk++; }, {once:true});

      _bgmTracks[key] = { a, b, active: null, fadeTimer: null, _loadOk:false };
    }

    _startSynthDrone();
    _bgmLoaded = true;

    // 延迟检测加载状态（给浏览器一点时间尝试加载）
    setTimeout(() => {
      for (const [key, track] of Object.entries(_bgmTracks)) {
        track._loadOk = (track.a.readyState >= 2); // HAVE_CURRENT_DATA
      }
      const ok = Object.entries(_bgmTracks).filter(([,t]) => t._loadOk).map(([k]) => k);
      const fail = Object.entries(_bgmTracks).filter(([,t]) => !t._loadOk).map(([k]) => k);
      if (fail.length > 0) {
        console.warn('%cBGM %c' + fail.length + '首加载失败%c: ' + fail.join(', ') +
          '%c — file:// 协议可能阻止了 .ogg 加载，使用合成垫底代替',
          'color:#ffcc44;','color:#ff6644;','color:#ff8866;','color:#888;');
      }
      if (ok.length > 0) {
        console.log('%cBGM %c已就绪 %c' + ok.length + '首%c · 双缓冲无缝循环 · 音量' + Math.round(_bgmVolume*100) + '%',
          'color:#ffcc44;','color:#aaa;','color:#aaa;','color:#888;');
      }
    }, 800);
  }

  /** 合成嗡鸣垫底 */
  function _startSynthDrone() {
    if (_synthActive) return;
    _synthActive = true;
    const a = ac();
    _synthGain = a.createGain();
    _synthGain.gain.value = 0;
    _synthGain.gain.linearRampToValueAtTime(0.022, a.currentTime + 2.0);
    _synthGain.connect(master());

    const drone = a.createOscillator();
    drone.type = 'sine'; drone.frequency.value = 36;
    const dg = a.createGain(); dg.gain.value = 0.15;
    drone.connect(dg); dg.connect(_synthGain);

    const lfo = a.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lg = a.createGain(); lg.gain.value = 5;
    lfo.connect(lg); lg.connect(drone.frequency);

    drone.start(); lfo.start();
    _synthNodes = [{ node: drone, gain: dg }, { node: lfo, gain: lg }];
  }

  function _destroySynth() {
    _synthNodes.forEach(n => { try { n.node.stop(); } catch(e) {} });
    _synthNodes = [];
    if (_synthGain) { try { _synthGain.disconnect(); } catch(e) {} _synthGain = null; }
    _synthActive = false;
  }

  /** 启动双缓冲无缝循环 — 用两个Audio交替播放消除循环间隙 */
  function _startGaplessLoop(track) {
    if (track.fadeTimer) { clearInterval(track.fadeTimer); track.fadeTimer = null; }

    const startAudio = (which) => {
      // 统一管理监听：先移除上次挂载的 timeupdate，防止同一audio堆积多个监听
      if (track._nearEndHandler) {
        [track.a, track.b].forEach(au => { try { au.removeEventListener('timeupdate', track._nearEndHandler); } catch(e){} });
        track._nearEndHandler = null;
      }
      track.active = which;
      const audio = track[which];
      audio.volume = _bgmVolume;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(e => {
          // file:// 下 Audio 可能加载失败，此时依赖合成垫底，不重复警告
          if (!track._warned) {
            track._warned = true;
            console.warn('BGM 播放失败（可能是 file:// 协议限制），已回退到合成垫底:', e.message || e);
          }
        });
      }

      // 监听即将结束 → 启动另一个副本交叉淡入
      const onNearEnd = () => {
        if (track.stopped) return;          // 已停止/切轨：不再续播，防止旧轨"复活"
        if (track.active !== which) return; // 已被替换
        const remaining = audio.duration - audio.currentTime;
        if (remaining > _bgmCrossfade + 0.1) return;

        audio.removeEventListener('timeupdate', onNearEnd);
        const other = which === 'a' ? 'b' : 'a';
        track[other].volume = 0;
        track[other].currentTime = 0;
        track[other].play().catch(e => {});

        // 快速淡入淡出
        if (track.fadeTimer) clearInterval(track.fadeTimer);
        const steps = Math.floor(_bgmCrossfade * 30);
        const interval = (_bgmCrossfade * 1000) / steps;
        let s = 0;
        track.fadeTimer = setInterval(() => {
          s++;
          const t = s / steps;
          track[which].volume = _bgmVolume * (1 - t);
          track[other].volume = _bgmVolume * t;
          if (s >= steps) {
            clearInterval(track.fadeTimer);
            track.fadeTimer = null;
            track[which].pause();
            track[which].volume = 0;
            track[other].volume = _bgmVolume;
            startAudio(other);
          }
        }, interval);
      };
      track._nearEndHandler = onNearEnd;
      audio.addEventListener('timeupdate', onNearEnd);
    };

    startAudio('a');
  }

  /** 切换BGM音轨（交叉淡入淡出） */
  function _bgmPlay(key, crossfadeSec = 1.5) {
    if (!_bgmLoaded) _bgmInit();
    if (_bgmCurrent === key) return;    // 同一音轨已在播放，跳过（防止initBoss重复触发导致静音）
    const track = _bgmTracks[key];
    if (!track) return;

    // 停止旧轨的循环
    if (_bgmCurrent && _bgmTracks[_bgmCurrent]) {
      const old = _bgmTracks[_bgmCurrent];
      old.stopped = true; // 停止旧轨循环，防止其 onNearEnd 续播（双BGM重叠根因）
      if (old._nearEndHandler) {
        [old.a, old.b].forEach(au => { try { au.removeEventListener('timeupdate', old._nearEndHandler); } catch(e){} });
        old._nearEndHandler = null;
      }
      if (old.fadeTimer) { clearInterval(old.fadeTimer); old.fadeTimer = null; }

      const oldAudio = old.active ? old[old.active] : null;
      const oldVol = oldAudio ? oldAudio.volume : 0;

      // 渐隐旧轨
      const steps = Math.floor(crossfadeSec * 30);
      const interval = (crossfadeSec * 1000) / steps;
      let s = 0;
      const fadeOutTimer = setInterval(() => {
        s++;
        if (oldAudio) oldAudio.volume = oldVol * (1 - s/steps);
        if (s >= steps) {
          clearInterval(fadeOutTimer);
          if (oldAudio) { oldAudio.pause(); oldAudio.volume = 0; }
          if (old.active === 'a' || old.active === 'b') {
            const other = old.active === 'a' ? 'b' : 'a';
            try { old[other].pause(); old[other].volume = 0; } catch(e) {}
          }
          old.active = null;
        }
      }, interval);
    }

    // 启动新轨双缓冲循环
    track.a.volume = 0; track.b.volume = 0;
    _startGaplessLoop(track);
    _bgmCurrent = key;

    // 渐显（覆盖初始volume）
    const fadeInSteps = Math.floor(crossfadeSec * 30);
    const fadeInInterval = (crossfadeSec * 1000) / fadeInSteps;
    let si = 0;
    const fadeInTimer = setInterval(() => {
      si++;
      const t = si / fadeInSteps;
      const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2)/2;
      const activeAudio = track.active ? track[track.active] : null;
      if (activeAudio) activeAudio.volume = ease * _bgmVolume;
      if (si >= fadeInSteps) clearInterval(fadeInTimer);
    }, fadeInInterval);

    // 合成垫底跟随场景
    if (_synthGain) {
      const a = ac(), now = a.currentTime;
      const vol = (key === 'boss') ? 0.045 : (key === 'safehouse') ? 0.01 : 0.022;
      _synthGain.gain.linearRampToValueAtTime(vol, now + crossfadeSec);
    }
  }

  /** 停止所有BGM */
  function _bgmStop(fadeOutSec = 2.5) {
    if (_bgmCurrent && _bgmTracks[_bgmCurrent]) {
      const t = _bgmTracks[_bgmCurrent];
      t.stopped = true; // 标记停止：挂起的 onNearEnd 不再续播
      if (t._nearEndHandler) {
        [t.a, t.b].forEach(au => { try { au.removeEventListener('timeupdate', t._nearEndHandler); } catch(e){} });
        t._nearEndHandler = null;
      }
      if (t.fadeTimer) { clearInterval(t.fadeTimer); t.fadeTimer = null; }

      [t.a, t.b].forEach(audio => {
        const startVol = audio.volume;
        const steps = Math.floor(fadeOutSec * 30);
        const interval = (fadeOutSec * 1000) / steps;
        let s = 0;
        const ft = setInterval(() => {
          s++;
          audio.volume = startVol * (1 - s/steps);
          if (s >= steps) { clearInterval(ft); audio.pause(); audio.volume = 0; }
        }, interval);
      });
      t.active = null;
      _bgmCurrent = null;
    }

    if (_synthGain) {
      const a = ac(), now = a.currentTime;
      _synthGain.gain.linearRampToValueAtTime(0, now + fadeOutSec);
      setTimeout(() => { _destroySynth(); }, fadeOutSec * 1000 + 300);
    }
  }

  function _bgmSetVolume(v) {
    _bgmVolume = v;
    if (_bgmCurrent && _bgmTracks[_bgmCurrent]) {
      const t = _bgmTracks[_bgmCurrent];
      if (t.active) t[t.active].volume = _muted ? 0 : v;
    }
  }

  // v5.2 全局静音：master gain（音效）归零 + 当前 BGM 归零；取消时恢复
  function _setMuted(m) {
    _muted = !!m;
    const g = master();
    if (_muted) {
      g.gain.value = 0;
      if (_bgmCurrent && _bgmTracks[_bgmCurrent] && _bgmTracks[_bgmCurrent].active) {
        _bgmTracks[_bgmCurrent][_bgmTracks[_bgmCurrent].active].volume = 0;
      }
    } else {
      g.gain.value = 0.2;
      if (_bgmCurrent && _bgmTracks[_bgmCurrent] && _bgmTracks[_bgmCurrent].active) {
        _bgmTracks[_bgmCurrent][_bgmTracks[_bgmCurrent].active].volume = _bgmVolume;
      }
    }
  }

  return {
    // BGM控制
    initBGM()              { _bgmInit(); },
    playBGM(key, fade)     { _bgmPlay(key, fade); },
    stopBGM(fade)          { _bgmStop(fade); },
    setBGMVolume(v)        { _bgmSetVolume(v); },
    startBGM(i)            { _bgmInit(); _bgmPlay('explore', 2.0); },
    setBGMIntensity(i)     { if (i > 0.5) _bgmPlay('boss', 1.2); else if (_bgmCurrent==='boss') _bgmPlay('explore', 2.0); },

    // v5.2 音量/静音
    setSfxVolume(v)        { _sfxVolume = Math.max(0, Math.min(1, v)); },
    getSfxVolume()         { return _sfxVolume; },
    setMuted(m)            { _setMuted(m); },
    getMuted()             { return _muted; },

    // ── 战斗音效 ──
    // 战斗音效 — 主vol统一0.8（以attack为基准），副音0.55
    attack(){ blip(800,'square',0.6,0.14,0.8); },                                             // ← 基准
    comboAtk(lv){ blip(800+lv*200,'square',0.4,0.1,0.8); },                                    // 1→0.8
    defense(){ blip(120,'triangle',0.2,0.28,0.8); sweep(200,80,0.3,'sine',0.55); },             // 0.7→0.8, 0.5→0.55
    heal(){ sweep(300,600,0.28,'sine',0.8); sweep(400,800,0.22,'sine',0.55); },                 // 0.6→0.8, 0.4→0.55
    boost(){ sweep(600,150,0.45,'sawtooth',0.8); blip(1000,'sine',0,0.14,0.55); },              // 0.5→0.8, 0.4→0.55
    noise(){ blip(200,'sawtooth',0.8,0.18,0.8); blip(100,'square',0.5,0.13,0.55); },            // 0.6→0.8, 0.4→0.55
    enemyAtk(){ sweep(150,400,0.28,'sawtooth',0.8); blip(60,'square',0.4,0.18,0.55); },         // 0.5→0.8, 0.4→0.55
    shieldBlock(){ blip(500,'triangle',0.1,0.18,0.8); sweep(600,900,0.14,'sine',0.55); },       // 0.6→0.8, 0.4→0.55
    victory(){ sweep(400,800,0.35,'sine',0.8); setTimeout(()=>sweep(500,1000,0.45,'sine',0.8),180); }, // 0.6→0.8
    defeat(){ sweep(300,60,0.7,'triangle',0.8); },                                               // 0.7→0.8
    stun(){ blip(100,'sawtooth',0.9,0.35,0.8); },                                                // 0.5→0.8
    heartbeat(){ heartbeat(); },                                                                  // 特殊，保持
    comboMilestone(lv){ sweep(400*lv,800*lv,0.28,'sine',0.8); blip(1000+lv*200,'triangle',0,0.18,0.8); }, // 0.7→0.8, 0.6→0.8
    eyeOpen(){ sweep(40,200,1.5,'sine',0.3); sweep(60,300,1.8,'sine',0.2); },                    // 氛围音，保持
    anomaly(){ sweep(400,80,0.8,'sawtooth',0.55); blip(60,'square',0.7,0.5,0.8); },              // 0.4→0.55, 0.5→0.8
    chime(){ blip(600,'sine',0,0.25,0.8); sweep(800,1200,0.2,'sine',0.55); },                    // 0.5→0.8, 0.3→0.55

    // ── UI音效 ── 主vol统一0.6（稍低于战斗），副音0.45
    uiClick(){ blip(900,'sine',0,0.08,0.6); },                                                  // 0.5→0.6
    uiHover(){ blip(1400,'sine',0,0.04,0.35); },                                                // 0.25→0.35
    uiOpen(){ sweep(250,700,0.25,'sine',0.6); blip(800,'triangle',0,0.1,0.45); },               // 0.4→0.6, 0.3→0.45
    uiClose(){ sweep(700,250,0.22,'sine',0.55); blip(300,'triangle',0,0.08,0.4); },             // 0.35→0.55, 0.25→0.4
    itemGet(){ sweep(500,1200,0.2,'sine',0.7); sweep(800,1600,0.18,'sine',0.55); blip(1600,'triangle',0,0.15,0.6); }, // 0.5→0.7, 0.35→0.55, 0.4→0.6
    teleport(){ sweep(200,1200,0.12,'sawtooth',0.55); blip(100,'square',0.5,0.1,0.45); },       // 0.35→0.55, 0.3→0.45
    phaseChange(){ sweep(100,40,0.6,'triangle',0.7); blip(60,'sawtooth',0.6,0.3,0.55); },       // 0.5→0.7, 0.4→0.55
    saveWrite(){ blip(500,'sine',0,0.12,0.6); setTimeout(()=>blip(800,'sine',0,0.1,0.55),100); }, // 0.4→0.6, 0.35→0.55
    mapNode(){ blip(700,'sine',0,0.1,0.55); sweep(800,1000,0.15,'sine',0.45); },                // 0.35→0.55, 0.25→0.45
    dialogueAdvance(){ blip(500,'triangle',0,0.06,0.5); },                                       // 0.3→0.5
  };
})();
