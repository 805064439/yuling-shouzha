// 入口引导模块（运行时由构建产物 index.js 在游戏启动后 import 并调用 run()）。
// 不再把 Game 作为场景组件挂载：Cocos 在构建期会对场景引用的 ccclass 组件做类收集，
// 而当前环境下该阶段 ccclass 尚未就绪（ccclass is not a function），会导致组件被剥离、白屏。
// 因此改为运行时引导：轮询直到场景与 Canvas 就绪后创建 UI 容器并启动 GameManager。
import { director, view, ResolutionPolicy, Node, UITransform } from 'cc';
import { GameManager } from './ui/GameManager';
import { GAME_CONFIG } from './logic/GameConfig';

let booted = false;

// 调试浮层：在页面上显示运行时状态/报错/点击计数，便于远端定位（手机端也能直接看到）。
function ensureDiag(): HTMLElement {
  let el = document.getElementById('__diag') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = '__diag';
    el.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:99999;max-width:90vw;' +
      'background:rgba(0,0,0,0.72);color:#7CFC00;font:12px/1.4 monospace;' +
      'padding:6px 8px;border-radius:6px;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(el);
  }
  return el;
}
function diag(msg: string): void {
  const el = ensureDiag();
  el.textContent = msg;
}
let tapCount = 0;
function installTapProbe(): void {
  const onTap = (x: number, y: number) => {
    tapCount++;
    diag(`booted · taps=${tapCount} @${Math.round(x)},${Math.round(y)}`);
  };
  window.addEventListener('touchstart', (e) => {
    const t = (e as TouchEvent).changedTouches[0];
    if (t) onTap(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener('mousedown', (e) => onTap(e.clientX, e.clientY));
}

function tryBoot(): void {
  if (booted) return;
  const scene = director.getScene();
  if (!scene) {
    setTimeout(tryBoot, 100);
    return;
  }
  const canvas = scene.getChildByName('Canvas');
  if (!canvas) {
    setTimeout(tryBoot, 100);
    return;
  }
  booted = true;

  // 关键：把 UI 容器（及其全部后代）强制置于 Canvas 所在 UI 层，
  // 否则动态创建的节点默认在 DEFAULT 层，既不被 UI 相机渲染、也收不到点击。
  const uiLayer = canvas.layer;
  view.setDesignResolutionSize(GAME_CONFIG.designWidth, GAME_CONFIG.designHeight, ResolutionPolicy.FIT_WIDTH);
  view.setResolutionPolicy(ResolutionPolicy.FIT_WIDTH);

  const root = new Node('UI');
  root.layer = uiLayer;
  canvas.addChild(root);
  const ut = root.addComponent(UITransform);
  ut.setContentSize(GAME_CONFIG.designWidth, GAME_CONFIG.designHeight);
  ut.anchorX = 0.5;
  ut.anchorY = 0.5;

  // 调试句柄：便于运行时/远端通过 window.__ui 检查节点树（层级、坐标、尺寸）。
  (globalThis as any).__ui = root;

  installTapProbe();
  try {
    const gm = new GameManager(root);
    gm.start();
    diag('booted · page=' + gm.current);
  } catch (err) {
    diag('BOOT ERROR: ' + (err && (err as Error).stack ? (err as Error).stack : String(err)));
    console.error(err);
  }
}

// 由构建入口在 application.start() 之后调用。
// 轮询方式不依赖任何场景启动事件名，稳定性最好。
export function run(): void {
  tryBoot();
}
