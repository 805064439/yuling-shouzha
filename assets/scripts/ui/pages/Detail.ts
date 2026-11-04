// 精灵详情 / 养成页（代码驱动 UI）
// 对应原 src/main.js 的详情弹窗：展示立绘、数值，执行升星 / 进化。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { SPIRIT_BY_ID, spiritStats, spiritResPath } from '../../logic/Spirits';
import { RARITY_COLOR, EVOLUTION } from '../../logic/GameConfig';
import { doStarUp, doEvolve, getProg } from '../../logic/Gacha';
import { STAR_COST } from '../../logic/GameConfig';
import { makeLabel, makeButton, makePanel, makeSpirit, makeSpiritStage, COLORS } from '../widgets';

export function buildDetail(root: Node, gm: GameManager, id: string, previewEvo?: number): void {
  root.removeAllChildren();
  const s = gm.state;
  const sp = SPIRIT_BY_ID[id];
  if (!sp) {
    gm.go('dex');
    return;
  }
  const prog = getProg(s, id);
  const st = spiritStats(sp, prog);
  const owned = (s.collection[id] || 0) > 0;
  const viewEvo = previewEvo ?? prog.evo; // 当前预览的形态（进页默认展示实际形态）

  const title = makeLabel(root, sp.name, { fontSize: 40, color: RARITY_COLOR[sp.rarity] });
  title.setPosition(0, 630, 0);
  const rarityLbl = makeLabel(root, `${sp.rarity} · ${EVOLUTION.stages[prog.evo]} ★${prog.star}`, {
    fontSize: 22, color: COLORS.sub,
  });
  rarityLbl.setPosition(0, 588, 0);

  // 立绘纸舞台（铁律：深底不放裸立绘）：宣纸底 + 稀有度主题色渐变衬
  // 大立绘版式：竖向 400×560 舞台，立绘外框 360×520（2:3 竖版立绘可铺满高度）
  const stage = makeSpiritStage(root, 400, 560, RARITY_COLOR[sp.rarity]);
  stage.setPosition(0, 280, 0);
  makeSpirit(stage, spiritResPath(sp, viewEvo), 360, sp.icon, 520).setPosition(0, 0, 0);

  // 三形态立绘切换页签：初生 / 觉醒 / 真灵，点谁看谁的立绘
  EVOLUTION.stages.forEach((name, e) => {
    makeButton(root, name, () => {
      if (e !== viewEvo) buildDetail(root, gm, id, e);
    }, { w: 118, h: 44, bg: e === viewEvo ? COLORS.btnPrimary : COLORS.btn, fontSize: 22 })
      .setPosition(-126 + e * 126, -50, 0);
  });

  const stats = makeLabel(
    root,
    `ATK ${st.atk}　HP ${st.hp}\n拥有 ×${s.collection[id] || 0}　灵核 ${s.cores}`,
    { fontSize: 26, color: COLORS.text, wrapWidth: 600 },
  );
  stats.setPosition(0, -115, 0);

  const desc = makePanel(root, { w: 660, h: 80, bg: COLORS.panel });
  desc.setPosition(0, -205, 0);
  makeLabel(desc, sp.desc, { fontSize: 22, color: COLORS.sub, wrapWidth: 620 }).setPosition(0, 0, 0);

  // 升星按钮
  const maxStar = EVOLUTION.maxStarByEvo[prog.evo];
  const starCost = STAR_COST[sp.rarity];
  const starNeed = 1 + starCost * prog.star;
  const canStar = owned && prog.star < maxStar && (s.collection[id] || 0) >= starNeed;
  const starBtn = makeButton(
    root,
    prog.star >= maxStar ? `已满星(${maxStar})` : `升星 (耗重复×${starNeed})`,
    () => {
      if (doStarUp(s, id)) {
        gm.save();
        gm.toast(`升星成功 → ★${getProg(s, id).star}`);
        buildDetail(root, gm, id);
      } else gm.toast('重复数量不足');
    },
    { w: 320, h: 76, bg: canStar ? COLORS.btnPrimary : COLORS.btn },
  );
  starBtn.setPosition(-180, -315, 0);

  // 进化按钮
  const canEvo = owned && prog.evo < 2 && prog.star >= maxStar;
  const ec = prog.evo < 2 ? EVOLUTION.evolveCost[prog.evo + 1] : null;
  const evoLabel = !canEvo
    ? prog.evo >= 2 ? '已达真灵' : `进化需满★${maxStar}`
    : `进化 (耗重复×${ec!.dup[sp.rarity]} + 灵核×${ec!.core})`;
  const evoBtn = makeButton(
    root,
    evoLabel,
    () => {
      if (doEvolve(s, id)) {
        gm.save();
        gm.toast(`进化成功 → ${EVOLUTION.stages[getProg(s, id).evo]}！`);
        buildDetail(root, gm, id);
      } else gm.toast('材料不足（重复卡/灵核）');
    },
    { w: 320, h: 76, bg: canEvo ? COLORS.btnPrimary : COLORS.btn },
  );
  evoBtn.setPosition(180, -315, 0);

  makeButton(root, '返回图鉴', () => gm.go('dex'), { w: 300, h: 70 }).setPosition(0, -600, 0);
}
