// 存档结构 + 存储封装（零引擎依赖）
// 原 src/idle.js 的 loadState 默认值 + src/cloud.js 的 localStorage 封装迁移而来。
// 兼容 Web 预览（localStorage）与微信小游戏（wx storage），UI 层无需关心底层。

import type { Prog } from './Spirits';

export interface GameState {
  gold: number;
  level: number;
  lastSeen: number;
  idleMult: number;
  cores: number; // 灵核（进化材料，战斗掉落）
  wave: number; // 当前战斗波次（难度梯队进度，切页面/重开不回退）
  team: string[]; // 出战队伍（spiritId 数组，最多 GAME_CONFIG.team.size 只）
  prog: Record<string, Prog>; // 每只精灵养成进度
  tickets: number; // 抽卡券
  collection: Record<string, number>; // spiritId -> 拥有数量
  sinceSSR: number; // 距上次 SSR 的抽数（软保底计数）
  lastDaily: string; // 每日免费券领取日期
  lastAd: number; // 看广告冷却时间戳
}

export function createDefaultState(): GameState {
  return {
    gold: 0,
    level: 1,
    lastSeen: Date.now(),
    idleMult: 1,
    cores: 0,
    wave: 1,
    team: [],
    prog: {},
    tickets: 0,
    collection: {},
    sinceSSR: 0,
    lastDaily: '',
    lastAd: 0,
  };
}

const PREFIX = 'ylsz_';

// 获取存储后端：优先微信小游戏 wx，否则 Web localStorage
function backend(): {
  get(k: string): string | null;
  set(k: string, v: string): void;
} {
  const g: any = globalThis as any;
  if (g.wx && g.wx.getStorageSync) {
    return {
      get: (k) => (g.wx.getStorageSync(k) as string) || null,
      set: (k, v) => g.wx.setStorageSync(k, v),
    };
  }
  return {
    get: (k) => {
      try { return localStorage.getItem(k); } catch { return null; }
    },
    set: (k, v) => {
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    },
  };
}

export const SaveStore = {
  get<T>(key: string, def: T): T {
    const raw = backend().get(PREFIX + key);
    if (raw == null) return def;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return def;
    }
  },
  set(key: string, val: unknown): void {
    try {
      backend().set(PREFIX + key, JSON.stringify(val));
    } catch {
      /* ignore quota / serialization errors */
    }
  },
};
