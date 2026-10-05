const TUTORIAL_LAYOUT = Object.freeze([
  '###########',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '#.#.#.#.#.#',
  '#.........#',
  '###########',
]);

const toTarget = (x, y, color) => ({ x, y, kind: 'color', id: `${color}_1`, color, completed: false });
const colors = [toTarget(3, 5, 'red'), toTarget(5, 1, 'orange'), toTarget(7, 1, 'yellow')];
const items = [
  { x: 3, y: 3, kind: 'nne', id: 'nne_1' },
  { x: 7, y: 3, kind: 'coo', id: 'coo_1' },
];
const solutionPath = [
  'down', 'down', 'down', 'down',
  'right', 'right',
  'up', 'up',
  'right', 'right', 'right', 'right',
  'left', 'left', 'up', 'up',
  'right', 'right',
  'left', 'left', 'left', 'left',
  'down', 'down', 'down', 'down',
  'left', 'left', 'up', 'up',
];

const wallLayout = [...TUTORIAL_LAYOUT];
const mazeTemplate = {
  width: 11,
  height: 11,
  tiles: TUTORIAL_LAYOUT.map(row => [...row].map(cell => cell === '#' ? 'wall' : 'floor')),
  spawn: { x: 1, y: 1 },
  exit: { x: 1, y: 3 },
  colors: colors.map(target => ({ ...target })),
  items: items.map(item => ({ ...item })),
  solutionPath: [...solutionPath],
  sequenceTargetIds: colors.map(target => target.id),
  quality: { solutionLength: solutionPath.length, junctionCount: 0, deadEndCount: 0, sectorById: {}, sequencePathDistances: [], purpleExitDistances: {} },
};

/**
 * Stage 0 is a tutorial special case: fixed 11×11 map and a short red-orange-yellow sequence.
 * Formal Stages 1–100 keep their existing two-round, twelve-target setup.
 */
export const TUTORIAL_STAGE = {
  id: 'stage-0', stageId: 0, number: 0, name: 'Stage 0 · 教學', sizeTier: 0, difficulty: 0, seed: 0,
  mazeWidth: 11, mazeHeight: 11,
  start: { x: 1, y: 1 }, exit: { x: 1, y: 3 },
  wallLayout,
  colorTargets: { red: [{ x: 3, y: 5, id: 'red_1', color: 'red', completed: false }], orange: [{ x: 5, y: 1, id: 'orange_1', color: 'orange', completed: false }], yellow: [{ x: 7, y: 1, id: 'yellow_1', color: 'yellow', completed: false }] },
  items: { nne: [items[0]], coo: [items[1]] },
  visionRange: 2, initialMemoryLevel: 3,
  itemEffects: { nneVisionBonus: 1, cooMemoryBonus: 2 },
  baseColorOrder: ['red', 'orange', 'yellow'], colorRounds: 1,
  colorCopies: { red: 1, orange: 1, yellow: 1 },
  nneCount: 1, cooCount: 1, earlyNneCount: 0, earlyCooCount: 0,
  minTargetPathDistance: 1, minSameColorPathDistance: 1, minFinalPurpleToExitPathDistance: 1, maxFinalPurpleToExitPathDistance: 1,
  mazeComplexity: 0, branchDensity: 0, minimumJunctions: 0,
  maxVisionRange: 3, maxMemoryLevel: 5,
  background: { image: '', opacity: 0.4, completedOpacity: 0.6, revealRows: 1, revealColumns: 3, revealOrder: [0, 1, 2] },
  isTutorial: true, generatedMaze: false, solverResult: { status: 'SCRIPTED', solutionLength: solutionPath.length },
  solutionPath: [...solutionPath], mazeTemplate,
};
