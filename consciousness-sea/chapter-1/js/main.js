/* ═══════════════════ §H+I 主循环 · 渲染 · 输入 · 初始化 v2 ═══════════════════
 *
 * 依赖：所有前置模块
 * 加载顺序（index.html中的<script>顺序保证）：
 *   config → sound → particles → dialogue → cinematic → battle → tutorial → main
 */

// ── Canvas 初始化 ──
const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
let W,H,mx=-999,my=-999,dpr=Math.min(window.devicePixelRatio||1,2);

function resize() {
  W=window.innerWidth;H=window.innerHeight;
  canvas.width=W*dpr;canvas.height=H*dpr;
  canvas.style.width=W+'px';canvas.style.height=H+'px';
  ctx.setTransform(1,0,0,1,0,0);ctx.scale(dpr,dpr);
}
window.addEventListener('resize',resize);resize();

// ── 全局状态 ──
let particles=[],bgParticles=[],battleWords=[];
let shakeAmount=0,balanceFrames=0;
let difficulty = 1; // 默认标准

// 序章流程状态
const PROLOGUE = { TUTORIAL:0, BOSS_HAN:1, PRE_DIVE:2, DIVING:3, END:4 };
let prologuePhase = PROLOGUE.TUTORIAL;
let prologueHanDefeated = false;  // 憾被击败标志
let wasBossActive = false;        // 上一帧Boss状态（检测过渡）
let _lastCanvasTransform = null;  // 画布缩放样式缓存（避免每帧重复写入）
let lastBossKey = null;           // 当前/上一场Boss的key（用于重试）
let bossEnergy = 0;               // 零能量碎片（通关收集要素 → Hub 回复零能量）
let zeroReturnTriggered = false;  // 零能量满 → 第三层切换遗憾完全体并解锁结局
let energyReturned = false;       // 能量已交还零（第一章结局演出已触发，防重复）
let zeroSolidified = false;       // 零凝实态（恢复力量后形体更完整，Hub显示暖金实影）
let _pendingHubSkit = false;      // 成功返回Hub时待触发的一次性小剧情标志（showRunSummary(true) 设置）
let ch1SkitsDone = [];            // 已触发过的小剧情编号（存档持久化，一次性）
let lastRunDied = false;          // 上一局肉鸽是否死亡（遗憾·装备残影房触发条件）

// ── 自定义光标粒子 ──
let cursorParticles = [];
function spawnCursorParticle(angle, radius, color, life) {
  return {
    angle: angle || Math.random()*Math.PI*2,
    radius: radius || 14+Math.random()*12,
    speed: 0.6+Math.random()*1.8,
    size: 1.5+Math.random()*2.5,
    alpha: 0.35+Math.random()*0.4,
    life: life || 60+Math.random()*100,
    age: 0,
    color: color || '160,200,240',
  };
}
// 初始化光标轨道粒子
for (let i=0;i<6;i++) cursorParticles.push(spawnCursorParticle());

// ═══════════════ 装备系统 ═══════════════

/** 当前装备 */
let playerWeapon = EQUIPMENT.weapons['beginner_brush'];
let playerArmor = EQUIPMENT.armors['thin_silk'];
playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : (playerArmor.defense || 0); // 同步初始防具减伤（含融合等级）
let playerSkill = EQUIPMENT.skills['concentration'];
let playerTalisman = null; // 初始无护符，需在潜航中获取

/** 技能运行时状态 */
let skillState = {
  collected: [],      // 已收集的技能字
  chargeLevel: 0,     // 蓄力型技能充能等级
  ready: false        // 技能是否已就绪
};

/** 已解锁的武器ID集合 */
let unlockedWeapons = new Set(['beginner_brush']);

// ═══════════════ 背包系统 ═══════════════

let canvasZoom = 1;           // CSS缩放，用于鼠标坐标修正
let backpackOpen = false;
let backpackItems = [];       // 当前背包中的装备文字对象
let backpackHovered = null;   // 悬停的背包物品
let backpackExpanded = null;  // 当前展开详情的物品

// 导师形体
const mentor=new MentorForm();
mentor.x=W*0.5; mentor.y=H*0.4;
mentor.init(mentor.x, mentor.y);
mentor.targetAlpha=0;

// 战斗UI的DOM引用（battle.js中声明了extern）
elComboDisplay=document.getElementById('combo-display');
elComboCount=document.getElementById('combo-count');
elComboWords=document.getElementById('combo-words');

// ── 背景粒子 ──
function initBGParticles() {
  bgParticles=[];
  const n=Math.floor(W*H/22000);
  for(let i=0;i<n;i++) bgParticles.push(new BGParticle());
}
initBGParticles();

// ═══════════════ 背包逻辑 ═══════════════

function toggleBackpack() {
  backpackOpen = !backpackOpen;
  backpackExpanded = null;
  if(backpackOpen){
    canvas.style.cursor = 'default'; // 背包模式恢复系统光标
    updateCurrencyBackpackLabel(); // 刷新货币标签
    initBackpackItems();
    document.getElementById('backpack-overlay').classList.add('show');
    document.getElementById('backpack-hint').style.opacity='0.8';
    document.getElementById('pouch-btn').classList.add('active');
    Sound.uiOpen();
    // 打开粒子
    const cx=W*0.5, cy=H*0.45;
    for(let i=0;i<20;i++) particles.push(new HitParticle(cx,cy,'#c8aa66','·'));
    // 背包教程检测
    if(Tutorial.phase===PHASE.TUTORIAL_BACKPACK&&Tutorial._introPlayed){
      const hint=document.getElementById('stage-hint');
      hint.style.opacity='0';
      setTimeout(()=>Tutorial.enterPhase(PHASE.PRE_BATTLE),500);
    }
  } else {
    canvas.style.cursor = 'none'; // 关闭背包隐藏系统光标
    document.getElementById('backpack-overlay').classList.remove('show');
    document.getElementById('pouch-btn').classList.remove('active');
    Sound.uiClose();
    // 关闭粒子
    backpackItems.forEach(item=>{
      const clr = item.data ? item.data.color : '#888';
      for(let i=0;i<6;i++) particles.push(new HitParticle(item.x,item.y,clr,'·'));
    });
    backpackItems = [];
    backpackHovered = null;
  }
}

function initBackpackItems() {
  backpackItems = [];
  // 装备融合等级标签（Lv>1 时显示）
  const equipLabel = (base, id) => {
    const lv = (typeof getEquipLevel === 'function') ? getEquipLevel(id) : 1;
    return lv > 1 ? `${base} Lv.${lv}` : base;
  };
  const items = [
    { type:'weapon', data:playerWeapon, label:playerWeapon ? equipLabel(playerWeapon.name, playerWeapon.id) : '无', cat:'攻' },
    { type:'armor',  data:playerArmor, label:playerArmor ? equipLabel(playerArmor.name, playerArmor.id) : '无', cat:'防' },
    { type:'skill',  data:playerSkill, label:playerSkill ? playerSkill.name : '凝神', cat:'skill' },
    { type:'talisman', data:playerTalisman, label:playerTalisman ? equipLabel(playerTalisman.name, playerTalisman.id) : '无', cat:'符' },
    { type:'currency', data:null, label:'', cat:'currency' },
    { type:'echo', data:null, label: '遗响 ' + (typeof echoInventory!=='undefined' ? echoInventory.length : 0), cat:'echo' },
  ];
  const cx = W*0.5, cy = H*0.45;
  const orbitR = Math.min(W,H)*0.28;
  items.forEach((item, i) => {
    const angle = (i/items.length)*Math.PI*2 - Math.PI/2;
    backpackItems.push({
      ...item,
      x: cx + Math.cos(angle)*orbitR,
      y: cy + Math.sin(angle)*orbitR*0.6,
      baseX: cx + Math.cos(angle)*orbitR,
      baseY: cy + Math.sin(angle)*orbitR*0.6,
      size: 20,
      alpha: 0,
      targetAlpha: 0.8,
      phase: Math.random()*Math.PI*2,
      hovered: false,
      _orbitAge: 0,
      _orbitBurst: 0,
    });
  });
  // 更新货币标签
  updateCurrencyBackpackLabel();
  // 延迟一帧再显示，触发缓入
  setTimeout(()=>{ backpackItems.forEach(bi=>bi.targetAlpha=0.8); }, 50);
}

/** 更新背包中局外货币位的标签和颜色 */
function updateCurrencyBackpackLabel() {
  const currencyItem = backpackItems.find(bi => bi.type === 'currency');
  if (!currencyItem) return;
  const sc = typeof soulCrystals !== 'undefined' ? soulCrystals : 0;
  currencyItem.label = `灵魂结晶 ${sc}`;
  currencyItem._currencyColor = getSoulCrystalColor(sc);
}

/** 局外货币颜色分级 */
function getSoulCrystalColor(n) {
  if (n >= 400) return '#ff88cc';  // 粉色
  if (n >= 300) return '#ffcc44';  // 金色
  if (n >= 200) return '#66dd99';  // 绿色
  if (n >= 100) return '#88bbff';  // 蓝色
  return '#cccccc';                 // 白色
}

function updateBackpackItems() {
  const cx = W*0.5, cy = H*0.42;
  backpackItems.forEach(item => {
    // alpha 平滑过渡
    item.alpha += (item.targetAlpha - item.alpha)*0.08;
    // 展开时位移到中心，否则回到轨道位置
    const isExpanded = (backpackExpanded === item);
    const tx = isExpanded ? cx : item.baseX;
    const ty = isExpanded ? cy : item.baseY;
    item.x += (tx - item.x)*0.06;
    item.y += (ty - item.y)*0.06;
    // 未展开时的微浮动（展开时不需要）
    if(!isExpanded){
      item.phase += 0.012;
      item.x += Math.sin(item.phase)*0.6;  // 小幅叠加在拉回动画上
      item.y += Math.cos(item.phase*0.7)*0.4;
    }
    // 词元轨道速度
    if(isExpanded){
      item._orbitAge += 0.022;
      item._orbitBurst += (1-item._orbitBurst)*0.1;
    } else {
      item._orbitBurst += (0-item._orbitBurst)*0.12;
    }
  });
}

function drawBackpackItems(ctx) {
  backpackItems.forEach(item => {
    if(item.alpha<0.02) return;
    const isCurrency = item.type === 'currency';
    const cfg = item.data;
    const clr = isCurrency ? (item._currencyColor || '#cccccc') : (cfg ? cfg.color || '#ccc' : '#888');
    const glowClr = isCurrency ? clr : (cfg ? cfg.glow || '#666' : '#444');
    const isExpanded = (backpackExpanded === item);
    const sz = isExpanded ? item.size*1.35 : (item.hovered ? item.size*1.15 : item.size);

    // 光晕
    if(item.hovered || isExpanded){
      ctx.save();
      ctx.shadowColor = glowClr;
      ctx.shadowBlur = isExpanded ? 30 : 18;
    }

    ctx.save();
    ctx.globalAlpha = item.alpha;
    ctx.fillStyle = clr;
    ctx.font = `${sz}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(item.label, item.x, item.y);
    ctx.restore();

    if(item.hovered || isExpanded) ctx.restore();

    // 类别小标（收缩时显示）
    if(!isExpanded && item._orbitBurst<0.3){
      ctx.save();
      ctx.globalAlpha = item.alpha*0.45*(1-item._orbitBurst);
      ctx.fillStyle = clr;
      ctx.font = '10px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center';
      if (isCurrency) {
        ctx.fillText('局外', item.x, item.y+sz*0.85);
      } else if (item.type === 'echo') {
        ctx.fillText('遗响', item.x, item.y+sz*0.85);
      } else {
        ctx.fillText(item.cat==='攻'?'武器':item.cat==='防'?'防具':item.cat==='符'?'护符':'技能', item.x, item.y+sz*0.85);
      }
      ctx.restore();
    }

    // 展开：词元环绕旋转（带缓入动画）
    if(item._orbitBurst>0.03){
      if (isCurrency) {
        // 货币位：显示来源提示文字
        const sourceHints = ['通关','结算','积累'];
        const orbitR = (44 + sourceHints.length*2)*item._orbitBurst;
        sourceHints.forEach((ch, i) => {
          const angle = item._orbitAge + (i/sourceHints.length)*Math.PI*2;
          const ox = item.x + Math.cos(angle)*orbitR;
          const oy = item.y + Math.sin(angle)*orbitR*0.7;
          const flicker = 0.5 + 0.5*Math.sin(item._orbitAge*1.5 + i);
          ctx.save();
          ctx.globalAlpha = item.alpha*item._orbitBurst*(0.4+flicker*0.3);
          ctx.fillStyle = item._currencyColor || '#cccccc';
          ctx.shadowColor = item._currencyColor || '#cccccc';
          ctx.shadowBlur = 3 + flicker*4;
          ctx.font = `14px "Noto Serif SC","SimSun",serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ch, ox, oy);
          ctx.shadowBlur = 0;
          ctx.restore();
        });
        // 总量描述
        if(item._orbitBurst>0.5){
          ctx.save();
          ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.45;
          ctx.fillStyle = 'rgba(200,210,230,0.7)';
          ctx.font = '11px "Noto Serif SC","SimSun",serif';
          ctx.textAlign = 'center';
          const sc = typeof soulCrystals !== 'undefined' ? soulCrystals : 0;
          ctx.fillText(`累计: ${sc}`, item.x, item.y + orbitR + 22);
          ctx.restore();
        }
      } else if (item.type === 'echo') {
        // 遗响位展开：icon 环绕 + 已收集名称列表
        const echoes = (typeof echoInventory !== 'undefined' && Array.isArray(echoInventory)) ? echoInventory : [];
        const orbitR = (50 + echoes.length*3)*item._orbitBurst;
        echoes.forEach((id, i) => {
          const d = (typeof ECHO_DEFS !== 'undefined') ? ECHO_DEFS[id] : null;
          if(!d) return;
          const rr = (typeof ECHO_RARITY !== 'undefined' && ECHO_RARITY[d.rarity]) || { color:'#ffb648' };
          const angle = item._orbitAge + (i/echoes.length)*Math.PI*2;
          const ox = item.x + Math.cos(angle)*orbitR;
          const oy = item.y + Math.sin(angle)*orbitR*0.7;
          const flicker = 0.5 + 0.5*Math.sin(item._orbitAge*1.5 + i);
          ctx.save();
          ctx.globalAlpha = item.alpha*item._orbitBurst*(0.5+flicker*0.4);
          ctx.fillStyle = rr.color;
          ctx.shadowColor = rr.color;
          ctx.shadowBlur = 4 + flicker*6;
          ctx.font = '17px "Noto Serif SC","SimSun",serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(d.icon || '忆', ox, oy);
          ctx.shadowBlur = 0;
          ctx.restore();
        });
        if(item._orbitBurst>0.5){
          ctx.save();
          ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.6;
          ctx.textAlign = 'center';
          const maxShow = 8;
          const show = echoes.slice(0, maxShow);
          let ty = item.y + orbitR + 22;
          show.forEach(id => {
            const d = (typeof ECHO_DEFS !== 'undefined') ? ECHO_DEFS[id] : null;
            if(!d) return;
            const rr = (typeof ECHO_RARITY !== 'undefined' && ECHO_RARITY[d.rarity]) || { color:'#ffb648' };
            ctx.fillStyle = rr.color;
            ctx.font = '12px "Noto Serif SC","SimSun",serif';
            ctx.fillText(`${d.icon||''} ${d.name}`, item.x, ty);
            ty += 18;
          });
          ctx.fillStyle = 'rgba(200,210,230,0.5)';
          ctx.font = '11px "Noto Serif SC","SimSun",serif';
          if(echoes.length === 0) ctx.fillText('（尚无遗响）', item.x, ty);
          else if(echoes.length > maxShow) ctx.fillText(`…等共 ${echoes.length} 枚`, item.x, ty + 2);
          ctx.restore();
        }
      } else {
        const chars = cfg ? (cfg.words || cfg.chars || []) : [];
        const orbitR = (50 + chars.length*3)*item._orbitBurst;
        chars.forEach((ch, i) => {
          const angle = item._orbitAge + (i/chars.length)*Math.PI*2;
          const ox = item.x + Math.cos(angle)*orbitR;
          const oy = item.y + Math.sin(angle)*orbitR*0.7;
          const flicker = 0.5 + 0.5*Math.sin(item._orbitAge*1.5 + i);
          ctx.save();
          ctx.globalAlpha = item.alpha*item._orbitBurst*(0.5+flicker*0.4);
          ctx.fillStyle = clr;
          ctx.shadowColor = glowClr;
          ctx.shadowBlur = 4 + flicker*6;
          ctx.font = `17px "Noto Serif SC","SimSun",serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(ch, ox, oy);
          ctx.shadowBlur = 0;
          ctx.restore();
        });

        // 描述（轨道下方）+ 流派标签 + 武器buff + 熟练度
        if(item._orbitBurst>0.5 && cfg){
          ctx.save();
          ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.45;
          ctx.fillStyle = 'rgba(200,210,230,0.7)';
          ctx.font = '11px "Noto Serif SC","SimSun",serif';
          ctx.textAlign = 'center';
          ctx.fillText(cfg.desc||'', item.x, item.y + orbitR + 22);
          let extraLine = 40;
          // 流派标签（武器/遗响）：一眼可辨所属流派 + 当前协同件数
          if (cfg.school && typeof SCHOOLS !== 'undefined' && SCHOOLS[cfg.school] && typeof schoolCount === 'function') {
            const s = SCHOOLS[cfg.school];
            const n = schoolCount(cfg.school);
            ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.85;
            ctx.fillStyle = s.color || '#cccccc';
            ctx.fillText(`【${s.icon}${s.name}】协同 ${n}/2`, item.x, item.y + orbitR + 40);
            extraLine = 58;
          }
          // 武器buff（深层掉落词缀）
          if (item.type === 'weapon' && typeof weaponBuffs !== 'undefined' && weaponBuffs[cfg.id]
              && typeof WEAPON_BUFFS !== 'undefined' && WEAPON_BUFFS[weaponBuffs[cfg.id]]) {
            const bd = WEAPON_BUFFS[weaponBuffs[cfg.id]];
            ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.7;
            ctx.fillStyle = bd.color || '#ffcc66';
            ctx.fillText(`【${bd.name}】${bd.desc}`, item.x, item.y + orbitR + extraLine);
            extraLine = 76;
          }
          // 熟练度（武器/防具/护符，非技能/货币/遗响）
          if ((item.type === 'weapon' || item.type === 'armor' || item.type === 'talisman') && typeof equipProficiency !== 'undefined') {
            const prof = equipProficiency[cfg.id] || 0;
            const thr = (typeof EQUIP_UNLOCK !== 'undefined') ? EQUIP_UNLOCK.THRESHOLD : 5;
            ctx.globalAlpha = item.alpha*(item._orbitBurst-0.5)*2*0.7;
            ctx.fillStyle = prof >= thr ? 'rgba(255,220,120,0.85)' : 'rgba(200,210,230,0.5)';
            ctx.fillText(prof >= thr ? `熟练 ${prof} · 已解锁开局池` : `熟练 ${prof}/${thr}`, item.x, item.y + orbitR + extraLine);
          }
          ctx.restore();
        }
      }
    }
  });
}

function hitTestBackpack(mx, my) {
  backpackHovered = null;
  for(let item of backpackItems){
    item.hovered = false;
    const w = Math.max(item.label.length*item.size*0.5, 60);
    const h = item.size*1.2;
    if(mx>item.x-w/2 && mx<item.x+w/2 && my>item.y-h/2 && my<item.y+h/2){
      item.hovered = true;
      backpackHovered = item;
    }
  }
  canvas.style.cursor = backpackHovered ? 'pointer' : 'default';
}

function expandBackpackItem(item) {
  backpackExpanded = item;
  const cfg = item.data;
  const clr = item.type === 'currency' ? (item._currencyColor || '#cccccc') : (cfg ? cfg.color : '#ccc');
  // 粒子爆发（文字道式 enterWorld）
  for(let i=0;i<30;i++) particles.push(new HitParticle(item.x,item.y,clr,'·'));
  // 其他物品淡出
  backpackItems.forEach(bi => {
    bi.targetAlpha = (bi===item) ? 1 : 0.12;
  });
}

function collapseBackpackItem() {
  if(!backpackExpanded) return;
  const cfg = backpackExpanded.data;
  const clr = backpackExpanded.type === 'currency' ? (backpackExpanded._currencyColor || '#cccccc') : (cfg ? cfg.color : '#ccc');
  // 粒子爆发（文字道式 leaveWorld）
  for(let i=0;i<18;i++) particles.push(new HitParticle(backpackExpanded.x,backpackExpanded.y,clr,'·'));
  backpackExpanded = null;
  // 所有物品恢复
  backpackItems.forEach(bi => { bi.targetAlpha = 0.8; });
}

function handleBackpackClick() {
  if(backpackHovered){
    // 点击已在展开的物品 → 收起
    if(backpackExpanded === backpackHovered){
      collapseBackpackItem();
    } else {
      // 切换到新物品
      if(backpackExpanded) collapseBackpackItem();
      expandBackpackItem(backpackHovered);
    }
  } else {
    // 点击空白
    if(backpackExpanded){
      collapseBackpackItem();
    } else {
      toggleBackpack();
    }
  }
}

// ── update ──
function update(dt) {
  // ═══════════ 地图淡入淡出过渡 ═══════════
  if (typeof mapTransitionDir !== 'undefined' && mapTransitionDir !== 0) {
    if (mapTransitionDir === -1) {
      // 淡入地图
      mapTransitionAlpha = Math.max(0, (mapTransitionAlpha || 1) - dt * 2.2);
      if (mapTransitionAlpha <= 0) { mapTransitionAlpha = 0; mapTransitionDir = 0; }
    } else if (mapTransitionDir === 1) {
      // 淡出地图
      mapTransitionAlpha = Math.min(1, (mapTransitionAlpha || 0) + dt * 2.2);
      if (mapTransitionAlpha >= 1) { mapTransitionAlpha = 1; mapTransitionDir = 0; }
    }
  }

  if(backpackOpen) {
    updateBackpackItems();
    return; // 背包打开时暂停游戏
  }

  // 遗响三选一模态（最高优先级，冻结游戏）
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive) {
    if (typeof updateEchoChoice === 'function') updateEchoChoice(dt);
    return;
  }

  // Hub模式
  if(typeof hubActive !== 'undefined' && hubActive) {
    if(typeof Dialogue !== 'undefined') Dialogue.update(dt);
    if(typeof Cinematic !== 'undefined') Cinematic.update(dt);
    if(typeof mentor !== 'undefined') mentor.update(Date.now());
    if(typeof updateHub === 'function') updateHub(dt);
    if(typeof updateBestiary === 'function') updateBestiary(dt);
    if(typeof updateAchievements === 'function') updateAchievements(dt);
    return; // Hub中暂停游戏逻辑
  }

  // 商店模式（与背包互斥）
  if(typeof shopOpen !== 'undefined' && shopOpen) {
    if(typeof updateShopItems === 'function') updateShopItems();
    return;
  }

  // 装备切换提示/事件选项 → 冻结敌人但不冻结渲染
  const equipPromptActive = (typeof equipPrompt !== 'undefined' && equipPrompt) || (typeof eventOptionsActive !== 'undefined' && eventOptionsActive);

  Cinematic.update(dt);
  Dialogue.update(dt);
  Tutorial.update(dt);

  // ═══════════ 房间对话推进 ═══════════
  if (typeof advanceRoomDialogue === 'function' && typeof currentDiveRoom !== 'undefined' && currentDiveRoom) {
    advanceRoomDialogue();
  }

  // ═══════════ 潜航过渡对话（pre-dive）═══
  if (prologuePhase === PROLOGUE.PRE_DIVE && preDiveStep >= 0 && !Dialogue.active) {
    const next = preDiveStep + 1;
    if (next < preDiveTexts.length) {
      Dialogue.show(preDiveTexts[next]);
      preDiveStep = next;
    } else {
      // 全部说完 → 启动地图
      preDiveStep = -1; preDiveTexts = [];
      prologuePhase = PROLOGUE.DIVING;
      if (typeof initMap === 'function') initMap();
      document.getElementById('enemy-zone').style.opacity = '0';
      document.getElementById('stage-hint').style.opacity = '0';
    }
  }

  // ═══════════ 房间内容更新 ═══════════
  if (typeof updateRoomElements === 'function') updateRoomElements();

  // ═══════════ 自定义光标：引力场/心锁/执念锁链拖拽鼠标 ═══════════
  const gravOn = bossActive && bossState && bossState._gravityActive;
  const lockOn = bossActive && bossState && (bossState._heartLock || (bossState._gripChain && bossState._gripChain.phase === 'locked'));

  if (gravOn) {
    const gx = W * 0.5, gy = H * 0.32;
    const pull = bossState._gravityIntensity * 0.55; // 轻柔拖拽，微微失控感
    mx += (gx - mx) * pull * dt;
    my += (gy - my) * pull * dt;
    // 引力场粒子：从光标被拉向中心
    if (Math.random() < 0.6) {
      const a = Math.atan2(gy - my, gx - mx);
      cursorParticles.push(spawnCursorParticle(a, 8+Math.random()*8, '255,130,80', 20+Math.random()*30));
    }
  }

  if (lockOn) {
    const lock = bossState._heartLock
      || { anchorX: bossState._gripChain.anchorX, anchorY: bossState._gripChain.anchorY, radius: bossState._gripChain.radius };
    const dx = mx - lock.anchorX, dy = my - lock.anchorY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > lock.radius && dist > 0.01) {
      mx = lock.anchorX + (dx / dist) * lock.radius;
      my = lock.anchorY + (dy / dist) * lock.radius;
    }
  }

  // 光标轨道粒子更新
  for (let cp of cursorParticles) {
    cp.age++;
    cp.angle += cp.speed * dt;
    cp.alpha *= 0.995;
    // 引力场：粒子被拉向中心
    if (gravOn) {
      const gx = W * 0.5, gy = H * 0.32;
      const px = mx + Math.cos(cp.angle) * cp.radius;
      const py = my + Math.sin(cp.angle) * cp.radius;
      cp.radius += (60 - cp.radius) * 0.03; // 逐渐拉向外圈
      cp.angle += Math.atan2(gy - py, gx - px) * 0.04; // 偏转朝向中心
      cp.speed += (3.5 - cp.speed) * 0.02; // 加速旋转
    }
  }
  cursorParticles = cursorParticles.filter(cp => cp.age < cp.life && cp.alpha > 0.03);
  // 维持粒子数：引力场时更多
  const cpTarget = gravOn ? 10 : 6;
  while (cursorParticles.length < cpTarget) {
    const clr = gravOn ? '255,130,80' : '160,200,240';
    cursorParticles.push(spawnCursorParticle(undefined, undefined, clr, gravOn ? 25+Math.random()*25 : 60+Math.random()*100));
  }

  // 始终隐藏系统光标（背包/图鉴/商店/地图/事件选项等UI模式除外，保留hover反馈）
  const _uiModes = [typeof backpackOpen !== 'undefined' && backpackOpen,
    typeof bestiaryOpen !== 'undefined' && bestiaryOpen,
    typeof achievementsOpen !== 'undefined' && achievementsOpen,
    typeof shopOpen !== 'undefined' && shopOpen,
    typeof mapActive !== 'undefined' && mapActive,
    typeof eventOptionsActive !== 'undefined' && eventOptionsActive,
    typeof equipPromptActive !== 'undefined' && equipPromptActive];
  if (!_uiModes.some(Boolean) && canvas.style.cursor !== 'none') {
    canvas.style.cursor = 'none';
  }

  // 遗憾融合演出更新
  if (typeof fusionActive !== 'undefined' && fusionActive && typeof updateFusion === 'function') {
    updateFusion(dt);
    // 融合演出期间强制1x缩放
    canvasZoom = 1;
  }

  // Boss更新
  if(bossActive && typeof updateBoss==='function'){
    updateBoss(dt);
    // 弹幕类攻击时缩小画面
    const isBulletHell = bossState && bossState.phase===BOSS_PHASE.ATTACK
      && bossState.currentAttack
      && bossState.currentAttack.type !== 'left_charge';
    const targetZoom = isBulletHell ? 1.4 : 1;
    canvasZoom = targetZoom;
    // 仅值变化时写入样式，避免每帧触发重算
    const tf = `scale(${targetZoom})`;
    if (_lastCanvasTransform !== tf) { canvas.style.transform = tf; canvas.style.transformOrigin = 'center center'; _lastCanvasTransform = tf; }

    // 非攻击阶段定时补字（split/charging/vulnerable）
    if(bossState && bossState.phase!==BOSS_PHASE.ATTACK && bossState.phase!==BOSS_PHASE.DEFEATED){
      balanceFrames++;
      if(balanceFrames>50){balanceFrames=0;balanceWords();}
    }
  } else {
    canvasZoom = 1;
    if (_lastCanvasTransform !== 'scale(1)') { canvas.style.transform = 'scale(1)'; _lastCanvasTransform = 'scale(1)'; }
  }

  // 检测憾Boss结束（击败或逃跑统一路径，战败不触发）
  if (wasBossActive && !bossActive && !prologueHanDefeated
      && Tutorial.phase !== PHASE.DEFEAT  // 战败中不触发过渡
      && (prologuePhase === PROLOGUE.BOSS_HAN || prologuePhase === PROLOGUE.PRE_DIVE)) {
    prologueHanDefeated = true;
    startPreDiveTransition();
  }
  wasBossActive = bossActive;

  // 遗憾融合演出完成 → 传送安全屋
  if (typeof fusionActive !== 'undefined' && fusionActive && typeof fusionState !== 'undefined' && fusionState && fusionState.phase === 5/*FUSION.DONE*/ && !Dialogue.active) {
    fusionActive = false; fusionState = null;
    battleWords = [];
    particles = [];
    document.getElementById('stun-overlay').classList.remove('active');
    // 遗击败奖励
    if (typeof grantShards === 'function' && typeof SHARD_REWARDS !== 'undefined') {
      grantShards(SHARD_REWARDS.BOSS_YI, W*0.5, H*0.35);
    }
    if (typeof returnToMap === 'function') {
      // 用真实房间id（肉鸽动态id如boss_0），硬编码'boss_yi'会导致boss房完成不了、肉鸽卡住
      const id = (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.id) || 'boss_yi';
      returnToMap(id);
    }
  }

  // 地图模式：检查房间完成 + 战斗波次
  if (prologuePhase === PROLOGUE.DIVING && typeof currentDiveRoom !== 'undefined' && currentDiveRoom) {
    // 战斗波次检测
    if (typeof checkCombatWave === 'function') checkCombatWave();
    // 静流房间治愈泡泡
    if (typeof updateRestBubbles === 'function') updateRestBubbles(dt);
    // 宝物房间检测
    if (typeof checkTreasureRoom === 'function') checkTreasureRoom();
    // 事件房间怪物检测
    if (typeof checkEventMonster === 'function') checkEventMonster();
    // 事件选项动画
    if (typeof updateEventOptions === 'function') updateEventOptions(dt);
    // 房间完成检测（装备提示期间跳过）
    if (!equipPromptActive && typeof checkRoomComplete === 'function' && checkRoomComplete() && !Dialogue.active) {
      const roomId = currentDiveRoom.id;
      currentDiveRoom = null;
      if (typeof returnToMap === 'function') returnToMap(roomId);
    }
  }

  // 战斗逻辑（仅在BATTLE阶段；装备提示/纯对话房间/过渡期/地图模式/序章结束后暂停）
  // 事件房间有怪物战斗时不视为被动
  // 事件房仅当确实生成过怪物波次时才视为战斗（startRoom防御性设enemyHP=999，直接用它会导致对话阶段误显示空敌人血条）
  const eventFighting = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'event' && typeof eventMonsterDefeated !== 'undefined' && !eventMonsterDefeated && typeof eventMonsterWaves !== 'undefined' && eventMonsterWaves > 0 && enemyHP > 0;
  const inPassiveRoom = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && (currentDiveRoom.type === 'start' || currentDiveRoom.type === 'rest' || (currentDiveRoom.type === 'event' && !eventFighting) || currentDiveRoom.type === 'safe_house');
  const pauseBattle = equipPromptActive || inPassiveRoom || prologuePhase === PROLOGUE.PRE_DIVE || prologuePhase === PROLOGUE.END || (typeof mapActive !== 'undefined' && mapActive);
  const inBossRoomWaiting = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'boss' && !bossActive;
  if(Tutorial.phase===PHASE.BATTLE && !pauseBattle){
    if(bossActive){
      document.getElementById('enemy-zone').style.opacity = '0';
    } else if (inBossRoomWaiting) {
      // Boss房间等待中，不显示普通敌人也不攻击
      document.getElementById('enemy-zone').style.opacity = '0';
    } else {
      document.getElementById('enemy-zone').style.opacity = '1';
      // 多敌人攻击计时（每个存活敌人独立计时器；末尾同步主敌人镜像）
      if (typeof updateEnemyTimers === 'function') updateEnemyTimers(dt);
      else { enemyTimer-=dt; if(enemyTimer<=0){enemyTimer=0;enemyAttack();} }
      const timerFill=document.getElementById('enemy-timer-fill');
      timerFill.style.width=`${Math.max(0,(enemyTimer/enemyInterval)*100)}%`;
      if(enemyTimer<1.5) timerFill.classList.add('urgent');
      else timerFill.classList.remove('urgent');

      // 宝物房间不生成普通战斗文字
      const inTreasureRoom = typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'treasure';
      if (!inTreasureRoom) {
        balanceFrames++;
        if(balanceFrames>55){balanceFrames=0;balanceWords();}
      }
    }
  }
  // 过渡/结束阶段：强制隐藏敌人UI
  if (pauseBattle) {
    document.getElementById('enemy-zone').style.opacity = '0';
  }

  // 连击衰减
  if(comboTimer>0){comboTimer-=dt;if(comboTimer<=0){combo=0;comboWords=[];elComboDisplay.classList.remove('show');}}

  // 护盾衰减
  if (hasShield && shieldHP > 0) {
    shieldDecayTimer += dt;
    if (shieldDecayTimer > 5.0) { shieldDecayTimer = 0; shieldHP = Math.max(0, shieldHP - 1); updatePlayerUI(); }
  } else { shieldDecayTimer = 0; }

  // 焚天「炎」debuff
  if (blazeCooldown > 0) { blazeCooldown -= dt; if (blazeCooldown <= 0) blazeProgress = 0; }
  if (blazeActive && blazeTimer > 0) {
    blazeTimer -= dt;
    // 每秒造成灼烧伤害
    if (Math.floor(blazeTimer * 10) !== Math.floor((blazeTimer + dt) * 10)) {
      // 炎流派协同：灼烧伤害加成（schoolMod 定义在 echo.js）
      const blazeDmg = Math.floor((playerWeapon ? playerWeapon.damage : 5) * 0.5
        * (1 + (typeof schoolMod==='function'?schoolMod('blazeDmgMult','blaze'):0)));
      if (bossActive && typeof damageBoss === 'function') {
        // Boss战：走damageBoss，复用20%逃跑/假撤退阈值与defeat判定（灼烧也能击杀Boss）
        if (bossState && bossState.hp > 0) damageBoss(blazeDmg, 1);
      } else if (typeof enemyList !== 'undefined' && enemyList.some(e => e.alive)) {
        // 多敌人：灼烧全体存活敌人
        for (const e of enemyList) {
          if (!e.alive) continue;
          e.hp = Math.max(0, e.hp - blazeDmg);
          if (e.hp <= 0) e.alive = false;
        }
        if (typeof syncEnemyCompat === 'function') syncEnemyCompat();
        updateEnemyUI();
      }
      // 灼烧粒子
      const ex = enemyEntity ? enemyEntity.x : W * 0.5;
      const ey = enemyEntity ? enemyEntity.y : H * 0.22;
      particles.push(new DamageText(ex + (Math.random() - 0.5) * 30, ey - 10, `炎-${blazeDmg}`, '#ff6600'));
    }
    if (blazeTimer <= 0) { blazeActive = false; blazeCooldown = 3.0; }
  }

  // 滞留伤害 DoT（鸡你太美精神污染）：tick 走 dealDamageToEnemy 正常统计+武器buff
  if (typeof enemyList !== 'undefined') {
    for (const e of enemyList) {
      if (!e.alive || !e.dot) continue;
      e.dot.timer += dt;
      if (e.dot.timer >= e.dot.tick) {
        e.dot.timer = 0;
        e.dot.duration -= e.dot.tick;
        if (typeof dealDamageToEnemy === 'function') dealDamageToEnemy(e, e.dot.dmg, false, false);
        if (e.dot.duration <= 0) e.dot = null;
      }
    }
  }

  // 敌人实体动画 + 普通敌人弹幕
  if (typeof updateEnemyEntity === 'function') updateEnemyEntity(dt);
  if (typeof updateEnemyProjectiles === 'function') updateEnemyProjectiles(dt);

  // 导师形体动画
  mentor.update(Date.now());

  // 主角飘浮文字碎片（drift模式）
  if(Tutorial.driftTexts && Tutorial.driftTexts.length > 0) {
    Tutorial.driftTexts.forEach(d => { if(!d.dead) d.update(dt); });
    Tutorial.driftTexts = Tutorial.driftTexts.filter(d => !d.dead);
  }

  // 战场文字
  const diff=DIFFICULTY[difficulty];
  const spd = Tutorial.phase===PHASE.BATTLE ? diff.speed : 0.5;
  battleWords.forEach(bw=>bw.update(spd, dt*60)); // 第二参数帧率归一化：消除高刷屏加速/文字提前消失
  battleWords=battleWords.filter(bw=>bw.alive||bw.alpha>0.03);

  // 粒子
  particles=particles.filter(p=>!p.dead);particles.forEach(p=>p.update(dt));
  bgParticles.forEach(p=>p.update());

  // 震动衰减
  if(shakeAmount>0) shakeAmount*=0.85;if(shakeAmount<0.1) shakeAmount=0;

  // 玩家血条受击抖动
  if (typeof playerHurtTimer !== 'undefined' && playerHurtTimer > 0) {
    playerHurtTimer -= dt;
    const el = document.getElementById('player-zone');
    if (el) {
      const shake = Math.sin(playerHurtTimer * 45) * playerHurtTimer * 14;
      el.style.transform = `translateX(-50%) translateX(${shake}px)`;
    }
  } else {
    const el = document.getElementById('player-zone');
    if (el && el.style.transform.includes('translateX(-50%) translateX')) {
      el.style.transform = 'translateX(-50%)';
    }
  }
}

// ═══════════════ 自定义光标绘制 ═══════════════

function drawGameCursor(ctx) {
  const now = performance.now();
  const gravOn = bossActive && bossState && bossState._gravityActive;
  const lockOn = bossActive && bossState && bossState._heartLock;
  const inCombat = Tutorial.phase === PHASE.BATTLE || (typeof Tutorial.phase === 'string' && Tutorial.phase.startsWith('tutorial_'));
  const inMenu = !inCombat && Tutorial.phase !== PHASE.EYE_OPEN;

  // 检测悬停：文字或选择肢上
  const hovering = battleWords.some(bw => bw.alive && bw.hovered) ||
    (Tutorial.driftTexts && Tutorial.driftTexts.some(d => !d.dead && d.hovered));

  // ── 颜色与大小 ──
  let mainColor, glowColor, cursorSize;
  if (gravOn) {
    mainColor = '#ffaa88'; glowColor = 'rgba(255,100,50,0.7)'; cursorSize = 24;
  } else if (lockOn) {
    mainColor = '#ff9988'; glowColor = 'rgba(255,80,45,0.6)'; cursorSize = 23;
  } else if (inCombat) {
    mainColor = '#c8ddf8'; glowColor = 'rgba(150,200,255,0.5)'; cursorSize = 22;
  } else {
    mainColor = '#aabbdd'; glowColor = 'rgba(140,170,220,0.3)'; cursorSize = 18;
  }

  // 悬停时光标放大变亮
  if (hovering) {
    cursorSize += 4;
    glowColor = glowColor.replace(/[\d.]+\)$/, (v) => Math.min(1, parseFloat(v) * 1.5) + ')');
  }

  ctx.save();
  const breathe = 0.75 + 0.25 * Math.sin(now * 0.0025);

  // ── 外层光晕 ──
  const haloGrad = ctx.createRadialGradient(mx, my, cursorSize * 0.3, mx, my, cursorSize * 2.2);
  haloGrad.addColorStop(0, glowColor);
  haloGrad.addColorStop(0.5, glowColor.replace(/[\d.]+\)$/, (parseFloat(glowColor.match(/[\d.]+\)$/)[0]) * 0.3) + ')'));
  haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath(); ctx.arc(mx, my, cursorSize * 2.2, 0, Math.PI * 2); ctx.fill();

  // ── 轨道粒子 ──
  for (let cp of cursorParticles) {
    const lifeRatio = 1 - cp.age / cp.life;
    const px = mx + Math.cos(cp.angle) * cp.radius;
    const py = my + Math.sin(cp.angle) * cp.radius;
    const alpha = cp.alpha * lifeRatio * breathe;
    if (alpha < 0.02) continue;
    ctx.fillStyle = `rgba(${cp.color},${alpha})`;
    ctx.shadowColor = `rgba(${cp.color},${alpha * 0.5})`;
    ctx.shadowBlur = 3;
    ctx.beginPath(); ctx.arc(px, py, cp.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;

  // ── 主字"识" ──
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 14 * breathe;

  if (gravOn) {
    // 引力拉伸：向中心方向拉伸变形（save/restore保护）
    const gx = W * 0.5, gy = H * 0.32;
    const dx = gx - mx, dy = gy - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const stretch = Math.min(dist * 0.0028, 0.55);
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(angle);
    ctx.scale(1 + stretch, 1 - stretch * 0.5);
    ctx.fillStyle = mainColor;
    ctx.font = `${cursorSize}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('识', 0, 0);
    ctx.restore();
  } else if (lockOn) {
    // 心锁：微小抖动
    const shack = 1.5 * Math.sin(now * 0.012);
    ctx.fillStyle = mainColor;
    ctx.font = `${cursorSize}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('识', mx + shack, my + shack * 0.7);
  } else {
    ctx.fillStyle = mainColor;
    ctx.font = `${cursorSize}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('识', mx, my);
  }
  ctx.shadowBlur = 0;

  // ── 十字准星（仅战斗中）──
  if (inCombat && !gravOn && !lockOn) {
    const cs = cursorSize * 0.7;
    ctx.strokeStyle = `rgba(200,220,255,${0.25 * breathe})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mx - cs, my); ctx.lineTo(mx - cs * 0.3, my);
    ctx.moveTo(mx + cs * 0.3, my); ctx.lineTo(mx + cs, my);
    ctx.moveTo(mx, my - cs); ctx.lineTo(mx, my - cs * 0.3);
    ctx.moveTo(mx, my + cs * 0.3); ctx.lineTo(mx, my + cs);
    ctx.stroke();
  }

  // ── 引力特效：光标到中心的拉力可视化 ──
  if (gravOn) {
    const gx = W * 0.5, gy = H * 0.32;
    const dx = gx - mx, dy = gy - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 8) {
      // 拉力光束（半透明渐变线）
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.08 * breathe;
      ctx.strokeStyle = '#ff8866';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(gx, gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      // 粒子轨迹（从光标被拉向中心，越近越密越亮）
      const steps = Math.floor(dist / 10);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const px = mx + dx * t, py = my + dy * t;
        const alpha = 0.08 + t * 0.35;
        const sz = 4 + t * 6;
        ctx.fillStyle = `rgba(255,${100 + Math.floor(t * 60)},${50 + Math.floor(t * 40)},${alpha})`;
        ctx.font = `${sz}px "Noto Serif SC","SimSun",serif`;
        ctx.textAlign = 'center';
        ctx.fillText('·', px, py);
      }
    }
  }

  ctx.restore();
}

// ── draw ──
function drawBackground() {
  const grad=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,Math.max(W,H)*0.7);
  grad.addColorStop(0,'#0a0a28');grad.addColorStop(0.5,'#06061a');grad.addColorStop(1,'#030310');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
}

function draw() {
  ctx.clearRect(0,0,W,H);

  const overlay=Cinematic.getOverlay();
  const glitch=Cinematic.getGlitchOffset();

  if(overlay.overlayAlpha >= 0.98){
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    return;
  }

  ctx.save();
  if(shakeAmount>0){ctx.translate((Math.random()-0.5)*shakeAmount*2,(Math.random()-0.5)*shakeAmount*2);}
  if(glitch.x||glitch.y) ctx.translate(glitch.x,glitch.y);

  drawBackground();
  bgParticles.forEach(p=>p.draw(ctx));

  // 导师形体（非战斗/非结局/非背包/非Hub阶段显示，Hub自己绘制）
  const ph = Tutorial.phase;
  const inHub = typeof hubActive !== 'undefined' && hubActive;
  if(!backpackOpen && !inHub && ph!==PHASE.BATTLE && ph!==PHASE.INIT && ph!==PHASE.END){
    mentor.draw(ctx);
  }

  // Boss进场暗角（画在文字之前，文字透过暗角可见）
  if (!backpackOpen && bossActive && bossState && bossState.phase === 'entrance' && !bossState._landed) {
    const s = bossState;
    const fallProgress = Math.min(1, (s.left.y + 120) / (H * 0.2 + 120));
    const vignette = ctx.createRadialGradient(W*0.5, H*0.2, H*0.3, W*0.5, H*0.2, Math.max(W,H)*0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.5, `rgba(30,5,0,${0.3*fallProgress})`);
    vignette.addColorStop(1, `rgba(10,0,0,${0.6*fallProgress})`);
    ctx.save();
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if(!backpackOpen){
    // 敌人编队（先于文字绘制，在文字下方）
    if (!bossActive && typeof enemyList !== 'undefined' && enemyList.length > 0) {
      drawEnemyEntity(ctx);
    }
    // 普通敌人弹幕（绘制在战场文字下方）
    if (typeof drawEnemyProjectiles === 'function') drawEnemyProjectiles(ctx);
    battleWords.forEach(bw=>bw.draw(ctx));
    particles.forEach(p=>p.draw(ctx));
    // Boss渲染
    if(bossActive && typeof drawBoss==='function') drawBoss(ctx);
    // 遗憾融合演出渲染（覆盖在Boss之上）
    if (typeof fusionActive !== 'undefined' && fusionActive && typeof drawFusion === 'function') drawFusion(ctx);
  }

  // 主角飘浮文字碎片（drift模式）
  if(!backpackOpen && Tutorial.driftTexts && Tutorial.driftTexts.length > 0) {
    Tutorial.driftTexts.forEach(d => { if(!d.dead) d.draw(ctx); });
  }

  // 睁眼演出提示文字
  if(Cinematic.eyeOpen.phase===2){
    const prog=Cinematic.eyeOpen.brightness;
    if(prog>0.3){
      ctx.save();ctx.globalAlpha=Math.min(1,(prog-0.3)/0.7*0.5);
      ctx.fillStyle='#8899cc';
      ctx.font='16px "Noto Serif SC","SimSun",serif';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('意识之海 · 深度 ???',W/2,H/2+80);
      ctx.restore();
    }
  }

  // Hub模式（Canvas绘制）
  if(typeof hubActive !== 'undefined' && hubActive){
    if(typeof drawHub === 'function') drawHub(ctx);
  }

  // 图鉴（Hub中打开，覆盖在Hub之上）
  if(typeof bestiaryOpen !== 'undefined' && bestiaryOpen){
    if(typeof drawBestiary === 'function') drawBestiary(ctx);
  }

  // 成就（Hub中打开，覆盖在Hub之上，与图鉴互斥）
  if(typeof achievementsOpen !== 'undefined' && achievementsOpen){
    if(typeof drawAchievements === 'function') drawAchievements(ctx);
  }

  // 商店模式（Canvas绘制，优先于背包）
  if(typeof shopOpen !== 'undefined' && shopOpen){
    if(typeof drawShop === 'function') drawShop(ctx);
  }

  // 背包模式：暗色遮罩 + 囊圆 + 漂浮装备文字
  if(backpackOpen){
    ctx.save();
    // 深色模糊遮罩
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);

    // 囊圆 — 暖黄色大圆，象征行囊
    const cx = W*0.5, cy = H*0.45;
    const circleR = Math.min(W,H)*0.34;
    const grad = ctx.createRadialGradient(cx, cy, circleR*0.3, cx, cy, circleR);
    grad.addColorStop(0, 'rgba(180,160,100,0.06)');
    grad.addColorStop(0.6, 'rgba(140,120,60,0.12)');
    grad.addColorStop(1, 'rgba(80,60,20,0)');
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, circleR, 0, Math.PI*2); ctx.fill();

    // 囊圆的细边框 — 微弱暖金色光环
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(200,170,100,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, circleR, 0, Math.PI*2); ctx.stroke();

    // 标题
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(200,220,240,0.5)';
    ctx.font = '16px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText('意识行囊', W/2, H*0.15);
    ctx.restore();
    drawBackpackItems(ctx);
  }

  ctx.restore();

  // 暗层叠加
  if(overlay.overlayAlpha>0.01){
    ctx.save();ctx.globalAlpha=overlay.overlayAlpha;
    ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  // 地图渲染（背包打开时不绘制）
  if (!backpackOpen && typeof drawMap === 'function' && typeof mapActive !== 'undefined' && mapActive) {
    ctx.save();
    ctx.globalAlpha = 1 - (typeof mapTransitionAlpha !== 'undefined' ? mapTransitionAlpha : 0);
    drawMap(ctx);
    ctx.restore();
  }

  // 地图过渡遮罩
  if (!backpackOpen && typeof mapTransitionDir !== 'undefined' && mapTransitionDir === 1 && typeof mapTransitionAlpha !== 'undefined') {
    ctx.save();
    ctx.globalAlpha = mapTransitionAlpha;
    ctx.fillStyle = '#020214';
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  // 房间特有元素（金色装备字等）
  if (typeof drawRoomElements === 'function') drawRoomElements(ctx);

  // 事件选择肢 + 装备切换提示
  if (typeof drawEventOptions === 'function') drawEventOptions(ctx);
  if (typeof drawEquipPrompt === 'function') drawEquipPrompt(ctx);

  // 遗响三选一（最顶层 UI 覆盖层）
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof drawEchoChoice === 'function') drawEchoChoice(ctx);

  // Glitch扫描线
  if(Cinematic.glitch.active){
    const i=Cinematic.glitch.intensity*(Cinematic.glitch.timer/0.4);
    ctx.save();ctx.globalAlpha=i*0.3;
    for(let j=0;j<Math.floor(i*5);j++){
      const gy=Math.random()*H;
      ctx.fillStyle=`rgba(${Math.random()>0.5?'180,140,255':'140,200,255'},0.5)`;
      ctx.fillRect(0,gy,W,1+Math.random()*3);
    }
    ctx.restore();
  }

  // 自定义光标（最顶层，覆盖地图/UI/特效）
  if (!backpackOpen && mx > 0 && my > 0) drawGameCursor(ctx);
}

// ── 主循环 ──
let lastTime=performance.now();
function loop(now){
  const dt=Math.min((now-lastTime)/1000,0.1);
  lastTime=now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ── 输入处理 ──

canvas.addEventListener('mousemove',e=>{
  // CSS缩放时修正坐标（transform:scale以中心为原点）
  if(canvasZoom!==1){
    mx = (e.clientX - W/2)/canvasZoom + W/2;
    my = (e.clientY - H/2)/canvasZoom + H/2;
  } else {
    mx=e.clientX;my=e.clientY;
  }

  // 遗响三选一悬停
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive && typeof hitTestEchoChoice === 'function') {
    const hit = hitTestEchoChoice(mx, my);
    canvas.style.cursor = hit ? 'pointer' : 'default';
    return;
  }

  // 事件选择肢悬停
  if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof hitTestEventOptions === 'function') {
    hitTestEventOptions(mx, my);
    canvas.style.cursor = 'pointer';
    return;
  }

  // 装备切换提示悬停
  if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof hitTestEquipPrompt === 'function') {
    hitTestEquipPrompt(mx, my);
    canvas.style.cursor = 'pointer';
    return;
  }

  // Hub模式（自定义光标悬浮检测）
  if(typeof hubActive !== 'undefined' && hubActive && !backpackOpen) {
    canvas.style.cursor = 'default';
    // 小萤和肉鸽按钮的hover由updateHub处理
    return;
  }

  // 商店模式（优先于背包）
  if(typeof shopOpen !== 'undefined' && shopOpen) {
    if(typeof hitTestShop === 'function') hitTestShop(mx, my);
    return;
  }

  // 背包模式
  if(backpackOpen) {
    hitTestBackpack(mx, my);
    return;
  }

  // 地图模式：悬停节点
  if (typeof mapActive !== 'undefined' && mapActive && typeof hitTestMap === 'function') {
    hitTestMap(mx, my);
    canvas.style.cursor = mapSelectedNode ? 'pointer' : 'default';
    return;
  }

  const ph=Tutorial.phase;

  // 飘浮选择肢悬停
  if(Tutorial._driftActive && Tutorial._driftSettled && !Tutorial._driftSelected) {
    let anyHovered = false;
    for(let dt of Tutorial.driftTexts) {
      dt.hovered = !dt.dead && dt.hitTest(mx, my);
      if(dt.hovered) anyHovered = true;
    }
    // 自定义光标模式下，hover反馈由drawGameCursor处理
    if(anyHovered) return;
  }

  // 囊字悬停
  const pouchEl = document.getElementById('pouch-btn');
  if(pouchEl){
    const r = pouchEl.getBoundingClientRect();
    if(mx>=r.left&&mx<=r.right&&my>=r.top&&my<=r.bottom){
      canvas.style.cursor = 'pointer';
      return;
    }
  }

  if(ph===PHASE.BATTLE||ph.startsWith('tutorial_')){
    // 自定义光标模式，hover高亮由BattleWord自身glowExtra处理
    let hovered=null;
    for(let bw of battleWords){
      bw.hovered=false;bw.glowExtra=0;
      if(bw.alive&&bw.hitTest(mx,my)&&bw.cooldown<=0){hovered=bw;bw.hovered=true;bw.glowExtra=12;}
    }
  }
});

canvas.addEventListener('click',e=>{
  // 融合演出期间只允许对话交互，其他点击屏蔽
  if (typeof fusionActive !== 'undefined' && fusionActive) {
    if (typeof Dialogue !== 'undefined' && Dialogue.active) {
      if (typeof Sound !== 'undefined') Sound.dialogueAdvance();
      if (!Dialogue.complete) Dialogue.skip();
      else Dialogue.hide();
    }
    return;
  }
  // CSS缩放坐标修正
  const cx = canvasZoom!==1 ? (e.clientX-W/2)/canvasZoom+W/2 : e.clientX;
  const cy = canvasZoom!==1 ? (e.clientY-H/2)/canvasZoom+H/2 : e.clientY;
  // 忽略来自囊字DOM元素的点击（它有自己的listener）
  const pouchEl = document.getElementById('pouch-btn');
  if(pouchEl && (e.target===pouchEl || pouchEl.contains(e.target))) return;
  // 额外坐标检测：防止canvas zoom时囊字区域误触
  if(pouchEl){
    const pr = pouchEl.getBoundingClientRect();
    if(cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom) return;
  }

  // 遗响三选一（最高优先级模态，点空白无响应；ESC 放弃）
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive) {
    const card = typeof hitTestEchoChoice === 'function' ? hitTestEchoChoice(cx, cy) : null;
    if (card && typeof clickEchoChoice === 'function') clickEchoChoice(card);
    return;
  }

  // 事件选择肢
  if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive) {
    const opt = typeof hitTestEventOptions === 'function' ? hitTestEventOptions(cx, cy) : null;
    if (opt && typeof handleEventChoice === 'function') {
      handleEventChoice(opt);
    }
    return;
  }

  // 装备切换提示
  if (typeof equipPrompt !== 'undefined' && equipPrompt) {
    const opt = typeof hitTestEquipPrompt === 'function' ? hitTestEquipPrompt(cx, cy) : null;
    if (opt && typeof handleEquipPromptClick === 'function') {
      handleEquipPromptClick(opt);
    }
    return;
  }

  // 背包模式（最优先，即使在Hub中也能操作）
  if(backpackOpen) {
    handleBackpackClick();
    return;
  }

  // Hub模式（优先于商店和地图；图鉴打开时优先图鉴交互，否则走Hub点击）
  if(typeof hubActive !== 'undefined' && hubActive) {
    if(typeof bestiaryOpen !== 'undefined' && bestiaryOpen) {
      if(typeof handleBestiaryClick === 'function') handleBestiaryClick(cx, cy);
    } else if(typeof achievementsOpen !== 'undefined' && achievementsOpen) {
      if(typeof handleAchievementsClick === 'function') handleAchievementsClick(cx, cy);
    } else if(typeof handleHubClick === 'function') {
      handleHubClick(cx, cy);
    }
    return;
  }

  // 商店模式（优先于背包和地图）
  if(typeof shopOpen !== 'undefined' && shopOpen) {
    if(typeof handleShopClick === 'function') handleShopClick();
    return;
  }

  // 地图模式：点击节点
  if (typeof mapActive !== 'undefined' && mapActive && typeof handleMapClick === 'function') {
    handleMapClick(cx, cy);
    return;
  }

  // 宝物房间：点击装备字（真/假）
  if (typeof hitTestRoomElements === 'function') {
    const treasure = hitTestRoomElements(cx, cy);
    if (treasure) {
      if (treasure.collect) {
        treasure.collect();
      } else if (treasure.onClick) {
        treasure.onClick();
      }
      return;
    }
  }

  // 优先：CG 演出点击推进（结局记忆分镜，玩家控制节奏）
  if (_cgState && _cgState.phase === 'cg') {
    advanceCGByClick();
    return;
  }
  // 优先：飘浮选择肢
  if(Tutorial._driftActive && Tutorial._driftSettled && !Tutorial._driftSelected){
    Tutorial.handleClick(); return;
  }
  // 对话推进：房间对话直接处理（不等Tutorial）
  if(Dialogue.active){
    Sound.dialogueAdvance();
    if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom) {
      if (!Dialogue.complete) Dialogue.skip();
      else Dialogue.hide();
    } else {
      Tutorial.handleClick();
    }
    return;
  }

  const ph=Tutorial.phase;
  if(ph===PHASE.BATTLE||ph.startsWith('tutorial_')){
    if(document.getElementById('stun-overlay').classList.contains('active')) return;

    // Boss 专属机制可点节点（余音消除 / 断挣脱 / 放下取消）优先于词元
    if (typeof bossActive !== 'undefined' && bossActive && typeof hitTestBossInteract === 'function') {
      if (hitTestBossInteract(cx, cy)) return;
    }

    // 优先匹配有用词元（包括技能字），噪点只在无其他命中时才触发
    let noiseHit = null;
    for(let bw of battleWords){
      if(!bw.alive||bw.cooldown>0) continue;
      if(!bw.hitTest(cx,cy)) continue;
      if(bw.cat==='乱'){ noiseHit=bw; continue; }
      // 命中非噪点字，立即处理
      if(ph===PHASE.BATTLE){ handleBattleClick(bw); return; }
      Tutorial.handleWordClick(bw);
      return;
    }
    // 没有命中任何有用字 → 噪点用更严的二次判定
    if(noiseHit){
      const bw=noiseHit;
      const tightW=bw.size*bw.text.length*0.55;
      const tightH=bw.size*0.55;
      if(cx>bw.x-tightW/2&&cx<bw.x+tightW/2&&
         cy>bw.y-tightH/2&&cy<bw.y+tightH/2){
        if(ph===PHASE.BATTLE){ handleBattleClick(bw); return; }
        Tutorial.handleWordClick(bw);
        return;
      }
    }
    // 未命中任何词元 → 尝试点击敌人切换索敌（多敌人编队）
    if (typeof switchTargetFromClick === 'function' && switchTargetFromClick(cx, cy)) return;
  }
});

// 触屏
canvas.addEventListener('touchstart',e=>{
  e.preventDefault();
  const t=e.touches[0];
  // 检查触摸是否在囊字按钮上，避免重复触发
  const pouchEl = document.getElementById('pouch-btn');
  if(pouchEl){
    const pr = pouchEl.getBoundingClientRect();
    if(t.clientX >= pr.left && t.clientX <= pr.right && t.clientY >= pr.top && t.clientY <= pr.bottom) return;
  }
  if(canvasZoom!==1){ mx=(t.clientX-W/2)/canvasZoom+W/2; my=(t.clientY-H/2)/canvasZoom+H/2; }
  else { mx=t.clientX;my=t.clientY; }
  canvas.dispatchEvent(new MouseEvent('click',{clientX:mx,clientY:my}));
},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();
  const cx=e.touches[0].clientX, cy=e.touches[0].clientY;
  if(canvasZoom!==1){ mx=(cx-W/2)/canvasZoom+W/2; my=(cy-H/2)/canvasZoom+H/2; }
  else { mx=cx;my=cy; }
},{passive:false});

// 键盘快捷键
window.addEventListener('keydown', e => {
  // 遗响三选一模态：只响应 ESC 放弃，拦截其余按键
  if (typeof echoChoiceActive !== 'undefined' && echoChoiceActive) {
    e.preventDefault();
    if (e.key === 'Escape' && typeof resolveBossChoice === 'function') resolveBossChoice();
    return;
  }
  // Tab：切换背包（先关闭商店）
  if(e.key === 'Tab'){
    e.preventDefault();
    if(typeof shopOpen !== 'undefined' && shopOpen){
      if(typeof closeShop === 'function') closeShop();
      // 不调用 shopRoomDone — Tab只是临时关闭商店去看背包，不应完成房间
    }
    toggleBackpack();
    return;
  }
  // ESC：关闭背包或商店
  if(e.key === 'Escape'){
    if(typeof shopOpen !== 'undefined' && shopOpen){
      e.preventDefault();
      if(typeof shopSelected !== 'undefined' && shopSelected) {
        shopSelected = null;
      } else {
        if(typeof closeShop === 'function') closeShop();
        if(typeof shopRoomDone === 'function') shopRoomDone();
      }
      return;
    }
    if(backpackOpen){
      e.preventDefault();
      if(backpackExpanded){
        backpackExpanded = null;
      } else {
        toggleBackpack();
      }
      return;
    }
  }
  // 空格：释放蓄力技能（Boss 战也可释放，dealSkillDamage 分发到 Boss）
  if(e.key === ' ' && Tutorial.phase===PHASE.BATTLE && !backpackOpen){
    e.preventDefault();
    if(playerSkill && playerSkill.type==='charge'){
      releaseChargedSkill();
    }
    return;
  }
  // F5：手动存档（阻止浏览器刷新）
  if(e.key === 'F5'){
    e.preventDefault();
    saveGame();
    return;
  }
});

// ═══════════════ 存档系统 ═══════════════

const SAVE_KEY = 'consciousness_sea_save';

function saveGame() {
  const data = {
    // ── 元数据 ──
    difficulty: difficulty,
    timestamp: Date.now(),

    // ── 永久进度 ──
    unlockedWeapons: [...unlockedWeapons],
    soulCrystals: typeof soulCrystals !== 'undefined' ? soulCrystals : 0,
    permanentUpgrades: typeof permanentUpgrades !== 'undefined' ? permanentUpgrades : {},
    affection: Tutorial.affection,
    uniqueEventsDone: typeof uniqueEventsDone !== 'undefined' ? uniqueEventsDone.slice() : [],
    bossEnergy: typeof bossEnergy !== 'undefined' ? bossEnergy : 0,
    zeroReturnTriggered: typeof zeroReturnTriggered !== 'undefined' ? zeroReturnTriggered : false,
    energyReturned: typeof energyReturned !== 'undefined' ? energyReturned : false,
    zeroSolidified: typeof zeroSolidified !== 'undefined' ? zeroSolidified : false,
    ch1SkitsDone: typeof ch1SkitsDone !== 'undefined' ? ch1SkitsDone.slice() : [],
    lastRunDied: typeof lastRunDied !== 'undefined' ? lastRunDied : false,
    achievements: typeof achievements !== 'undefined' ? achievements : {},

    // ── 游戏位置 ⭐ ──
    prologuePhase: prologuePhase,
    tutorialPhase: Tutorial.phase,
    prologueHanDefeated: prologueHanDefeated,

    // ── Hub状态 ⭐ ──
    inHub: typeof hubActive !== 'undefined' ? hubActive : false,
    hubRunNumber: typeof hubRunNumber !== 'undefined' ? hubRunNumber : 0,
    hubZeroTalkIndex: typeof hubZeroTalkIndex !== 'undefined' ? hubZeroTalkIndex : 0,
    trioDepartureDone: typeof trioDepartureDone !== 'undefined' ? trioDepartureDone : false,

    // ── 装备（存ID，从EQUIPMENT恢复）──
    weaponId: playerWeapon ? playerWeapon.id : 'beginner_brush',
    armorId: playerArmor ? playerArmor.id : 'thin_silk',
    skillId: playerSkill ? playerSkill.id : 'concentration',
    talismanId: playerTalisman ? playerTalisman.id : null,

    // ── 装备强化（融合等级 跨局持久化；武器buff weaponBuffs 已改为局内有效不存；unlockedArmors/Talismans 为局内不存）──
    equipmentLevels: typeof equipmentLevels !== 'undefined' ? equipmentLevels : {},
    // ── 装备熟练度（开局随机池解锁进度，跨局持久化）──
    equipProficiency: typeof equipProficiency !== 'undefined' ? equipProficiency : {},

    // ── 玩家状态 ──
    playerHP: typeof playerHP !== 'undefined' ? playerHP : 100,
    playerMaxHP: typeof playerMaxHP !== 'undefined' ? playerMaxHP : 100,
    hasShield: typeof hasShield !== 'undefined' ? hasShield : false,
    shieldHP: typeof shieldHP !== 'undefined' ? shieldHP : 0,
    threatLevel: typeof threatLevel !== 'undefined' ? threatLevel : 0,
    nextAttackBoost: typeof nextAttackBoost !== 'undefined' ? nextAttackBoost : false,
    skillState: typeof skillState !== 'undefined' ? skillState : { collected:[], chargeLevel:0, ready:false },
    echoes: (typeof echoInventory !== 'undefined' ? echoInventory : []).slice(),

    // ── 地图状态（DIVING阶段时保存）──
    mapRooms: prologuePhase >= PROLOGUE.DIVING ? _serializeMapRooms() : null,
    mapConnections: prologuePhase >= PROLOGUE.DIVING ? mapConnections : null,

    // ── 肉鸽状态（肉鸽地图中时保存）──
    isRoguelikeMap: typeof isRoguelikeMap !== 'undefined' ? isRoguelikeMap : false,
    dynamicRoomData: (typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap && typeof dynamicRoomData !== 'undefined') ? dynamicRoomData : null,
    dynamicBaseConnections: (typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap && typeof dynamicBaseConnections !== 'undefined') ? dynamicBaseConnections : null,
    dynamicSegments: (typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap && typeof dynamicSegments !== 'undefined') ? dynamicSegments : null,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    if (typeof Sound !== 'undefined') Sound.saveWrite();
    showSaveToast();
  } catch(e) { console.log('存档失败:', e); }
}

/** 序列化 mapRooms 为纯数据对象 */
function _serializeMapRooms() {
  if (typeof mapRooms === 'undefined' || !mapRooms) return null;
  const out = {};
  Object.keys(mapRooms).forEach(id => {
    const r = mapRooms[id];
    out[id] = { unlocked: r.unlocked, completed: r.completed, visited: r.visited };
    if (r._active !== undefined) out[id]._active = r._active;
  });
  return out;
}

function showSaveToast() {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  toast.classList.add('show');
  toast.textContent = '已存档  ' + new Date().toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  } catch(e) { return null; }
}

// ═══════════════ 菜单流程 ═══════════════

function showDifficulty() {
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('difficulty-screen').classList.remove('hidden');
}

function backToMenu() {
  document.getElementById('difficulty-screen').classList.add('hidden');
  document.getElementById('main-menu').classList.remove('hidden');
}

function continueGame() {
  const save = loadGame();
  if(!save) {
    // 无存档时显示提示，而不是完全无响应
    const toast = document.getElementById('save-toast');
    if (toast) {
      toast.textContent = '暂无存档，请先开始新的游戏';
      toast.classList.add('show');
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
    }
    const btn = document.getElementById('btn-continue');
    if (btn) { btn.style.color = 'rgba(255,150,120,0.5)'; setTimeout(() => { btn.style.color = ''; }, 400); }
    return;
  }
  // 隐藏菜单
  document.getElementById('main-menu').classList.add('hidden');
  // BGM
  if (typeof Sound !== 'undefined' && Sound.startBGM) Sound.startBGM(0);
  // 根据存档位置恢复游戏
  resumeFromSave(save);
}

/** 从存档恢复到对应游戏位置 */
function resumeFromSave(save) {
  // ── 恢复永久数据 ──
  difficulty = save.difficulty || 1;
  if (save.unlockedWeapons) unlockedWeapons = new Set(save.unlockedWeapons);
  // 装备强化（融合等级 跨局；武器buff 已改为局内有效不读档）
  if (typeof save.equipmentLevels !== 'undefined' && typeof equipmentLevels !== 'undefined') equipmentLevels = save.equipmentLevels;
  if (typeof save.equipProficiency !== 'undefined' && typeof equipProficiency !== 'undefined') equipProficiency = save.equipProficiency;
  if (typeof resetRunEquipmentState === 'function') resetRunEquipmentState(); // 局内防具/护符解锁集合（每局重置）
  if (typeof save.threatLevel !== 'undefined' && typeof threatLevel !== 'undefined') threatLevel = save.threatLevel;
  if (typeof save.soulCrystals !== 'undefined' && typeof soulCrystals !== 'undefined') soulCrystals = save.soulCrystals;
  if (typeof save.permanentUpgrades !== 'undefined' && typeof initPermanentUpgrades === 'function') initPermanentUpgrades(save.permanentUpgrades);
  if (typeof save.affection !== 'undefined') Tutorial.affection = save.affection;
  if (Array.isArray(save.uniqueEventsDone) && typeof uniqueEventsDone !== 'undefined') uniqueEventsDone = save.uniqueEventsDone;
  if (typeof save.bossEnergy !== 'undefined' && typeof bossEnergy !== 'undefined') bossEnergy = save.bossEnergy;
  if (typeof save.zeroReturnTriggered !== 'undefined') zeroReturnTriggered = save.zeroReturnTriggered;
  if (typeof save.energyReturned !== 'undefined') energyReturned = save.energyReturned;
  if (typeof save.zeroSolidified !== 'undefined') zeroSolidified = save.zeroSolidified;
  if (Array.isArray(save.ch1SkitsDone) && typeof ch1SkitsDone !== 'undefined') ch1SkitsDone = save.ch1SkitsDone.slice();
  if (typeof save.lastRunDied !== 'undefined') lastRunDied = save.lastRunDied;
  if (save.achievements && typeof achievements !== 'undefined') achievements = save.achievements;

  // ── 基础初始化 ──
  Dialogue.init();
  shards = 0; updateShardsDisplay();
  applyPermanentUpgrades();
  battleWords = []; particles = [];
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('player-zone').style.opacity = '1';
  document.getElementById('stage-hint').style.opacity = '0';
  document.getElementById('combo-display').classList.remove('show');
  document.getElementById('skill-display').style.opacity = '0';

  // ── 恢复装备 ──
  _restoreEquipment(save);

  // ── 恢复遗响（局内构筑；旧档无字段默认空，不重算 hpMaxCost 等 grant 代价）──
  if (typeof clearEchoes === 'function') clearEchoes();
  if (Array.isArray(save.echoes) && typeof ECHO_DEFS !== 'undefined') {
    echoInventory = save.echoes.filter(k => ECHO_DEFS[k]);
  }

  // ── 恢复玩家状态 ──
  playerHP = save.playerHP || 100;
  playerMaxHP = save.playerMaxHP || 100;
  if (typeof save.hasShield !== 'undefined') { hasShield = save.hasShield; shieldHP = save.shieldHP || 0; }
  if (typeof save.nextAttackBoost !== 'undefined') nextAttackBoost = save.nextAttackBoost;
  if (save.skillState && typeof skillState !== 'undefined') {
    skillState.collected = save.skillState.collected || [];
    skillState.chargeLevel = save.skillState.chargeLevel || 0;
    skillState.ready = save.skillState.ready || false;
  }
  updatePlayerUI();
  updateSkillUI();
  updateEnemyUI();
  enemyHP = enemyMaxHP = 999; enemyTimer = enemyInterval = 99;

  // ── 初始化流程状态 ──
  prologuePhase = save.prologuePhase !== undefined ? save.prologuePhase : PROLOGUE.TUTORIAL;
  prologueHanDefeated = save.prologueHanDefeated || false;
  wasBossActive = false;
  preDiveStep = -1; preDiveTexts = [];

  // ── 恢复Hub状态 ──
  if (typeof save.hubRunNumber !== 'undefined' && typeof hubRunNumber !== 'undefined') hubRunNumber = save.hubRunNumber;
  if (typeof save.hubZeroTalkIndex !== 'undefined' && typeof hubZeroTalkIndex !== 'undefined') hubZeroTalkIndex = save.hubZeroTalkIndex;
  if (typeof save.trioDepartureDone !== 'undefined') trioDepartureDone = save.trioDepartureDone;

  // ── 恢复肉鸽状态 ──
  if (save.isRoguelikeMap && typeof isRoguelikeMap !== 'undefined') isRoguelikeMap = true;
  if (save.dynamicRoomData && typeof dynamicRoomData !== 'undefined') dynamicRoomData = save.dynamicRoomData;
  if (save.dynamicBaseConnections && typeof dynamicBaseConnections !== 'undefined') dynamicBaseConnections = save.dynamicBaseConnections;
  if (save.dynamicSegments && typeof dynamicSegments !== 'undefined') dynamicSegments = save.dynamicSegments;

  // ── 根据阶段恢复 ──
  // Hub中保存的存档：直接回Hub
  if (save.inHub) {
    if (typeof enterHub === 'function') {
      setTimeout(() => enterHub(), 300);
    } else {
      startPrologue();
    }
    return;
  }
  if (prologuePhase >= PROLOGUE.END) {
    // 已通关序章：进入零的领域Hub
    if (typeof enterHub === 'function') {
      setTimeout(() => enterHub(), 300);
    } else {
      startPrologue(); // fallback
    }
    return;
  }
  if (prologuePhase >= PROLOGUE.DIVING) {
    // 潜航阶段：恢复地图状态
    _resumeDiving(save);
  } else if (prologuePhase >= PROLOGUE.PRE_DIVE) {
    // 潜航过渡中：直接进入地图
    prologuePhase = PROLOGUE.DIVING;
    if (save.mapRooms && save.mapConnections) {
      _resumeDiving(save);
    } else {
      initMap();
    }
  } else if (prologuePhase === PROLOGUE.BOSS_HAN) {
    // 憾已触发但未击败：跳到憾战斗
    _resumeBossHan(save);
  } else {
    // 教程阶段：若已推进到实质阶段则恢复进度，否则从头开始教程
    resumeTutorial(save);
  }
}

/** 教程阶段恢复：跳到存档的 tutorialPhase（教学阶段状态自包含），前半/无效则从头开始 */
function resumeTutorial(save) {
  prologuePhase = PROLOGUE.TUTORIAL;
  prologueHanDefeated = false;
  const phase = save.tutorialPhase;
  const resumeable = [
    PHASE.TUTORIAL_SHIELD, PHASE.TUTORIAL_HEAL, PHASE.TUTORIAL_SKILL,
    PHASE.TUTORIAL_NOISE, PHASE.TUTORIAL_BACKPACK, PHASE.PRE_BATTLE, PHASE.BATTLE
  ];
  if (phase && resumeable.includes(phase) && typeof Tutorial !== 'undefined' && Tutorial.enterPhase) {
    if (typeof Dialogue !== 'undefined') Dialogue.init();
    if (typeof updateSkillUI === 'function') updateSkillUI();
    Tutorial.enterPhase(phase);
  } else {
    startPrologue();
  }
}

/** 恢复装备（从存档ID） */
function _restoreEquipment(save) {
  // 武器
  if (save.weaponId && EQUIPMENT.weapons[save.weaponId]) {
    playerWeapon = EQUIPMENT.weapons[save.weaponId];
  } else if (save.weaponId === null) {
    // ⚠️ 显式null：装备被遗震碎，保持空手
    playerWeapon = null;
  } else {
    playerWeapon = EQUIPMENT.weapons['beginner_brush'];
  }
  // 防具
  if (save.armorId && EQUIPMENT.armors[save.armorId]) {
    playerArmor = EQUIPMENT.armors[save.armorId];
    playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : ((playerArmor && playerArmor.defense) || 0);
  } else if (save.armorId === null) {
    playerArmor = null;
    playerDefense = 0;
  } else {
    playerArmor = EQUIPMENT.armors['thin_silk'];
    playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : ((playerArmor && playerArmor.defense) || 0);
  }
  // 技能（固有，始终有默认值；被删技能/未知 id 兜底到卍解，并重置收集进度防旧档卡死）
  if (save.skillId && EQUIPMENT.skills[save.skillId]) {
    playerSkill = EQUIPMENT.skills[save.skillId];
  } else {
    playerSkill = EQUIPMENT.skills['concentration'];
    if (typeof skillState !== 'undefined') skillState = { collected: [], chargeLevel: 0, ready: false };
  }
  // 护符
  playerTalisman = (save.talismanId && EQUIPMENT.talismans[save.talismanId])
    ? EQUIPMENT.talismans[save.talismanId] : null;
  // 当前装备注册进局内解锁集合（供融合判定 isOwned）
  if (playerArmor && typeof unlockedArmors !== 'undefined') unlockedArmors.add(playerArmor.id);
  if (playerTalisman && typeof unlockedTalismans !== 'undefined') unlockedTalismans.add(playerTalisman.id);
}

/** 恢复到地图潜航阶段 */
function _resumeDiving(save) {
  prologuePhase = PROLOGUE.DIVING;
  mapActive = false;
  currentDiveRoom = null;

  if (save.mapRooms && save.mapConnections) {
    // 使用保存的地图状态初始化
    if (typeof initMapFromSave === 'function') {
      initMapFromSave(save.mapRooms, save.mapConnections);
    } else {
      initMap();
    }
  } else {
    initMap();
  }

  // 隐藏战斗UI，显示地图
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';
}

/** 恢复到Boss憾战斗 */
function _resumeBossHan(save) {
  prologuePhase = PROLOGUE.BOSS_HAN;
  prologueHanDefeated = false;
  wasBossActive = false;
  currentDiveRoom = null;
  mapActive = false;

  // 准备战场
  playerHP = playerMaxHP = 100;
  updatePlayerUI();
  Tutorial.enterPhase(PHASE.BATTLE);
  battleWords = []; balanceWords();

  // 初始化Boss憾
  const hint = document.getElementById('stage-hint');
  if (hint) { hint.style.opacity = '1'; hint.textContent = '憾 · 深海的回响'; }
  if (typeof initBoss === 'function') initBoss('regret');
}

/** 潜航过渡对话序列 → 播放完毕后调用 initMap() */
// 潜航过渡对话（由 update 循环驱动，单计数器）
let preDiveStep = -1; // -1=未激活, 0~5=对话序号, 6=完成等待initMap
let preDiveTexts = [];

function startPreDiveTransition() {
  // 守卫：防止重复调用
  if (preDiveStep >= 0) return;

  prologuePhase = PROLOGUE.PRE_DIVE;
  // 憾击败后存档（教程→潜航过渡点）
  saveGame();
  preDiveStep = -1; // 等待1秒延迟

  // 立刻隐藏战斗UI
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';
  document.getElementById('combo-display').classList.remove('show');
  document.getElementById('skill-display').style.opacity = '0';
  battleWords = [];
  if (typeof enemyEntity !== 'undefined') enemyEntity = null;
  enemyHP = enemyMaxHP = 999; enemyTimer = enemyInterval = 99;

  // 憾逃跑判定：bossState在DEFEATED转场期间保留，_fled为唯一逃跑标志（原'typeof bossState==="undefined"'子句恒为false，是死代码）
  const isFlee = !!(bossState && bossState._fled);
  preDiveTexts = [
    { mode:'float', speaker:'零', text: isFlee ? '它逃向深层了。但深海的信号没有消失……反而更强了。' : '憾被击退了。但深海的信号没有消失……反而更强了。', speed:35 },
    { mode:'float', speaker:'零', text:'我之前查到的那个信号源——它叫「遗」。比憾更强的存在。', speed:35 },
    { mode:'float', speaker:'零', text:'如果放任不管，整个浅层都会被它的噪点污染。我们得下去一趟。', speed:35 },
    { mode:'float', speaker:'零', text:'这是你第一次正式潜航。浅层的意识场域我已经标记好了——你只需要选择路径。', speed:35 },
    { mode:'plain', text:'（零展开了一幅意识海图，几个节点在深蓝中微微发光。）', speed:40 },
    { mode:'float', speaker:'零', text:'准备好了的话……就出发吧。', speed:35 },
  ];

  // 1秒后开始第一句
  setTimeout(() => {
    if (prologuePhase === PROLOGUE.PRE_DIVE && preDiveStep === -1) {
      Dialogue.show(preDiveTexts[0]);
      preDiveStep = 0;
    }
  }, 1000);
}

/** 序章结束 → 第一章开场 → Hub */
function triggerPrologueEnd() {
  prologuePhase = PROLOGUE.END;
  if (typeof Sound !== 'undefined' && Sound.stopBGM) Sound.stopBGM(3.0);
  if (typeof mapActive !== 'undefined') mapActive = false;
  if (typeof currentDiveRoom !== 'undefined') currentDiveRoom = null;

  // 静默结算局外货币
  const yiDefeated = typeof prologueHanDefeated !== 'undefined' && prologueHanDefeated;
  const affection = (typeof Tutorial !== 'undefined' && Tutorial.affection) ? Tutorial.affection : 0;
  if (typeof soulCrystals !== 'undefined' && typeof SOUL_REWARDS !== 'undefined') {
    let earned = SOUL_REWARDS.BASE || 20;
    if (yiDefeated) earned += SOUL_REWARDS.BOSS_YI || 30;
    earned += (affection || 0) * (SOUL_REWARDS.AFFECTION_MULT || 10);
    soulCrystals += earned;
  }

  // ⚠️ 遗的冲击震碎了所有装备——行囊空空如也
  playerWeapon = null;
  playerArmor = null;
  playerTalisman = null;
  playerDefense = 0;
  // 凝神是固有意识能力，不算装备，保留

  saveGame();

  // ⚠️ 第一章标题卡（复用序章开篇的章节卡效果，不用对话）
  showChapterCard(
    '第一章 · 深渊回声',
    '为了拯救零，潜航者再次潜入意识之海……',
    '点击任意位置继续',
    () => {
      transitionToHub();
    }
  );
}

/** 肉鸽潜航模式：设置游戏阶段为潜航中 */
function setGameToDiving() {
  prologuePhase = PROLOGUE.DIVING; // 复用DIVING阶段
  if (typeof Tutorial !== 'undefined') {
    Tutorial.enterPhase(PHASE.BATTLE);
  }
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('player-zone').style.opacity = '1';
  document.getElementById('stage-hint').style.opacity = '0';
}

/** 结算后 → Hub过渡（防重复调用） */
let _transitioningToHub = false;
function transitionToHub() {
  if (_transitioningToHub) return;
  _transitioningToHub = true;
  canvas.style.cursor = 'none';
  const overlay = document.getElementById('ending-overlay');
  if (overlay) { overlay.classList.remove('show'); overlay._isSettlement = false; }

  // 清理战场
  battleWords = [];
  particles = [];
  isRoguelikeMap = false;
  dynamicRoomData = null;
  dynamicBaseConnections = null;

  // 延迟一下再进入Hub（加速：600→300ms）
  setTimeout(() => {
    if (typeof enterHub === 'function') enterHub();
    _transitioningToHub = false;
  }, 300);
}

// ── 章节开头卡片 ──
function showChapterCard(title, subtitle, hint, onclick) {
  const overlay = document.getElementById('ending-overlay');
  overlay.innerHTML = `
    <div id="ending-title">${title}</div>
    <div id="ending-sub">${subtitle}</div>
    ${hint ? `<div id="ending-hint">${hint}</div>` : ''}
  `;
  overlay.classList.add('show');
  overlay.onclick = (e) => {
    if(e.target.closest('.ending-btn')) return; // 不拦截按钮点击
    overlay.style.opacity = '0';
    setTimeout(()=>{ overlay.classList.remove('show'); overlay.onclick=null; onclick(); }, 300);
  };
}

// ── 第一章 Hub 一次性小剧情（成功通关归来触发）──
// 小萤人设：绝对客观辅助AI → 幻觉"在场观众"，对幻想观众唠家常（死侍式破第四面墙）。
// 成功通关（showRunSummary(true)）点「返回零的领域」→ setPendingHubSkit 置标 → enterHub 消费触发。
let _hubSkitTimer = null;

/** 成功通关返回前标记：待触发一次性小剧情 */
function setPendingHubSkit() {
  _pendingHubSkit = true;
}

/** 在 Hub 播放一段一次性小剧情对话池（按 skit 顺序，触发后记入 ch1SkitsDone 不再重复） */
function playCh1Skit(skit) {
  if (!skit || !skit.lines || !skit.lines.length) return;
  if (typeof Dialogue === 'undefined') return;
  let idx = 0;
  const lines = skit.lines;
  function playNext() {
    if (idx >= lines.length) {
      if (_hubSkitTimer) { clearInterval(_hubSkitTimer); _hubSkitTimer = null; }
      // 小剧情播完 → 回 Hub 正常 idle
      if (typeof hubPhase !== 'undefined') hubPhase = 'idle';
      return;
    }
    const d = lines[idx];
    idx++;
    Dialogue.show({ mode: d.mode || 'float', speaker: d.speaker || '', text: d.text, speed: d.speed || 40 });
  }
  if (typeof hubPhase !== 'undefined') hubPhase = 'talking_zero'; // 复用零对话的推进逻辑
  playNext();
  if (_hubSkitTimer) clearInterval(_hubSkitTimer);
  _hubSkitTimer = setInterval(() => {
    if (typeof Dialogue !== 'undefined' && !Dialogue.active) {
      if (idx < lines.length) playNext();
      else { clearInterval(_hubSkitTimer); _hubSkitTimer = null; if (typeof hubPhase !== 'undefined') hubPhase = 'idle'; }
    }
  }, 200);
}

/** 检查并触发下一个待播放的一次性小剧情（enterHub 时调用；成功通关归来才置标） */
function maybeTriggerCh1Skit() {
  if (!_pendingHubSkit) return false;
  if (typeof CH1_SKITS === 'undefined' || !CH1_SKITS.length) { _pendingHubSkit = false; return false; }
  // 找第一个未触发的小剧情
  const next = CH1_SKITS.find(s => !(typeof ch1SkitsDone !== 'undefined' && ch1SkitsDone.includes(s.id)));
  if (!next) { _pendingHubSkit = false; return false; }
  if (typeof ch1SkitsDone !== 'undefined') ch1SkitsDone.push(next.id);
  if (typeof saveGame === 'function') saveGame();
  _pendingHubSkit = false;
  playCh1Skit(next);
  return true;
}

// ── 第一章结局：把零能量交还给她（Hub 小萤菜单触发）──
// 能量满（zeroReturnTriggered=true）后可交还 → 白房间演出 → 解锁实验记忆 → 引出第二章
let _energyCinematicTimer = null;
function returnZeroEnergy() {
  if (energyReturned) return;              // 已演出过，防重复
  if (!zeroReturnTriggered) {              // 能量未满：先给零一段"还差一点"的回应
    if (typeof Dialogue !== 'undefined') Dialogue.show({
      mode: 'float', speaker: '零',
      text: `……我感觉到你的意识里攒着一些什么。还差一点，就能拼回我了。`,
      speed: 40,
    });
    return;
  }
  energyReturned = true;
  zeroSolidified = true;                   // 零凝实态
  bossEnergy = 0;                          // 能量交还
  if (typeof saveGame === 'function') saveGame();
  // 图鉴解锁：白房间记忆（bestiary.js 数据已就绪）
  if (typeof registerMemory === 'function') registerMemory('memory_white_room');
  // 演出序列（Dialogue 队列推进）
  triggerZeroReturnCinematic();
}

// 第一章结局演出：白房间 → 记忆CG分镜 → 倒放 → 眨眼 → 回零的领域拥抱零
let _zeroCinematicStep = 0;
let _cgState = null; // { phase:'cg'|'rewind'|'blink'|'hub', idx, timer }

// CG 分镜数据（图片文件在 PICTURE/，16:9）——台词用对话体，不做旁白
const CG_SEQUENCE = [
  { img: 'PICTURE/cg1_debate.png', text: '「让她参加这种实验，你们疯了吗？！」\n「这是活人——不是数据样本！」' },
  { img: 'PICTURE/cg2_giveup.png', text: '「看清楚，签了这个，你还是首席研究员。」\n「……不签的话呢？」\n「不签的话，今天就收拾东西。」' },
  { img: 'PICTURE/cg3_news_photo.png', text: '「UCRB 意识回收实验……疑似失败。」\n「（照片上，白发的女孩安静地笑着。）\n……你就是她吗。」' },
  { img: 'PICTURE/cg4_inverted.png', text: '「你等我。」\n「我一定会去救你。」' },
];

function triggerZeroReturnCinematic() {
  if (typeof Cinematic !== 'undefined' && Cinematic.startTransition) {
    Cinematic.startTransition('out', 1.0, null);
  }
  _zeroCinematicStep = 0;
  const lines = [
    { mode:'whisper', speaker:'???', text:'你来了。', speed:45 },
    { mode:'whisper', speaker:'我', text:'……这是哪里？', speed:42 },
    { mode:'float', speaker:'???', text:'你会忘掉一切。但你一定会找到她。', speed:42 },
    { mode:'whisper', speaker:'我', text:'找到谁？你是谁？', speed:40 },
    { mode:'shake', speaker:'???', text:'「实验」……以真人意识为样本的回收实验。你反对过的。', speed:35 },
    { mode:'float', speaker:'我', text:'……公司。', speed:42 },
    { mode:'whisper', speaker:'???', text:'你曾经坚决反对。你输了。', speed:40 },
    { mode:'whisper', speaker:'我', text:'那她呢？那个……自愿参加的人。', speed:40 },
    { mode:'plain', text:'（画面涌入——）', speed:42 },
  ];
  function playNext() {
    if (_zeroCinematicStep >= lines.length) {
      // 白房间对话结束 → 进入 CG 分镜演出
      if (_energyCinematicTimer) { clearInterval(_energyCinematicTimer); _energyCinematicTimer = null; }
      if (typeof Dialogue !== 'undefined') Dialogue.hide();
      startCGSequence();
      return;
    }
    const d = lines[_zeroCinematicStep];
    _zeroCinematicStep++;
    if (typeof Dialogue !== 'undefined') {
      Dialogue.show({ mode: d.mode, speaker: d.speaker || '', text: d.text, speed: d.speed || 40 });
    }
  }
  if (_energyCinematicTimer) clearInterval(_energyCinematicTimer);
  _energyCinematicTimer = setInterval(() => {
    if (typeof Dialogue === 'undefined' || !Dialogue.active) {
      playNext();
      if (_zeroCinematicStep > lines.length) {
        clearInterval(_energyCinematicTimer);
        _energyCinematicTimer = null;
      }
    }
  }, 350);
  playNext();
}

// ═══════════════ 结局 CG 演出 ═══════════════
// 分镜：CG-1争辩 → CG-2放弃(黑屏切场) → CG-3报纸照片 → CG-4颠倒数字流
// 播完 → 倒放回CG-1 → 眨眼(黑/灰屏) → 回零的领域 → 拥抱零
let _cgTimer = null;
function startCGSequence() {
  const ov = document.getElementById('cg-overlay');
  const img = document.getElementById('cg-image');
  const txt = document.getElementById('cg-text');
  if (!ov) { finishCGToHub(); return; }
  ov.classList.remove('hidden');
  // ⚠️ CG overlay 全屏固定定位会挡住 canvas 点击，需给 overlay 本身绑点击
  ov.onclick = function() { advanceCGByClick(); };
  _cgState = { phase: 'cg', idx: 0, timer: 0 };
  showCGFrame(0);
}

// 玩家点击推进 CG（正序 1→4，第4张点击后进入倒放）
function advanceCGByClick() {
  if (!_cgState || _cgState.phase !== 'cg') return;
  if (typeof Sound !== 'undefined' && Sound.dialogueAdvance) Sound.dialogueAdvance();
  _cgState.idx++;
  if (_cgState.idx >= CG_SEQUENCE.length) {
    // CG 播完 → 倒放（自动）
    startCGRewind();
  } else {
    showCGFrame(_cgState.idx);
  }
}

function showCGFrame(idx) {
  const img = document.getElementById('cg-image');
  const txt = document.getElementById('cg-text');
  if (!img) return;
  const frame = CG_SEQUENCE[idx];
  if (!frame) return;
  img.style.backgroundImage = `url('${frame.img}')`;
  // CG-2 黑屏切场：图片先淡出再进（模拟黑屏）
  img.style.opacity = 0;
  txt.classList.remove('show');
  setTimeout(() => {
    img.style.backgroundImage = `url('${frame.img}')`;
    img.style.opacity = 1;
    if (txt) { txt.textContent = frame.text; txt.classList.add('show'); }
  }, idx === 1 ? 500 : 50);
}

// 倒放：从 CG-4 → CG-3 → CG-2 → CG-1（像放带子倒放）
function startCGRewind() {
  _cgState = { phase: 'rewind', idx: CG_SEQUENCE.length - 2, timer: 0 };
  const txt = document.getElementById('cg-text');
  if (txt) txt.classList.remove('show');
  if (_cgTimer) clearInterval(_cgTimer);
  _cgTimer = setInterval(() => {
    if (!_cgState || _cgState.phase !== 'rewind') return;
    _cgState.timer += 0.4;
    if (_cgState.timer >= 0.6) {
      _cgState.timer = 0;
      _cgState.idx--;
      if (_cgState.idx < 0) {
        // 倒回 CG-1 完成 → 眨眼
        startCGBlink();
      } else {
        showCGFrame(_cgState.idx);
      }
    }
  }, 400);
}

// 眨眼：黑屏/灰屏快速闪动（模仿眨眼合眼）
function startCGBlink() {
  _cgState = { phase: 'blink', idx: 0, timer: 0 };
  const blink = document.getElementById('cg-blink');
  const ov = document.getElementById('cg-overlay');
  const img = document.getElementById('cg-image');
  if (_cgTimer) clearInterval(_cgTimer);
  let blinkCount = 0;
  function doBlink() {
    if (!blink || !ov) { finishCGToHub(); return; }
    // 闭眼（变暗）→ 睁眼（恢复）
    if (blinkCount < 3) {
      blink.style.opacity = 1;
      setTimeout(() => {
        blink.style.opacity = 0;
        blinkCount++;
        setTimeout(doBlink, 120);
      }, 160);
    } else {
      // 眨眼结束 → 回零的领域
      ov.classList.add('hidden');
      if (img) img.style.opacity = 0;
      finishCGToHub();
    }
  }
  doBlink();
}

// CG 演出结束 → 回零的领域 + 拥抱零
function finishCGToHub() {
  _cgState = null;
  if (_cgTimer) { clearInterval(_cgTimer); _cgTimer = null; }
  const _ov = document.getElementById('cg-overlay');
  if (_ov) _ov.onclick = null; // 清理 CG overlay 点击，防止残留
  if (typeof Sound !== 'undefined' && Sound.stopBGM) Sound.stopBGM(3.0);
  if (typeof Cinematic !== 'undefined' && Cinematic.startTransition) {
    Cinematic.startTransition('in', 1.0, null);
  }
  // 回零的领域 → 拥抱零演出
  setTimeout(() => { enterHub(); startHugCinematic(); }, 600);
}

// ═══════════════ 拥抱零演出（结局）═══════════════
// 男主猜到了什么，但还不太确认。零凝实，他抱住她——然后松开，灰屏收尾。
let _hugTimer = null;
let _hugLineTimer = null;
function startHugCinematic() {
  const ov = document.getElementById('hug-overlay');
  const scene = document.getElementById('hug-scene');
  const txt = document.getElementById('hug-text');
  if (!ov) return;
  ov.classList.remove('hidden');
  // ⚠️ hug-overlay 全屏会挡住 canvas 点击，需给 overlay 绑点击推进拥抱对话
  ov.onclick = function() {
    if (typeof Dialogue !== 'undefined' && Dialogue.active) {
      if (Dialogue.complete) Dialogue.hide(); else Dialogue.skip();
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { ov.classList.add('show'); }));
  if (scene) scene.textContent = '零';

  // 对话式拥抱（用 Dialogue 引擎播放，点击推进）
  const hugLines = [
    { mode:'plain', text:'（零的投影不再透明。你张开了手，抱住了她。）', speed:42 },
    { mode:'float', speaker:'零', text:'……突然是怎么了？', speed:36 },
    { mode:'whisper', speaker:'我', text:'（顿了顿）没怎么。', speed:40 },
    { mode:'plain', text:'（你慢慢地松开手。很小声地，对自己说了一句。）', speed:42 },
    { mode:'whisper', speaker:'我', text:'……果然，是这样。', speed:36 },
  ];
  if (typeof Dialogue !== 'undefined' && txt) {
    // 用对话系统逐句播放，最后一句播完 → 灰屏收尾
    let idx = 0;
    function playHugLine() {
      if (idx >= hugLines.length) {
        // 灰屏 → 第一章结束
        showChapterEndScreen();
        return;
      }
      const d = hugLines[idx];
      idx++;
      const isLast = idx >= hugLines.length;
      Dialogue.show({
        mode: d.mode, speaker: d.speaker || '', text: d.text, speed: d.speed || 40,
        onComplete: () => { if (isLast) showChapterEndScreen(); },
      });
    }
    if (_hugLineTimer) clearInterval(_hugLineTimer);
    _hugLineTimer = setInterval(() => {
      if (typeof Dialogue !== 'undefined' && !Dialogue.active) {
        playHugLine();
        if (idx >= hugLines.length) {
          clearInterval(_hugLineTimer);
          _hugLineTimer = null;
        }
      }
    }, 250);
    playHugLine();
  } else {
    // 兜底：无对话系统直接灰屏
    showChapterEndScreen();
  }
}

// 第一章结束灰屏（拥抱对话播完后）
function showChapterEndScreen() {
  const ov = document.getElementById('hug-overlay');
  const txt = document.getElementById('hug-text');
  if (!ov) return;
  // 灰屏过渡
  ov.style.background = 'linear-gradient(180deg, #2a2a30, #1a1a20)';
  if (txt) {
    txt.classList.add('show');
    txt.style.color = 'rgba(220,220,230,0.9)';
    txt.textContent = '—— 第一章 · 深渊回声 · 完 ——';
  }
  // 停留后回到正常 Hub
  if (_hugTimer) clearTimeout(_hugTimer);
  _hugTimer = setTimeout(() => {
    ov.classList.remove('show');
    setTimeout(() => {
      ov.classList.add('hidden');
      ov.style.background = '';
      ov.onclick = null; // 清理拥抱 overlay 点击
      if (typeof Dialogue !== 'undefined') Dialogue.hide();
    }, 1500);
  }, 4000);
}

// ── 难度选择 → 章节卡 → 开始 ──
function selectDifficulty(idx) {
  difficulty = idx;
  if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined') threatLevel = THREAT.BASE[idx] || 2;
  document.getElementById('difficulty-screen').classList.add('hidden');
  showChapterCard('序章 · 觉醒', '意识之海的深处，有什么在等待着你……', '点击任意位置开始', startPrologue);
}

function startPrologue() {
  Dialogue.init();
  // BGM: 开始环境音乐
  if (typeof Sound !== 'undefined' && Sound.startBGM) Sound.startBGM(0);
  // ⚠️ 新游戏：重置所有货币和升级（局内+局外）
  if (typeof shards !== 'undefined') shards = 0;
  if (typeof updateShardsDisplay === 'function') updateShardsDisplay();
  if (typeof soulCrystals !== 'undefined') soulCrystals = 0;
  if (typeof permanentUpgrades !== 'undefined') permanentUpgrades = {};
  if (typeof clearEchoes === 'function') clearEchoes(); // 新档重置遗响
  if (typeof equipmentLevels !== 'undefined') equipmentLevels = {}; // 新档重置融合等级
  if (typeof weaponBuffs !== 'undefined') weaponBuffs = {};          // 新档重置武器buff
  if (typeof equipProficiency !== 'undefined') equipProficiency = {}; // 新档重置装备熟练度
  if (typeof resetRunStats === 'function') resetRunStats();          // 新档重置本局统计
  uniqueEventsDone = []; // 新档重置独特事件标记
  achievements = {}; // 新档重置成就（成就进主存档，随新档清空）
  lastRunDied = false; // 新档重置上局死亡标记
  zeroSolidified = false; // 新档重置零凝实态
  if (typeof resetRunEquipmentState === 'function') resetRunEquipmentState(); // 局内防具/护符解锁集合
  // 应用永久升级（新游戏时为空，无效果）
  if (typeof applyPermanentUpgrades === 'function') applyPermanentUpgrades();
  // 初始化序章流程状态
  prologuePhase = PROLOGUE.TUTORIAL;
  prologueHanDefeated = false;
  wasBossActive = false;
  preDiveStep = -1;
  preDiveTexts = [];
  mapActive = false;
  currentDiveRoom = null;
  // 初始化默认装备
  playerWeapon = EQUIPMENT.weapons['beginner_brush'];
  playerArmor = EQUIPMENT.armors['thin_silk'];
  playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : ((playerArmor && playerArmor.defense) || 0);
  playerSkill = EQUIPMENT.skills['concentration'];
  playerTalisman = EQUIPMENT.talismans['vitality_charm']; // 初始护符：回春符
  if (playerArmor && typeof unlockedArmors !== 'undefined') unlockedArmors.add(playerArmor.id);
  if (playerTalisman && typeof unlockedTalismans !== 'undefined') unlockedTalismans.add(playerTalisman.id);
  skillState = { collected:[], chargeLevel:0, ready:false };
  updateSkillUI();
  setTimeout(()=>{
    Tutorial.enterPhase(PHASE.EYE_OPEN);
    const checkEye=setInterval(()=>{
      if(Cinematic.eyeOpen.done){ clearInterval(checkEye); Tutorial.enterPhase(PHASE.MEET_MENTOR); }
    },200);
  },400);
}

// ── 战败画面 ──
/** 肉鸽潜航总结页（死亡/通关共用）：结算奖励 + 展示统计 → 返回零的领域 */
function showRunSummary(victory) {
  canvas.style.cursor = 'default';
  if (typeof Sound !== 'undefined' && Sound.stopBGM) Sound.stopBGM(1.5);

  // ── 结算（仅死亡/通关；主动返回不调本函数）──
  let soulReward = 0;
  if (victory) {
    // 通关：熟练度 + 货币（按战绩加成）
    soulReward = (typeof RUN_REWARDS !== 'undefined')
      ? RUN_REWARDS.CLEAR_BASE + (maxLayerReached || 1) * RUN_REWARDS.PER_LAYER
        + (runEliteKills || 0) * RUN_REWARDS.PER_ELITE + (runBossKills || 0) * RUN_REWARDS.PER_BOSS
      : 10;
    if (typeof soulCrystals !== 'undefined') soulCrystals += soulReward;
    if (typeof settleEquipGains === 'function') settleEquipGains(); // 本局装备熟练度入账
  } else {
    // 死亡：只给货币，熟练度作废；记录"上局死亡"（遗憾·装备残影房触发条件）
    soulReward = (typeof RUN_REWARDS !== 'undefined')
      ? RUN_REWARDS.DEATH_BASE + (runEliteKills || 0) * RUN_REWARDS.PER_ELITE_DEATH
      : 5;
    if (typeof soulCrystals !== 'undefined') soulCrystals += soulReward;
    if (typeof lastRunDied !== 'undefined') lastRunDied = true;
  }
  if (typeof saveGame === 'function') saveGame();

  // ── 填充 UI ──
  const overlay = document.getElementById('defeat-overlay');
  overlay.classList.add('show');
  document.getElementById('defeat-title').textContent = victory ? '潜航完成' : '意识崩解';
  document.getElementById('defeat-sub').textContent = victory
    ? '锚点将你安全送回零的领域。'
    : '锚点感知到你的濒危，将你拉了回来。';
  const statsEl = document.getElementById('defeat-stats');
  if (statsEl) {
    const wname = (typeof playerWeapon !== 'undefined' && playerWeapon) ? playerWeapon.name : '—';
    statsEl.innerHTML =
      `抵达深度 ${maxLayerReached || 1} 层 · 击败敌人 ${runKills || 0} · 精英 ${runEliteKills || 0} · Boss ${runBossKills || 0}<br>` +
      `意识碎片 ${typeof shards !== 'undefined' ? shards : 0} · 遗响 ${(typeof echoInventory !== 'undefined' && echoInventory) ? echoInventory.length : 0} 枚 · 武器 ${wname}<br>` +
      `<span style="color:#ffdd88;">灵魂结晶 +${soulReward}</span>`;
  }
  const btnsDiv = document.getElementById('defeat-btns');
  if (btnsDiv) {
    // ⚠️ 成功通关返回：标记待触发的一次性小剧情（enterHub 消费）
    btnsDiv.innerHTML = `<div class="ending-btn" onclick="setPendingHubSkit();enterHub()">返回零的领域</div>`;
  }

  // 隐藏战斗UI
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('combo-display').classList.remove('show');
  document.getElementById('skill-display').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';
}

function showDefeat() {
  canvas.style.cursor = 'default'; // 恢复系统光标以便点击按钮
  // BGM: 战败渐弱
  if (typeof Sound !== 'undefined' && Sound.stopBGM) Sound.stopBGM(1.5);
  const overlay = document.getElementById('defeat-overlay');
  overlay.classList.add('show');

  // 更新按钮文本（肉鸽模式 vs 序章模式）
  const inRoguelike = typeof isRoguelikeMap !== 'undefined' && isRoguelikeMap;
  const btnsDiv = document.getElementById('defeat-btns');
  if (btnsDiv) {
    btnsDiv.innerHTML = `
      <div class="ending-btn" onclick="restartFromDefeat()">重新挑战</div>
      <div class="ending-btn" onclick="${inRoguelike ? 'enterHub()' : 'location.reload()'}" style="border-color:rgba(255,100,80,0.25);color:rgba(255,150,120,0.4);font-size:12px;">${inRoguelike ? '返回零的领域' : '返回标题'}</div>
    `;
  }

  // 隐藏战斗UI
  document.getElementById('enemy-zone').style.opacity = '0';
  document.getElementById('combo-display').classList.remove('show');
  document.getElementById('skill-display').style.opacity = '0';
  document.getElementById('stage-hint').style.opacity = '0';

  // 散落一些暗红粒子
  for (let i = 0; i < 30; i++) {
    const p = new HitParticle(W * 0.5 + (Math.random() - 0.5) * 400, H * 0.5 + (Math.random() - 0.5) * 300, '#ff4433', '·');
    p.vx = (Math.random() - 0.5) * 2;
    p.vy = (Math.random() - 0.5) * 2 - 1;
    p.size = 3 + Math.random() * 10;
    p.life = 50 + Math.random() * 80;
    p.gravity = 0.02;
    particles.push(p);
  }
}

function restartFromDefeat() {
  canvas.style.cursor = 'none'; // 回到自定义光标
  const overlay = document.getElementById('defeat-overlay');
  overlay.classList.remove('show');

  // 重置玩家状态
  playerHP = playerMaxHP = 100;
  playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(playerArmor) : ((playerArmor && playerArmor.defense) || 0);
  hasShield = false; shieldHP = 0;
  updatePlayerUI();
  document.getElementById('player-zone').style.opacity = '1';

  // 清空战场
  battleWords = [];
  particles = [];
  shakeAmount = 0;

  // 重置技能状态
  skillState = { collected: [], chargeLevel: 0, ready: false };
  nextAttackBoost = false;
  updateSkillUI();

  const wasBoss = (bossActive && bossState) || (lastBossKey !== null && !bossActive);

  // BGM: 重新开始
  if (typeof Sound !== 'undefined' && Sound.startBGM) Sound.startBGM(0);
  if (wasBoss) {
    // Boss战：清理后延迟重新初始化
    bossProjectiles = [];
    bossState = null;
    bossActive = false;
    const retryKey = lastBossKey || 'regret';
    const bossName = (typeof BOSS_CONFIG !== 'undefined' && BOSS_CONFIG[retryKey]) ? BOSS_CONFIG[retryKey].name : '憾';
    setTimeout(() => {
      initBoss(retryKey);
      Tutorial.enterPhase(PHASE.BATTLE);
      document.getElementById('stage-hint').style.opacity = '1';
      document.getElementById('stage-hint').textContent = `再次挑战 · ${bossName}`;
    }, 500);
  } else {
    // 普通战斗：重置敌人
    enemyHP = enemyMaxHP = 40;
    enemyTimer = enemyInterval = 6;
    updateEnemyUI();
    const timerFill = document.getElementById('enemy-timer-fill');
    timerFill.style.width = '100%';
    timerFill.classList.remove('urgent');
    document.getElementById('enemy-zone').style.opacity = '1';
    Tutorial.enterPhase(PHASE.BATTLE);
    balanceWords();
    document.getElementById('stage-hint').style.opacity = '1';
    document.getElementById('stage-hint').textContent = '意识重新凝聚……';
  }
}

// ── 结局画面 ──
function showEnding() {
  canvas.style.cursor = 'default'; // 恢复系统光标以便点击结局按钮
  saveGame();

  const overlay=document.getElementById('ending-overlay');
  overlay.innerHTML = `
    <div id="ending-title">未完待续</div>
    <div id="ending-sub">意识之海的深处，有什么在等待着你……</div>
    <div id="ending-btns">
      <div class="ending-btn" onclick="location.reload()">返回标题</div>
    </div>
  `;
  overlay.classList.add('show');
  // 结局不响应点击空白
  overlay.onclick = null;

  // 散落一些文字粒子继续飘
  battleWords=[];
  for(let i=0;i<20;i++){
    const cats=['攻','防','符'];
    const cat=cats[Math.floor(Math.random()*cats.length)];
    const cfg=getCatConfig(cat);
    if(!cfg) continue;
    const bw=new BattleWord(cat,cfg.words[Math.floor(Math.random()*cfg.words.length)]);
    bw.vx*=0.3;bw.vy*=0.3;bw.wobbleAmp*=0.3;
    bw.size=20+Math.random()*14;bw.isTutorial=true;
    battleWords.push(bw);
  }
  mentor.targetAlpha=0;
}

// ═══════════════ 囊字元素 ═══════════════
const pouchBtn = document.getElementById('pouch-btn');
pouchBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleBackpack();
});

// ═══════════════ 菜单初始化 ═══════════════
// 检查存档，更新继续按钮状态和局外货币信息
(function initMenu(){
  try {
  const btnContinue = document.getElementById('btn-continue');
  const saveInfo = document.getElementById('save-info');
  const save = loadGame();
  if(!save){
    btnContinue.classList.add('disabled');
    btnContinue.textContent = '继续游戏 — 暂无存档';
    if (saveInfo) saveInfo.textContent = '';
  } else {
    if (saveInfo && save.timestamp) {
      const d = new Date(save.timestamp);
      const ds = d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
      const sc = save.soulCrystals || 0;
      saveInfo.textContent = '上次存档: ' + ds + ' | ◆ ' + sc;
    }
    // 局外货币恢复（用于菜单显示）
    if (typeof save.soulCrystals !== 'undefined' && typeof soulCrystals !== 'undefined') soulCrystals = save.soulCrystals;
    if (typeof save.permanentUpgrades !== 'undefined' && typeof initPermanentUpgrades === 'function') initPermanentUpgrades(save.permanentUpgrades);
  }
  } catch(e) { console.error('initMenu失败:', e); }
})();

// ── 启动 ──
initBGParticles();
loop(performance.now());

// ⚠️ 本地演示钩子：?demo=hub 直接进零的领域（凝实态零），仅调试用，不影响正常游戏
// 用法：http://localhost:8734/index.html?demo=hub
(function(){
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === 'hub') {
      const _demoSave = {
        difficulty:1, timestamp:Date.now(), prologuePhase:4, tutorialPhase:'battle',
        inHub:true, bossEnergy:0, zeroReturnTriggered:true, energyReturned:true,
        zeroSolidified:true, trioDepartureDone:true, hubRunNumber:3,
        weaponId:'beginner_brush', armorId:'thin_silk', skillId:'concentration',
        playerHP:100, playerMaxHP:100, soulCrystals:200, permanentUpgrades:{},
        unlockedWeapons:['beginner_brush'], equipmentLevels:{}, weaponBuffs:{},
        equipProficiency:{}, achievements:{}, ch1SkitsDone:[], uniqueEventsDone:[],
        lastRunDied:false,
      };
      localStorage.setItem('consciousness_sea_save', JSON.stringify(_demoSave));
      setTimeout(() => { if (typeof continueGame === 'function') continueGame(); }, 300);
    }
  } catch(e) { console.error('demo钩子失败:', e); }
})();

console.log('%c意识之海 · 序章 · 觉醒 v2 %c已就绪',
  'font-size:16px;color:#88bbee;','font-size:12px;color:#666;');
console.log('%c装备系统 · 技能拼字 · 文字道背包 · 双货币商店 %c已加载',
  'font-size:12px;color:#ffaa44;','font-size:12px;color:#888;');
