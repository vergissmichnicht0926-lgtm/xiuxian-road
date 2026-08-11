/* 验证 returnToMap 安全屋分支 → showRunSummary(true)（肉鸽通关总结页） */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 8000); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.exceptionDetails ? 'EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text).split('\n')[0] : r.result?.value; };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 0, mobile: false });
  await send('Page.reload', { ignoreCache: true });
  await sleep(3000);

  const r = await ev(`(function(){
    try {
      isRoguelikeMap = true;
      mapRooms = { 'safe_test': { unlocked:true, completed:false, visited:false } };
      mapConnections = {};
      dynamicRoomData = [ { id:'safe_test', type:'safe_house', layer:1, label:'安全屋' } ];
      window.__sumCalls = [];
      var orig = showRunSummary;
      showRunSummary = function(v){ window.__sumCalls.push(v); };
      returnToMap('safe_test');
      return 'ok';
    } catch(e){ return 'THROW:' + e.message; }
  })()`);
  console.log('触发:', r);
  await sleep(900);
  console.log('showRunSummary 调用:', await ev('JSON.stringify(window.__sumCalls)'));
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
