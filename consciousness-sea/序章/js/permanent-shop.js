/* ═══════════════════ §O 局外商店 + 局外货币 ═══════════════════
 *
 * 依赖：config.js (PERMANENT_UPGRADES, SOUL_REWARDS)
 *       sound.js (Sound)
 *
 * 局外货币「灵魂结晶(soulCrystals)」— 永久积累，存档持久化
 * 局外商店「灵魂工坊」— 主菜单进入，DOM覆盖层
 */

// ═══════════════ 局外货币 ═══════════════
let soulCrystals = 0;
let permanentUpgrades = {};  // { upgradeKey: currentLevel }

/** 初始化永久升级等级（从存档恢复后调用） */
function initPermanentUpgrades(saved) {
  permanentUpgrades = saved || {};
  // 确保所有升级key都存在
  if (typeof PERMANENT_UPGRADES !== 'undefined') {
    Object.keys(PERMANENT_UPGRADES).forEach(key => {
      if (!(key in permanentUpgrades)) permanentUpgrades[key] = 0;
    });
  }
}

/** 获取升级当前等级 */
function getUpgradeLevel(key) {
  return permanentUpgrades[key] || 0;
}

/** 获取升级配置 */
function getUpgradeConfig(key) {
  return PERMANENT_UPGRADES ? PERMANENT_UPGRADES[key] : null;
}

/** 应用所有永久升级效果（在 startPrologue 时调用） */
function applyPermanentUpgrades() {
  if (!PERMANENT_UPGRADES) return;

  // 意识扩容：初始HP +10/级
  const hpLevel = getUpgradeLevel('healthBoost');
  if (hpLevel > 0 && typeof playerMaxHP !== 'undefined') {
    playerMaxHP = 100 + hpLevel * 10;
    playerHP = playerMaxHP;
  }

  // 词元亲和：随机携带一把非初始武器
  if (getUpgradeLevel('weaponGift') > 0 && typeof unlockedWeapons !== 'undefined' && typeof EQUIPMENT !== 'undefined') {
    const wpnKeys = Object.keys(EQUIPMENT.weapons || {}).filter(k => k !== 'beginner_brush');
    if (wpnKeys.length > 0) {
      const key = wpnKeys[Math.floor(Math.random() * wpnKeys.length)];
      unlockedWeapons.add(key);
      if (typeof playerWeapon !== 'undefined') playerWeapon = EQUIPMENT.weapons[key];
    }
  }

  // 零之庇护：每局开始+30碎片
  if (getUpgradeLevel('shardBlessing') > 0 && typeof shards !== 'undefined') {
    shards += 30;
    if (typeof updateShardsDisplay === 'function') updateShardsDisplay();
  }
}

/** 获取威胁等级增长率（深海抗性修正） */
function getThreatGrowthRate() {
  const level = getUpgradeLevel('threatResist');
  return 1.0 - level * 0.15;
}

/** 获取连击倍率加成（连击强化修正） */
function getComboBonusMultiplier() {
  const level = getUpgradeLevel('comboBoost');
  return 1.0 + level * 0.2;
}

/** 获取融合成功率加成（融合之缘修正，每级 +10%） */
function getFusionLuck() {
  const level = getUpgradeLevel('fusionLuck');
  return level * 0.10;
}

// ═══════════════ 局外商店 UI ═══════════════

let soulShopOpen = false;

function openSoulShop() {
  soulShopOpen = true;
  const overlay = document.getElementById('permanent-shop-screen');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  renderSoulShop();
  if (typeof Sound !== 'undefined') Sound.uiOpen();
}

function closeSoulShop() {
  soulShopOpen = false;
  const overlay = document.getElementById('permanent-shop-screen');
  if (!overlay) return;
  overlay.classList.add('hidden');
  if (typeof Sound !== 'undefined') Sound.uiClose();
}

/** 渲染局外商店内容 */
function renderSoulShop() {
  const container = document.getElementById('ps-items');
  if (!container || !PERMANENT_UPGRADES) return;

  // 更新余额
  const balEl = document.getElementById('ps-balance');
  if (balEl) balEl.textContent = `◆ 灵魂结晶: ${soulCrystals}`;

  let html = '';
  Object.entries(PERMANENT_UPGRADES).forEach(([key, cfg]) => {
    const level = getUpgradeLevel(key);
    const maxed = level >= cfg.maxLevel;
    const canAfford = !maxed && soulCrystals >= cfg.cost;
    const costText = maxed ? '已满级' : `◆ ${cfg.cost}`;

    html += `
      <div class="ps-item ${maxed ? 'maxed' : ''} ${canAfford ? 'affordable' : ''}"
           onclick="buyPermanentUpgrade('${key}')">
        <div class="ps-item-icon">${cfg.icon || '◆'}</div>
        <div class="ps-item-info">
          <div class="ps-item-name">${cfg.name} <span class="ps-level">Lv.${level}/${cfg.maxLevel}</span></div>
          <div class="ps-item-desc">${cfg.desc || ''}</div>
        </div>
        <div class="ps-item-cost">${costText}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/** 购买永久升级 */
function buyPermanentUpgrade(key) {
  const cfg = getUpgradeConfig(key);
  if (!cfg) return;

  const level = getUpgradeLevel(key);
  if (level >= cfg.maxLevel) return;
  if (soulCrystals < cfg.cost) {
    if (typeof Sound !== 'undefined') Sound.stun();
    return;
  }

  soulCrystals -= cfg.cost;
  permanentUpgrades[key] = level + 1;

  if (typeof Sound !== 'undefined') Sound.itemGet();
  renderSoulShop();
  // 立即存档，防止购买后直接关页导致升级丢失
  if (typeof saveGame === 'function') saveGame();

  // 提示
  const toast = document.getElementById('save-toast');
  if (toast) {
    toast.textContent = `已升级 ${cfg.name} → Lv.${level + 1}`;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
  }
}

// ═══════════════ 通关结算（由 main.js 内联结算，此处为已废弃的独立结算UI，已移除）
