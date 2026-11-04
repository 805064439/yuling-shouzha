// 自动战斗（挂机战斗，纯数值演算 + 日志回调，无需逐帧精灵动画）
// 原 src/battle.js 迁移而来。改为 class 封装，UI 层用 Cocos schedule 或 setInterval 驱动 tick。

import { GAME_CONFIG } from './GameConfig';
import { SPIRIT_BY_ID, spiritStats } from './Spirits';
import { GameState } from './Save';

export interface BattleEvent {
  ratio: number; // 敌人剩余血量比例 0~1
  attackerId: string | null; // 本次出手精灵 id（用于立绘高亮，纯展示）
}

export class Battle {
  private enemyHp = 1;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private state: GameState,
    private onLog: (msg: string) => void,
  ) {}

  private charBase(): number {
    return 8 + this.state.level * 2; // 主角小椿固定贡献
  }

  private teamAtk(): number {
    return (this.state.team || []).reduce((sum, id) => {
      const s = SPIRIT_BY_ID[id];
      if (!s) return sum;
      return sum + spiritStats(s, this.state.prog && this.state.prog[id]).atk;
    }, 0);
  }

  private totalAtk(): number {
    return this.charBase() + this.teamAtk();
  }

  // 敌人血量随「队伍总攻击 + 主角等级」缩放，保证一直有挑战
  private maxHp(): number {
    return Math.max(
      1,
      Math.floor((GAME_CONFIG.battle.enemyHpBase + this.totalAtk() * 0.5) * this.state.level),
    );
  }

  private tick(): BattleEvent {
    const ids = this.state.team || [];
    const attackerId = ids.length ? ids[Math.floor(Math.random() * ids.length)] : null;
    const attacker = attackerId ? SPIRIT_BY_ID[attackerId] : null;
    const who = attacker ? attacker.name : '主角小椿';
    const dmg = Math.floor(this.totalAtk() * (0.9 + Math.random() * 0.2));
    this.enemyHp -= dmg;
    this.onLog(`${who} 造成 ${dmg} 伤害，敌人剩余 ${Math.max(0, this.enemyHp)}`);
    if (this.enemyHp <= 0) {
      const reward = Math.floor(this.maxHp() * 0.25); // 击败奖励随敌人强度放大
      const cores = Math.floor(this.maxHp() * 0.02); // 灵核掉落（进化材料）
      this.state.gold += reward;
      this.state.cores = (this.state.cores || 0) + cores;
      this.onLog(`击败敌人！获得 ${reward} 灵气 · ${cores} 灵核`);
      this.enemyHp = this.maxHp();
    }
    return { ratio: this.enemyHp / this.maxHp(), attackerId };
  }

  start(onTick?: (ev: BattleEvent) => void): void {
    if (this.timer) return;
    this.enemyHp = this.maxHp(); // 开战时按当前队伍/等级刷新
    this.timer = setInterval(() => {
      const ev = this.tick();
      if (onTick) onTick(ev);
    }, GAME_CONFIG.battle.tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.timer !== null;
  }
}
