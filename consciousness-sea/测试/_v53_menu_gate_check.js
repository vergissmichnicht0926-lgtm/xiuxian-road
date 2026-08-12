/* ═══════════════ v5.3 追加回归：左下角菜单 / 难度重开刷新提示 / 变异与精英通关门控 ═══════════════
 * 运行：node 测试/_v53_menu_gate_check.js（需先起 server 8734 + Chrome CDP 9222）
 */
function log(...a){console.log(a.map(x=>typeof x==='object'?JSON.stringify(x):String(x)).join(' '));}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  function send(method, params = {}) { return new Promise((res, rej) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 15000); }); }
  async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text }; return (r.result && r.result.result) ? r.result.result.value : r; }
  return { send, ev };
}
(async () => {
  const { send, ev } = await connect();
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(3000);
  let ready = false;
  for (let i = 0; i < 10; i++) { if (await ev(`typeof openSettings === 'function' && typeof generateRoguelikeMap === 'function'`)) { ready = true; break; } await sleep(600); }
  log('ready:', ready);
  if (!ready) { process.exit(1); }

  // ① 左下角菜单按钮：存在 / 点击打开设置 / 冻结标志
  const menuBtn = await ev(`(() => {
    const b = document.getElementById('menu-btn');
    if (!b) return { err: 'no menu-btn' };
    b.click();
    const open = !document.getElementById('settings-screen').classList.contains('hidden');
    const m1 = (typeof menuOpen !== 'undefined' && menuOpen);
    closeSettings();
    const m2 = (typeof menuOpen !== 'undefined' && menuOpen);
    return { text: b.textContent, opened: open, menuOpenWhileOpen: m1, menuOpenAfterClose: m2 };
  })()`);
  log('[菜单按钮]', menuBtn);

  // ② 切难度 → toast 提示刷新
  const diffToast = await ev(`(() => {
    openSettings();
    onSettingDiff(2);
    const t = document.getElementById('save-toast');
    const txt = t.textContent;
    closeSettings();
    return { toast: txt, hasRefresh: txt.indexOf('刷新') >= 0 };
  })()`);
  log('[难度toast]', diffToast);

  // ③ 重开新档 → confirm 文案含「刷新」
  const restart = await ev(`(() => {
    window.__confirmMsg = null;
    const orig = window.confirm;
    window.confirm = (m) => { window.__confirmMsg = m; return false; };  // 返回 false 避免真的 reload
    confirmNewGame();
    window.confirm = orig;
    const msg = window.__confirmMsg;
    return { msg: msg, hasRefresh: msg ? msg.indexOf('刷新') >= 0 : false };
  })()`);
  log('[重开confirm]', restart);

  // ④ 通关门控：未通关（totalClears=0）→ 无地图精英 / ch1Cleared false
  const gate0 = await ev(`(() => {
    totalClears = 0;
    const c0 = (typeof ch1Cleared === 'function') ? ch1Cleared() : null;
    try { generateRoguelikeMap(); } catch(e) { return { __mapErr: e.message }; }
    const rooms = (typeof dynamicRoomData !== 'undefined' && dynamicRoomData) ? dynamicRoomData : [];
    const elites = rooms.filter(r => r.elite);
    return { ch1Cleared: c0, totalRooms: rooms.length, elites: elites.length };
  })()`);
  log('[未通关地图]', gate0);

  // ⑤ 通关后（totalClears=1）→ 有地图精英 / ch1Cleared true
  const gate1 = await ev(`(() => {
    totalClears = 1;
    const c1 = (typeof ch1Cleared === 'function') ? ch1Cleared() : null;
    try { generateRoguelikeMap(); } catch(e) { return { __mapErr: e.message }; }
    const rooms = (typeof dynamicRoomData !== 'undefined' && dynamicRoomData) ? dynamicRoomData : [];
    const elites = rooms.filter(r => r.elite);
    return { ch1Cleared: c1, totalRooms: rooms.length, elites: elites.length };
  })()`);
  log('[通关后地图]', gate1);

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
