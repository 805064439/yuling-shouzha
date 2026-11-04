// 商店页（代码驱动 UI）
// 对应原 src/main.js 的 renderShop / 各购买按钮。

import { Node } from 'cc';
import type { GameManager } from '../GameManager';
import { GAME_CONFIG } from '../../logic/GameConfig';
import {
  claimDaily,
  buyTicket,
  watchAd,
  buySpirit,
  buyCore,
  buyFreeTest,
  todayStr,
} from '../../logic/Gacha';
import { SPIRITS } from '../../logic/Spirits';
import { makeLabel, makeButton, makePanel, flowV, COLORS } from '../widgets';

export function buildShop(root: Node, gm: GameManager): void {
  root.removeAllChildren();
  const s = gm.state;
  const sh = GAME_CONFIG.shop;

  const title = makeLabel(root, '商店', { fontSize: 40, color: COLORS.text });
  title.setPosition(0, 600, 0);

  const info = makeLabel(root, `灵气 ${Math.floor(s.gold)}　灵核 ${s.cores}　券 ${s.tickets}`, {
    fontSize: 24, color: COLORS.sub,
  });
  info.setPosition(0, 545, 0);

  const mkRow = (label: string, cb: () => boolean, bg = COLORS.btn) => {
    const b = makeButton(root, label, () => {
      const ok = cb();
      if (ok) {
        gm.save();
        buildShop(root, gm);
      } else gm.toast('条件不满足');
    }, { w: 620, h: 70, bg });
    return b;
  };

  const rows: Node[] = [];
  rows.push(
    mkRow(
      s.lastDaily === todayStr() ? '每日免费券（今日已领）' : `领取每日免费券 ×${sh.dailyFreeTicket}`,
      () => claimDaily(s),
      s.lastDaily === todayStr() ? COLORS.btn : COLORS.btnPrimary,
    ),
  );
  rows.push(mkRow(`购买召唤券 ×1（${sh.ticketPrice}灵气）`, () => buyTicket(s, 1)));
  rows.push(mkRow(`购买召唤券 ×10（${sh.ticketPack10}灵气）`, () => buyTicket(s, 10)));
  rows.push(
    mkRow(
      (Date.now() - (s.lastAd || 0) < sh.adCooldownMin * 60000)
        ? `看广告（+${sh.adReward}灵气，冷却中）`
        : `看广告（+${sh.adReward}灵气）`,
      () => watchAd(s),
      COLORS.btnWarn,
    ),
  );
  for (const p of sh.corePacks) {
    rows.push(mkRow(`购买灵核 ×${p.n}（${p.price}灵气）`, () => buyCore(s, p.n)));
  }
  rows.push(mkRow(`直接购买 花灵（${sh.directBuy.R}灵气）`, () => buySpirit(s, 'hua')));
  rows.push(mkRow(`直接购买 萤火灵（${sh.directBuy.SR}灵气）`, () => buySpirit(s, 'ying')));
  rows.push(mkRow(`领取测试灵气 ×${sh.freeTestGold}`, () => buyFreeTest(s), COLORS.btnWarn));

  flowV(root, rows, 460, 12);

  makeButton(root, '返回主页', () => gm.go('home'), { w: 300, h: 70 }).setPosition(0, -600, 0);
}
