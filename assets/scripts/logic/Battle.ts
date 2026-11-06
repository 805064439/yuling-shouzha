// 自动战斗（挂机战斗，纯数值演算 + 日志回调，无需逐帧精灵动画）
// ---------------------------------------------------------------------------
// 单位制回合：主角 + 每只上场精灵、每只敌人都是独立 Unit（各自 hp / maxHp / atk / dead）。
// 步进制演出（用户要求）：每次 tick 只发生一次攻击——我方单位逐个出手一刀，
// 紧接着轮到一只存活敌人反击，如此交替；出手/受击由 UI 高亮对应立绘。
// 全清 / 团灭时画面停留 CLEAR/WIPE_PAUSE_TICKS 个 tick（可看清全部「已击败/倒下」
// 遮罩），倒计时结束才换场。关卡规则（见 Difficulty.decideAfterWipe）：
//   全清     → 进下一关；
//   0 击杀团灭 → 退回上一关修炼，打过上一关自然再回到本关；
//   有击杀团灭 → 留在本关反复挑战，直到能全清。
// 波次 / 掉落即时写入存档，切页面或重开都不丢。

import { GAME_CONFIG } from './GameConfig';
import { SPIRIT_BY_ID, spiritStats } from './Spirits';
import type { EnemyDef } from './Enemies';
import { ENEMIES, ENEMY_BY_ID } from './Enemies';
import type { GameState } from './Save';
import type { DifficultyStage } from './Difficulty';
import {
  stageForWave, stageIndexForWave, isBossWave, isEliteWave,
  enemyUnitHp, enemyUnitAtk, killReward, decideAfterWipe, stageLabel,
  heroMaxHp, heroAtk, ALLY_HP_MULT,
} from './Difficulty';

/** 一个上场单位（我方或敌方） */
export interface Unit {
  id: string; // 我方：'__hero' | spiritId；敌方：<enemyId>#<index>
  name: string;
  side: 'ally' | 'enemy';
  hp: number;
  maxHp: number;
  atk: number;
  dead: boolean;
  def?: EnemyDef; // 敌方专有，用于 UI 立绘 / 掉落层级
}

export interface BattleEvent {
  ratio: number; // 敌方全体剩余血量比例 0~1（顶部总血条）
  attackerId: string | null; // 本次最后出手者（立绘高亮，纯展示）
  targetId: string | null; // 本次受击目标
  attackerSide?: 'ally' | 'enemy'; // 出手方（UI 据此高亮我方/敌卡立绘）
  attackerIndex?: number; // 敌方出手者在 enemyTeam 中的下标（UI 高亮用）
  enemyChanged?: boolean; // 敌方编队已刷新（需重绘立绘）
  wave?: number;
  stageName?: string;
  kills?: number; // 本关本次已击杀数
  enemyCount?: number;
  result?: 'fight' | 'clear' | 'regress' | 'retry' | 'pause';
  // pause = 全清/团灭后的停留画面（enemies/allies 全 dead 供 UI 展示遮罩）
  regressFrom?: number; // 退回前的波次
}

const byTier = (t: number): EnemyDef[] => ENEMIES.filter((e) => e.tier === t);

/** 全清 / 团灭后画面停留的 tick 数（tickMs=1000 → 各停 2 秒，可看清全部遮罩） */
const CLEAR_PAUSE_TICKS = 2;
const WIPE_PAUSE_TICKS = 2;

export class Battle {
  private state: GameState;
  private onLog: (msg: string) => void;
  private onSave: (() => void) | undefined;
  private rng: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * 步进制演出状态机：
   *   ally    → 我方 cursor 位单位出手一刀，然后轮到敌方；
   *   enemy   → 敌方 cursor 位怪反击一次，然后轮到我方；
   *   clearing → 全清停留画面，倒计时结束换下一关；
   *   wiping   → 团灭停留画面，倒计时结束复活/退关。
   */
  private phase: 'ally' | 'enemy' | 'clearing' | 'wiping' = 'ally';
  private cursor = 0; // 当前阶段下一个待行动单位的下标（循环使用）
  private pauseTicks = 0; // 停留阶段剩余 tick 数
  private pendingWipe: 'regress' | 'retry' | null = null; // 停留结束后执行的换场方式

  /** 当前波次（存档字段；全清 +1，团灭 0 击杀时 -1） */
  wave: number;
  /** 当前敌方编队（蚀灵教成员，供 UI 展示立绘） */
  enemyTeam: EnemyDef[] = [];
  /** 敌方单位（下标与 enemyTeam 一一对应） */
  enemies: Unit[] = [];
  /** 我方单位：0 号恒为主角，其后依次为出战精灵 */
  allies: Unit[] = [];
  /** 本关本次挑战已击杀数（团灭决策依据） */
  kills = 0;
  /** 本关已挑战次数（纯展示） */
  attempts = 0;

  constructor(
    state: GameState,
    onLog: (msg: string) => void,
    onSave?: () => void,
    rng: () => number = Math.random,
  ) {
    this.state = state;
    this.onLog = onLog;
    this.onSave = onSave;
    this.rng = rng;
    this.wave = Math.max(1, Math.floor(state.wave || 1));
    state.wave = this.wave;
    if (!state.bestWave || state.bestWave < this.wave) state.bestWave = this.wave;
    this.respawn();
  }

  /** 当前难度梯队（供 UI 读） */
  get stage(): DifficultyStage {
    return stageForWave(this.wave);
  }

  /** 按层级组合抽敌人：同一波尽量不出现重复角色 */
  private rollComp(tiers: number[]): EnemyDef[] {
    const used = new Set<string>();
    const out: EnemyDef[] = [];
    for (const t of tiers) {
      const all = byTier(t);
      const fresh = all.filter((e) => !used.has(e.id));
      const pool = fresh.length ? fresh : all;
      const chosen = pool[Math.floor(this.rng() * pool.length)];
      used.add(chosen.id);
      out.push(chosen);
    }
    return out;
  }

  // 难度梯队编排：
  //   每 30 波       = 教主 Boss 单挑
  //   每 10 波(非30) = 关底：1 长老 + 2 随从（随从层级看梯队）
  //   普通波         = 从该梯队的组合池抽 3 只
  private rollEnemyTeam(): EnemyDef[] {
    const w = this.wave;
    if (isBossWave(w)) return [ENEMY_BY_ID['e_lord']];
    const s = stageForWave(w);
    if (isEliteWave(w)) {
      const elders = byTier(3);
      return [elders[Math.floor(this.rng() * elders.length)], ...this.rollComp(s.eliteTiers)];
    }
    const pool = s.normalComp[Math.floor(this.rng() * s.normalComp.length)];
    return this.rollComp(pool);
  }

  /** 我方单位：主角 + 出战精灵，各自独立血条 */
  private buildAllies(): Unit[] {
    const lv = Math.max(1, this.state.level || 1);
    const hp = heroMaxHp(lv);
    const out: Unit[] = [{
      id: '__hero', name: '主角·小椿', side: 'ally',
      hp, maxHp: hp, atk: heroAtk(lv), dead: false,
    }];
    for (const id of this.state.team || []) {
      const sp = SPIRIT_BY_ID[id];
      if (!sp) {
        // 坏档占位：保持与 UI 槽位下标一一对应
        out.push({ id, name: '???', side: 'ally', hp: 1, maxHp: 1, atk: 0, dead: false });
        continue;
      }
      const st = spiritStats(sp, this.state.prog && this.state.prog[id]);
      const ahp = Math.max(1, Math.round(st.hp * ALLY_HP_MULT));
      out.push({ id, name: sp.name, side: 'ally', hp: ahp, maxHp: ahp, atk: st.atk, dead: false });
    }
    return out;
  }

  /** 敌方单位：每只怪按自身层级 hpMul 单独算血量/伤害 */
  private buildEnemies(defs: EnemyDef[]): Unit[] {
    return defs.map((def, i) => {
      const hp = enemyUnitHp(this.wave, def.hpMul);
      return {
        id: `${def.id}#${i}`, name: def.name, side: 'enemy',
        hp, maxHp: hp, atk: enemyUnitAtk(this.wave, def.hpMul), dead: false, def,
      };
    });
  }

  /** 换关（通关 / 退回）时完整重开：新敌人组合 + 双方满血 */
  private respawn(): void {
    this.enemyTeam = this.rollEnemyTeam();
    this.enemies = this.buildEnemies(this.enemyTeam);
    this.allies = this.buildAllies();
  }

  /** 本关原地再战：只复活我方；已击杀的怪保持死亡、存活怪保留残血（进度不清零） */
  private reviveAllies(): void {
    for (const a of this.allies) { a.hp = a.maxHp; a.dead = false; }
  }

  /** 敌方总血量剩余比例（顶部总血条） */
  private enemyRatio(): number {
    let total = 0, cur = 0;
    for (const e of this.enemies) { total += e.maxHp; cur += Math.max(0, e.hp); }
    return total > 0 ? Math.max(0, Math.min(1, cur / total)) : 0;
  }

  /** 全清瞬间：波次即时 +1 并落盘（进度不丢），画面停留展示全灭，倒计时后再换场 */
  private beginClear(ev: BattleEvent, lines: string[]): void {
    ev.result = 'clear';
    ev.enemyChanged = false; // 换场延后到 finishClear
    const prevStage = stageIndexForWave(this.wave);
    const cleared = this.wave;
    this.wave = cleared + 1;
    this.state.wave = this.wave;
    if (!this.state.bestWave || this.state.bestWave < this.wave) this.state.bestWave = this.wave;
    if (this.onSave) this.onSave();
    lines.push(`◆ 第 ${cleared} 关通关！推进 ${stageLabel(this.wave)}`);
    if (stageIndexForWave(this.wave) !== prevStage) {
      lines.push(`◆ 进入「${stageForWave(this.wave).name}」，敌人更强了`);
    }
    this.phase = 'clearing';
    this.pauseTicks = CLEAR_PAUSE_TICKS;
  }

  /** 停留结束：清计数、刷出新一关敌人 */
  private finishClear(ev: BattleEvent, lines: string[]): void {
    this.kills = 0;
    this.attempts = 0;
    this.respawn();
    if (this.onSave) this.onSave();
    ev.enemyChanged = true;
    lines.push(`${stageLabel(this.wave)}：${this.enemyTeam.map((e) => e.name).join('、')} 出现`);
    this.phase = 'ally';
    this.cursor = 0;
  }

  /** 我方团灭瞬间：判定退关/留关（波次即时落盘），画面停留展示全倒，倒计时后换场 */
  private beginWipe(ev: BattleEvent, lines: string[]): void {
    ev.enemyChanged = false; // 换场/复活延后到 finishWipe
    this.attempts += 1;
    const before = this.wave;
    const d = decideAfterWipe(before, this.kills);
    this.wave = d.nextWave;
    this.state.wave = this.wave;
    if (this.onSave) this.onSave();
    if (d.outcome === 'regress') {
      ev.result = 'regress';
      ev.regressFrom = before;
      lines.push(`◆ 一只怪也打不过，退回 ${stageLabel(this.wave)} 修炼`);
      this.pendingWipe = 'regress';
    } else {
      ev.result = 'retry';
      lines.push(`◆ 全员倒下，本关已击杀 ${this.kills} 只，原地再战 ${stageLabel(this.wave)}`);
      this.pendingWipe = 'retry';
    }
    this.phase = 'wiping';
    this.pauseTicks = WIPE_PAUSE_TICKS;
  }

  /** 停留结束：留关只复活我方（已杀的怪不复活、残血保留）；退关完整重开 */
  private finishWipe(ev: BattleEvent): void {
    if (this.pendingWipe === 'regress') {
      this.kills = 0;
      this.respawn(); // 换关：新敌人 + 双方满血
      ev.enemyChanged = true;
    } else {
      this.reviveAllies(); // 留关：不清击杀数、不复活怪，只让我方满血复活继续打
      ev.enemyChanged = false;
    }
    this.pendingWipe = null;
    this.phase = 'ally';
    this.cursor = 0;
  }

  /**
   * 一步演出：只发生一次攻击（我方一人出手 或 敌方一只反击），公开供模拟器驱动。
   * 全清/团灭后进入停留画面（result='pause'），倒计时结束才换场。
   */
  tick(): BattleEvent {
    const lines: string[] = [];
    const ev: BattleEvent = {
      ratio: this.enemyRatio(), attackerId: null, targetId: null,
      result: 'fight', wave: this.wave, stageName: this.stage.name,
      kills: this.kills, enemyCount: this.enemies.length,
    };

    // —— 0. 停留画面：展示全灭/全倒，倒计时结束后换场（用户要求能看清结果）——
    if (this.phase === 'clearing') {
      this.pauseTicks -= 1;
      ev.result = 'pause';
      if (this.pauseTicks <= 0) this.finishClear(ev, lines);
      this.emit(ev, lines);
      return ev;
    }
    if (this.phase === 'wiping') {
      this.pauseTicks -= 1;
      ev.result = 'pause';
      if (this.pauseTicks <= 0) this.finishWipe(ev);
      this.emit(ev, lines);
      return ev;
    }

    if (this.phase === 'ally') {
      // —— 1. 我方 cursor 位单位出手一刀（逐个轮流，跳过已倒下的）——
      const actor = this.nextAlive(this.allies, this.cursor);
      if (!actor) {
        this.beginWipe(ev, lines); // 兜底：无人可出手视为团灭
      } else {
        this.cursor = actor.index + 1;
        const target = this.enemies.find((e) => !e.dead);
        if (!target) {
          this.beginClear(ev, lines); // 兜底：敌已全灭
        } else {
          ev.attackerId = actor.unit.id;
          ev.attackerSide = 'ally';
          ev.targetId = target.id;
          const dmg = Math.max(1, Math.floor(actor.unit.atk * (0.9 + this.rng() * 0.2)));
          target.hp -= dmg;
          if (target.hp <= 0) {
            target.hp = 0;
            target.dead = true;
            this.kills += 1;
            const r = killReward(target.maxHp, this.wave, target.def ? target.def.tier : 1, this.rng());
            this.state.gold += r.gold;
            this.state.cores = (this.state.cores || 0) + r.cores;
            lines.push(`◆ 击杀 ${target.name}！+${r.gold} 灵气${r.cores ? ` · +${r.cores} 灵核` : ''}`);
            if (this.onSave) this.onSave(); // 每只击杀即时落盘
          } else {
            lines.push(`${actor.unit.name} 攻击 ${target.name} · ${dmg} 伤害（剩 ${target.hp}）`);
          }
          // 全灭判定：波次即时 +1，画面停留后再换场
          if (this.enemies.every((e) => e.dead)) this.beginClear(ev, lines);
          else { this.phase = 'enemy'; this.cursor = 0; } // 轮到敌方反击
        }
      }
    } else {
      // —— 2. 敌方 cursor 位怪反击一次（逐只轮流，跳过已击败的）——
      const actor = this.nextAlive(this.enemies, this.cursor);
      if (!actor) {
        // 敌方无人可反击：回合交回我方；若我方也全倒则团灭
        if (this.allies.every((a) => a.dead)) this.beginWipe(ev, lines);
        else { this.phase = 'ally'; this.cursor = 0; }
      } else {
        this.cursor = actor.index + 1;
        ev.attackerId = actor.unit.id;
        ev.attackerSide = 'enemy';
        ev.attackerIndex = actor.index;
        const alive = this.allies.filter((a) => !a.dead);
        if (alive.length) {
          const target = alive[Math.floor(this.rng() * alive.length)];
          ev.targetId = target.id;
          const dmg = Math.max(1, Math.floor(actor.unit.atk * (0.9 + this.rng() * 0.2)));
          target.hp -= dmg;
          if (target.hp <= 0) {
            target.hp = 0;
            target.dead = true;
            lines.push(`${actor.unit.name} 反击 ${target.name} · ${dmg} 伤害，${target.name} 倒下`);
          } else {
            lines.push(`${actor.unit.name} 反击 ${target.name} · ${dmg} 伤害（剩 ${target.hp}）`);
          }
        }
        // 团灭判定：波次即时落盘，画面停留后再换场
        if (this.allies.every((a) => a.dead)) this.beginWipe(ev, lines);
        else this.phase = 'ally'; // 轮到我方下一位出手（cursor 延续）
      }
    }

    this.emit(ev, lines);
    return ev;
  }

  /** 统一回填派生字段并广播日志 */
  private emit(ev: BattleEvent, lines: string[]): void {
    ev.kills = this.kills;
    ev.wave = this.wave;
    ev.stageName = this.stage.name;
    ev.enemyCount = this.enemies.length;
    ev.ratio = this.enemyRatio();
    for (const l of lines) this.onLog(l);
  }

  /** 从 from 起循环查找下一个存活单位（供步进制轮流出手） */
  private nextAlive(units: Unit[], from: number): { unit: Unit; index: number } | null {
    for (let i = 0; i < units.length; i++) {
      const idx = (from + i) % units.length;
      if (!units[idx].dead) return { unit: units[idx], index: idx };
    }
    return null;
  }

  start(onTick?: (ev: BattleEvent) => void): void {
    if (this.timer) return;
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
