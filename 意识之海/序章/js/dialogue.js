/* ═══════════════════ §D 对话演出引擎 — 通用可复用模板 ═══════════════════
 *
 * 零依赖，纯 DOM 操作。可复制到任意章节复用。
 *
 * ── 五种模式 ──
 *   'float'   — 高级存在：文字从上方缓缓凝聚浮现（带光晕）
 *   'bubble'  — 普通人：漫画气泡框 + 三角尾巴
 *   'shake'   — 激动/紧急：字体抖动 + 暖色光晕
 *   'whisper' — 低语/内心：细微斜体半透明
 *   'plain'   — 主角：无框无光，就是一行干净的白色文字
 *
 * ── 使用示例 ──
 *   Dialogue.show({ mode:'float', speaker:'零', text:'这就是意识之海。', speed:40 });
 *   // 点击画面推进 → Dialogue 自动处理 skip/hide
 *   // 外部判断：Dialogue.active / Dialogue.complete
 */

const Dialogue = {
  _box: null,
  _continue: null,
  _active: false,
  _mode: 'float',
  _speaker: '',
  _fullText: '',
  _displayed: '',
  _charIdx: 0,
  _typeTimer: 0,
  _typeSpeed: 40,
  _complete: false,
  _onComplete: null,
  _locked: false,

  /** 初始化（页面加载后调用一次） */
  init() {
    this._box = document.getElementById('dialogue-box');
    this._continue = document.getElementById('d-continue');
    this._box.innerHTML = '';
    this._continue.style.opacity = '0';
  },

  /** 显示对话
   *  @param opts.mode      'float'|'bubble'|'shake'|'whisper'|'plain'|'tremble'|'bounce'
   *  @param opts.speaker   说话人名字（whisper/tremble/bounce模式可省略）
   *  @param opts.text      对话内容
   *  @param opts.speed     打字速度 ms/字（默认40）
   *  @param opts.onComplete 打字完成回调
   *  @param opts.locked    锁定期间不显示"点击继续"
   */
  show(opts={}) {
    this._mode = opts.mode || 'float';
    this._speaker = opts.speaker || '';
    this._fullText = opts.text || '';
    this._typeSpeed = opts.speed || 40;
    this._onComplete = opts.onComplete || null;
    this._locked = opts.locked || false;

    this._displayed = '';
    this._charIdx = 0;
    this._typeTimer = 0;
    this._complete = false;
    this._active = true;

    this._render();
    this._continue.style.opacity = '0';
  },

  /** 内部：根据模式渲染HTML框架 */
  _render() {
    const speakerHtml = this._speaker ? `<div class="d-speaker">${this._speaker}</div>` : '';
    let html = '';
    switch(this._mode) {
      case 'float':
        html = `<div class="dialogue-float active">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      case 'bubble':
        html = `<div class="dialogue-bubble active"><div class="d-bubble-box">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div></div>`;
        break;
      case 'shake':
        html = `<div class="dialogue-shake active">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      case 'whisper':
        html = `<div class="dialogue-whisper active"><div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      case 'plain':
        html = `<div class="dialogue-plain active"><div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      case 'tremble':
        html = `<div class="dialogue-tremble active">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      case 'bounce':
        html = `<div class="dialogue-bounce active">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
        break;
      default:
        html = `<div class="dialogue-float active">${speakerHtml}<div class="d-text">${this._displayed||'&nbsp;'}</div></div>`;
    }
    this._box.innerHTML = html;
  },

  /** 每帧调用，驱动打字机效果 */
  update(dt) {
    if(!this._active || this._complete) return;
    this._typeTimer += dt*1000;
    while(this._typeTimer >= this._typeSpeed && this._charIdx < this._fullText.length) {
      this._typeTimer -= this._typeSpeed;
      this._charIdx++;
    }
    if(this._charIdx >= this._fullText.length) {
      this._complete = true;
      this._displayed = this._fullText;
      this._updateText();
      if(!this._locked) this._continue.style.opacity = '1';
      if(this._onComplete) this._onComplete();
    } else {
      this._displayed = this._fullText.slice(0, this._charIdx);
      this._updateText();
    }
  },

  _updateText() {
    const textEl = this._box.querySelector('.d-text');
    if(textEl) textEl.textContent = this._displayed || ' ';
  },

  /** 跳过打字，立即显示全文。返回 true 表示之前已经完成了 */
  skip() {
    if(!this._active) return true;
    if(!this._complete) {
      this._displayed = this._fullText;
      this._charIdx = this._fullText.length;
      this._complete = true;
      this._updateText();
      if(!this._locked) this._continue.style.opacity = '1';
      if(this._onComplete) this._onComplete();
      return false;
    }
    return true;
  },

  /** 隐藏对话框 */
  hide() {
    this._active = false;
    this._box.innerHTML = '';
    this._continue.style.opacity = '0';
  },

  get active() { return this._active; },
  get complete() { return this._complete; },
};
