/* 验证：分裂型敌人三轮递增(1→2→4) + enterHub 清空装备/清残留敌人 */
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

  await send('Runtime.enable'); await send('Page.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 0, mobile: false });
  await send('Page.bringToFront');
  await send('Page.navigate', { url: 'http://localhost:8734/index.html' });
  for (let i = 0; i < 40; i++) { if (await ev(`typeof EQUIPMENT !== 'undefined' && typeof clearEnemyList === 'function'`)) break; await sleep(250); }
  await sleep(400);
  if (typeof Dialogue !== 'undefined' && Dialogue.init) await ev('Dialogue.init(); true');

  // ═══ 1. enterHub 清理验证 ═══
  await ev(`(function(){ playerWeapon={id:'t'}; playerArmor={id:'t',defense:3}; playerTalisman={id:'t'}; playerDefense=3;
    enemyList=[{alive:true},{alive:true}]; enemyProjectiles=[{},{}]; enterHub(); })()`);
  await sleep(300);
  console.log('enterHub 后:', await ev('JSON.stringify({w:playerWeapon, a:playerArmor, def:playerDefense, tal:playerTalisman, enemyN:enemyList.length, proj:enemyProjectiles.length, hub:hubActive})'));

  // ═══ 2. 分裂三轮验证 ═══
  await ev(`(function(){
    isRoguelikeMap = true; mapActive = false; prologuePhase = 3; // DIVING
    const room = { id:'split_test', type:'combat', label:'分裂残响', enemyType:'split', waves:3, enemyHP:52, enemyInterval:5.0, enemyDmgMult:1.0, layer:3, hardMode:false };
    startRoom(room);
  })()`);
  await sleep(400);
  const w1 = await ev('JSON.stringify({n:enemyList.filter(e=>e.alive).length, sl:enemyList.map(e=>e.splitLevel), hp:enemyList.map(e=>e.hp), waves:roomCombatWaves})');
  console.log('第1波:', w1);

  // 清怪 → 手动触发 checkCombatWave 推第2波
  await ev('while(enemyList.some(e=>e.alive)) dealDamage(99999, false); if(typeof checkCombatWave==="function") checkCombatWave(); true');
  await sleep(1500);
  const w2 = await ev('JSON.stringify({n:enemyList.filter(e=>e.alive).length, sl:enemyList.map(e=>e.splitLevel), hp:enemyList.map(e=>e.hp), waves:roomCombatWaves})');
  console.log('第2波:', w2);

  // 清怪 → 推第3波
  await ev('while(enemyList.some(e=>e.alive)) dealDamage(99999, false); if(typeof checkCombatWave==="function") checkCombatWave(); true');
  await sleep(1500);
  const w3 = await ev('JSON.stringify({n:enemyList.filter(e=>e.alive).length, sl:enemyList.map(e=>e.splitLevel), hp:enemyList.map(e=>e.hp), waves:roomCombatWaves})');
  console.log('第3波:', w3);
  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
