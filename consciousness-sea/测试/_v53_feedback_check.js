/* ═══════════════ v5.3 玩家反馈回归：商店列表→详情二级 / 连击倍率位置 / 子弹缩小 ═══════════════
 * 运行：node 测试/_v53_feedback_check.js（需先起 server 8734 + Chrome CDP 9222）
 */
function log(...a){console.log(a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '));}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  };
  function send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = ++msgId; pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 15000);
    });
  }
  async function ev(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text };
    return (r.result && r.result.result) ? r.result.result.value : r;
  }
  return { send, ev };
}

(async () => {
  const { send, ev } = await connect();
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(3000);

  // 等待游戏脚本就绪
  let ready = false;
  for (let i = 0; i < 10; i++) {
    const chk = await ev(`(typeof Projectile !== 'undefined' && typeof openShop === 'function')`);
    if (chk === true) { ready = true; break; }
    await sleep(800);
  }
  log('ready:', ready);
  if (!ready) { log('ERR: 游戏脚本未加载'); process.exit(1); }

  // ── ① 子弹大小（默认 + 显式传参）──
  const bullets = await ev(`(() => {
    const p1 = new Projectile('·',0,0,0,0,'#ff6644',5);
    const p2 = new Projectile('·',0,0,0,0,'#ff6644',5,30);
    const p3 = new Projectile('·',0,0,0,0,'#ff6644',5,26);
    return { def: Math.round(p1.size*10)/10, explicit30: Math.round(p2.size*10)/10, explicit26: Math.round(p3.size*10)/10 };
  })()`);
  log('[子弹]', bullets);

  // ── ② 连击倍率位置（应 bottom:170px，居中偏下）──
  const combo = await ev(`(() => {
    const el = document.getElementById('combo-display');
    const cs = getComputedStyle(el);
    return { bottom: cs.bottom, top: cs.top, transform: cs.transform, pos: cs.position };
  })()`);
  log('[倍率]', combo);

  // ── ③ 商店列表→详情二级结构（真实点击流：先 hitTestShop(mousemove) 再 handleShopClick）──
  const opened = await ev(`(() => {
    openShop();
    updateShopItems();            // 清 shopJustOpened 防误触
    shards = 9999; updateShardsDisplay();
    return { open: shopOpen, count: shopItems.length, types: shopItems.map(i=>i.type) };
  })()`);
  log('[商店-打开]', opened);

  // ③a 点卡片 → 进入详情
  const detailOpen = await ev(`(() => {
    const it = shopItems[0];
    mx = it.x; my = it.y; hitTestShop(mx, my);
    handleShopClick();
    const d = shopDetail;
    return { detail: !!d, name: d ? (d.name || d.data.name) : null, hovered: !!shopHovered };
  })()`);
  log('[商店-进详情]', detailOpen);

  // ③b 点「返回」→ 回列表
  const cancelBack = await ev(`(() => {
    const btns = getShopDetailButtons();
    mx = btns.cancel.x; my = btns.cancel.y; hitTestShop(mx, my);
    handleShopClick();
    return { detailAfterCancel: !!shopDetail, btnHover: shopDetailHover };
  })()`);
  log('[商店-返回]', cancelBack);

  // ③c 进详情 → 点「购买」（用固定的意识修复消耗品，安全可重复）
  const buyFlow = await ev(`(() => {
    const heal = shopItems.find(i => i.type === 'consumable' && i.key === 'heal');
    if (!heal) return { err: 'no heal item', items: shopItems.map(i=>i.type) };
    mx = heal.x; my = heal.y; hitTestShop(mx, my);
    handleShopClick();
    const inDetail = !!shopDetail;
    const before = shards;
    const btns = getShopDetailButtons();
    mx = btns.buy.x; my = btns.buy.y; hitTestShop(mx, my);
    handleShopClick();
    return { inDetail, before, after: shards, detailAfterBuy: !!shopDetail, feedback: shopFeedback ? shopFeedback.text : null };
  })()`);
  log('[商店-购买]', buyFlow);

  // ③d 进详情 → 截图备查（视觉验证）
  const weaponShot = await ev(`(() => {
    const it = shopItems[0];
    if (!it) return { err: 'no item' };
    mx = it.x; my = it.y; hitTestShop(mx, my);
    handleShopClick();
    return { detail: !!shopDetail, type: shopDetail ? shopDetail.type : null, name: shopDetail ? (shopDetail.name || shopDetail.data.name) : null };
  })()`);
  log('[商店-详情截图对象]', weaponShot);

  if (weaponShot && weaponShot.detail) {
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.result && shot.result.data) {
      const fs = require('fs');
      fs.writeFileSync('/tmp/v53_shop_detail.png', Buffer.from(shot.result.data, 'base64'));
      log('[截图] 已存 /tmp/v53_shop_detail.png');
    }
  }

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
