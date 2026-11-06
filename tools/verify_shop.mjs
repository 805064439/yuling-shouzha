// 商店入口专项验证：主页点「商店」→ 确认商店页标题与按钮行渲染出来。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9225;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), 'cdchrome_shop_' + Date.now());
const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', `--user-data-dir=${PROFILE}`, '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' },
);
process.on('exit', () => { try { chrome.kill(); } catch {} });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCdp() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('CDP 超时');
}

await waitCdp();
const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const report = { exceptions: [] };
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const ed = m.params.exceptionDetails;
    report.exceptions.push(`${ed.text} ${ed.exception?.description ?? ''}`);
  }
});
await new Promise((res) => ws.addEventListener('open', () => res()));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET });
let booted = false;
for (let i = 0; i < 45; i++) {
  await sleep(2000);
  const probe = await send('Runtime.evaluate', {
    expression: '!!(window.__ui && window.cc && window.cc.resources)',
    returnByValue: true,
  });
  if (probe.result && probe.result.value === true) { booted = true; break; }
}
report.booted = booted;
await sleep(2000);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return 'EVAL_EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result ? r.result.value : 'EVAL_FAIL';
};

// 点「商店」
const clickShop = await evaluate(
  `(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';let hit=null;const walk=(n)=>{for(const c of n.children){if(c.name==='btn'){const lab=c.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('商店')){c.emit('click');hit=s.string;}}}walk(c);}};walk(ui);return hit?('CLICKED:'+hit):'BTN_NOT_FOUND';}catch(e){return 'ERR '+e.message;}})()`,
);
await sleep(3000);

// 检查商店页：标题「商店」+ 各功能按钮
const shopCheck = await evaluate(
  `(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';const labels=[];const walk=(n)=>{const l=n.getComponent('cc.Label');if(l&&l.string)labels.push(l.string);n.children.forEach(walk);};walk(ui);const has=Array.from(new Set(labels));return JSON.stringify({hasTitle:has.includes('商店'),buttons:has.filter((s)=>s.includes('每日免费券')||s.includes('召唤券')||s.includes('广告')||s.includes('灵核')||s.includes('购买')||s.includes('测试灵气')||s.includes('返回'))});}catch(e){return 'ERR '+e.message;}})()`,
);

console.log('==== VERIFY SHOP ====');
console.log('clickShop:', clickShop);
console.log('shopCheck:', shopCheck);
console.log('exceptions:', report.exceptions.length ? report.exceptions.slice(0, 5).join(' || ') : '(none)');
const ok = String(clickShop).includes('CLICKED') && String(shopCheck).includes('"hasTitle":true') && report.exceptions.length === 0;
console.log(ok ? 'SHOP_OK' : 'SHOP_FAIL');
ws.close();
process.exit(ok ? 0 : 2);
