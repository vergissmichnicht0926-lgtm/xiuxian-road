/* ═══════════════════ §L 地图/节点系统 — 杀戮尖塔式抽象节点图 ═══════════════════
 *
 * 节点布局：按 layer 纵向排列，连接线指示行进路线
 * 完成当前房间解锁相邻房间，分支节点二选一
 *
 * 状态：mapActive → 显示节点图 / 进入房间后 false → 显示房间内容
 */

// ═══════════════ 房间配置 ═══════════════

const ROOM_DATA = [
  { id:'start',    type:'start',    label:'出发',     layer:1,
    desc:'意识海浅层入口，零的引导之光照亮前路。' },
  { id:'combat1',  type:'combat',   label:'残响碎片', layer:2,
    desc:'被遗弃的记忆碎片化作了噪点。', waves:3, enemyHP:40, enemyInterval:6.0 },
  { id:'memory',   type:'event',    label:'记忆涟漪',  layer:3, branch:'upper',
    desc:'前方有不稳定的意识波动……无法判断里面有什么。' },
  { id:'treasure', type:'treasure', label:'遗落装备',  layer:3, branch:'lower',
    desc:'词元结晶仍在发光，但守护它的残响之影尚未消散。' },
  { id:'combat2',  type:'combat',   label:'强化噪点',  layer:4,
    desc:'更深的意识层，噪点变得更加狂暴。', waves:2, enemyHP:65, enemyInterval:4.5, hardMode:true },
  { id:'rest',     type:'rest',     label:'静流',      layer:5,
    desc:'深海中的一片暖流。纯净的意识信息在此缓慢循环，可恢复全部意识完整度。' },
  { id:'boss_yi',  type:'boss',     label:'遗',        layer:6, bossKey:'yi',
    desc:'深海的守护者。辶为疾走，贵为珍宝——两者合一，便是永恒的遗憾。' },
  { id:'safehouse',type:'safe_house',label:'零的领域',  layer:7,
    desc:'零用最后的力量编织的避难所。安静，温暖，与深海的噪点完全隔绝。' },
];

// 连接关系：当前房间 → 可前往的下一个房间
const CONNECTIONS = {
  'start':     ['combat1'],
  'combat1':   ['memory', 'treasure'],
  'memory':    ['combat2'],
  'treasure':  ['combat2'],
  'combat2':   ['rest'],
  'rest':      ['boss_yi'],
  'boss_yi':   ['safehouse'],
  'safehouse': [],
};

// ═══════════════ 地图状态 ═══════════════

let mapActive = false;
let mapCurrentRoom = null;      // 当前所在的房间 id（在地图视图时表示上次完成的房间）
let mapRooms = {};              // { id: { unlocked, completed, visited } }
let mapSelectedNode = null;
let mapTransitionAlpha = 0;
let mapTransitionDir = 0;       // 0=无, 1=淡出, -1=淡入

function initMap() {
  mapRooms = {};
  ROOM_DATA.forEach(r => {
    mapRooms[r.id] = { unlocked: false, completed: false, visited: false };
  });
  // 起始房间默认解锁
  mapRooms['start'].unlocked = true;
  mapCurrentRoom = null;
  mapActive = true;
  mapTransitionAlpha = 0;
  mapTransitionDir = -1;

  // 隐藏战斗UI
  const enemyZone = document.getElementById('enemy-zone');
  if (enemyZone) enemyZone.style.opacity = '0';
  const stageHint = document.getElementById('stage-hint');
  if (stageHint) stageHint.style.opacity = '0';
  const comboDisplay = document.getElementById('combo-display');
  if (comboDisplay) comboDisplay.classList.remove('show');
  const skillDisplay = document.getElementById('skill-display');
  if (skillDisplay) skillDisplay.style.opacity = '0';
}

/** 解锁指定房间 */
function unlockRoom(roomId) {
  if (mapRooms[roomId]) mapRooms[roomId].unlocked = true;
}

/** 完成指定房间，解锁后续 */
function completeRoom(roomId) {
  if (mapRooms[roomId]) {
    mapRooms[roomId].completed = true;
    mapRooms[roomId].visited = true;
  }
  // 解锁连接的下一个房间
  const nextIds = CONNECTIONS[roomId] || [];
  nextIds.forEach(id => unlockRoom(id));
  // 如果是分支房间的选择：锁定另一个分支
  const room = ROOM_DATA.find(r => r.id === roomId);
  if (room && room.branch) {
    // 同一层有其他分支房间 → 锁定
    const sameLayer = ROOM_DATA.filter(r => r.layer === room.layer && r.id !== roomId);
    sameLayer.forEach(r => {
      if (mapRooms[r.id]) mapRooms[r.id].unlocked = false;
    });
  }
  mapCurrentRoom = roomId;
}

/** 进入房间 → 离开地图视图 */
function enterRoom(roomId) {
  if (!mapRooms[roomId] || !mapRooms[roomId].unlocked) return false;
  if (mapRooms[roomId].completed) return false;

  mapSelectedNode = null;
  mapTransitionDir = 1; // 淡出

  // 延迟执行：等过渡动画
  setTimeout(() => {
    mapActive = false;
    mapTransitionDir = 0;
    mapTransitionAlpha = 1;

    const room = ROOM_DATA.find(r => r.id === roomId);
    if (room && typeof startRoom === 'function') {
      // 根据层级更新威胁等级
      if (typeof threatLevel !== 'undefined' && typeof THREAT !== 'undefined' && room.layer) {
        const baseThreat = THREAT.BASE[difficulty] || 2;
        threatLevel = Math.min(10, baseThreat + (room.layer - 1) * THREAT.PER_LAYER);
      }
      startRoom(room);
    }
  }, 400);

  return true;
}

/** 房间内容完成后回到地图 */
function returnToMap(roomId) {
  completeRoom(roomId);
  mapTransitionAlpha = 1;
  mapTransitionDir = -1; // 淡入
  mapActive = true;
  mapCurrentRoom = roomId;

  // BGM: 回到地图 → 探索音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('explore', 1.5);

  // safehouse → 延迟触发结局
  if (roomId === 'safehouse') {
    setTimeout(() => {
      if (typeof triggerPrologueEnd === 'function') triggerPrologueEnd();
    }, 2000);
  }
}

// ═══════════════ 渲染 ═══════════════

// ═══════════════ 布局工具（drawMap 和 hitTestMap 共用）═══════════════

function getMapLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const layers = [...new Set(ROOM_DATA.map(r => r.layer))].sort((a, b) => a - b);
  const marginX = W * 0.1;
  const colW = (W * 0.8) / (layers.length - 1 || 1);
  const startX = marginX;
  const cy = H * 0.48;
  // 预计算所有节点坐标（避免重复计算）
  const nodePos = {};
  ROOM_DATA.forEach(room => {
    const layerIdx = layers.indexOf(room.layer);
    const x = startX + layerIdx * colW;
    const sameLayer = ROOM_DATA.filter(r => r.layer === room.layer);
    if (sameLayer.length > 1) {
      const idx = sameLayer.indexOf(room);
      const spacing = 90;
      const totalH = (sameLayer.length - 1) * spacing;
      nodePos[room.id] = { x, y: cy - totalH / 2 + idx * spacing };
    } else {
      nodePos[room.id] = { x, y: cy };
    }
  });
  return { W, H, layers, startX, colW, cy, nodePos };
}

function drawMap(ctx) {
  if (!mapActive) return;

  const L = getMapLayout();
  const visibleNodes = getVisibleNodes();

  // 背景
  ctx.save();
  ctx.fillStyle = 'rgba(2,2,20,0.92)';
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.fillStyle = 'rgba(180,200,240,0.7)';
  ctx.font = '20px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('意识海图 · 浅层', L.W * 0.5, L.H * 0.08);

  // ── 连线 ──
  ROOM_DATA.forEach(room => {
    const nextIds = CONNECTIONS[room.id] || [];
    const fromPos = L.nodePos[room.id];
    const fromDone = mapRooms[room.id] && mapRooms[room.id].completed;
    if (!visibleNodes.has(room.id) && !fromDone) return;

    nextIds.forEach(nextId => {
      if (!visibleNodes.has(nextId) && !(mapRooms[nextId] && mapRooms[nextId].completed)) return;
      const toPos = L.nodePos[nextId];
      if (!toPos) return;
      const toUnlocked = mapRooms[nextId] && mapRooms[nextId].unlocked;

      ctx.save();
      ctx.strokeStyle = fromDone ? 'rgba(180,200,240,0.4)' : toUnlocked ? 'rgba(200,180,140,0.5)' : 'rgba(80,80,100,0.2)';
      ctx.lineWidth = fromDone ? 2 : 1.5;
      if (!fromDone && toUnlocked) ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(fromPos.x, fromPos.y); ctx.lineTo(toPos.x, toPos.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const midX = (fromPos.x + toPos.x) / 2, midY = (fromPos.y + toPos.y) / 2;
      drawArrow(ctx, midX, midY, Math.atan2(toPos.y - fromPos.y, toPos.x - fromPos.x),
        fromDone ? 'rgba(180,200,240,0.5)' : 'rgba(200,180,140,0.4)');
    });
  });

  // ── 节点 ──
  ROOM_DATA.forEach(room => {
    const pos = L.nodePos[room.id];
    const state = mapRooms[room.id];
    if (!visibleNodes.has(room.id) && !(state && state.completed)) return;

    const isHovered = mapSelectedNode === room.id;
    const now = performance.now();
    let nodeColor, glowColor, nodeAlpha;

    if (state && state.completed) {
      nodeColor = '#8899bb'; glowColor = 'rgba(120,150,200,0.3)'; nodeAlpha = 0.55;
    } else if (isHovered) {
      nodeColor = '#ffcc88'; glowColor = 'rgba(255,180,100,0.7)'; nodeAlpha = 1;
    } else if (state && state.unlocked) {
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.003);
      nodeColor = '#c8ddf8'; glowColor = `rgba(150,200,255,${0.4 * pulse})`; nodeAlpha = 0.8 * pulse;
    } else return;

    ctx.save();
    if (isHovered || (state && state.unlocked && !state.completed)) {
      const g = ctx.createRadialGradient(pos.x, pos.y, 8, pos.x, pos.y, 50);
      g.addColorStop(0, glowColor); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pos.x, pos.y, 50, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowColor = glowColor; ctx.shadowBlur = isHovered ? 18 : 8;
    ctx.fillStyle = nodeColor; ctx.globalAlpha = nodeAlpha;
    ctx.font = `${isHovered ? 26 : 22}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(room.label, pos.x, pos.y);
    ctx.shadowBlur = 0;
    if (state && state.completed) {
      ctx.fillStyle = 'rgba(150,200,120,0.7)'; ctx.font = '12px "Noto Serif SC","SimSun",serif';
      ctx.fillText('✓', pos.x + 26, pos.y - 16);
    }
    if (isHovered && room.desc && state && state.unlocked) {
      ctx.fillStyle = 'rgba(200,210,230,0.65)'; ctx.font = '12px "Noto Serif SC","SimSun",serif';
      ctx.fillText(room.desc, pos.x, pos.y + 28);
    }
    ctx.restore();
  });

  ctx.fillStyle = 'rgba(150,170,200,0.35)';
  ctx.font = '12px "Noto Serif SC","SimSun",serif'; ctx.textAlign = 'center';
  ctx.fillText('点击发光节点进入', L.W * 0.5, L.H * 0.92);
  ctx.restore();
}

function getVisibleNodes() {
  const visible = new Set();
  ROOM_DATA.forEach(room => {
    const state = mapRooms[room.id];
    if (state && (state.completed || state.unlocked)) visible.add(room.id);
  });
  return visible;
}

function drawArrow(ctx, x, y, angle, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(-4, -3);
  ctx.lineTo(-4, 3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ═══════════════ 鼠标交互 ═══════════════

function hitTestMap(mx, my) {
  if (!mapActive) return null;
  const L = getMapLayout();
  mapSelectedNode = null;
  for (let room of ROOM_DATA) {
    if (!(mapRooms[room.id] && (mapRooms[room.id].completed || mapRooms[room.id].unlocked))) continue;
    const pos = L.nodePos[room.id];
    const w = Math.max(room.label.length * 18, 60);
    if (mx > pos.x - w/2 && mx < pos.x + w/2 && my > pos.y - 18 && my < pos.y + 18) {
      if (mapRooms[room.id].unlocked && !mapRooms[room.id].completed) {
        mapSelectedNode = room.id;
        return room;
      }
      mapSelectedNode = room.id;
    }
  }
  return null;
}

function handleMapClick(mx, my) {
  const room = hitTestMap(mx, my);
  if (room) {
    Sound.mapNode();
    enterRoom(room.id);
  }
}
