// R12 程序侧回归（整合指示 M1–M4 接入后）：
//   · 单位血条端头帽 unitHpCap：SIMPLE / _v1 资源 / 与 fill 等高 / 极窄态隐藏；
//   · 上檐金线 ui_bar_hp_eave：620×33 SIMPLE、跨满血/低血帧恒尺寸恒位置；
//   · 底部导航 5 枚 Label：#E8C87E + 1px 原生描边；
//   · 输出 3 张原始 CDP 真机截图（不裁剪、不放大、不合成）：
//       r12_full.png（满血态檐线）、r12_low.png（低血态檐线）、r12_tri.png（三态同屏圆头）。
// 用法: node tools/verify_r12.mjs [url] [outDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TARGET = process.argv[2] || 'http://127.0.0.1:8088/';
const OUTDIR = process.argv[3] || 'tools/r12';
const PORT = 9234;
const CHROME_CANDIDATES = [
  'C:/Users/admin/AppData/Local/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome'); process.exit(1); }
const PROFILE = path.join(os.tmpdir(), 'cdchrome_r12_' + Date.now());
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=' + PORT,
  '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--disable-gpu',
  '--window-size=750,1334', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch {} });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCdp() {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch('http://127.0.0.1:' + PORT + '/json/version'); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('CDP 端口等待超时');
}

const PROBE = `(()=>{
  const ui=window.__ui;
  if(!ui||ui.children.length===0)return {error:'NO_UI'};
  const find=(root,fn)=>{const out=[];const walk=(n)=>{if(fn(n))out.push(n);for(const c of n.children)walk(c);};walk(root);return out;};
  const byName=(root,name)=>find(root,n=>n.name===name);
  const utOf=n=>n.getComponent('cc.UITransform');
  const spOf=n=>n.getComponent('cc.Sprite');
  const info=n=>{if(!n)return null;const sp=spOf(n),ut=utOf(n);return {
    sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',type:sp?sp.type:-1,
    w:ut?Number(ut.width.toFixed(1)):-1,h:ut?Number(ut.height.toFixed(1)):-1,
    x:Number(n.position.x.toFixed(1)),y:Number(n.position.y.toFixed(1)),z:n.position.z,active:n.active};};
  const eave=byName(ui,'ui_bar_hp_eave')[0];
  const hpFills=byName(ui,'ui_bar_hp_fill').concat(byName(ui,'ui_bar_hp_fill_gold')).map(info);
  const fills=byName(ui,'unitHpFill');
  const caps=byName(ui,'unitHpCap').map(info);
  const unitFills=fills.map(n=>{
    const sp=spOf(n),ut=utOf(n);
    return {h:ut?Number(ut.height.toFixed(1)):-1,w:ut?Number(ut.width.toFixed(1)):-1,
      type:sp?sp.type:-1,fillRange:sp?Number(sp.fillRange.toFixed(3)):-1,
      sf:sp&&sp.spriteFrame?(sp.spriteFrame.name||'anon'):'NONE',active:n.active};
  });
  // 真实血量比例取自胶囊里的 unitHpNum 子节点文字 hp/maxHp（死亡时是「已击败」，记为 null）
  // 注意：Label 挂在子节点上，chip / btn 节点自身没有 Label。
  const chipRatios=byName(ui,'unitHpNum').map(n=>{
    const l=n.getComponent('cc.Label'); if(!l)return null;
    const parts=String(l.string).trim().split('/');
    if(parts.length!==2)return null;
    const hp=Number(parts[0]),max=Number(parts[1]);
    if(!isFinite(hp)||!isFinite(max)||max<=0)return null;
    return Number((hp/max).toFixed(3));
  });
  const navLabs=[];
  byName(ui,'btn').forEach(n=>{
    n.children.forEach(c=>{
      const l=c.getComponent('cc.Label'); if(!l)return;
      const co=l.color||{};
      navLabs.push({text:String(l.string),rgb:[co.r,co.g,co.b].join(','),
        outline:!!l.enableOutline,ow:Number(l.outlineWidth)});
    });
  });
  return {
    hpEave:info(eave),hpFills:hpFills,
    unitFills:unitFills,caps:caps,chipRatios:chipRatios,navLabs:navLabs,
    navCount:byName(ui,'btn').length,
    hpDeco:info(byName(ui,'ui_bar_hp_deco')[0]),
    deadMasks:byName(ui,'unitDeadMask').filter(n=>n.active).length,
    jsErr:0
  };
})()`;

async function main() {
  await waitCdp();
  const list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json();
  const target = list.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.text));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const t = String(m.params.entry.text), u = String(m.params.entry.url || '');
      // 浏览器自动请求 /favicon.ico 的 404 是历史无害项，不算 JS 异常
      if (!/favicon/i.test(t + u)) errors.push(t + (u ? ' @ ' + u : ''));
    }
  });
  await new Promise((res) => ws.addEventListener('open', () => res()));
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(2500);
  fs.mkdirSync(OUTDIR, { recursive: true });

  const shots = { full: null, low: null, tri: null };
  const shotMeta = {};
  const allSamples = [];
  const phaseLog = [];
  let bestCandidate = null; // 三态未凑齐时，退用评分最高的真实帧（绝不合成图）

  async function grab() {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    return Buffer.from(shot.data, 'base64');
  }
  async function capture(tag, reason, data) {
    if (shots[tag]) return;
    const buf = await grab();
    const file = path.join(OUTDIR, 'r12_' + tag + '.png');
    fs.writeFileSync(file, buf);
    shots[tag] = file;
    shotMeta[tag] = { reason, hpFillW: data.hpFillW, chipRatios: data.ratios };
    console.log('  [shot] ' + tag + ' <- ' + reason + ' ratios=' + JSON.stringify(data.ratios));
  }

  async function bootWith(saveFile) {
    const save = fs.readFileSync(saveFile, 'utf8');
    await send('Runtime.evaluate', {
      expression: "localStorage.setItem('ylsz_save', " + JSON.stringify(save) + "); 'ok'",
      returnByValue: true,
    });
    await send('Page.reload');
    let booted = false;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      const r = await send('Runtime.evaluate', {
        expression: '!!(window.__ui && window.__ui.children.length > 0)', returnByValue: true,
      });
      if (r.result && r.result.value) { booted = true; break; }
    }
    if (!booted) throw new Error('页面未启动: ' + saveFile);
    await sleep(5500); // 切图预载 + 战斗起手
    return booted;
  }

  async function runPhase(saveFile, frames, pick) {
    console.log('=== phase ' + saveFile + ' ===');
    await bootWith(saveFile);
    for (let k = 0; k < frames; k++) {
      const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      const s = r.result && r.result.value;
      if (!s || s.error) { await sleep(800); continue; }
      s._phase = saveFile;
      allSamples.push(s);
      const live = s.hpFills.filter((f) => f.active).map((f) => f.w);
      const hpFillW = live.length ? Math.max(...live) : 0;
      const ratios = s.chipRatios.filter((v) => v !== null);
      const data = { hpFillW, ratios };
      const score = (ratios.some((v) => v >= 0.85) ? 1 : 0)
        + (ratios.some((v) => v >= 0.20 && v <= 0.80) ? 1 : 0)
        + (ratios.some((v) => v <= 0.20) ? 1 : 0);
      if (score >= 2 && !shots.tri && (!bestCandidate || score > bestCandidate.score)) {
        bestCandidate = { score, buf: await grab(),
          reason: 'BEST_CANDIDATE score=' + score + ' ' + saveFile + '#' + k, ratios: ratios };
      }
      const hits = pick(s, data);
      for (const tag of hits) await capture(tag, 'phase=' + saveFile + ' frame=' + k, data);
      await sleep(900);
    }
    phaseLog.push({ save: saveFile, frames, samples: allSamples.filter((x) => x._phase === saveFile).length });
  }

  // 三态判据：同屏同时存在满血档(≥85%)、中间档(20~80%)、极窄档(≤20%)
  const triHit = (r) => r.some((v) => v >= 0.85) && r.some((v) => v >= 0.20 && v <= 0.80)
    && r.some((v) => v <= 0.20);
  // 阶段 A：140 波敌人血厚、掉血慢 → 满血态檐线，也最容易凑出三态同屏
  await runPhase('tools/save140.json', 20, (s, d) => {
    const hits = [];
    if (d.hpFillW >= 560) hits.push('full');
    if (triHit(d.ratios)) hits.push('tri');
    return hits;
  });
  // 阶段 B：第 3 波开局约 68% → 低血/极窄态檐线与圆头降级
  await runPhase('tools/save_rush.json', 26, (s, d) => {
    const hits = [];
    if (triHit(d.ratios)) hits.push('tri');
    if (d.hpFillW <= 120 || d.ratios.some((v) => v <= 0.15)) hits.push('low');
    return hits;
  });

  const last = allSamples[allSamples.length - 1];
  // 三态未凑齐时退用评分最高的真实帧（仍是原样 CDP 截图，不裁剪、不合成）
  if (!shots.tri && bestCandidate) {
    const file = path.join(OUTDIR, 'r12_tri.png');
    fs.writeFileSync(file, bestCandidate.buf);
    shots.tri = file;
    shotMeta.tri = { reason: bestCandidate.reason, chipRatios: bestCandidate.ratios };
    console.log('  [shot] tri <- ' + bestCandidate.reason + ' ratios=' + JSON.stringify(bestCandidate.ratios));
  }
  for (const tag of ['full', 'low', 'tri']) {
    if (!shots[tag] && last) await capture(tag, 'FALLBACK 末帧', { hpFillW: 0, ratios: last.chipRatios });
  }

  const eaveKeys = allSamples.map((s) => s.hpEave ? JSON.stringify(s.hpEave) : 'NONE');
  const eaveStable = eaveKeys.every((k) => k === eaveKeys[0]);
  const decoKeys = allSamples.map((s) => s.hpDeco ? JSON.stringify(s.hpDeco) : 'NONE');
  const decoStable = decoKeys.every((k) => k === decoKeys[0]);
  const fillWs = [...new Set(allSamples.map((s) => s.hpFills.filter((f) => f.active).map((f) => f.w).join('/')))];

  fs.writeFileSync(path.join(OUTDIR, 'r12_probe.json'),
    JSON.stringify({ phaseLog, shots: shotMeta, eaveStable, decoStable, fillWs, errors,
      sampleCount: allSamples.length,
      frames: allSamples.map((s) => ({ phase: s._phase, ratios: s.chipRatios,
        fillRanges: s.unitFills.map((f) => f.fillRange),
        capsActive: s.caps.map((c) => c.active),
        hpFillW: s.hpFills.filter((f) => f.active).map((f) => f.w) })) }, null, 2));

  console.log('==== R12 PROBE ====');
  console.log('采样帧:', allSamples.length, ' 阶段:', JSON.stringify(phaseLog));
  console.log('hpEave:', JSON.stringify(last.hpEave));
  console.log('檐线恒定:', eaveStable, ' 金饰恒定:', decoStable, ' 总血条宽档位:', fillWs.length);
  console.log('caps 数/unitFills 数:', last.caps.length + '/' + last.unitFills.length);
  console.log('cap 明细:', last.caps.map((c) => c.sf + '/type' + c.type + '/' + c.w + 'x' + c.h + '/act' + c.active).join(' | '));
  console.log('fill(type/range):', last.unitFills.map((f) => f.type + '/' + f.fillRange).join(' | '));
  console.log('chip 真实比例:', JSON.stringify(last.chipRatios));
  console.log('导航:', last.navCount + ' 枚', last.navLabs.map((n) => n.text + '/' + n.rgb + '/outline' + n.outline + '-' + n.ow).join(' | '));

  const bad = [];
  if (!last.hpEave || last.hpEave.sf !== 'hp_total_eave_v1') bad.push('eave 资源未加载');
  if (last.hpEave && (last.hpEave.type !== 0 || last.hpEave.w !== 620 || last.hpEave.h !== 33 || last.hpEave.y !== 25.5)) bad.push('eave 规格错');
  if (!eaveStable) bad.push('檐线随血量变化');
  if (!decoStable) bad.push('金饰随血量变化');
  if (last.caps.length !== last.unitFills.length) bad.push('cap 数量与 fill 不符');
  if (last.caps.some((c) => c.type !== 0 || !/cap_.*_v1/.test(c.sf))) bad.push('cap 非 SIMPLE 或资源名错');
  if (last.caps.some((c, i) => Math.abs(c.h - last.unitFills[i].h) > 0.2)) bad.push('cap 与 fill 不等高');
  if (last.unitFills.some((f) => f.type !== 3)) bad.push('单位 fill 非 FILLED');
  if (last.navLabs.length !== 5) bad.push('导航 Label 数 != 5');
  if (last.navLabs.some((n) => n.rgb !== '232,200,126' || !n.outline || n.ow !== 1)) bad.push('导航文字色/描边错');
  console.log('断言失败:', bad.length ? bad.join(' / ') : '无');
  console.log('JS 异常:', errors.length + (errors.length ? ' -> ' + errors.slice(0, 3).join(' | ') : ''));
  console.log('截图:', Object.values(shots).join(', '));
  ws.close();
  process.exit(0);
}
main().catch((e) => { console.error('ERROR:', e); process.exit(1); });
