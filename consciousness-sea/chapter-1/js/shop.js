/* ═══════════════════ §N 局内商店 + 局内货币 ═══════════════════
 *
 * 依赖：config.js (SHOP_CATALOG, SHOP_CONSUMABLES, SHARD_REWARDS, EQUIPMENT)
 *       particles.js (HitParticle, DamageText)
 *       sound.js (Sound)
 *       main.js (playerWeapon, playerArmor, playerSkill, unlockedWeapons, shards)
 *
 * 局内货币「意识碎片(shards)」— 每局重置，用于局内商店消费
 * 局内商店 — 地图随机节点，Canvas绘制覆盖层
 */

// ═══════════════ 局内货币 ═══════════════
let shards = 0;

/** 给予局内碎片（带粒子效果和音效）。遗响 shardMult（漂流/贪婪）在此统一放大 */
function grantShards(amount, x, y) {
  // v5.2 裂隙变异 shardMult：与遗响 shardMult 叠加
  const mult = 1 + (typeof echoMod === 'function' ? (echoMod('shardMult') || 0) : 0)
    + (typeof variantMod === 'function' ? (variantMod('shardMult') || 0) : 0);
  if (mult !== 1) amount = Math.floor(amount * mult);
  shards += amount;
  updateShardsDisplay();
  // 粒子
  if (typeof particles !== 'undefined' && typeof HitParticle !== 'undefined') {
    for (let i = 0; i < 12; i++) {
      const px = x || (typeof W !== 'undefined' ? W * 0.5 : 600);
      const py = y || (typeof H !== 'undefined' ? H * 0.5 : 400);
      const p = new HitParticle(px + (Math.random() - 0.5) * 60, py + (Math.random() - 0.5) * 30, '#ffcc88', '◇');
      p.vx *= 0.6; p.vy *= 0.6; p.size = 10 + Math.random() * 8;
      particles.push(p);
    }
  }
  if (typeof DamageText !== 'undefined' && typeof particles !== 'undefined') {
    particles.push(new DamageText(x || W*0.5, (y || H*0.5) - 15, `◇ +${amount}`, '#ffcc88'));
  }
  if (typeof Sound !== 'undefined') Sound.itemGet();
}

/** 更新左上角碎片DOM显示 */
function updateShardsDisplay() {
  const el = document.getElementById('shards-display');
  if (el) el.textContent = `◇ ${shards}`;
}

// ═══════════════ 局内商店 ═══════════════

let shopOpen = false;
let shopItems = [];           // 商品对象数组
let shopHovered = null;       // 悬停商品
let shopDetail = null;        // v5.3 详情查看中的商品（列表→详情二级结构）
let shopDetailHover = null;   // 详情面板按钮悬停 'buy'|'cancel'|null
let shopFeedback = null;      // { text, color, timer }
let shopJustOpened = false;   // 刚打开商店，防止立即误触

/** 切换商店开关 */
function toggleShop() {
  if (shopOpen) {
    closeShop();
  } else {
    openShop();
  }
}

function openShop() {
  if (typeof backpackOpen !== 'undefined' && backpackOpen) {
    // 关闭背包后再打开商店
    if (typeof toggleBackpack === 'function') toggleBackpack();
  }
  shopOpen = true;
  shopJustOpened = true;
  shopDetail = null;
  shopFeedback = null;
  initShopItems();
  if (typeof Sound !== 'undefined') Sound.uiOpen();
  // 抑制背包按钮的视觉状态
  const pb = document.getElementById('pouch-btn');
  if (pb) pb.classList.remove('active');
}

function closeShop() {
  shopOpen = false;
  shopItems = [];
  shopHovered = null;
  shopDetail = null;
  shopDetailHover = null;
  shopFeedback = null;
  if (typeof Sound !== 'undefined') Sound.uiClose();
}

/** 初始化商店商品 */
function initShopItems() {
  shopItems = [];

  // ── 随机刷1-2件装备/技能（排除已拥有）──
  const available = [];
  // 武器
  if (SHOP_CATALOG.weapons) {
    Object.entries(SHOP_CATALOG.weapons).forEach(([key, cost]) => {
      const data = EQUIPMENT.weapons[key];
      if (!data) return;
      const owned = (typeof unlockedWeapons !== 'undefined' && unlockedWeapons.has(key))
                 || (typeof playerWeapon !== 'undefined' && playerWeapon && playerWeapon.id === key);
      if (!owned) available.push({ type:'weapon', key, data, cost });
    });
  }
  // 防具
  if (SHOP_CATALOG.armors) {
    Object.entries(SHOP_CATALOG.armors).forEach(([key, cost]) => {
      const data = EQUIPMENT.armors[key];
      if (!data) return;
      const owned = (typeof playerArmor !== 'undefined' && playerArmor && playerArmor.id === key)
        || (typeof unlockedArmors !== 'undefined' && unlockedArmors.has(key));
      if (!owned) available.push({ type:'armor', key, data, cost });
    });
  }
  // 技能
  if (SHOP_CATALOG.skills) {
    Object.entries(SHOP_CATALOG.skills).forEach(([key, cost]) => {
      const data = EQUIPMENT.skills[key];
      if (!data) return;
      const owned = (typeof playerSkill !== 'undefined' && playerSkill && playerSkill.id === key);
      if (!owned) available.push({ type:'skill', key, data, cost });
    });
  }
  // 护符（必须在随机选取之前入池，否则永远不会上架）
  if (SHOP_CATALOG.talismans) {
    Object.entries(SHOP_CATALOG.talismans).forEach(([key, cost]) => {
      const data = EQUIPMENT.talismans[key];
      if (!data) return;
      const owned = (typeof playerTalisman !== 'undefined' && playerTalisman && playerTalisman.id === key)
        || (typeof unlockedTalismans !== 'undefined' && unlockedTalismans.has(key));
      if (!owned) available.push({ type:'talisman', key, data, cost });
    });
  }

  // 随机选1-2件
  const equipCount = available.length > 0 ? (Math.random() < 0.5 ? 1 : 2) : 0;
  const shuffled = available.sort(() => Math.random() - 0.5);
  const selectedEquip = shuffled.slice(0, Math.min(equipCount, shuffled.length));

  // ── 工坊「传承共鸣」：概率上架传承技能（初始0%，每级+5%，只卖未拥有）──
  if (typeof getInheritShopChance === 'function' && Math.random() < getInheritShopChance()) {
    const inheritPool = (typeof INHERIT_SKILL_IDS !== 'undefined' ? INHERIT_SKILL_IDS : [])
      .filter(k => EQUIPMENT.skills[k] && !(playerSkill && playerSkill.id === k));
    if (inheritPool.length) {
      const key = inheritPool[Math.floor(Math.random() * inheritPool.length)];
      selectedEquip.push({ type:'skill', key, data: EQUIPMENT.skills[key], cost: 300 });
    }
  }

  // ── 固定消耗品（始终出现）──
  const consumables = [];
  if (SHOP_CONSUMABLES.heal) {
    consumables.push({ type:'consumable', key:'heal', ...SHOP_CONSUMABLES.heal });
  }
  if (SHOP_CONSUMABLES.gamble) {
    consumables.push({ type:'consumable', key:'gamble', ...SHOP_CONSUMABLES.gamble });
  }

  // ── 遗响商品（1-2 件未拥有，按稀有度定价）──
  const echoItems = [];
  if (typeof ECHO_DEFS !== 'undefined' && typeof echoInventory !== 'undefined') {
    const echoPool = Object.keys(ECHO_DEFS).filter(k => !echoInventory.includes(k));
    if (echoPool.length) {
      const echoCount = Math.random() < 0.5 ? 1 : 2;
      const echoShuffled = echoPool.sort(() => Math.random() - 0.5);
      echoShuffled.slice(0, Math.min(echoCount, echoPool.length)).forEach(k => {
        const ed = ECHO_DEFS[k];
        const rr = (typeof ECHO_RARITY !== 'undefined' && ECHO_RARITY[ed.rarity]) || ECHO_RARITY.common;
        echoItems.push({ type:'echo', key:k, data:ed, cost: rr.cost });
      });
    }
  }

  const allItems = [...selectedEquip, ...echoItems, ...consumables];
  const Ww = typeof W !== 'undefined' ? W : 1200;
  const Hh = typeof H !== 'undefined' ? H : 800;
  const cols = Ww < 480 ? 1 : 2; // 窄屏自动降为单列
  const cardW = 160, cardH = 70;
  const gapX = 20, gapY = 16;
  const totalW = cols * cardW + (cols - 1) * gapX;
  const startX = Ww * 0.5 - totalW * 0.5 + cardW * 0.5;
  const startY = Hh * 0.28;

  allItems.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    shopItems.push({
      ...item,
      x: startX + col * (cardW + gapX),
      y: startY + row * (cardH + gapY),
      baseX: startX + col * (cardW + gapX),
      baseY: startY + row * (cardH + gapY),
      cardW, cardH,
      alpha: 0,
      targetAlpha: 0.9,
      phase: Math.random() * Math.PI * 2,
      hovered: false,
      _hasGlow: false,
    });
  });

  // 延迟缓入
  setTimeout(() => { shopItems.forEach(si => si.targetAlpha = 0.9); }, 50);
}

/** 每帧更新商店物品 */
function updateShopItems() {
  // 刚打开时冷却
  if (shopJustOpened) {
    shopJustOpened = false;
  }

  if (shopFeedback) {
    shopFeedback.timer--;
    if (shopFeedback.timer <= 0) shopFeedback = null;
  }

  shopItems.forEach(item => {
    item.alpha += (item.targetAlpha - item.alpha) * 0.1;
    item.phase += 0.012;
    // 选中后的微浮动
    const floatY = (item === shopDetail) ? Math.sin(item.phase) * 4 : Math.sin(item.phase * 0.7) * 2;
    item.x += (item.baseX - item.x) * 0.08;
    item.y += (item.baseY + floatY - item.y) * 0.08;
    // 选中发光脉动
    item._hasGlow = (item === shopDetail);
  });
}

/** 获取商品颜色 */
function getItemColor(item) {
  if (item.color) return item.color;
  if (item.type === 'weapon') return '#ff8866';
  if (item.type === 'armor') return '#66aaff';
  if (item.type === 'skill') return '#ffaa44';
  if (item.type === 'talisman') return '#55ee99';
  return '#ffcc88';
}

/** 获取商品光晕 */
function getItemGlow(item) {
  if (item.glow) return item.glow;
  if (item.type === 'weapon') return '#cc4422';
  if (item.type === 'armor') return '#3366cc';
  if (item.type === 'skill') return '#cc7722';
  if (item.type === 'talisman') return '#228844';
  return '#ccaa22';
}

/** 绘制商店 */
function drawShop(ctx) {
  const Ww = typeof W !== 'undefined' ? W : 1200;
  const Hh = typeof H !== 'undefined' ? H : 800;
  const now = performance.now();

  ctx.save();

  // 深色遮罩
  ctx.fillStyle = 'rgba(2,2,18,0.93)';
  ctx.fillRect(0, 0, Ww, Hh);

  // 标题
  ctx.fillStyle = 'rgba(200,220,240,0.6)';
  ctx.font = '22px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('意识市集', Ww * 0.5, Hh * 0.1);

  // 碎片余额
  const balColor = '#ffcc88';
  ctx.fillStyle = balColor;
  ctx.font = '16px "Noto Serif SC","SimSun",serif';
  ctx.fillText(`◇ 意识碎片: ${shards}`, Ww * 0.5, Hh * 0.16);

  // 分隔线
  ctx.strokeStyle = 'rgba(255,200,140,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Ww * 0.15, Hh * 0.2);
  ctx.lineTo(Ww * 0.85, Hh * 0.2);
  ctx.stroke();

  // 商品卡片
  shopItems.forEach(item => {
    if (item.alpha < 0.03) return;
    const isHovered = item.hovered;
    const isSelected = false; // v5.3 详情面板独立于卡片，卡片不再常驻选中态
    const sz = isHovered ? 1.05 : 1;
    const glowPulse = isSelected ? (0.6 + 0.4 * Math.sin(now * 0.004)) : 1;

    ctx.save();
    ctx.globalAlpha = item.alpha;

    // 卡片背景
    const cx = item.x, cy = item.y;
    const cw = item.cardW * sz, ch = item.cardH * sz;
    const cr = 8;

    // 选中/悬停光晕
    if (isHovered || isSelected) {
      ctx.shadowColor = isSelected
        ? getItemGlow(item)
        : 'rgba(255,220,150,0.5)';
      ctx.shadowBlur = isSelected ? 18 * glowPulse : 12;
    }

    // 卡片底色
    const bgAlpha = isSelected ? 0.18 : (isHovered ? 0.12 : 0.06);
    ctx.fillStyle = `rgba(255,220,180,${bgAlpha})`;
    ctx.strokeStyle = isSelected
      ? `rgba(255,200,140,${0.5 * glowPulse})`
      : (isHovered ? 'rgba(255,200,140,0.4)' : 'rgba(255,255,255,0.08)');
    ctx.lineWidth = isSelected ? 2 : 1;
    roundRect(ctx, cx - cw/2, cy - ch/2, cw, ch, cr);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 类型小标
    const typeLabel = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '防具' : item.type === 'skill' ? '技能' : item.type === 'talisman' ? '护符' : item.type === 'echo' ? '遗响' : '消耗';
    ctx.fillStyle = 'rgba(200,200,220,0.35)';
    ctx.font = '9px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'left';
    ctx.fillText(typeLabel, cx - cw/2 + 10, cy - ch/2 + 14);

    // 商品名（v5.3 列表只显示名称，描述移入详情面板）
    const itemColor = getItemColor(item);
    ctx.fillStyle = itemColor;
    ctx.font = `${isHovered ? 19 : 17}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center';
    ctx.fillText(item.name || item.data.name, cx, cy - 2);

    // 价格（含遗响折扣）
    const price = (typeof getShopPrice === 'function') ? getShopPrice(item) : item.cost;
    const canAfford = shards >= price;
    const priceColor = isHovered ? '#ffdd88' : (canAfford ? 'rgba(255,220,150,0.7)' : 'rgba(255,100,80,0.7)');
    ctx.fillStyle = priceColor;
    ctx.font = '13px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'right';
    ctx.fillText(`◇ ${price}`, cx + cw/2 - 10, cy - ch/2 + 14);

    // 悬停提示：点击查看详情
    if (isHovered && !isSelected) {
      const hintAlpha = 0.5 + 0.35 * Math.sin(now * 0.003);
      ctx.fillStyle = `rgba(255,220,150,${hintAlpha})`;
      ctx.font = '11px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center';
      ctx.fillText('点击查看详情', cx, cy + ch/2 + 15);
    }

    ctx.restore();
  });

  // 反馈文字
  if (shopFeedback) {
    ctx.save();
    const fa = Math.min(1, shopFeedback.timer / 15);
    ctx.globalAlpha = fa;
    ctx.fillStyle = shopFeedback.color;
    ctx.font = '16px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'center';
    ctx.fillText(shopFeedback.text, Ww * 0.5, Hh * 0.86);
    ctx.restore();
  }

  // 详情面板（列表之上）
  if (shopDetail) drawShopDetail(ctx, shopDetail);

  // 底部提示
  const pulse = 0.25 + 0.2 * Math.sin(now * 0.002);
  ctx.fillStyle = `rgba(180,190,210,${pulse})`;
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  const hintText = shopDetail
    ? '点击「购买」购入 · 点击面板外或「返回」返回列表 · ESC返回'
    : '点击商品查看详情 · 点击空白离开 · ESC关闭';
  ctx.fillText(hintText, Ww * 0.5, Hh * 0.92);

  ctx.restore();
}

// ═══════════════ v5.3 商店详情面板 ═══════════════

/** 详情面板几何（居中） */
function getShopDetailRect() {
  const Ww = typeof W !== 'undefined' ? W : 1200;
  const Hh = typeof H !== 'undefined' ? H : 800;
  const w = Math.min(460, Ww * 0.82);
  const h = Math.min(330, Hh * 0.52);
  return { x: Ww * 0.5, y: Hh * 0.42, w, h };
}

/** 详情面板按钮几何 */
function getShopDetailButtons() {
  const r = getShopDetailRect();
  const bw = 112, bh = 40, gap = 26;
  const total = bw * 2 + gap;
  const cy = r.y + r.h * 0.5 - 24;
  return {
    buy:    { x: r.x - total/2 + bw/2, y: cy, w: bw, h: bh },
    cancel: { x: r.x - total/2 + bw + gap + bw/2, y: cy, w: bw, h: bh },
  };
}

/** 中文字符逐字换行 */
function wrapCtxText(ctx, text, maxWidth) {
  if (!text) return [];
  const lines = [];
  let cur = '';
  for (const ch of String(text)) {
    if (cur && ctx.measureText(cur + ch).width > maxWidth) {
      lines.push(cur); cur = ch;
    } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** 详情面板统计行 */
function getShopDetailStats(item) {
  const d = item.data || {};
  const parts = [];
  if (item.type === 'weapon') {
    if (d.wordCount) parts.push(`攻字 ${d.wordCount} 枚`);
    if (d.damage) parts.push(`伤害 ${d.damage}`);
    if (d.targetMode === 'aoe') parts.push('AOE');
    if (d.pierce) parts.push('贯穿');
    if (d.slow) parts.push('减速');
    if (d.leech) parts.push(`吸血 ${Math.round(d.leech * 100)}%`);
  } else if (item.type === 'armor') {
    if (d.defense) parts.push(`减伤 ${d.defense}`);
    if (d.shieldPerWord) parts.push(`每字盾 ${d.shieldPerWord}`);
    if (d.maxShield) parts.push(`盾上限 ${d.maxShield}`);
  }
  return parts.join(' · ');
}

/** 绘制详情面板按钮 */
function drawShopDetailBtn(ctx, b, label, enabled, hovered) {
  ctx.save();
  ctx.globalAlpha = enabled ? 1 : 0.4;
  ctx.fillStyle = (enabled && hovered) ? 'rgba(255,220,170,0.15)' : 'rgba(255,220,170,0.06)';
  roundRect(ctx, b.x - b.w/2, b.y - b.h/2, b.w, b.h, 6);
  ctx.fill();
  ctx.strokeStyle = (enabled && hovered) ? 'rgba(255,220,160,0.75)' : 'rgba(255,200,140,0.35)';
  ctx.lineWidth = hovered ? 1.5 : 1;
  roundRect(ctx, b.x - b.w/2, b.y - b.h/2, b.w, b.h, 6);
  ctx.stroke();
  ctx.fillStyle = enabled ? (hovered ? '#ffe8c8' : 'rgba(255,225,185,0.9)') : 'rgba(255,255,255,0.3)';
  ctx.font = '15px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, b.x, b.y);
  ctx.restore();
}

/** 绘制商店详情面板（大字描述 + 购买/返回） */
function drawShopDetail(ctx, item) {
  const Ww = typeof W !== 'undefined' ? W : 1200;
  const Hh = typeof H !== 'undefined' ? H : 800;
  const now = performance.now();
  const r = getShopDetailRect();
  const btns = getShopDetailButtons();
  const price = (typeof getShopPrice === 'function') ? getShopPrice(item) : item.cost;
  const canAfford = shards >= price;
  const itemColor = getItemColor(item);
  const cx = r.x;

  ctx.save();

  // 列表压暗
  ctx.fillStyle = 'rgba(2,2,18,0.6)';
  ctx.fillRect(0, 0, Ww, Hh);

  // 面板本体
  ctx.shadowColor = getItemGlow(item);
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(12,12,32,0.97)';
  roundRect(ctx, r.x - r.w/2, r.y - r.h/2, r.w, r.h, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,210,150,${0.4 + 0.15 * Math.sin(now * 0.003)})`;
  ctx.lineWidth = 1.5;
  roundRect(ctx, r.x - r.w/2, r.y - r.h/2, r.w, r.h, 12);
  ctx.stroke();

  let ty = r.y - r.h/2 + 36;
  ctx.textAlign = 'center';

  // 类型
  const typeLabel = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '防具' : item.type === 'skill' ? '技能' : item.type === 'talisman' ? '护符' : item.type === 'echo' ? '遗响' : '消耗品';
  ctx.fillStyle = 'rgba(200,200,220,0.45)';
  ctx.font = '12px "Noto Serif SC","SimSun",serif';
  ctx.fillText(typeLabel, cx, ty);
  ty += 28;

  // 名称
  ctx.fillStyle = itemColor;
  ctx.font = '25px "Noto Serif SC","SimSun",serif';
  ctx.fillText(item.name || item.data.name, cx, ty);
  ty += 36;

  // 统计行
  const stats = getShopDetailStats(item);
  if (stats) {
    ctx.fillStyle = 'rgba(225,228,240,0.6)';
    ctx.font = '14px "Noto Serif SC","SimSun",serif';
    ctx.fillText(stats, cx, ty);
    ty += 26;
  }

  // 分隔线
  ctx.strokeStyle = 'rgba(255,200,140,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x - r.w * 0.32, ty); ctx.lineTo(r.x + r.w * 0.32, ty); ctx.stroke();
  ty += 14;

  // 描述（换行大字）
  const priceTop = r.y + r.h * 0.5 - 84;      // 价格预留线
  const avail = priceTop - ty - 12;
  const maxLines = Math.max(1, Math.min(4, Math.floor(avail / 23)));
  const desc = item.desc || (item.data && item.data.desc) || '';
  ctx.fillStyle = 'rgba(208,214,232,0.9)';
  ctx.font = '14px "Noto Serif SC","SimSun",serif';
  const lines = wrapCtxText(ctx, desc, r.w - 56);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    ctx.fillText(lines[i], cx, ty);
    ty += 23;
  }

  // 价格
  ctx.fillStyle = canAfford ? 'rgba(255,220,150,0.9)' : 'rgba(255,100,80,0.85)';
  ctx.font = '17px "Noto Serif SC","SimSun",serif';
  ctx.fillText(`◇ ${price}`, cx, priceTop);

  // 按钮
  drawShopDetailBtn(ctx, btns.buy, '购买', canAfford, shopDetailHover === 'buy');
  drawShopDetailBtn(ctx, btns.cancel, '返回', true, shopDetailHover === 'cancel');

  ctx.restore();
}

/** 商店悬停检测 */
function hitTestShop(mx, my) {
  shopHovered = null;
  shopDetailHover = null;
  // 详情模式：只检测面板按钮
  if (shopDetail) {
    const b1 = getShopDetailButtons().buy, b2 = getShopDetailButtons().cancel;
    if (mx > b1.x - b1.w/2 && mx < b1.x + b1.w/2 && my > b1.y - b1.h/2 && my < b1.y + b1.h/2) shopDetailHover = 'buy';
    else if (mx > b2.x - b2.w/2 && mx < b2.x + b2.w/2 && my > b2.y - b2.h/2 && my < b2.y + b2.h/2) shopDetailHover = 'cancel';
    return;
  }
  for (let item of shopItems) {
    item.hovered = false;
    const cw = item.cardW, ch = item.cardH;
    if (mx > item.x - cw/2 && mx < item.x + cw/2 &&
        my > item.y - ch/2 && my < item.y + ch/2) {
      item.hovered = true;
      shopHovered = item;
    }
  }
}

/** 商店点击处理（v5.3 列表→详情二级结构） */
function handleShopClick() {
  if (shopJustOpened) return; // 防误触

  // ── 详情模式：购买 / 返回 / 面板外返回列表 ──
  if (shopDetail) {
    const r = getShopDetailRect();
    const btns = getShopDetailButtons();
    const inBuy = mx > btns.buy.x - btns.buy.w/2 && mx < btns.buy.x + btns.buy.w/2 &&
                  my > btns.buy.y - btns.buy.h/2 && my < btns.buy.y + btns.buy.h/2;
    const inCancel = mx > btns.cancel.x - btns.cancel.w/2 && mx < btns.cancel.x + btns.cancel.w/2 &&
                     my > btns.cancel.y - btns.cancel.h/2 && my < btns.cancel.y + btns.cancel.h/2;
    if (inBuy) {
      attemptPurchase(shopDetail);
    } else if (inCancel) {
      shopDetail = null;
      if (typeof Sound !== 'undefined') Sound.uiClose();
    } else if (mx < r.x - r.w/2 || mx > r.x + r.w/2 || my < r.y - r.h/2 || my > r.y + r.h/2) {
      // 点击面板外 → 返回列表
      shopDetail = null;
      if (typeof Sound !== 'undefined') Sound.uiClose();
    }
    return;
  }

  // ── 列表模式：点击商品 → 查看详情；点击空白 → 离开商店 ──
  if (shopHovered) {
    shopDetail = shopHovered;
    if (typeof Sound !== 'undefined') Sound.uiClick();
  } else {
    closeShop();
    if (typeof shopRoomDone === 'function') shopRoomDone();
  }
}

/** 遗响·商店折扣：统一取价（市集之忆等可打折） */
function getShopPrice(item) {
  // v5.2 词元枯竭变异 shopDiscount：与遗响 shopDiscount 叠加
  const disc = (typeof echoMod === 'function' ? (echoMod('shopDiscount') || 0) : 0)
    + (typeof variantMod === 'function' ? (variantMod('shopDiscount') || 0) : 0);
  return Math.max(1, Math.round((item.cost || 0) * (1 - disc)));
}

/** 执行购买 */
function attemptPurchase(item) {
  const price = (typeof getShopPrice === 'function') ? getShopPrice(item) : (item.cost || 0);
  if (shards < price) {
    shopFeedback = { text: '意识碎片不足', color: '#ff6644', timer: 45 };
    // 保持详情面板打开，玩家可点「返回」退出
    if (typeof Sound !== 'undefined') Sound.stun();
    return;
  }

  shards -= price;
  updateShardsDisplay();

  if (item.type === 'echo') {
    // ── 遗响 ──
    if (typeof grantEcho === 'function') grantEcho(item.key);
    shopFeedback = { text: `获得了遗响 · ${item.data.name}`, color: '#ffb648', timer: 80 };
    shopItems = shopItems.filter(si => si !== item);
    shopDetail = null;
  } else if (item.type === 'consumable') {
    // ── 消耗品 ──
    if (item.effect === 'heal') {
      if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') {
        playerHP = Math.min(playerMaxHP, playerHP + (item.value || 40));
        if (typeof updatePlayerUI === 'function') updatePlayerUI();
      }
      shopFeedback = { text: `回复了 ${item.value || 40} 点意识完整度`, color: '#44dd88', timer: 60 };
      shopDetail = null; // 购买成功 → 返回列表
      if (typeof Sound !== 'undefined') Sound.heal();
    } else if (item.effect === 'gamble') {
      // 意识共鸣：对当前武器铭刻/重铸额外效果（WEAPON_BUFFS buff）
      if (playerWeapon && typeof WEAPON_BUFFS !== 'undefined') {
        const wid = playerWeapon.id;
        const pool = Object.keys(WEAPON_BUFFS);
        const hasExtra = typeof weaponBuffs !== 'undefined' && weaponBuffs[wid];
        let newBuff;
        if (hasExtra) {
          // 已有额外效果 → 重随成另一个（排除当前）
          const others = pool.filter(b => b !== weaponBuffs[wid]);
          newBuff = others[Math.floor(Math.random() * others.length)] || weaponBuffs[wid];
        } else {
          // 无额外效果 → 铭刻一个随机效果
          newBuff = pool[Math.floor(Math.random() * pool.length)];
        }
        weaponBuffs[wid] = newBuff;
        if (typeof saveGame === 'function') saveGame();
        shopFeedback = { text: hasExtra ? `重铸效果 · ${WEAPON_BUFFS[newBuff].name}` : `铭刻效果 · ${WEAPON_BUFFS[newBuff].name}`, color: '#ffdd88', timer: 80 };
        shopDetail = null; // 购买成功 → 返回列表
        if (typeof Sound !== 'undefined') Sound.boost();
      } else {
        // 无武器：退款，保持详情面板打开
        shopFeedback = { text: '尚未装备武器', color: '#888888', timer: 45 };
        shards += item.cost; // 退款
        updateShardsDisplay();
        if (typeof Sound !== 'undefined') Sound.stun();
      }
    }
    // 消耗品不消失，可重复购买
  } else {
    // ── 装备 ──
    equipItem(item.type, item.key, item.data);
    shopFeedback = { text: `购买了 ${item.data.name}`, color: '#ffdd88', timer: 80 };
    // 装备商品从列表中移除
    shopItems = shopItems.filter(si => si !== item);
    shopDetail = null;
  }

  // 粒子效果
  if (typeof particles !== 'undefined' && typeof HitParticle !== 'undefined') {
    for (let i = 0; i < 20; i++) {
      const p = new HitParticle(item.x, item.y, getItemColor(item), '◆');
      p.size = 6 + Math.random() * 10;
      particles.push(p);
    }
  }
  if (typeof Sound !== 'undefined') Sound.itemGet();
}

/** 装备武器/防具/技能 */
function equipItem(type, key, data) {
  // 图鉴：记录装备获得
  if (typeof registerEquipment === 'function') registerEquipment(key);
  // 装备获得计数（熟练度/开局池解锁）
  if ((type === 'weapon' || type === 'armor' || type === 'talisman') && typeof runEquipGains !== 'undefined' && runEquipGains) {
    runEquipGains[key] = (runEquipGains[key] || 0) + 1;
  }

  if (type === 'weapon') {
    if (typeof unlockedWeapons !== 'undefined') unlockedWeapons.add(key);
    if (typeof playerWeapon !== 'undefined') playerWeapon = data;
  } else if (type === 'armor') {
    if (typeof playerArmor !== 'undefined') {
      playerArmor = data;
      if (typeof unlockedArmors !== 'undefined') unlockedArmors.add(key);
      if (typeof playerDefense !== 'undefined') playerDefense = (typeof getArmorDefense === 'function') ? getArmorDefense(data) : (data.defense || 0);
    }
  } else if (type === 'skill') {
    if (typeof playerSkill !== 'undefined') {
      playerSkill = data;
      if (typeof skillState !== 'undefined') {
        skillState = { collected: [], chargeLevel: 0, ready: false };
      }
      if (typeof eightGatesLevel !== 'undefined') eightGatesLevel = 0; // 换技能重置八门门数
      if (typeof updateSkillUI === 'function') updateSkillUI();
    }
  } else if (type === 'talisman') {
    if (typeof playerTalisman !== 'undefined') playerTalisman = data;
    if (typeof unlockedTalismans !== 'undefined') unlockedTalismans.add(key);
  }
  if (typeof updatePlayerUI === 'function') updatePlayerUI();
}

/** 商店房间完成回调 */
function shopRoomDone() {
  if (typeof currentDiveRoom !== 'undefined' && currentDiveRoom && currentDiveRoom.type === 'shop') {
    // 用真实房间id（肉鸽动态id如shop_0），硬编码'shop'会导致completeRoom找不到键、肉鸽卡住
    const roomId = currentDiveRoom.id;
    currentDiveRoom = null;
    if (typeof returnToMap === 'function') returnToMap(roomId);
  }
}

