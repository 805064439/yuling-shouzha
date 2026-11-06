// 演出时间线采样：进页后每 700ms 采样一次战斗状态（日志末行/敌人存活/波次），
// 验证步进制演出：我方逐个出手、敌人逐个被击败、全灭后停留再换关。
// 用法: node tools/verify_pacing.mjs [durationSec]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 9232;
const TARGET = 'http://127.0.0.1:8088/';
const DURATION = Number(process.argv[2] || 18) * 1000;
// 可选第 3 参数：存档 JSON 文件 → 种档后刷新（复现高攻快速全灭场景）
const SAVE_FILE = process.argv[3] || '';

const chrome = spawn('C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${path.join(os.tmpdir(), 'cdchrome_pace_' + Date.now())}`,
  '--disable-gpu', '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch { /* noop */ } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch { /* retry */ }
    await sleep(500);
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const r = await send('Runtime.evaluate', { expression: '!!window.__ui', returnByValue: true });
      if (r.result.value) break;
    } catch { /* retry */ }
  }
  await sleep(3000);

  // 种档：写 localStorage 后刷新，加载高攻存档快速复现全灭/换关
  if (SAVE_FILE) {
    const saveJson = fs.readFileSync(SAVE_FILE, 'utf8');
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('ylsz_save', ${JSON.stringify(saveJson)}); 'ok'`,
      returnByValue: true,
    });
    await send('Page.reload');
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      try {
        const r = await send('Runtime.evaluate', { expression: '!!window.__ui', returnByValue: true });
        if (r.result.value) break;
      } catch { /* retry */ }
    }
    await sleep(3000);
  }

  console.log('--- 时间线（每行=一次采样，间隔 700ms）---');
  const t0 = Date.now();
  let last = '';
  while (Date.now() - t0 < DURATION) {
    const r = await send('Runtime.evaluate', { returnByValue: true, expression: `
      (() => {
        const ui = window.__ui;
        const find = (root, name) => { const out = []; const walk = n => { if (n.name === name) out.push(n); for (const c of n.children) walk(c); }; walk(root); return out; };
        const masks = find(ui, 'unitDeadMask');
        const waveLbl = find(ui, 'label').find(l => /^第 [0-9]+ 波$/.test((l.getComponent('cc.Label')||{}).string || ''));
        const logs = find(ui, 'label').map(l => (l.getComponent('cc.Label')||{}).string || '').filter(s => s.includes('伤害') || s.includes('击杀') || s.includes('通关') || s.includes('出现'));
        return JSON.stringify({
          t: ((Date.now()) / 1000 % 1000).toFixed(1),
          wave: waveLbl ? (waveLbl.getComponent('cc.Label').string) : '?',
          dead: masks.filter(m => m.active).length + '/' + masks.length,
          lastLog: logs.length ? logs[logs.length - 1].slice(0, 40) : '',
        });
      })()` });
    let line = '';
    try { line = r.result.value || ''; } catch { line = 'eval-error'; }
    if (line && line !== last) { console.log(line); last = line; }
    await sleep(700);
  }
  fs.writeFileSync('tools/verify_pacing.ok', 'ok');
  console.log('--- done ---');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
