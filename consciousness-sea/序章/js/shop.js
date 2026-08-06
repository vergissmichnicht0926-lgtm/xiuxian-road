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

/** 给予局内碎片（带粒子效果和音效） */
function grantShards(amount, x, y) {
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
let shopSelected = null;      // 已选中待确认
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
  shopSelected = null;
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
  shopSelected = null;
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
      const owned = (typeof playerArmor !== 'undefined' && playerArmor && playerArmor.id === key);
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
      const owned = (typeof playerTalisman !== 'undefined' && playerTalisman && playerTalisman.id === key);
      if (!owned) available.push({ type:'talisman', key, data, cost });
    });
  }

  // 随机选1-2件
  const equipCount = available.length > 0 ? (Math.random() < 0.5 ? 1 : 2) : 0;
  const shuffled = available.sort(() => Math.random() - 0.5);
  const selectedEquip = shuffled.slice(0, Math.min(equipCount, shuffled.length));

  // ── 固定消耗品（始终出现）──
  const consumables = [];
  if (SHOP_CONSUMABLES.heal) {
    consumables.push({ type:'consumable', key:'heal', ...SHOP_CONSUMABLES.heal });
  }
  if (SHOP_CONSUMABLES.purify) {
    consumables.push({ type:'consumable', key:'purify', ...SHOP_CONSUMABLES.purify });
  }
  if (SHOP_CONSUMABLES.gamble) {
    consumables.push({ type:'consumable', key:'gamble', ...SHOP_CONSUMABLES.gamble });
  }

  const allItems = [...selectedEquip, ...consumables];
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
    const floatY = (item === shopSelected) ? Math.sin(item.phase) * 4 : Math.sin(item.phase * 0.7) * 2;
    item.x += (item.baseX - item.x) * 0.08;
    item.y += (item.baseY + floatY - item.y) * 0.08;
    // 选中发光脉动
    item._hasGlow = (item === shopSelected);
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
    const isSelected = (item === shopSelected);
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
    const typeLabel = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '防具' : item.type === 'skill' ? '技能' : item.type === 'talisman' ? '护符' : '消耗';
    ctx.fillStyle = 'rgba(200,200,220,0.35)';
    ctx.font = '9px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'left';
    ctx.fillText(typeLabel, cx - cw/2 + 10, cy - ch/2 + 14);

    // 商品名
    const itemColor = getItemColor(item);
    ctx.fillStyle = itemColor;
    ctx.font = `${isHovered ? 18 : 16}px "Noto Serif SC","SimSun",serif`;
    ctx.textAlign = 'center';
    ctx.fillText(item.name || item.data.name, cx, cy - 2);

    // 描述（下小字）
    ctx.fillStyle = 'rgba(180,190,210,0.45)';
    ctx.font = '10px "Noto Serif SC","SimSun",serif';
    ctx.fillText(item.desc || (item.data && item.data.desc) || '', cx, cy + 16);

    // 价格
    const canAfford = shards >= item.cost;
    const priceColor = isSelected ? '#ffdd88' : (canAfford ? 'rgba(255,220,150,0.7)' : 'rgba(255,100,80,0.7)');
    ctx.fillStyle = priceColor;
    ctx.font = '13px "Noto Serif SC","SimSun",serif';
    ctx.textAlign = 'right';
    ctx.fillText(`◇ ${item.cost}`, cx + cw/2 - 10, cy - ch/2 + 14);

    // 选中提示
    if (isSelected) {
      const hintAlpha = 0.5 + 0.35 * Math.sin(now * 0.003);
      ctx.fillStyle = `rgba(255,220,150,${hintAlpha})`;
      ctx.font = '11px "Noto Serif SC","SimSun",serif';
      ctx.textAlign = 'center';
      ctx.fillText('再次点击确认购买', cx, cy + ch/2 + 16);
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

  // 底部提示
  const pulse = 0.25 + 0.2 * Math.sin(now * 0.002);
  ctx.fillStyle = `rgba(180,190,210,${pulse})`;
  ctx.font = '11px "Noto Serif SC","SimSun",serif';
  ctx.textAlign = 'center';
  ctx.fillText('点击商品购买 · 点击空白离开 · ESC关闭', Ww * 0.5, Hh * 0.92);

  ctx.restore();
}

/** 商店悬停检测 */
function hitTestShop(mx, my) {
  shopHovered = null;
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

/** 商店点击处理 */
function handleShopClick() {
  if (shopJustOpened) return; // 防误触

  if (shopHovered) {
    if (shopSelected === shopHovered) {
      // 二次确认 → 购买
      attemptPurchase(shopHovered);
    } else {
      // 首次选中
      shopSelected = shopHovered;
      if (typeof Sound !== 'undefined') Sound.uiClick();
    }
  } else {
    // 点击空白
    if (shopSelected) {
      shopSelected = null;
    } else {
      // 离开商店 → 完成商店房间
      closeShop();
      if (typeof shopRoomDone === 'function') shopRoomDone();
    }
  }
}

/** 执行购买 */
function attemptPurchase(item) {
  if (shards < item.cost) {
    shopFeedback = { text: '意识碎片不足', color: '#ff6644', timer: 45 };
    shopSelected = null;
    if (typeof Sound !== 'undefined') Sound.stun();
    return;
  }

  shards -= item.cost;
  updateShardsDisplay();

  if (item.type === 'consumable') {
    // ── 消耗品 ──
    if (item.effect === 'heal') {
      if (typeof playerHP !== 'undefined' && typeof playerMaxHP !== 'undefined') {
        playerHP = Math.min(playerMaxHP, playerHP + (item.value || 40));
        if (typeof updatePlayerUI === 'function') updatePlayerUI();
      }
      shopFeedback = { text: `回复了 ${item.value || 40} 点意识完整度`, color: '#44dd88', timer: 60 };
      if (typeof Sound !== 'undefined') Sound.heal();
    } else if (item.effect === 'purify') {
      // 清除所有干扰字
      if (typeof battleWords !== 'undefined') {
        battleWords = battleWords.filter(bw => bw.cat !== '乱');
      }
      shopFeedback = { text: '干扰字已被清除', color: '#88ccff', timer: 60 };
      if (typeof Sound !== 'undefined') Sound.boost();
    } else if (item.effect === 'gamble') {
      // 随机获得一件未拥有的装备
      const allEquip = [];
      if (SHOP_CATALOG.weapons) {
        Object.entries(SHOP_CATALOG.weapons).forEach(([key]) => {
          const data = EQUIPMENT.weapons[key];
          if (data && !(typeof unlockedWeapons !== 'undefined' && unlockedWeapons.has(key))
              && !(typeof playerWeapon !== 'undefined' && playerWeapon && playerWeapon.id === key)) {
            allEquip.push({ type:'weapon', key, data });
          }
        });
      }
      if (SHOP_CATALOG.armors) {
        Object.entries(SHOP_CATALOG.armors).forEach(([key]) => {
          const data = EQUIPMENT.armors[key];
          if (data && !(typeof playerArmor !== 'undefined' && playerArmor && playerArmor.id === key)) {
            allEquip.push({ type:'armor', key, data });
          }
        });
      }
      if (SHOP_CATALOG.skills) {
        Object.entries(SHOP_CATALOG.skills).forEach(([key]) => {
          const data = EQUIPMENT.skills[key];
          if (data && !(typeof playerSkill !== 'undefined' && playerSkill && playerSkill.id === key)) {
            allEquip.push({ type:'skill', key, data });
          }
        });
      }
      if (SHOP_CATALOG.talismans) {
        Object.entries(SHOP_CATALOG.talismans).forEach(([key]) => {
          const data = EQUIPMENT.talismans[key];
          if (data && !(typeof playerTalisman !== 'undefined' && playerTalisman && playerTalisman.id === key)) {
            allEquip.push({ type:'talisman', key, data });
          }
        });
      }
      if (allEquip.length > 0) {
        const pick = allEquip[Math.floor(Math.random() * allEquip.length)];
        equipItem(pick.type, pick.key, pick.data);
        shopFeedback = { text: `获得了 ${pick.data.name}！`, color: '#ffdd88', timer: 80 };
      } else {
        shopFeedback = { text: '已拥有全部装备', color: '#888888', timer: 45 };
        shards += item.cost; // 退款
        updateShardsDisplay();
        if (typeof Sound !== 'undefined') Sound.stun();
      }
    }
    // 消耗品不消失，可重复购买
    shopSelected = null;
  } else {
    // ── 装备 ──
    equipItem(item.type, item.key, item.data);
    shopFeedback = { text: `购买了 ${item.data.name}`, color: '#ffdd88', timer: 80 };
    // 装备商品从列表中移除
    shopItems = shopItems.filter(si => si !== item);
    shopSelected = null;
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

  if (type === 'weapon') {
    if (typeof unlockedWeapons !== 'undefined') unlockedWeapons.add(key);
    if (typeof playerWeapon !== 'undefined') playerWeapon = data;
  } else if (type === 'armor') {
    if (typeof playerArmor !== 'undefined') {
      playerArmor = data;
      if (typeof playerDefense !== 'undefined') playerDefense = data.defense || 0;
    }
  } else if (type === 'skill') {
    if (typeof playerSkill !== 'undefined') {
      playerSkill = data;
      if (typeof skillState !== 'undefined') {
        skillState = { collected: [], chargeLevel: 0, ready: false };
      }
      if (typeof updateSkillUI === 'function') updateSkillUI();
    }
  } else if (type === 'talisman') {
    if (typeof playerTalisman !== 'undefined') playerTalisman = data;
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

