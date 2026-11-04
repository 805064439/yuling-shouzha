// 挂机 / 离线收益结算（零引擎依赖）
// 原 src/idle.js 迁移而来。

import { GAME_CONFIG } from './GameConfig';
import { SaveStore, createDefaultState, GameState } from './Save';

export function loadState(): GameState {
  const saved = SaveStore.get<GameState>('save', createDefaultState());
  const def = createDefaultState();
  // 字段兜底，避免旧存档缺字段
  return {
    ...def,
    ...saved,
    prog: saved.prog || {},
    team: saved.team || [],
    collection: saved.collection || {},
  };
}

// 离线收益：用时间戳差值计算，避免客户端作弊也简单可靠
export function settleOffline(state: GameState): { elapsedSec: number; gold: number } {
  const now = Date.now();
  const last = state.lastSeen || now;
  const elapsedSec = Math.max(0, Math.floor((now - last) / 1000));
  const cap = GAME_CONFIG.idle.offlineCapHours * 3600;
  const effective = Math.min(elapsedSec, cap);
  const gold = effective * GAME_CONFIG.idle.baseGoldPerSec * (state.idleMult || 1);
  state.gold = (state.gold || 0) + gold;
  state.lastSeen = now;
  return { elapsedSec, gold: Math.floor(gold) };
}

export function saveState(state: GameState): void {
  state.lastSeen = Date.now();
  SaveStore.set('save', state);
}
