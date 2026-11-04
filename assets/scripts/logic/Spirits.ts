// 精怪图鉴数据 + 数值/立绘路径工具（纯数据，零引擎依赖）
// 原 src/config.js 的 SPIRITS / spiritStats / spiritImgHtml 迁移而来。
// 关键变化：立绘从 DOM <img> 改为 Cocos resources 动态加载，故提供 spiritResPath 返回资源路径。

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export interface Spirit {
  id: string;
  name: string;
  rarity: Rarity;
  atk: number;
  hp: number;
  icon: string; // emoji 兜底
  color: string; // 主题色（卡片描边 / 抽卡高亮）
  desc: string;
}

export interface Prog {
  star: number;
  evo: number; // 0=初生 / 1=觉醒 / 2=真灵
}

// 立绘文件名约定：<id>.png(初生) / <id>1.png(觉醒) / <id>2.png(真灵)
// lu3 的觉醒/真灵分别为 lu31 / lu32，也满足 "<id>+数字" 规则，故通用处理即可。
export const SPIRITS: Spirit[] = [
  { id: 'cao',  name: '草灵',   rarity: 'N',  atk: 6,  hp: 30,  icon: '🌿', color: '#7ec850', desc: '最寻常的灵草化形，亲切又活泼。' },
  { id: 'lu',   name: '露珠精', rarity: 'N',  atk: 5,  hp: 28,  icon: '💧', color: '#5fb6e6', desc: '凝结晨露的小精怪，怕热。' },
  { id: 'ye',   name: '叶灵',   rarity: 'R',  atk: 12, hp: 55,  icon: '🍃', color: '#5fae57', desc: '随风起舞的叶之精灵。' },
  { id: 'hua',  name: '花灵',   rarity: 'R',  atk: 14, hp: 50,  icon: '🌸', color: '#e88bb0', desc: '汲取花蜜而生的灵。' },
  { id: 'rong', name: '绒灵',   rarity: 'R',  atk: 10, hp: 62,  icon: '🐑', color: '#d9c27a', desc: '毛茸茸的治愈系精怪。' },
  { id: 'ying', name: '萤火灵', rarity: 'SR', atk: 22, hp: 90,  icon: '✨', color: '#f2d65b', desc: '提着灯笼巡夜的光之灵。' },
  { id: 'tai',  name: '苔灵',   rarity: 'SR', atk: 20, hp: 105, icon: '🍄', color: '#4f9d7a', desc: '生于幽谷的沉稳精怪。' },
  { id: 'luling', name: '露灵', rarity: 'SR', atk: 24, hp: 88,  icon: '🌟', color: '#6fb6c9', desc: '承载星辉的露之灵。' },
  { id: 'shou', name: '守脉灵', rarity: 'SSR', atk: 40, hp: 160, icon: '🔮', color: '#9b6fe0', desc: '镇守灵脉的古灵，威严而温柔。' },
  { id: 'lu3',  name: '月华灵鹿', rarity: 'SSR', atk: 46, hp: 150, icon: '🦌', color: '#7f8fe0', desc: '踏月而来的灵鹿，祥瑞之兆。' },
];

export const SPIRIT_BY_ID: Record<string, Spirit> = Object.fromEntries(
  SPIRITS.map((s) => [s.id, s]),
);

export function getSpiritById(id: string): Spirit | undefined {
  return SPIRIT_BY_ID[id];
}

// 精灵当前战力（基础 atk/hp × 升星 × 进化 倍率）
export function spiritStats(s: Spirit, prog?: Prog) {
  const star = (prog && prog.star) || 1;
  const evo = (prog && prog.evo) || 0;
  const mult = (1 + 0.15 * (star - 1)) * Math.pow(1.8, evo);
  return {
    atk: Math.round(s.atk * mult),
    hp: Math.round(s.hp * mult),
  };
}

// 立绘资源路径（Cocos resources 目录内，不含扩展名，cc.resources.load 自动匹配）。
// evo 缺省按初生。同时返回带版本号的 URL 友好查询串，供 UI 层按需破缓存。
export function spiritResPath(s: Spirit, evo: number = 0): string {
  const stage = evo >= 2 ? '2' : evo >= 1 ? '1' : '';
  return `spirits/${s.id}${stage}`;
}
