// 记忆风暴（storm）针对性验证：构造事件战斗 → 模拟打死 2 波 → 断言结算（60碎片+随机遗响）
const fs = require('fs');
function log(...args) { console.log(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')); }
async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list.find(t => t.type === 'page');
  return page.webSocketDebuggerUrl;
}
let msgId = 0; const pending = new Map(); let ws;
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 10000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
  return r.result ? r.result.value : r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  await sleep(2500);
  log('页面:', await ev('document.title'));

  // 直接构造风暴事件（游戏已加载，全局可用）
  const setup = await ev(`(() => {
    const beforeShards = typeof shards !== 'undefined' ? shards : -1;
    const beforeEcho = typeof echoInventory !== 'undefined' ? echoInventory.length : -1;
    window.__beforeShards = beforeShards;
    window.__beforeEcho = beforeEcho;
    // 初始化对话层（主菜单态 Dialogue 未 init，playRoomDialogue 会崩）
    if (typeof Dialogue !== 'undefined' && Dialogue.init) Dialogue.init();
    if (typeof currentDiveRoom === 'undefined') return 'no currentDiveRoom';
    currentDiveRoom = { id: 't_event', type: 'event' }; // 模拟事件房（checkEventMonster 需要）
    if (typeof handleEventChoice !== 'function') return 'no handleEventChoice';
    handleEventChoice({ action: 'storm' });
    return JSON.stringify({ waves: eventMonsterWaves, storm: eventStormReward, enemyHP, resolved: eventResolved });
  })()`);
  log('风暴构造:', setup);

  // 模拟打怪结算 2 波
  const fight = await ev(`(() => {
    let errs = [];
    try {
      for (let w = 0; w < 2; w++) {
        let guard = 0;
        // 打死当前波敌人
        enemyHP = 0;
        if (typeof checkEventMonster === 'function') checkEventMonster();
        // 推进波次过渡（eventMonsterWavePending 帧计数）
        while (typeof eventMonsterWavePending === 'number' && eventMonsterWavePending > 0 && guard < 200) {
          if (typeof checkEventMonster === 'function') checkEventMonster();
          guard++;
        }
      }
    } catch (e) { errs.push(e.message); }
    return JSON.stringify({
      shards: shards, shardsGain: shards - window.__beforeShards,
      echoN: echoInventory.length, echoGain: echoInventory.length - window.__beforeEcho,
      stormReward: eventStormReward, waves: eventMonsterWaves, defeated: eventMonsterDefeated, errs
    });
  })()`);
  log('风暴结算:', fight);

  const f = JSON.parse(fight);
  const pass = f.shardsGain >= 60 && f.echoGain >= 1 && f.stormReward === false && f.waves === 0 && f.defeated === true && f.errs.length === 0;
  log(pass ? '\n✅✅ 记忆风暴验证通过：60碎片 + 随机遗响 + 标记复位' : '\n❌❌ 记忆风暴验证失败：' + fight);
  ws.close(); process.exit(pass ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
