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

// 连接关系：当前房间 → 可前往的下一个房间（基础定义，不可变）
const BASE_CONNECTIONS = {
  'start':     ['combat1'],
  'combat1':   ['memory', 'treasure'],
  'memory':    ['combat2'],
  'treasure':  ['combat2'],
  'combat2':   ['rest'],
  'rest':      ['boss_yi'],
  'boss_yi':   ['safehouse'],
  'safehouse': [],
};

// 运行时连接关系（initMap 中根据商店生成情况动态构建）
let mapConnections = {};

// ═══════════════ 地图状态 ═══════════════

let mapActive = false;
let mapCurrentRoom = null;      // 当前所在的房间 id（在地图视图时表示上次完成的房间）
let mapRooms = {};              // { id: { unlocked, completed, visited } }
let mapSelectedNode = null;
let mapTransitionAlpha = 0;
let mapTransitionDir = 0;       // 0=无, 1=淡出, -1=淡入
let isRoguelikeMap = false;    // 是否为肉鸽随机地图
let dynamicRoomData = null;    // 肉鸽模式动态房间数据
let dynamicBaseConnections = null; // 肉鸽模式动态连接关系
let dynamicSegments = [];      // 肉鸽层段边界（分屏显示用）

// ═══════════════ 肉鸽随机地图生成 ═══════════════

/** 从房间池中随机抽取，生成一次潜航的地图 */
function generateRoguelikeMap() {
  const pool = typeof ROGUELIKE_ROOM_POOL !== 'undefined' ? ROGUELIKE_ROOM_POOL : null;
  const template = typeof ROGUELIKE_MAP_TEMPLATE !== 'undefined' ? ROGUELIKE_MAP_TEMPLATE : null;
  if (!pool || !template || !template.segments) { initMap(); return; }

  isRoguelikeMap = true;

  // 从池中随机抽取房间
  function pickOne(type) {
    const items = pool[type];
    if (!items || items.length === 0) return null;
    return { ...items[Math.floor(Math.random() * items.length)] }; // 浅拷贝
  }

  // 构建动态房间数据
  const rooms = [];
  let idCounter = 0;
  function genId(prefix) { return `${prefix}_${idCounter++}`; }

  // 第一章肉鸽无「出发」节点：直接从第1层开始第一个普通房
  // ═══════════ 三层段生成（浅层·追忆 → 中层·执念 → 深层·遗憾）═══════════
  let nextLayer = 1;
  dynamicSegments = []; // 记录层段边界（分屏显示）
  template.segments.forEach(seg => {
    const segStart = nextLayer;
    // 段内普通房
    seg.rooms.forEach(rd => {
      if (rd.type === 'branch') {
        // 同层分支节点（如 event/treasure、event/shop），玩家二选一
        const layer = nextLayer;
        const types = rd.branchTypes || ['event', 'treasure'];
        types.forEach((t, i) => {
          const branch = i === 0 ? 'upper' : 'lower';
          if (t === 'event') {
            const evt = pickOne('event');
            if (evt) { evt.id = genId('event'); evt.layer = layer; evt.branch = branch; rooms.push(evt); }
            else { rooms.push({ id: genId('event'), type: 'event', label: '记忆涟漪', layer, branch, desc: '前方有不稳定的意识波动……' }); }
          } else if (t === 'treasure') {
            const trs = pickOne('treasure');
            if (trs) { trs.id = genId('treasure'); trs.layer = layer; trs.branch = branch; rooms.push(trs); }
            else { rooms.push({ id: genId('treasure'), type: 'treasure', label: '遗落装备', layer, branch, desc: '词元结晶仍在发光……' }); }
          } else if (t === 'shop') {
            rooms.push({ id: genId('shop'), type: 'shop', label: '市', layer, isShop: true, branch,
              desc: '意识共鸣点。用碎片换取装备与补给。' });
          }
        });
        nextLayer++;
      } else if (rd.type === 'rest') {
        rooms.push({ id: genId('rest'), type: 'rest', label: '静流', layer: nextLayer,
          desc: '深海中的一片暖流。可恢复全部意识完整度。' });
        nextLayer++;
      } else if (rd.type === 'shop') {
        rooms.push({ id: genId('shop'), type: 'shop', label: '市', layer: nextLayer, isShop: true,
          desc: '意识共鸣点。用碎片换取装备与补给。' });
        nextLayer++;
      } else {
        // 战斗（默认类型）
        const c = pickOne('combat');
        if (c) { c.id = genId('combat'); c.layer = nextLayer; rooms.push(c); }
        else { rooms.push({ id: genId('combat'), type: 'combat', label: '残响碎片', layer: nextLayer, waves: 3, enemyHP: 40, enemyInterval: 6.0, desc: '被遗弃的记忆碎片化作了噪点。' }); }
        nextLayer++;
      }
    });

    // 段末 Boss
    rooms.push({ id: genId('boss'), type: 'boss', label: seg.bossLabel, layer: nextLayer,
      bossKey: seg.bossKey, desc: seg.bossDesc || '深海的守护者。' });
    // 记录该层段边界（分屏显示用）
    dynamicSegments.push({ name: seg.name, startLayer: segStart, endLayer: nextLayer });
    nextLayer++;
  });

  // 末段 Boss 之后：安全屋（终点）
  rooms.push({ id: genId('safehouse'), type: 'safe_house', label: '零的领域', layer: nextLayer,
    desc: '零用最后的力量编织的避难所。安静，温暖。' });

  // ═══════════ 构建连接关系（按层连接，分支节点连下一层对应序位）═══════════
  const conns = {};
  const byLayer = {};
  rooms.forEach(r => {
    const l = r.layer;
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(r);
  });

  const sortedLayers = Object.keys(byLayer).map(Number).sort((a,b) => a-b);
  for (let i = 0; i < sortedLayers.length - 1; i++) {
    const curLayer = sortedLayers[i];
    const nextLayerId = sortedLayers[i + 1];
    const curRooms = byLayer[curLayer] || [];
    const nextRooms = byLayer[nextLayerId] || [];

    curRooms.forEach(r => {
      if (r.type === 'safe_house') {
        conns[r.id] = [];
      } else if (r.branch) {
        // 分支节点 → 下一层对应序位（upper→0, lower→1）
        const idx = r.branch === 'upper' ? 0 : 1;
        conns[r.id] = [nextRooms[Math.min(idx, nextRooms.length - 1)].id];
      } else {
        conns[r.id] = nextRooms.map(nr => nr.id);
      }
    });

    // 确保每个房间都有连接定义
    nextRooms.forEach(r => {
      if (!conns[r.id]) conns[r.id] = [];
    });
  }

  // 最后一层（safehouse）无连接
  const lastLayer = sortedLayers[sortedLayers.length - 1];
  (byLayer[lastLayer] || []).forEach(r => {
    if (!conns[r.id]) conns[r.id] = [];
  });

  // 存储动态数据
  dynamicRoomData = rooms;
  dynamicBaseConnections = conns;

  // 初始化地图
  initMap();
}

/** 获取当前活跃的房间数据（动态或静态） */
function _getRoomData() {
  return (isRoguelikeMap && dynamicRoomData) ? dynamicRoomData : ROOM_DATA;
}

/** 获取当前连接关系 */
function _getBaseConnections() {
  return (isRoguelikeMap && dynamicBaseConnections) ? dynamicBaseConnections : BASE_CONNECTIONS;
}

function initMap() {
  const rooms = _getRoomData();
  const baseConns = _getBaseConnections();

  mapRooms = {};
  rooms.forEach(r => {
    mapRooms[r.id] = { unlocked: false, completed: false, visited: false };
  });

  // 肉鸽模式：所有商店始终生成（多层结构下有多个shop，避免断连卡死）
  if (isRoguelikeMap) {
    rooms.forEach(r => {
      if (r.type === 'shop') {
        mapRooms[r.id] = { unlocked: false, completed: false, visited: false, _active: true };
      }
    });
  }
  mapConnections = { ...baseConns };

  // 起始房间默认解锁：肉鸽无start，解锁第一个房间；序章静态图解锁start
  if (isRoguelikeMap) {
    const first = rooms[0];
    if (first && mapRooms[first.id]) mapRooms[first.id].unlocked = true;
  } else {
    const startRoom = rooms.find(r => r.type === 'start');
    if (startRoom) mapRooms[startRoom.id].unlocked = true;
  }
  mapCurrentRoom = null;
  mapActive = true;
  mapTransitionAlpha = 0;
  mapTransitionDir = -1;

  // 隐藏战斗UI
  ['enemy-zone','stage-hint'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.opacity = '0';
  });
  const cd = document.getElementById('combo-display'); if (cd) cd.classList.remove('show');
  const sd = document.getElementById('skill-display'); if (sd) sd.style.opacity = '0';
}

/** 从存档恢复地图（不重新随机商店） */
function initMapFromSave(savedRooms, savedConnections) {
  // 恢复房间状态
  mapRooms = {};
  Object.keys(savedRooms).forEach(id => {
    const r = savedRooms[id];
    mapRooms[id] = {
      unlocked: r.unlocked || false,
      completed: r.completed || false,
      visited: r.visited || false,
      _active: r._active !== undefined ? r._active : true,
    };
  });

  // 恢复连接关系
  mapConnections = {};
  Object.keys(savedConnections).forEach(id => {
    mapConnections[id] = [...savedConnections[id]];
  });

  // 保证已完成的房间解锁其后续
  _getRoomData().forEach(room => {
    if (mapRooms[room.id] && mapRooms[room.id].completed) {
      const nextIds = mapConnections[room.id] || [];
      nextIds.forEach(nid => { if (mapRooms[nid]) mapRooms[nid].unlocked = true; });
    }
  });

  mapCurrentRoom = null;
  mapActive = true;
  mapTransitionAlpha = 0;
  mapTransitionDir = -1;

  // BGM
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('explore', 1.5);

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
  const nextIds = mapConnections[roomId] || [];
  nextIds.forEach(id => unlockRoom(id));
  // 如果是分支房间的选择：锁定另一个分支
  const rooms = _getRoomData();
  const room = rooms.find(r => r.id === roomId);
  if (room && room.branch) {
    // 同一层有其他分支房间 → 锁定
    const sameLayer = rooms.filter(r => r.layer === room.layer && r.id !== roomId);
    sameLayer.forEach(r => {
      if (mapRooms[r.id]) mapRooms[r.id].unlocked = false;
    });
  }
  mapCurrentRoom = roomId;
}

/** 进入房间 → 离开地图视图 */
let _enteringRoom = false; // 重入保护：过渡动画期间忽略重复点击
function enterRoom(roomId) {
  if (_enteringRoom) return false;
  if (!mapRooms[roomId] || !mapRooms[roomId].unlocked) return false;
  if (mapRooms[roomId].completed) return false;
  // 分支互斥兜底：同层对立分支已完成时，此分支视为废弃（防止走回头路）
  const rooms = _getRoomData();
  const target = rooms.find(r => r.id === roomId);
  if (target && target.branch) {
    const rival = rooms.find(r => r.layer === target.layer && r.id !== roomId && r.branch);
    if (rival && mapRooms[rival.id] && mapRooms[rival.id].completed) return false;
  }
  _enteringRoom = true;

  mapSelectedNode = null;
  mapTransitionDir = 1; // 淡出

  // 延迟执行：等过渡动画
  setTimeout(() => {
    _enteringRoom = false;
    mapActive = false;
    mapTransitionDir = 0;
    mapTransitionAlpha = 1;

    const room = _getRoomData().find(r => r.id === roomId);
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

  // 自动存档（每次回到地图时）
  if (typeof saveGame === 'function') saveGame();

  // ═══════════════════════════════════════════
  // ⚠️ 安全屋：不显示地图，直接过渡到结局/Hub
  // 防止地图界面短暂闪现（Bug #1）
  // ═══════════════════════════════════════════
  const room = _getRoomData().find(r => r.id === roomId);
  if (room && room.type === 'safe_house') {
    if (isRoguelikeMap) {
      setTimeout(() => {
        if (typeof enterHub === 'function') enterHub();
      }, 2000);
    } else {
      // 序章模式：直接触发结局，跳过地图
      setTimeout(() => {
        if (typeof triggerPrologueEnd === 'function') triggerPrologueEnd();
      }, 1500);
    }
    return; // ← 跳过地图显示
  }

  mapTransitionAlpha = 1;
  mapTransitionDir = -1; // 淡入
  mapActive = true;
  mapCurrentRoom = roomId;

  // BGM: 回到地图 → 探索音乐
  if (typeof Sound !== 'undefined' && Sound.playBGM) Sound.playBGM('explore', 1.5);
}

// ═══════════════ 渲染 ═══════════════

// ═══════════════ 布局工具（drawMap 和 hitTestMap 共用）═══════════════

/** 当前层段 index（0/1/2）— 根据已击败的层段 Boss 数 */
function _currentSegmentIndex() {
  if (!isRoguelikeMap || !dynamicSegments || dynamicSegments.length === 0) return 0;
  let bossDone = 0;
  _getRoomData().forEach(r => {
    if (r.type === 'boss' && mapRooms[r.id] && mapRooms[r.id].completed) bossDone++;
  });
  return Math.min(bossDone, dynamicSegments.length - 1);
}

/** 获取当前活跃的房间列表（只显示当前层段，分屏显示） */
function getActiveRooms() {
  const segIdx = _currentSegmentIndex();
  const seg = dynamicSegments[segIdx];
  return _getRoomData().filter(r => {
    if (r.isShop) return mapRooms[r.id] && mapRooms[r.id]._active;
    if (!seg) return true;
    return r.layer >= seg.startLayer && r.layer <= seg.endLayer;
  });
}

function getMapLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const activeRooms = getActiveRooms();
  const layers = [...new Set(activeRooms.map(r => r.layer))].sort((a, b) => a - b);
  const marginX = W * 0.1;
  const colW = (W * 0.8) / (layers.length - 1 || 1);
  const startX = marginX;
  const cy = H * 0.48;
  // 预计算所有节点坐标（避免重复计算）
  const nodePos = {};
  activeRooms.forEach(room => {
    const layerIdx = layers.indexOf(room.layer);
    const x = startX + layerIdx * colW;
    const sameLayer = activeRooms.filter(r => r.layer === room.layer);
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

/** 当前层段名（浅层/中层/深层） */
function _currentSegmentName() {
  if (!isRoguelikeMap) return '序章';
  const seg = dynamicSegments[_currentSegmentIndex()];
  return seg ? seg.name : '浅层';
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
  ctx.fillText('意识海图 · ' + _currentSegmentName(), L.W * 0.5, L.H * 0.08);

  // ── 连线 ──
  getActiveRooms().forEach(room => {
    const nextIds = mapConnections[room.id] || [];
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
  getActiveRooms().forEach(room => {
    const pos = L.nodePos[room.id];
    const state = mapRooms[room.id];
    if (!visibleNodes.has(room.id) && !(state && state.completed)) return;

    const isHovered = mapSelectedNode === room.id;
    const now = performance.now();
    let nodeColor, glowColor, nodeAlpha;

    const isShopNode = room.type === 'shop';

    if (state && state.completed) {
      nodeColor = '#8899bb'; glowColor = 'rgba(120,150,200,0.3)'; nodeAlpha = 0.55;
    } else if (isHovered) {
      nodeColor = isShopNode ? '#ffdd88' : '#ffcc88';
      glowColor = isShopNode ? 'rgba(255,200,120,0.7)' : 'rgba(255,180,100,0.7)';
      nodeAlpha = 1;
    } else if (state && state.unlocked) {
      const pulse = 0.7 + 0.3 * Math.sin(now * 0.003);
      nodeColor = isShopNode ? '#e8c888' : '#c8ddf8';
      glowColor = isShopNode
        ? `rgba(220,180,100,${0.4 * pulse})`
        : `rgba(150,200,255,${0.4 * pulse})`;
      nodeAlpha = 0.8 * pulse;
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
  getActiveRooms().forEach(room => {
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
  for (let room of getActiveRooms()) {
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
