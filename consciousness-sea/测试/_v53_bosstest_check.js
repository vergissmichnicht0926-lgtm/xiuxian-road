/* ═══════════════ v5.3 Boss测试通道回归：主菜单无设置 / 直达五Boss开战链路 ═══════════════
 * 运行：node 测试/_v53_bosstest_check.js（需先起 server 8734 + Chrome CDP 9222）
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
  for (let i = 0; i < 10; i++) { if (await ev(`typeof openBossTest === 'function' && typeof startRoom === 'function'`)) { ready = true; break; } await sleep(600); }
  log('ready:', ready);
  if (!ready) { process.exit(1); }

  // ① 主菜单已无「设置」按钮
  const noSettings = await ev(`(() => {
    const btn = document.getElementById('btn-settings');
    const link = document.getElementById('boss-test-link');
    return { btnSettingsExists: !!btn, bossTestLink: link ? link.textContent : null };
  })()`);
  log('[主菜单]', noSettings);

  // ② 打开 Boss 测试选择层
  const overlay = await ev(`(() => {
    openBossTest();
    const shown = !document.getElementById('bosstest-screen').classList.contains('hidden');
    closeBossTest();
    const hidden = document.getElementById('bosstest-screen').classList.contains('hidden');
    return { shown, hiddenAfterClose: hidden };
  })()`);
  log('[选择层]', overlay);

  // ③ 逐个 Boss 直达开战（驱动对话 → initBoss）
  const bosses = ['recall', 'obsess', 'regret_abyss', 'yi_abyss', 'regretful'];
  for (const key of bosses) {
    const r = await ev(`(async () => {
      try {
        startTestBoss('${key}');
        // 驱动第一章入场对话直到 initBoss
        let ok = false, guard = 0;
        while (guard++ < 30) {
          try {
            if (typeof Dialogue !== 'undefined' && Dialogue.active) { Dialogue.hide(); }
            if (typeof advanceRoomDialogue === 'function') advanceRoomDialogue();
          } catch(e) {}
          await new Promise(r => setTimeout(r, 120));
          if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState && bossState._bossKey === '${key}') { ok = true; break; }
        }
        const name = (typeof bossConfig !== 'undefined' && bossConfig) ? bossConfig.name : null;
        return { bossKey: '${key}', started: ok, bossName: name, bossHP: ok ? bossState.maxHP : null,
                 projArr: (typeof bossProjectiles !== 'undefined' && Array.isArray(bossProjectiles)),
                 roomType: (typeof currentDiveRoom !== 'undefined' && currentDiveRoom) ? currentDiveRoom.type : null };
      } catch(e) { return { bossKey: '${key}', __err: e.message }; }
    })()`);
    log('[Boss直达]', r);
  }

  log('DONE');
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
