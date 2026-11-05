// 自动战斗（挂机战斗，纯数值演算 + 日志回调，无需逐帧精灵动画）
// 挂机版：构造后即可 start，敌方为「蚀灵教」编队（分层编排：杂兵/弟子/长老/教主），
// 击败后 wave+1 自动刷新下一波，血量随阵容强度系数缩放。

import { GAME_CONFIG } from './GameConfig';
import { SPIRIT_BY_ID, spiritStats } from './Spirits';
import { EnemyDef, ENEMIES, ENEMY_BY_ID } from './Enemies';
import { GameState } from './Save';

export interface BattleEvent {
  ratio: number; // 敌人剩余血量比例 0~1
  attackerId: string | null; // 本次出手精灵 id（用于立绘高亮，纯展示）
  enemyChanged?: boolean; // 敌方编队已刷新（击败旧敌，新敌人登场）
  wave?: number; // 当前波次
}

const byTier = (t: number): EnemyDef[] => ENEMIES.filter((e) => e.tier === t);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class Battle {
  private enemyHp = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 当前波次（击败一波 +1，用于分层编排敌人） */
  wave = 1;
  /** 当前敌方编队（蚀灵教成员，供 UI 展示立绘） */
  enemyTeam: EnemyDef[] = [];

  constructor(
    private state: GameState,
    private onLog: (msg: string) => void,
  ) {
    this.enemyTeam = this.rollEnemyTeam();
  }

  // 随机刷一波敌方编队（蚀灵教分层编排）：
  //   每 30 波  = 教主 Boss 单挑
  //   每 10 波  = 1 长老 + 2 外门杂兵
  //   普通波    = 前期全杂兵，5 波后混入内门弟子
  private rollEnemyTeam(): EnemyDef[] {
    const w = this.wave;
    if (w > 0 && w % 30 === 0) {
      return [ENEMY_BY_ID['e_lord']];
    }
    const t1 = byTier(1);
    const t2 = byTier(2);
    const t3 = byTier(3);
    if (w > 0 && w % 10 === 0) {
      return [pick(t3), pick(t1), pick(t1)];
    }
    if (w < 5) {
      return [pick(t1), pick(t1), pick(t1)];
    }
    return [pick(t1), pick(t1), pick(t2)];
  }

  /** 敌方阵容强度系数：全队 hpMul 均值 */
  private enemyStrength(): number {
    if (this.enemyTeam.length === 0) return 1;
    return this.enemyTeam.reduce((s, e) => s + e.hpMul, 0) / this.enemyTeam.length;
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

  // 敌人血量随「队伍总攻击 + 主角等级」缩放，再乘敌方阵容强度系数（Boss 波更肉）
  private maxHp(): number {
    return Math.max(
      1,
      Math.floor((GAME_CONFIG.battle.enemyHpBase + this.totalAtk() * 0.5) * this.state.level * this.enemyStrength()),
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
      const bossDown = this.enemyTeam.some((e) => e.tier === 4);
      this.onLog(bossDown
        ? `击败${this.enemyTeam[0].name}！获得 ${reward} 灵气 · ${cores} 灵核`
        : `击败敌人！获得 ${reward} 灵气 · ${cores} 灵核`);
      this.wave += 1;
      this.enemyTeam = this.rollEnemyTeam(); // 下一波敌人登场
      this.enemyHp = this.maxHp();
      this.onLog(`第 ${this.wave} 波：${this.enemyTeam.map((e) => e.name).join('、')} 出现`);
      return { ratio: 1, attackerId, enemyChanged: true, wave: this.wave };
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
