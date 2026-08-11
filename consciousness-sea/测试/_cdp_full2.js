const fs = require('fs');
const LOGFILE = 'C:/Users/V_ER_G~1/AppData/Local/Temp/_full2.log';
function log(...args) {
  const line = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  console.log(line);
  try { fs.appendFileSync(LOGFILE, line + '\n'); } catch (e) {}
}

async function getTarget() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  return list[0].webSocketDebuggerUrl;
}
let msgId = 0;
const pending = new Map();
let ws;
function send(m, p = {}) {
  return new Promise((res, rej) => {
    const id = ++msgId; pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method: m, params: p }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + m)); } }, 10000);
  });
}
async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.text + ' | ' + JSON.stringify(r.exceptionDetails.exception || {}) };
  return r.result ? r.result.value : r;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  ws = new WebSocket(await getTarget());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const errors = [];
  let navCount = 0;
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.frameNavigated') navCount++;
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && ['error','warning'].includes(m.params.type)) {
      errors.push('CONSOLE[' + m.params.type + ']: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    }
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.enable');

  await ev(`localStorage.removeItem('consciousness_sea_save'); true`);
  await send('Page.navigate', { url: 'http://localhost:8734/' });
  await sleep(1500);
  await ev('showDifficulty(); true');
  await sleep(100);
  await ev('selectDifficulty(0); true');
  await sleep(400);
  await ev(`
    (async () => {
      const overlay = document.getElementById('ending-overlay');
      if (overlay && overlay.classList.contains('show')) { overlay.click(); return 'card'; }
      return 'no-card';
    })()
  `);
  await sleep(400);
  log('注入前: prologuePhase=', await ev('typeof prologuePhase!=="undefined"?prologuePhase:"UNDEF"'), 'Tutorial=', await ev('typeof Tutorial!=="undefined"?Tutorial.phase:"UNDEF"'));

  // 注入完整自动推进器
  const inject = `
    (function installAuto() {
      if (window.__autoInstalled) return 'already';
      window.__autoInstalled = true;
      window.__autoError = [];
      setInterval(() => {
        try {
          // 背包保险：非背包教程阶段强制关闭背包（防止update在main.js:395提前return卡死一切）
          try {
            if (typeof Tutorial !== 'undefined' && Tutorial.phase !== 'tutorial_backpack'
                && typeof backpackOpen !== 'undefined' && backpackOpen
                && typeof toggleBackpack === 'function') toggleBackpack();
          } catch(e) {}
          // 主循环守护：rAF可能停滞，手动推进逻辑并捕获异常定位根因
          try { if (typeof update === 'function') update(0.033); } catch(e) { window.__autoError.push('UPDATE_EXC: ' + e.message); }
          // 飘浮选择（强制settled，避免测试等待）
          if (typeof Tutorial !== 'undefined' && Tutorial._driftActive && !Tutorial._driftSelected) {
            if (!Tutorial._driftSettled) Tutorial._driftSettled = true;
            const dt = Tutorial.driftTexts.find(d => !d.dead);
            if (dt) { dt.x = window.innerWidth/2; dt.y = window.innerHeight/2; dt.hitTest = () => true; Tutorial._selectDrift(dt); }
            return;
          }
          // 教程对话推进
          const _tutPhases = ['meet_mentor','memory_loss','pre_battle','victory','hook'];
          if (typeof Tutorial !== 'undefined' && Tutorial.phase && (Tutorial.phase.startsWith('tutorial_') || _tutPhases.indexOf(Tutorial.phase) >= 0) && typeof Dialogue !== 'undefined' && Dialogue.active) {
            mx = window.innerWidth/2; my = window.innerHeight/2;
            Tutorial.handleClick();
            return;
          }
          // 普通对话
          if (typeof Dialogue !== 'undefined' && Dialogue.active) {
            if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide();
            return;
          }
          // 教程词元
          if (typeof Tutorial !== 'undefined' && Tutorial.phase && Tutorial.phase.startsWith('tutorial_') && Tutorial.phase !== 'tutorial_backpack') {
            const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat !== '乱');
            if (bw) { bw.x = 10; bw.y = 10; Tutorial.handleWordClick(bw); return; }
          }
          // BATTLE 非boss：攻字杀敌
          if (typeof Tutorial !== 'undefined' && Tutorial.phase === PHASE.BATTLE && typeof bossActive !== 'undefined' && !bossActive && typeof enemyHP !== 'undefined' && enemyHP > 0) {
            const bw = (typeof battleWords !== 'undefined' ? battleWords : []).find(w => w.alive && w.cooldown <= 0 && w.cat === '攻');
            if (bw) { bw.x = 10; bw.y = 10; if (typeof handleBattleClick === 'function') handleBattleClick(bw); return; }
          }
          // Boss：憾落地进入战斗后走damageBoss正常逃跑/击败流程（直接设hp=0会卡在入场）
          if (typeof bossActive !== 'undefined' && bossActive && typeof bossState !== 'undefined' && bossState
              && typeof damageBoss === 'function' && bossState._landed && bossState.phase !== 'entrance') {
            if (bossState.hp > 0) damageBoss(99999, 1);
            return;
          }
          // 事件选项
          if (typeof eventOptionsActive !== 'undefined' && eventOptionsActive && typeof handleEventChoice === 'function' && typeof eventOptions !== 'undefined' && eventOptions.length) {
            handleEventChoice(eventOptions[0]); return;
          }
          // 装备提示（模拟"保留原装备"，跳过替换，避免传null崩rooms.js:535）
          if (typeof equipPrompt !== 'undefined' && equipPrompt && typeof handleEquipPromptClick === 'function') {
            handleEquipPromptClick({ action: 'keep' }); return;
          }
          // 背包教程：打开一次即触发进入PRE_BATTLE，背包由开头保险负责关闭
          if (typeof Tutorial !== 'undefined' && Tutorial.phase === 'tutorial_backpack' && Tutorial._introPlayed) {
            if (typeof backpackOpen !== 'undefined' && !backpackOpen && typeof toggleBackpack === 'function') toggleBackpack();
            return;
          }
          // 商店关闭
          if (typeof shopOpen !== 'undefined' && shopOpen) {
            closeShop(); if (typeof shopRoomDone === 'function') shopRoomDone(); return;
          }
          // 地图节点
          if (typeof mapActive !== 'undefined' && mapActive && (typeof currentDiveRoom === 'undefined' || !currentDiveRoom)) {
            const target = Object.keys(mapRooms).find(id => mapRooms[id].unlocked && !mapRooms[id].completed);
            if (target) { if (typeof enterRoom === 'function') enterRoom(target); return; }
          }
          // 结局/章节卡
          const overlay = document.getElementById('ending-overlay');
          if (overlay && overlay.classList.contains('show')) { overlay.click(); return; }
        } catch (e) { window.__autoError.push(String(e)); }
      }, 80);
      return 'installed';
    })()
  `;
  log('注入结果:', await ev(inject));

  // 轮询
  let reached = false;
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const st = await ev(`JSON.stringify({ hub: hubActive, phase: prologuePhase, tut: Tutorial.phase, err: (window.__autoError||[]).length, room: currentDiveRoom?currentDiveRoom.id:null, shake: shakeAmount })`);
    if (i % 5 === 0) log(`[${i}s] nav=${navCount} state=${typeof st==='string'?st:(st&&st.__err?'ERR:'+st.__err:JSON.stringify(st))}`);
    if (typeof st === 'string') {
      try { const s = JSON.parse(st); if (s.hub === true) { reached = true; log('✅ 到达 Hub'); break; } if (s.err > 30) { log('⚠️ autoErr 过多'); break; } } catch (e) {}
    }
    if (st && st.__err) { log('⚠️ 轮询 evaluate 异常:', st.__err); }
  }

  log('\n=== 最终状态 ===');
  log('hubActive:', await ev('typeof hubActive!=="undefined"?hubActive:"UNDEF"'));
  log('prologuePhase:', await ev('typeof prologuePhase!=="undefined"?prologuePhase:"UNDEF"'));
  log('Tutorial.phase:', await ev('typeof Tutorial!=="undefined"?Tutorial.phase:"UNDEF"'));
  log('autoErrors:', await ev('JSON.stringify((window.__autoError||[]).slice(0,15))'));
  log('总导航次数:', navCount);
  log('页面异常:', errors.length ? errors.slice(0,20).join('\n') : '(无)');

  if (reached) {
    log('\n=== 点击开始潜航 ===');
    await ev('handleHubClick(window.innerWidth/2, window.innerHeight*0.72); true');
    await sleep(1500);
    log('hubFirstDiveStoryActive:', await ev('typeof hubFirstDiveStoryActive!=="undefined"?hubFirstDiveStoryActive:"x"'));
    log('hubRunNumber:', await ev('typeof hubRunNumber!=="undefined"?hubRunNumber:"x"'));
    await ev(`
      (async () => {
        const sleep = ms => new Promise(r=>setTimeout(r,ms));
        for (let i=0;i<80;i++){
          if (typeof Dialogue!=="undefined" && Dialogue.active){ if (!Dialogue.complete) Dialogue.skip(); else Dialogue.hide(); }
          if (typeof hubFirstDiveStoryActive!=="undefined" && !hubFirstDiveStoryActive) break;
          await sleep(60);
        }
        return 'ok';
      })()
    `);
    await sleep(1500);
    log('mapActive:', await ev('typeof mapActive!=="undefined"?mapActive:"x"'));
    log('isRoguelikeMap:', await ev('typeof isRoguelikeMap!=="undefined"?isRoguelikeMap:"x"'));
    log('prologuePhase:', await ev('typeof prologuePhase!=="undefined"?prologuePhase:"x"'));
    log('dynamicRoomData:', await ev('typeof dynamicRoomData!=="undefined"&&dynamicRoomData?dynamicRoomData.map(r=>r.id).join(","):"null"'));
  }

  ws.close(); process.exit(0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
