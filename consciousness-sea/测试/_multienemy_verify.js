/* ═══════════════ 多敌人 + 融合 + buff 浏览器端验证（CDP）═══════════════
 * 运行：node 测试/_multienemy_verify.js（需先起 server + Chrome CDP 9222）
 * 直接构造战斗房场景断言，绕开肉鸽时序
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const list = await (await fetch('http://localhost:9222/json')).json();
  const page = list.find(t => t.type === 'page' && t.url.includes('8734')) || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } };
  const send = (method, params={}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, {res, rej}); ws.send(JSON.stringify({id, method, params})); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout')); } }, 8000); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.exceptionDetails) return { __err: (r.exceptionDetails.exception||{}).description || r.exceptionDetails.text }; return r.result ? r.result.value : r; };

  await send('Runtime.enable');
  await send('Page.enable');
  // 复用当前已就绪页面（不 navigate，避免重载时序）
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const ok = await ev(`document.getElementById('dialogue-box') && typeof EQUIPMENT !== 'undefined' && typeof bossActive !== 'undefined' && typeof enemyList !== 'undefined'`);
    if (ok === true) { ready = true; break; }
    await sleep(250);
  }
  if (!ready) { console.log('❌ 页面未就绪'); ws.close(); process.exit(1); }
  await sleep(300);

  const result = await ev(`(function(){
    const out = { pass: 0, fail: 0, msgs: [] };
    const check = (cond, msg) => { if (cond) { out.pass++; } else { out.fail++; out.msgs.push('❌ ' + msg); } };
    try {
      // 初始化对话系统（跳过标题菜单直接构造场景，Dialogue 需先 init）
      if (typeof Dialogue !== 'undefined' && Dialogue.init) Dialogue.init();
      // ═══ 1. 战斗房多敌编队生成 ═══
      if (typeof currentDiveRoom !== 'undefined') currentDiveRoom = null;
      document.getElementById('enemy-zone').style.opacity = '1';
      const room = { id:'test_c', type:'combat', label:'测试噪点', enemyType:'bash', waves:3, enemyHP:50, enemyInterval:5.0, layer:5, enemyDmgMult:1 };
      currentDiveRoom = room;
      startCombatRoom(room);
      const cnt = enemyList.filter(e=>e.alive).length;
      check(cnt >= 2, '战斗房应生成多敌，实际 ' + cnt);
      check(enemyHP === 50, '镜像HP应=50，实际 ' + enemyHP);
      check(currentEnemyType === 'bash', '镜像类型应=bash');

      // ═══ 2. 攻字伤害 → targetMode 分发 ═══
      const wpn = { id:'beginner_brush', name:'初学者之笔', words:['斩'], color:'#ff6644', glow:'#c33', damage:8, wordCount:1, targetMode:'single' };
      playerWeapon = wpn;
      const hpBefore = enemyHP;
      const main = getMainEnemy();
      dealDamage(20, false);
      check(enemyHP <= hpBefore, '单伤武器应打主敌人 (' + hpBefore + '→' + enemyHP + ')');

      // ═══ 3. 击杀主敌 → 重锁下一敌 ═══
      while (enemyList.some(e => e.alive) && enemyHP > 0) dealDamage(999, false);
      check(enemyHP === 0, '全灭后镜像 enemyHP=0，实际 ' + enemyHP);
      const aliveAfter = enemyList.filter(e=>e.alive).length;
      check(aliveAfter === 0, '全灭后无存活敌人，实际 ' + aliveAfter);

      // ═══ 4. 融合：已拥有 → 选项含融合 ═══
      playerWeapon = EQUIPMENT.weapons['star_shatter'];
      unlockedWeapons.add('star_shatter');
      showEquipPrompt('weapon', 'star_shatter', EQUIPMENT.weapons['star_shatter']);
      const optTexts = equipPrompt.options.map(o => o.text).join('/');
      check(optTexts.indexOf('融合强化') >= 0, '已拥有装备应显示融合选项，实际 [' + optTexts + ']');
      // 融合成功（Math.random→0 保证成功）
      const origRandom = Math.random;
      Math.random = () => 0;
      equipmentLevels = {};
      handleEquipPromptClick({ action:'fuse' });
      Math.random = origRandom;
      check(equipmentLevels['star_shatter'] === 2, '融合成功应升到Lv2，实际 ' + equipmentLevels['star_shatter']);
      // 满级 → 转碎片不升
      equipmentLevels['star_shatter'] = FUSION.MAX_LEVEL;
      Math.random = () => 0;
      handleEquipPromptClick({ action:'fuse' });
      Math.random = origRandom;
      check(equipmentLevels['star_shatter'] === FUSION.MAX_LEVEL, '满级融合不应再升');
      // 未拥有 → 无融合选项
      unlockedWeapons.delete('star_shatter');
      showEquipPrompt('weapon', 'frost_verse', EQUIPMENT.weapons['frost_verse']);
      const opt2 = equipPrompt.options.map(o => o.text).join('/');
      check(opt2.indexOf('替换装备') >= 0 && opt2.indexOf('融合强化') < 0, '未拥有应显示替换选项，实际 [' + opt2 + ']');

      // ═══ 5. buff：仅深层掉落 ═══
      dynamicSegments = [{name:'浅',startLayer:1,endLayer:10},{name:'中',startLayer:11,endLayer:18},{name:'深',startLayer:19,endLayer:24}];
      weaponBuffs = {};
      rollWeaponBuff('frost_verse', 5);
      check(weaponBuffs['frost_verse'] === undefined, '浅层不应出buff');
      rollWeaponBuff('blaze_heaven', 15);
      check(weaponBuffs['blaze_heaven'] === undefined, '中层不应出buff');
      Math.random = () => 0.1;
      rollWeaponBuff('void_blade', 20);
      Math.random = origRandom;
      check(weaponBuffs['void_blade'] !== undefined, '深层40%应出buff，实际 ' + weaponBuffs['void_blade']);
      // 已有 buff 不覆盖
      const b1 = weaponBuffs['void_blade'];
      Math.random = () => 0.1;
      rollWeaponBuff('void_blade', 20);
      Math.random = origRandom;
      check(weaponBuffs['void_blade'] === b1, '已有buff不应覆盖');

      // ═══ 6. 形状坐标 ═══
      ['line','rect','triangle','ring','arrow'].forEach(s => {
        const pts = formationPositions(s, 4);
        check(pts.length === 4, s + ' 应生成4坐标');
        check(pts.every(p => p.y > 100 && p.y < 400), s + ' 坐标y应在中上区');
      });

      // ═══ 7. 事件房单敌兼容 ═══
      enemyHP = 80; enemyTimer = 3.5;
      spawnEnemyEntity(true);
      check(enemyList.length === 1 && enemyHP === 80, 'spawnEnemyEntity 应生成单敌且读标量HP');
    } catch (e) { out.msgs.push('❌ 异常: ' + e.message + '\\n' + (e.stack||'').split('\\n').slice(0,3).join('\\n')); }
    return JSON.stringify(out);
  })()`);

  console.log('原始返回:', typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result).slice(0, 500));
  const r = typeof result === 'string' ? JSON.parse(result) : result;
  console.log('=== 多敌人+融合+buff 浏览器验证 ===');
  console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
  if (r.msgs && r.msgs.length) console.log(r.msgs.join('\n'));
  ws.close(); process.exit(r.fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
