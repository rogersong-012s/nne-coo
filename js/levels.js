const BASE_COLOR_ORDER = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);

const LEVEL_SPECS = [
  { name: 'Level 1 · 入門環廊', seed: 20261001, mazeWidth: 11, mazeHeight: 11, start: { x: 1, y: 1 }, mazeComplexity: 0.14, branchDensity: 0.30, minimumJunctions: 22, minTargetPathDistance: 3, minSameColorPathDistance: 7, nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [5, 2, 9, 7, 0, 11, 3, 8, 1, 10, 6, 4] } },
  { name: 'Level 2 · 雙岔走廊', seed: 20268920, mazeWidth: 13, mazeHeight: 13, start: { x: 11, y: 1 }, mazeComplexity: 0.28, branchDensity: 0.27, minimumJunctions: 30, minTargetPathDistance: 3, minSameColorPathDistance: 7, nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [6, 1, 10, 4, 8, 3, 11, 0, 5, 9, 2, 7] } },
  { name: 'Level 3 · 長廊回環', seed: 20604524, mazeWidth: 15, mazeHeight: 15, start: { x: 1, y: 13 }, mazeComplexity: 0.39, branchDensity: 0.20, minimumJunctions: 24, minTargetPathDistance: 3, minSameColorPathDistance: 8, nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [2, 9, 4, 11, 6, 0, 8, 3, 10, 5, 1, 7] } },
  { name: 'Level 4 · 交錯路網', seed: 20284758, mazeWidth: 17, mazeHeight: 17, start: { x: 15, y: 15 }, mazeComplexity: 0.48, branchDensity: 0.15, minimumJunctions: 30, minTargetPathDistance: 4, minSameColorPathDistance: 8, nneCount: 4, cooCount: 4, earlyNneCount: 1, earlyCooCount: 0, earlyResourceMaxDistance: 5, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [7, 0, 10, 3, 8, 1, 5, 11, 2, 9, 4, 6] } },
  { name: 'Level 5 · 深層折返', seed: 20292677, mazeWidth: 17, mazeHeight: 17, start: { x: 1, y: 7 }, mazeComplexity: 0.56, branchDensity: 0.14, minimumJunctions: 24, minTargetPathDistance: 4, minSameColorPathDistance: 9, nneCount: 4, cooCount: 4, earlyNneCount: 0, earlyCooCount: 1, earlyResourceMaxDistance: 5, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [4, 11, 1, 8, 5, 2, 10, 0, 7, 3, 9, 6] } },
  { name: 'Level 6 · 盲區迷宮', seed: 20431670, mazeWidth: 19, mazeHeight: 19, start: { x: 17, y: 9 }, mazeComplexity: 0.63, branchDensity: 0.17, minimumJunctions: 42, minTargetPathDistance: 4, minSameColorPathDistance: 9, nneCount: 4, cooCount: 4, earlyNneCount: 1, earlyCooCount: 0, earlyResourceMaxDistance: 6, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [9, 3, 6, 0, 11, 4, 8, 1, 10, 5, 2, 7] } },
  { name: 'Level 7 · 記憶斷層', seed: 20570663, mazeWidth: 21, mazeHeight: 21, start: { x: 7, y: 19 }, mazeComplexity: 0.69, branchDensity: 0.16, minimumJunctions: 48, minTargetPathDistance: 4, minSameColorPathDistance: 10, nneCount: 4, cooCount: 4, earlyNneCount: 1, earlyCooCount: 1, earlyResourceMaxDistance: 6, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [1, 8, 5, 10, 2, 7, 0, 11, 4, 9, 3, 6] } },
  { name: 'Level 8 · 紫色遠端', seed: 20381971, mazeWidth: 21, mazeHeight: 21, start: { x: 13, y: 1 }, mazeComplexity: 0.75, branchDensity: 0.17, minimumJunctions: 32, minTargetPathDistance: 5, minSameColorPathDistance: 10, nneCount: 5, cooCount: 5, earlyNneCount: 1, earlyCooCount: 1, earlyResourceMaxDistance: 6, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [10, 4, 0, 7, 3, 9, 1, 6, 11, 2, 8, 5] } },
  { name: 'Level 9 · 外環遺跡', seed: 20586501, mazeWidth: 23, mazeHeight: 23, start: { x: 5, y: 21 }, mazeComplexity: 0.81, branchDensity: 0.18, minimumJunctions: 48, minTargetPathDistance: 5, minSameColorPathDistance: 11, nneCount: 5, cooCount: 5, earlyNneCount: 2, earlyCooCount: 1, earlyResourceMaxDistance: 8, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [8, 2, 11, 5, 0, 9, 3, 7, 1, 10, 4, 6] } },
  { name: 'Level 10 · 遺忘核心', seed: 20397809, mazeWidth: 25, mazeHeight: 25, start: { x: 23, y: 13 }, mazeComplexity: 0.86, branchDensity: 0.19, minimumJunctions: 60, minTargetPathDistance: 5, minSameColorPathDistance: 12, nneCount: 6, cooCount: 6, earlyNneCount: 2, earlyCooCount: 1, earlyResourceMaxDistance: 8, background: { image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6, revealRows: 3, revealColumns: 4, revealOrder: [3, 10, 6, 1, 9, 4, 11, 2, 7, 0, 5, 8] } },
];

export const LEVELS = LEVEL_SPECS.map((spec, index) => ({
  ...spec,
  id: `level-${index + 1}`,
  number: index + 1,
  start: { ...(spec.start ?? { x: 1, y: 1 }) },
  visionRange: spec.visionRange ?? 2,
  initialMemoryLevel: spec.initialMemoryLevel ?? 3,
  itemEffects: {
    nneVisionBonus: spec.itemEffects?.nneVisionBonus ?? 1,
    cooMemoryBonus: spec.itemEffects?.cooMemoryBonus ?? 2,
  },
  baseColorOrder: [...BASE_COLOR_ORDER],
  colorRounds: 2,
  colorCopies: Object.fromEntries(BASE_COLOR_ORDER.map(color => [color, 2])),
  generatedMaze: true,
  exitStrategy: 'farthest',
  maxVisionRange: spec.maxVisionRange ?? (spec.visionRange ?? 2) + spec.nneCount * (spec.itemEffects?.nneVisionBonus ?? 1),
  maxMemoryLevel: spec.maxMemoryLevel ?? (spec.initialMemoryLevel ?? 3) + spec.cooCount * (spec.itemEffects?.cooMemoryBonus ?? 2),
}));

for (const level of LEVELS) {
  validateLevel(level);
  const maze = generateMaze(level);
  level.start = { ...maze.spawn };
  level.exit = { ...maze.exit };
  level.wallLayout = maze.tiles.map(row => row.map(tile => tile === 'wall' ? '#' : '.').join(''));
  level.colorTargets = Object.fromEntries(level.baseColorOrder.map(color => [
    color,
    maze.colors.filter(target => target.color === color).map(({ x, y, id }) => ({ x, y, id, color, completed: false })),
  ]));
  level.items = {
    nne: maze.items.filter(item => item.kind === 'nne').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'nne', earlyResource: Boolean(earlyResource) })),
    coo: maze.items.filter(item => item.kind === 'coo').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'coo', earlyResource: Boolean(earlyResource) })),
  };
  level.solutionPath = [...maze.solutionPath];
  level.mazeTemplate = maze;
}

export { getBackgroundPartCount, getColorConfig, validateLevel };
import { generateMaze } from './maze.js';
import { getBackgroundPartCount, getColorConfig, validateLevel } from './level-config.js';
