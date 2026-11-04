// 一次性诊断：运行时 resources bundle 的路径索引 vs 静态 config.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9224;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
const PROFILE = path.join(os.tmpdir(), 'cdchrome_diag_' + Date.now());
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
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
});
await new Promise((res) => ws.addEventListener('open', () => res()));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: TARGET });
await sleep(15000);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result ? r.result.value : 'EVAL_FAIL';
};

const out = {};
out.bundleNames = await evaluate(`window.cc? JSON.stringify(Array.from(window.cc.assetManager.bundles.keys?window.cc.assetManager.bundles.keys():[])):'NO_CC'`);
out.pathsCao = await evaluate(
  `(()=>{const b=window.cc.assetManager.bundles.get('resources');if(!b)return 'NO_RES_BUNDLE';const p=b.config.paths;return JSON.stringify(Object.keys(p).filter(k=>k.includes('spirits/cao')));})()`,
);
out.assetInfo = await evaluate(
  `(()=>{const b=window.cc.assetManager.bundles.get('resources');if(!b)return 'NO_RES_BUNDLE';try{return JSON.stringify(b.getAssetInfo('spirits/cao'));}catch(e){return 'ERR '+e.message;}})()`,
);
out.assetInfoTex = await evaluate(
  `(()=>{const b=window.cc.assetManager.bundles.get('resources');if(!b)return 'NO_RES_BUNDLE';try{return JSON.stringify(b.getAssetInfo('spirits/cao/texture'));}catch(e){return 'ERR '+e.message;}})()`,
);
out.loadMainUntyped = await evaluate(
  `new Promise((res)=>{const b=window.cc.assetManager.bundles.get('resources');if(!b){res('NO_RES_BUNDLE');return;}b.load('spirits/cao',(e,a)=>{res(JSON.stringify({err:e?(e.message||String(e)):null,type:a?a.constructor.name:null,uuid:a?a.uuid:null}));});})`,
);
out.loadTexSub = await evaluate(
  `new Promise((res)=>{const b=window.cc.assetManager.bundles.get('resources');if(!b){res('NO_RES_BUNDLE');return;}b.load('spirits/cao/texture',window.cc.Texture2D,(e,a)=>{res(JSON.stringify({err:e?(e.message||String(e)):null,type:a?a.constructor.name:null,w:a?a.width:null,h:a?a.height:null}));});})`,
);
console.log(JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
