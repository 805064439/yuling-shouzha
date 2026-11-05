// 游戏总控（单例风格）：负责页面路由、存档、Toast、离开清理。
// 替代原 src/main.js 的 boot / show / render* 体系，但 UI 全改为代码驱动的 Cocos 节点。

import { Node, UITransform } from 'cc';
import { loadState, saveState, settleOffline } from '../logic/Idle';
import { GameState } from '../logic/Save';
import { recalcIdleMult } from '../logic/GameConfig';
import { makeLabel, makePanel, COLORS, setBg, preloadUiPanels } from './widgets';
import { buildTeam } from './pages/Team';
import { buildGacha } from './pages/Gacha';
import { buildShop } from './pages/Shop';
import { buildDex } from './pages/Dex';
import { buildDetail } from './pages/Detail';
import { buildBattle } from './pages/Battle';
import { buildProtagonist } from './pages/Protagonist';

export class GameManager {
  state: GameState;
  root: Node;
  current = 'battle';
  cleanup: (() => void) | null = null; // 离开当前页前的清理钩子（如停止战斗计时器）
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(root: Node) {
    this.root = root;
    this.state = loadState();
  }

  start(): void {
    preloadUiPanels(); // 预载九宫格面板切图，makePanel 即刻可用
    recalcIdleMult(this.state); // 启动即重算挂机倍率：等级加成不依赖升级动作，旧档也能补算
    // 离线收益结算
    const r = settleOffline(this.state);
    this.save();
    this.go('battle'); // 挂机游戏：进游戏直接在战斗界面
    if (r.elapsedSec >= 60 && r.gold > 0) {
      const h = Math.floor(r.elapsedSec / 3600);
      const m = Math.floor((r.elapsedSec % 3600) / 60);
      this.toast(`离线 ${h}小时${m}分，收获 ${r.gold} 灵气`);
    }
  }

  go(key: string, param?: string): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
    this.current = key;
    this.root.removeAllChildren();
    setBg(this.root, COLORS.bg);
    // 确保 root 有 UITransform（容器尺寸用于定位参考）
    if (!this.root.getComponent(UITransform)) this.root.addComponent(UITransform);

    switch (key) {
      case 'team': buildTeam(this.root, this); break;
      case 'gacha': buildGacha(this.root, this); break;
      case 'shop': buildShop(this.root, this); break;
      case 'dex': buildDex(this.root, this); break;
      case 'battle': buildBattle(this.root, this); break;
      case 'protagonist': buildProtagonist(this.root, this); break;
      case 'detail':
        if (param) buildDetail(this.root, this, param);
        else buildDex(this.root, this);
        break;
      default: buildBattle(this.root, this);
    }
    this.fixLayer();
  }

  // 把 UI 容器及其全部后代强制置于容器自身所在的层（即 Canvas 的 UI 层），
  // 否则动态创建的子节点默认在 DEFAULT 层，UI 相机不渲染、也收不到点击。
  private fixLayer(): void {
    const layer = this.root.layer;
    const walk = (n: Node): void => {
      n.layer = layer;
      for (const c of n.children) walk(c);
    };
    walk(this.root);
  }

  save(): void {
    saveState(this.state);
  }

  // 顶部状态刷新：当前页整体重建即可
  refreshTop(): void {
    /* 调用方通常会紧接着 rebuild 当前页，这里留空避免重复构建 */
  }

  toast(msg: string): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    const old = this.root.getChildByName('__toast');
    if (old) old.destroy();

    const panel = makePanel(this.root, { w: 560, h: 90, bg: '#101324' });
    panel.name = '__toast';
    panel.setPosition(0, -620, 10);
    makeLabel(panel, msg, { fontSize: 26, color: COLORS.text });
    this.toastTimer = setTimeout(() => {
      if (panel.isValid) panel.destroy();
      this.toastTimer = null;
    }, 1800);
  }
}
