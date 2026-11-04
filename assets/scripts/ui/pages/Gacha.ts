// 召唤（抽卡）页（代码驱动 UI）
// 对应原 src/gacha.js 的 renderGacha / doSummon / drawAll。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { GAME_CONFIG, RARITY_COLOR as RC } from '../../logic/GameConfig';
import { doSummon, drawAll, canSummon, ensure } from '../../logic/Gacha';
import { SPIRIT_BY_ID, spiritResPath } from '../../logic/Spirits';
import { makeLabel, makeButton, makePanel, makeSpirit, flowH, COLORS } from '../widgets';

function renderResult(rowParent: Node, ids: string[]): void {
  // 清空旧的展示（保留按钮区由 buildGacha 控制，这里只重建结果区）
  const old = rowParent.getChildByName('__result');
  if (old) old.destroy();
  const wrap = makePanel(rowParent, { w: 700, h: 220, bg: COLORS.panel });
  wrap.name = '__result';
  wrap.setPosition(0, 120, 0);
  if (ids.length === 0) {
    makeLabel(wrap, '点击上方按钮开始召唤', { fontSize: 24, color: COLORS.sub }).setPosition(0, 0, 0);
    return;
  }
  const cards: Node[] = ids.map((id) => {
    const s = SPIRIT_BY_ID[id];
    const c = makePanel(wrap, { w: 110, h: 150, bg: COLORS.bg });
    makeSpirit(c, spiritResPath(s, 0), 90, s ? s.icon : '❓').setPosition(0, 30, 0);
    if (s) makeLabel(c, s.name, { fontSize: 18, color: RC[s.rarity] }).setPosition(0, -50, 0);
    return c;
  });
  flowH(wrap, cards, 0, 12);
}

export function buildGacha(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  ensure(gm.state);
  const s = gm.state;
  const g = GAME_CONFIG.gacha;

  const title = makeLabel(root, '召唤精怪', { fontSize: 40, color: COLORS.text });
  title.setPosition(0, 600, 0);
  const info = makeLabel(
    root,
    `灵气 ${Math.floor(s.gold)}　召唤券 ${s.tickets}　距SSR保底 ${g.softPityAt - s.sinceSSR}`,
    { fontSize: 24, color: COLORS.sub, wrapWidth: 680 },
  );
  info.setPosition(0, 540, 0);
  info.name = '__info';

  const resultWrap = makePanel(root, { w: 700, h: 220, bg: COLORS.panel });
  resultWrap.setPosition(0, 120, 0);
  resultWrap.name = '__result';
  makeLabel(resultWrap, '点击上方按钮开始召唤', { fontSize: 24, color: COLORS.sub }).setPosition(0, 0, 0);

  const doDraw = (count: number) => {
    const res = doSummon(s, count);
    if (!res) {
      gm.toast('灵气或召唤券不足');
      return;
    }
    gm.save();
    renderResult(resultWrap, res.results.map((x) => x.id));
    const best = res.results.reduce(
      (a, b) => ((b.rarity === 'SSR' || (b.rarity === 'SR' && a !== 'SSR')) ? b.rarity : a),
      'N',
    );
    gm.toast(`召唤完成 · 最高 ${best} · 返还 ${res.refund} 灵气`);
    // 刷新顶部数值
    const i2 = root.getChildByName('__info');
    if (i2) {
      const lab = i2.getComponent('cc.Label') as any;
      if (lab) {
        lab.string = `灵气 ${Math.floor(s.gold)}　召唤券 ${s.tickets}　距SSR保底 ${g.softPityAt - s.sinceSSR}`;
      }
    }
  };

  const b1 = makeButton(root, `单抽 (${g.singleCost}灵气/券)`, () => doDraw(1), {
    w: 320, h: 76, bg: COLORS.btnPrimary,
  });
  b1.setPosition(-180, 430, 0);
  const b2 = makeButton(root, `十连 (${g.tenCost}灵气/券)`, () => doDraw(10), {
    w: 320, h: 76, bg: COLORS.btnPrimary,
  });
  b2.setPosition(180, 430, 0);

  const b3 = makeButton(root, '抽光（仅灵气）', () => {
    const r = drawAll(s);
    if (r.results.length === 0) {
      gm.toast('灵气不足以抽一次');
      return;
    }
    gm.save();
    renderResult(resultWrap, r.results.map((x) => x.id));
    gm.toast(`抽了 ${r.results.length} 次 · 返还 ${r.refund} 灵气`);
    const i2 = root.getChildByName('__info');
    if (i2) {
      const lab = i2.getComponent('cc.Label') as any;
      if (lab) lab.string = `灵气 ${Math.floor(s.gold)}　召唤券 ${s.tickets}　距SSR保底 ${g.softPityAt - s.sinceSSR}`;
    }
  }, { w: 320, h: 70, bg: COLORS.btn });
  b3.setPosition(0, 340, 0);

  makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -600, 0);
}
