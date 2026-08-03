/* ═══════════════════ §E 演出动画系统 ═══════════════════
 *
 * 依赖：sound.js (Sound)
 *
 * 提供：睁眼演出、画面过渡、glitch特效
 */

const Cinematic = {
  // ── 睁眼演出 ──
  eyeOpen: {
    phase: 0,        // 0=等待, 1=黑屏, 2=模糊渐清, 3=完成
    timer: 0,
    blur: 20,
    brightness: 0,
    done: false,
  },

  // ── 画面过渡 ──
  transition: {
    active: false,
    timer: 0,
    duration: 0.8,
    dir: 'out',
    onMid: null,
    _midFired: false,
  },

  // ── Glitch特效 ──
  glitch: {
    active: false,
    timer: 0,
    intensity: 0,
  },

  /** 开始睁眼演出（黑屏→模糊→清晰，约5秒） */
  startEyeOpen() {
    this.eyeOpen.phase = 1;
    this.eyeOpen.timer = 0;
    this.eyeOpen.blur = 20;
    this.eyeOpen.brightness = 0;
    this.eyeOpen.done = false;
    Sound.eyeOpen();
  },

  /** 画面过渡：变暗→回调→变亮
   *  @param dir      'out'=先变暗再变亮, 'in'=先变亮再变暗
   *  @param duration 总时长（秒）
   *  @param onMid    中间点回调
   */
  startTransition(dir, duration, onMid) {
    this.transition.active = true;
    this.transition.timer = 0;
    this.transition.duration = duration || 0.8;
    this.transition.dir = dir;
    this.transition.onMid = onMid || null;
    this.transition._midFired = false;
  },

  /** 触发glitch画面撕裂效果 */
  triggerGlitch(intensity=1, duration=0.4) {
    this.glitch.active = true;
    this.glitch.timer = duration;
    this.glitch.intensity = intensity;
  },

  /** 每帧更新 */
  update(dt) {
    // 睁眼
    const eo = this.eyeOpen;
    if(eo.phase===1){
      eo.timer += dt;
      if(eo.timer > 1.5) { eo.phase = 2; eo.timer = 0; }
    }
    if(eo.phase===2){
      eo.timer += dt;
      const progress = Math.min(1, eo.timer / 3.5);
      const t = 1 - Math.pow(1-progress, 3); // ease-out
      eo.blur = 20*(1-t);
      eo.brightness = t;
      if(progress >= 1) { eo.phase=3; eo.done=true; eo.blur=0; eo.brightness=1; }
    }

    // 过渡
    const tr = this.transition;
    if(tr.active){
      tr.timer += dt;
      const half = tr.duration/2;
      if(tr.timer >= half && !tr._midFired){
        tr._midFired = true;
        if(tr.onMid) tr.onMid();
      }
      if(tr.timer >= tr.duration){
        tr.active = false; tr._midFired = false;
      }
    }

    // glitch
    const gl = this.glitch;
    if(gl.active){
      gl.timer -= dt;
      if(gl.timer <= 0){ gl.active = false; gl.intensity = 0; }
    }
  },

  /** 获取当前画面叠加参数（用于渲染） */
  getOverlay() {
    const eo = this.eyeOpen;
    let overlayAlpha = 0;
    if(eo.phase===1){
      overlayAlpha = 1;
    } else if(eo.phase===2){
      overlayAlpha = 1 - eo.brightness;
    }
    // 过渡叠加
    const tr = this.transition;
    if(tr.active){
      const half = tr.duration/2;
      let trAlpha = 0;
      if(tr.timer < half){
        trAlpha = tr.dir==='out' ? tr.timer/half : 1-tr.timer/half;
      } else {
        trAlpha = tr.dir==='out' ? (tr.duration-tr.timer)/half : (tr.timer-half)/half;
      }
      overlayAlpha = Math.max(overlayAlpha, trAlpha);
    }
    const eoBlur = this.eyeOpen.phase===2 ? this.eyeOpen.blur : 0;
    return { overlayAlpha, blurPx: eoBlur };
  },

  /** 获取glitch偏移量 */
  getGlitchOffset() {
    if(!this.glitch.active) return {x:0, y:0};
    const i = this.glitch.intensity * (this.glitch.timer/0.4);
    return {
      x: (Math.random()-0.5)*12*i,
      y: (Math.random()-0.5)*6*i,
    };
  },
};
