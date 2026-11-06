// 主页 UI 验收自检：无头 Chrome CDP 截图 + 关键节点体检（血条/日志面板/状态栏）。
// 用法：node tools/shot_check.mjs [url] [outfile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const OUT = process.argv[3] || 'tools/shot_check.png';
const PORT = 9224;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_shot_' + Date.now());

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${PROFILE}`, '--disable-gpu', '--window-size=750,1334',
  'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCdp() {
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('CDP 端口等待超时');
}

const dumpNode = (n) => {
  if (!n || !n.isValid) return 'INVALID';
  const ut = n.getComponent('cc.UITransform');
  const sp = n.getComponent('cc.Sprite');
  const parts = [n.name, `pos=(${n.position.x.toFixed(0)},${n.position.y.toFixed(0)})`,
    `size=(${ut ? ut.width.toFixed(0) : '?'}x${ut ? ut.height.toFixed(0) : '?'})`,
    `active=${n.active}`];
  if (sp) parts.push(`sprite=${sp.spriteFrame ? (sp.spriteFrame.name || 'anon') : 'NONE'} color=${sp.color.toHEX()} type=${sp.type}`);
  const lb = n.getComponent('cc.Label');
  if (lb) parts.push(`label="${String(lb.string).replace(/\n/g, '\\n').slice(0, 40)}"`);
  return parts.join(' ');
};

async function main() {
  await waitCdp();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(3000);

  // 可选：第 4 参数为存档 JSON 文件 → 种档后刷新，复现高波次场景
  if (process.argv[4]) {
    const saveJson = fs.readFileSync(process.argv[4], 'utf8');
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('ylsz_save', ${JSON.stringify(saveJson)}); 'ok'`,
      returnByValue: true,
    });
    await send('Page.reload');
  }

  // 等待 boot（轮询 __ui，最多 90s）
  let booted = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    try {
      const r = await send('Runtime.evaluate', { expression: '!!window.__ui', returnByValue: true });
      if (r.result && r.result.value) { booted = true; break; }
    } catch {}
  }
  console.log('booted:', booted);
  await sleep(6000); // 让战斗跑几拍、切图全部就绪

  // 关键节点体检
  const probe = await send('Runtime.evaluate', {
    expression: `(()=>{
      const find=(root,name)=>{const out=[];const walk=(n)=>{if(n.name===name)out.push(n);for(const c of n.children)walk(c);};walk(root);return out;};
      const ui=window.__ui;if(!ui)return 'NO_UI';
      const dump=${dumpNode.toString()};
      const lines=[];
      const hpbg=find(ui,'ui_bar_hp_bg')[0];
      lines.push('HP_BG: '+(hpbg?dump(hpbg):'NOT_FOUND'));
      if(hpbg){lines.push('HP_FILL: '+dump(hpbg.children.find(c=>c.name==='ui_bar_hp_fill')||null));}
      const panels=find(ui,'panel');
      const logPanel=panels[panels.length-1];
      lines.push('LOG_PANEL: '+(logPanel?dump(logPanel):'NOT_FOUND'));
      if(logPanel){for(const c of logPanel.children)lines.push('  LOG_CHILD: '+dump(c));}
      const status=find(ui,'ui_panel_status')[0];
      if(status){for(const c of status.children)lines.push('  STATUS_CHILD: '+dump(c));}
      const fills=find(ui,'ui_bar_hp_fill');
      lines.push('hp_fill_count='+fills.length);
      if(fills[0]){const ut=fills[0].getComponent('cc.UITransform');lines.push('hp_fill_size='+ut.width.toFixed(0)+'x'+ut.height.toFixed(0));}
      // 已击败互斥性：chip 与 mask 不应同时 active
      const chips=find(ui,'unitHpChip');const masks=find(ui,'unitDeadMask');
      const dup=[];
      for(let i=0;i<Math.max(chips.length,masks.length);i++){
        if(chips[i]&&masks[i]&&chips[i].active&&masks[i].active)dup.push(i);
      }
      lines.push('unit_bars='+chips.length+' both_active_conflicts='+JSON.stringify(dup));
      return lines.join('\\n');
    })()`,
    returnByValue: true,
  });
  console.log('==== NODE PROBE ====');
  console.log(probe.result && probe.result.value);

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('==== screenshot saved:', OUT);
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
