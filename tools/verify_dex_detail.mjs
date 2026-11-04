// 图鉴/详情页专项验证（无头 Chrome + CDP）：
// 种档 → 进图鉴 → 断言 paper/deep 切图卡都出现 → 点已拥有卡进详情 → 断言纸舞台存在、零异常。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9224;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome');
  process.exit(1);
}
const PROFILE = path.join(os.tmpdir(), 'cdchrome_dd_' + Date.now());
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334', 'about:blank'],
  { stdio: 'ignore' },
);
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
    await sleep(500);
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const report = { exceptions: [], errors: [] };
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const ed = m.params.exceptionDetails;
      report.exceptions.push(`${ed.text} ${ed.exception?.description ?? ''}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      report.errors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    }
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(10000);
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return 'EVAL_EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result ? r.result.value : 'EVAL_FAIL';
  };
  await evaluate(`localStorage.setItem('ylsz_save', JSON.stringify({collection:{cao:2,lu:1}, gold:500, tickets:1, prog:{cao:{star:1,evo:1},lu:{star:1,evo:0}}})); 'SEEDED'`);
  await send('Page.reload');
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const probe = await evaluate('!!(window.__ui && window.cc && window.cc.resources)');
    if (probe === true) break;
  }
  await sleep(2000);

  // 进图鉴
  const clickDex = await evaluate(
    `(()=>{let hit=null;const walk=(n)=>{for(const c of n.children){if(c.name==='btn'){const lab=c.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('精怪图鉴')){c.emit('click');hit=s.string;}}}walk(c);}};walk(window.__ui);return hit?'CLICKED':'NOT_FOUND';})()`,
  );
  await sleep(8000); // 等图鉴立绘加载

  // 图鉴页：paper 卡（已拥有）与 deep 卡（未获得）都应存在，且都是 SLICED（按 frame.name 分类）
  const dexPanels = await evaluate(
    `(()=>{const out={paper:0,deep:0,ink:0,other:0};const walk=(n)=>{if(n.name==='panel'){const sp=n.getComponent('cc.Sprite');if(sp&&sp.type===1&&sp.spriteFrame){const nm=sp.spriteFrame.name||'';if(nm.includes('paper'))out.paper++;else if(nm.includes('deep'))out.deep++;else if(nm.includes('ink'))out.ink++;else out.other++;}}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify(out);})()`,
  );

  // 点第一张已拥有卡（有 Button 且名字是 cao）进详情
  const clickCard = await evaluate(
    `(()=>{let hit=null;const walk=(n)=>{if(hit)return;if(n.name==='panel'&&n.getComponent('cc.Button')){const lab=n.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string==='草灵'){n.emit('click');hit=s.string;return;}}}n.children.forEach(walk);};walk(window.__ui);return hit?'CLICKED:'+hit:'NOT_FOUND';})()`,
  );
  await sleep(9000); // 等详情页纸舞台+立绘

  const detail = await evaluate(
    `(()=>{const out={stage:0,stageSprite:0};const walk=(n)=>{if(n.name==='spiritStage'){out.stage++;const sp=n.getComponent('cc.Sprite');if(sp&&sp.spriteFrame)out.stageSprite=1;}n.children.forEach(walk);};walk(window.__ui);return JSON.stringify(out);})()`,
  );

  console.log('==== VERIFY DEX/DETAIL ====');
  console.log('clickDex  :', clickDex);
  console.log('dexPanels :', dexPanels, '(paper=已拥有卡, deep=未获得卡)');
  console.log('clickCard :', clickCard);
  console.log('detail    :', detail, '(stage=纸舞台)');
  console.log('exceptions:', report.exceptions.length ? report.exceptions.slice(0, 5).join(' || ') : '(none)');
  console.log('consoleErr:', report.errors.length ? report.errors.slice(0, 5).join(' || ') : '(none)');
  const ok =
    clickDex === 'CLICKED' &&
    String(dexPanels).includes('"paper":2') &&
    String(dexPanels).includes('"deep"') &&
    clickCard === 'CLICKED:草灵' &&
    String(detail).includes('"stage":1') &&
    String(detail).includes('"stageSprite":1') &&
    report.exceptions.length === 0;
  console.log(ok ? 'DEX_DETAIL_OK' : 'DEX_DETAIL_FAIL');
  ws.close();
  process.exit(ok ? 0 : 2);
}
main().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(1); });
