// 自动战斗（挂机战斗，纯数值演算 + 日志回调，无需逐帧精灵动画）
// 难度梯队见 logic/Difficulty.ts：按波次分章，敌人层级 / 血量 / 奖励逐档提升；
// 每 10 波长老关底、每 30 波教主 Boss；波次写入存档，切页面不回退。

import { GAME_CONFIG } from './GameConfig';
import { SPIRIT_BY_ID, spiritStats } from './Spirits';
import { EnemyDef, ENEMIES, ENEMY_BY_ID } from './Enemies';
import { GameState } from './Save';
import {
  DifficultyStage, stageForWave, stageIndexForWave, isBossWave, isEliteWave,
  enemyMaxHp, waveReward, stageLabel,
} from './Difficulty';

export interface BattleEvent {
  ratio: number; // 敌人剩余血量比例 0~1
  attackerId: string | null; // 本次出手精灵 id（用于立绘高亮，纯展示）
  enemyChanged?: boolean; // 敌方编队已刷新（击败旧敌，新敌人登场）
  wave?: number; // 当前波次
  stageName?: string; // 当前梯队名（血条展示）
}

const byTier = (t: number): EnemyDef[] => ENEMIES.filter((e) => e.tier === t);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export class Battle {
  private enemyHp = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** 当前波次（存档字段；击败一波 +1） */
  wave: number;
  /** 当前敌方编队（蚀灵教成员，供 UI 展示立绘） */
  enemyTeam: EnemyDef[] = [];

  constructor(
    private state: GameState,
    private onLog: (msg: string) => void,
    private onSave?: () => void, // 波次变化时落盘
  ) {
    this.wave = Math.max(1, Math.floor(state.wave || 1));
    this.enemyTeam = this.rollEnemyTeam();
  }

  /** 当前难度梯队（供 UI 读） */
  get stage(): DifficultyStage {
    return stageForWave(this.wave);
  }

  /** 按层级组合抽敌人：同一波尽量不出现重复角色 */
  private rollComp(tiers: number[]): EnemyDef[] {
    const used = new Set<string>();
    return tiers.map((t) => {
      const all = byTier(t);
      const fresh = all.filter((e) => !used.has(e.id));
      const e = pick(fresh.length ? fresh : all);
      used.add(e.id);
      return e;
    });
  }

  // 难度梯队编排：
  //   每 30 波       = 教主 Boss 单挑
  //   每 10 波(非30) = 关底：1 长老 + 2 随从（随从层级看梯队）
  //   普通波         = 从该梯队的组合池抽 3 只
  private rollEnemyTeam(): EnemyDef[] {
    const w = this.wave;
    if (isBossWave(w)) return [ENEMY_BY_ID['e_lord']];
    const s = stageForWave(w);
    if (isEliteWave(w)) return [pick(byTier(3)), ...this.rollComp(s.eliteTiers)];
    return this.rollComp(pick(s.normalComp));
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

  /** 血量 = (基础血 + 队伍攻击×0.5) × 波次梯队倍率 × 敌方阵容强度（不再乘主角等级） */
  private maxHp(): number {
    return enemyMaxHp(GAME_CONFIG.battle.enemyHpBase, this.totalAtk(), this.wave, this.enemyStrength());
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
      const hp = this.maxHp();
      const { gold, cores } = waveReward(hp, this.wave); // 奖励按「被击败那一波」的梯队结算
      this.state.gold += gold;
      this.state.cores = (this.state.cores || 0) + cores;
      const bossDown = this.enemyTeam.some((e) => e.tier === 4);
      this.onLog(bossDown
        ? `击败${this.enemyTeam[0].name}！获得 ${gold} 灵气 · ${cores} 灵核`
        : `击败敌人！获得 ${gold} 灵气 · ${cores} 灵核`);

      const prevStage = stageIndexForWave(this.wave);
      this.wave += 1;
      this.state.wave = this.wave;
      if (this.onSave) this.onSave(); // 波次持久化：切页面 / 重开不回退
      this.enemyTeam = this.rollEnemyTeam(); // 下一波敌人登场
      this.enemyHp = this.maxHp();
      const stage = stageForWave(this.wave);
      if (stageIndexForWave(this.wave) !== prevStage) {
        this.onLog(`⚔ 进入「${stage.name}」，敌人更强了`);
      }
      this.onLog(`${stageLabel(this.wave)}：${this.enemyTeam.map((e) => e.name).join('、')} 出现`);
      return { ratio: 1, attackerId, enemyChanged: true, wave: this.wave, stageName: stage.name };
    }
    return { ratio: this.enemyHp / this.maxHp(), attackerId };
  }

  start(onTick?: (ev: BattleEvent) => void): void {
    if (this.timer) return;
    this.enemyHp = this.maxHp(); // 开战时按当前队伍/波次刷新
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
