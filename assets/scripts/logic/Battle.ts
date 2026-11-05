// 自动战斗（挂机战斗，纯数值演算 + 日志回调，无需逐帧精灵动画）
// 原 src/battle.js 迁移而来。改为 class 封装，UI 层用 Cocos schedule 或 setInterval 驱动 tick。
// 挂机版：构造后即可 start，敌方为随机 3 只精怪编队，击败后自动刷新下一波。

import { GAME_CONFIG } from './GameConfig';
import { SPIRITS, SPIRIT_BY_ID, spiritStats } from './Spirits';
import { GameState } from './Save';

export interface BattleEvent {
  ratio: number; // 敌人剩余血量比例 0~1
  attackerId: string | null; // 本次出手精灵 id（用于立绘高亮，纯展示）
  enemyChanged?: boolean; // 敌方编队已刷新（击败旧敌，新敌人登场）
}

const ENEMY_TEAM_SIZE = 3;

export class Battle {
  private enemyHp = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 当前敌方编队（随机 3 只精怪 id，供 UI 展示立绘） */
  enemyTeam: string[] = [];

  constructor(
    private state: GameState,
    private onLog: (msg: string) => void,
  ) {
    this.enemyTeam = this.rollEnemyTeam();
  }

  // 随机刷一波敌方编队（不放重复的）
  private rollEnemyTeam(): string[] {
    const pool = SPIRITS.map((sp) => sp.id);
    const team: string[] = [];
    while (team.length < Math.min(ENEMY_TEAM_SIZE, pool.length)) {
      const id = pool[Math.floor(Math.random() * pool.length)];
      if (!team.includes(id)) team.push(id);
    }
    return team;
  }

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
    // 主角也有 1/4 概率出手
    const attackerId = ids.length && Math.random() > 0.25
      ? ids[Math.floor(Math.random() * ids.length)]
      : null;
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
      this.enemyTeam = this.rollEnemyTeam(); // 下一波敌人登场
      this.enemyHp = this.maxHp();
      this.onLog(`新的敌人出现了：${this.enemyTeam.map((id) => SPIRIT_BY_ID[id]?.name ?? id).join('、')}`);
      return { ratio: 1, attackerId, enemyChanged: true };
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
