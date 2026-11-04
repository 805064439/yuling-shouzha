// 立绘加载端到端验证（无头 Chrome + CDP，零 npm 依赖）：
// 1) 种一个含 cao 精怪的存档（ylsz_save，loadState 会与默认值合并）；
// 2) 刷新进游戏，点击「编队出战」进入编队页；
// 3) 检查 spirit 节点是否挂上 SpriteFrame、emoji 兜底是否隐藏；
// 4) 汇总运行期异常。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const PORT = 9223;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error('找不到 Chrome，请用 CHROME_PATH 环境变量指定');
  process.exit(1);
}
const PROFILE = path.join(os.tmpdir(), 'cdchrome_verify_' + Date.now()); // 全新 profile 规避缓存

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${PROFILE}`,
    '--disable-gpu',
    '--window-size=750,1334',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const cleanup = () => {
  try { chrome.kill(); } catch {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(1));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCdp() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('CDP 端口等待超时');
}

async function main() {
  await waitCdp();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  let target = list.find((t) => t.type === 'page');
  if (!target) {
    target = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify('about:blank'),
      })
    ).json();
  }
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
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result);
      pending.delete(m.id);
      return;
    }
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
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: TARGET });

  // 等页面加载到源(origin)就绪，然后种存档（隧道模式走 Cloudflare，预留更多时间）
  await sleep(10000);
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) return 'EVAL_EXC:' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result ? r.result.value : `EVAL_FAIL:${JSON.stringify(r)}`;
  };
  const seeded = await evaluate(
    `(()=>{try{localStorage.setItem('ylsz_save', JSON.stringify({collection:{cao:1}, gold:500, tickets:1, prog:{cao:{star:1,evo:0}}}));return 'SEEDED';}catch(e){return 'ERR '+e.message;}})()`,
  );
  report.seeded = seeded;

  // 刷新，让游戏带着存档启动（轮询等待 boot 完成，隧道慢时最多等 90s）
  await send('Page.reload');
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

  // 1) 直接验证 texture 子资源加载（游戏 loadSpiritFrame 的首选路径）
  const texCheck = await evaluate(
    `(async()=>{try{const cc=window.cc;if(!cc||!cc.resources)return 'NO_CC_RESOURCES';return await new Promise((res)=>{cc.resources.load('spirits/cao/texture',cc.Texture2D,(e,t)=>{res(JSON.stringify({err:e?(e.message||String(e)):null,tex:t?{w:t.width,h:t.height}:null}));});});}catch(e){return 'ERR '+e.message;}})()`,
    true,
  );
  report.texCheck = texCheck;

  // 2) 点击「编队出战」
  const clickTeam = await evaluate(
    `(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';let hit=null;const walk=(n)=>{for(const c of n.children){if(c.name==='btn'){const lab=c.children.find((x)=>x.name==='label');if(lab){const s=lab.getComponent('cc.Label');if(s&&s.string.includes('编队出战')){c.emit('click');hit=s.string;}}}walk(c);}};walk(ui);return hit?('CLICKED:'+hit):'BTN_NOT_FOUND';}catch(e){return 'ERR '+e.message;}})()`,
  );
  report.clickTeam = clickTeam;

  // 等立绘异步加载
  await sleep(6000);

  // 3) 检查 spirit 节点：外框恒定 size×size（同排卡片大小一致），
  //    pic 子节点挂 SpriteFrame（contain 等比、sizeMode=CUSTOM(0)）、emoji 已隐藏
  const spirits = await evaluate(
    `(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';const out=[];const walk=(n)=>{if(n.name==='spirit'){const pic=n.children.find((x)=>x.name==='pic');const sp=pic?pic.getComponent('cc.Sprite'):null;const em=n.children.find((x)=>x.name==='label');const ut=n.getComponent('cc.UITransform');const put=pic?pic.getComponent('cc.UITransform'):null;const fw=sp&&sp.spriteFrame?sp.spriteFrame.width:1;const fh=sp&&sp.spriteFrame?sp.spriteFrame.height:1;const pw=put?put.width:0;const ph=put?put.height:0;out.push({hasSprite:!!sp,hasFrame:!!(sp&&sp.spriteFrame),emojiVisible:em?em.active:null,sizeMode:sp?sp.sizeMode:null,boxW:Math.round(ut?ut.width:0),boxH:Math.round(ut?ut.height:0),picW:Math.round(pw),picH:Math.round(ph),ratioOk:Math.abs((pw/ph)-(fw/fh))<0.02});}n.children.forEach(walk);};walk(ui);return JSON.stringify(out);}catch(e){return 'ERR '+e.message;}})()`,
  );
  report.spirits = spirits;

  // 3.5) 检查 panel 节点：标准色面板应已用上九宫格切图（Sprite SLICED=1 且有 frame）
  const panels = await evaluate(
    `(()=>{try{const ui=window.__ui;if(!ui)return 'NO_UI';let total=0,sliced=0,withFrame=0;const walk=(n)=>{if(n.name==='panel'){total++;const sp=n.getComponent('cc.Sprite');if(sp){if(sp.spriteFrame)withFrame++;if(sp.type===1&&sp.spriteFrame)sliced++;}}n.children.forEach(walk);};walk(ui);return JSON.stringify({total,sliced,withFrame});}catch(e){return 'ERR '+e.message;}})()`,
  );
  report.panels = panels;

  await sleep(1500);
  console.log('==== VERIFY SPRITES ====');
  console.log('seeded    :', report.seeded);
  console.log('texCheck  :', report.texCheck);
  console.log('clickTeam :', report.clickTeam);
  console.log('spirits   :', report.spirits);
  console.log('panels    :', report.panels);
  console.log('exceptions:', report.exceptions.length ? report.exceptions.slice(0, 5).join(' || ') : '(none)');
  console.log('consoleErr:', report.errors.length ? report.errors.slice(0, 5).join(' || ') : '(none)');

  const ok =
    String(report.texCheck).includes('"tex":{"w"') &&
    String(report.spirits).includes('"hasFrame":true') &&
    String(report.spirits).includes('"emojiVisible":false') &&
    String(report.spirits).includes('"sizeMode":0') &&
    String(report.spirits).includes('"ratioOk":true') &&
    String(report.spirits).includes('"boxW":150') && // 外框恒定 150×150，编队卡片大小统一
    /"total":\d+,"sliced":[1-9]/.test(String(report.panels)) && // 面板已用九宫格切图
    report.exceptions.length === 0;
  console.log(ok ? 'SPRITES_OK' : 'SPRITES_FAIL');
  ws.close();
  process.exit(ok ? 0 : 2);
}

main().catch((e) => {
  console.error('VERIFY ERROR:', e);
  process.exit(1);
});
