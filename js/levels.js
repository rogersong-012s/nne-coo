import { generateMaze, isWalkable, solveMaze, validateChoiceSafety, validateSolutionPath } from './maze.js';
import { getBackgroundPartCount, getColorConfig, validateLevel } from './level-config.js';

const BASE_COLOR_ORDER = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'purple']);
const STAGES_PER_TIER = 20;
const STAGE_COUNT = 100;
const SEED_BASE = 20261001;

// These dimensions are copied from the existing LV1–LV5 configs.
export const SIZE_TIERS = Object.freeze({
  1: Object.freeze({ mazeWidth: 11, mazeHeight: 11 }),
  2: Object.freeze({ mazeWidth: 13, mazeHeight: 13 }),
  3: Object.freeze({ mazeWidth: 15, mazeHeight: 15 }),
  4: Object.freeze({ mazeWidth: 17, mazeHeight: 17 }),
  5: Object.freeze({ mazeWidth: 17, mazeHeight: 17 }),
});

const TIER_FINISH_DISTANCE = Object.freeze([
  Object.freeze({ min: 5, max: 12 }),
  Object.freeze({ min: 7, max: 14 }),
  Object.freeze({ min: 9, max: 17 }),
  Object.freeze({ min: 11, max: 20 }),
  Object.freeze({ min: 14, max: 22 }),
]);

const TIER_DIFFICULTY = [
  { mazeComplexity: [0.14, 0.36], branchDensity: [0.20, 0.34], minimumJunctions: [22, 30], minTargetPathDistance: [3, 3], minSameColorPathDistance: [7, 7], nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0 },
  { mazeComplexity: [0.28, 0.50], branchDensity: [0.16, 0.33], minimumJunctions: [30, 42], minTargetPathDistance: [3, 4], minSameColorPathDistance: [7, 8], nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0 },
  { mazeComplexity: [0.39, 0.64], branchDensity: [0.14, 0.33], minimumJunctions: [24, 42], minTargetPathDistance: [3, 4], minSameColorPathDistance: [8, 9], nneCount: 3, cooCount: 3, earlyNneCount: 0, earlyCooCount: 0 },
  { mazeComplexity: [0.48, 0.76], branchDensity: [0.12, 0.32], minimumJunctions: [30, 52], minTargetPathDistance: [4, 5], minSameColorPathDistance: [8, 9], nneCount: 4, cooCount: 4, earlyNneCount: 1, earlyCooCount: 0, earlyResourceMaxDistance: 5 },
  { mazeComplexity: [0.56, 0.90], branchDensity: [0.12, 0.34], minimumJunctions: [32, 54], minTargetPathDistance: [4, 5], minSameColorPathDistance: [9, 10], nneCount: 4, cooCount: 4, earlyNneCount: 0, earlyCooCount: 1, earlyResourceMaxDistance: 5 },
];

const lerp = ([start, end], progress) => start + (end - start) * progress;
const lerpInt = (range, progress) => Math.round(lerp(range, progress));

function makeRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeStart(sizeTier, withinTier) {
  const { mazeWidth, mazeHeight } = SIZE_TIERS[sizeTier];
  const rooms = [];
  for (let y = 1; y < mazeHeight - 1; y += 2) {
    for (let x = 1; x < mazeWidth - 1; x += 2) rooms.push({ x, y });
  }
  // The stride is coprime with each tier's room count, varying starts throughout a tier.
  return { ...rooms[(withinTier * 13 + sizeTier * 7) % rooms.length] };
}

function makeBackground(seed) {
  const revealOrder = Array.from({ length: 12 }, (_, index) => index);
  const random = makeRandom(seed ^ 0x51ed270b);
  for (let index = revealOrder.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [revealOrder[index], revealOrder[swapIndex]] = [revealOrder[swapIndex], revealOrder[index]];
  }
  return {
    image: 'assets/background/level_x.png', opacity: 0.4, completedOpacity: 0.6,
    revealRows: 3, revealColumns: 4, revealOrder,
  };
}

function makeStage(stageId) {
  const sizeTier = Math.ceil(stageId / STAGES_PER_TIER);
  const withinTier = (stageId - 1) % STAGES_PER_TIER;
  const progress = withinTier / (STAGES_PER_TIER - 1);
  const tier = TIER_DIFFICULTY[sizeTier - 1];
  const dimensions = SIZE_TIERS[sizeTier];
  const finishDistance = TIER_FINISH_DISTANCE[sizeTier - 1];
  const seed = SEED_BASE + stageId * 104729;
  return {
    id: `stage-${stageId}`,
    stageId,
    number: stageId,
    name: `Stage ${stageId}`,
    sizeTier,
    difficulty: Number(((stageId - 1) / (STAGE_COUNT - 1)).toFixed(3)),
    seed,
    ...dimensions,
    minFinalPurpleToExitPathDistance: finishDistance.min,
    maxFinalPurpleToExitPathDistance: finishDistance.max,
    start: makeStart(sizeTier, withinTier),
    mazeComplexity: Number(lerp(tier.mazeComplexity, progress).toFixed(3)),
    branchDensity: Number(lerp(tier.branchDensity, progress).toFixed(3)),
    minimumJunctions: lerpInt(tier.minimumJunctions, progress),
    minTargetPathDistance: lerpInt(tier.minTargetPathDistance, progress),
    minSameColorPathDistance: lerpInt(tier.minSameColorPathDistance, progress),
    nneCount: tier.nneCount,
    cooCount: tier.cooCount,
    earlyNneCount: tier.earlyNneCount,
    earlyCooCount: tier.earlyCooCount,
    ...(tier.earlyResourceMaxDistance ? { earlyResourceMaxDistance: tier.earlyResourceMaxDistance } : {}),
    visionRange: 2,
    initialMemoryLevel: 3,
    itemEffects: { nneVisionBonus: 1, cooMemoryBonus: 2 },
    baseColorOrder: [...BASE_COLOR_ORDER],
    colorRounds: 2,
    colorCopies: Object.fromEntries(BASE_COLOR_ORDER.map(color => [color, 2])),
    choiceSafeValidation: true,
    generatedMaze: true,
    exitStrategy: 'balanced-finishing-walk',
    background: makeBackground(seed),
    maxVisionRange: 2 + tier.nneCount,
    maxMemoryLevel: 3 + tier.cooCount * 2,
  };
}

export const STAGES = Array.from({ length: STAGE_COUNT }, (_, index) => makeStage(index + 1));
// Retain the old data export for tools that imported it; the player-facing campaign is Stage-based.
export const LEVELS = STAGES;

export function prepareStage(stageOrId) {
  const stage = typeof stageOrId === 'number' ? STAGES[stageOrId - 1] : stageOrId;
  if (!stage) throw new RangeError(`找不到 Stage ${stageOrId}。`);
  if (stage.mazeTemplate) return stage;
  validateLevel(stage);
  let maze;
  try { maze = generateMaze(stage); }
  catch (error) { throw new Error(`Stage ${stage.stageId} 無法生成：${error.message}`); }
  stage.start = { ...maze.spawn };
  stage.exit = { ...maze.exit };
  stage.wallLayout = maze.tiles.map(row => row.map(tile => tile === 'wall' ? '#' : '.').join(''));
  stage.colorTargets = Object.fromEntries(stage.baseColorOrder.map(color => [
    color,
    maze.colors.filter(target => target.color === color).map(({ x, y, id }) => ({ x, y, id, color, completed: false })),
  ]));
  stage.items = {
    nne: maze.items.filter(item => item.kind === 'nne').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'nne', earlyResource: Boolean(earlyResource) })),
    coo: maze.items.filter(item => item.kind === 'coo').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'coo', earlyResource: Boolean(earlyResource) })),
  };
  stage.solutionPath = [...maze.solutionPath];
  stage.solverResult = { status: 'VALID', solutionLength: maze.solutionPath.length };
  stage.choiceSafeResult = maze.quality.choiceSafety;
  stage.mazeTemplate = maze;
  return stage;
}

export function validateAllStages({ log = false } = {}) {
  const results = STAGES.map(stage => {
    const reasons = [];
    try { validateLevel(stage); } catch (error) { reasons.push(`INVALID CONFIG: ${error.message}`); }
    try { prepareStage(stage); } catch (error) { reasons.push(`GENERATION: ${error.message}`); }
    const maze = stage.mazeTemplate;
    const { baseColorOrder, colorSequence, colorCopies } = getColorConfig(stage);
    const solution = maze && solveMaze(maze, colorSequence);
    const solvable = Boolean(solution && validateSolutionPath(maze, solution, colorSequence));
    if (!solvable) reasons.push('UNSOLVABLE');
    const choiceSafety = maze ? validateChoiceSafety(maze, colorSequence, baseColorOrder) : null;
    if (!choiceSafety?.choiceSafe) reasons.push('CHOICE UNSAFE');
    const expectedSize = SIZE_TIERS[stage.sizeTier];
    const sizeTierCorrect = Boolean(expectedSize && stage.mazeWidth === expectedSize.mazeWidth && stage.mazeHeight === expectedSize.mazeHeight
      && stage.stageId > (stage.sizeTier - 1) * STAGES_PER_TIER && stage.stageId <= stage.sizeTier * STAGES_PER_TIER);
    if (!sizeTierCorrect) reasons.push('SIZE TIER MISMATCH');
    const difficultyMetrics = maze?.quality;
    const colorDistanceOk = Boolean(difficultyMetrics
      && difficultyMetrics.sequencePathDistances.length === colorSequence.length - 1
      && difficultyMetrics.sequencePathDistances.every(item => item.distance >= stage.minTargetPathDistance && item.junctions > 0)
      && baseColorOrder.every(color => {
        const copies = maze.colors.filter(target => target.color === color);
        return copies.length === colorCopies[color]
          && difficultyMetrics.colorPathDistances[`${copies[0]?.id} → ${copies[1]?.id}`] >= stage.minSameColorPathDistance;
      }));
    const earlyChokePlacementOk = stage.stageId > 20 || !difficultyMetrics?.colorMajorChokeIds?.length;
    const difficultyRangeOk = Boolean(difficultyMetrics && difficultyMetrics.junctionCount >= stage.minimumJunctions
      && colorDistanceOk && earlyChokePlacementOk);
    if (!difficultyRangeOk) reasons.push('DIFFICULTY RANGE INVALID');
    const purpleDistances = maze?.quality?.purpleExitDistances ?? {};
    const finalPurpleDistanceOk = Object.values(purpleDistances).length === 2
      && Object.values(purpleDistances).every(distance => distance >= stage.minFinalPurpleToExitPathDistance && distance <= stage.maxFinalPurpleToExitPathDistance);
    if (!finalPurpleDistanceOk) reasons.push('PURPLE EXIT DISTANCE OUT OF RANGE');
    const occupied = [maze?.spawn, maze?.exit, ...(maze?.colors ?? []), ...(maze?.items ?? [])].filter(Boolean);
    const objectDistributionOk = Boolean(maze && occupied.every(point => isWalkable(maze, point.x, point.y))
      && new Set(occupied.map(point => `${point.x},${point.y}`)).size === occupied.length
      && maze.colors.length === Object.values(colorCopies).reduce((sum, count) => sum + count, 0)
      && maze.items.filter(item => item.kind === 'nne').length === stage.nneCount
      && maze.items.filter(item => item.kind === 'coo').length === stage.cooCount
      && new Set(maze.items.map(item => maze.quality.sectorById[item.id])).size >= 5);
    if (!objectDistributionOk) reasons.push('OBJECT DISTRIBUTION INVALID');
    const averageTargetDistance = difficultyMetrics?.sequencePathDistances.length
      ? difficultyMetrics.sequencePathDistances.reduce((sum, item) => sum + item.distance, 0) / difficultyMetrics.sequencePathDistances.length : 0;
    const difficultyScore = difficultyMetrics ? Number((stage.difficulty * 30 + difficultyMetrics.junctionCount * 0.35
      + difficultyMetrics.deadEndCount * 0.4 + averageTargetDistance * 0.6 + difficultyMetrics.solutionLength * 0.015
      + stage.mazeComplexity * 10).toFixed(2)) : null;
    const valid = solvable && choiceSafety?.choiceSafe && sizeTierCorrect && difficultyRangeOk && finalPurpleDistanceOk && objectDistributionOk;
    const result = {
      stageId: stage.stageId,
      sizeTier: stage.sizeTier,
      status: valid ? 'VALID' : 'INVALID',
      valid,
      solvable,
      choiceSafe: Boolean(choiceSafety?.choiceSafe),
      testedChoiceBranches: choiceSafety?.testedChoiceBranches ?? 0,
      choicePlansConsidered: choiceSafety?.choicePlansConsidered ?? 64,
      choiceEdgesTested: choiceSafety?.choiceEdgesTested ?? 0,
      reachableChoiceEdges: choiceSafety?.reachableChoiceEdges ?? 0,
      unreachableChoiceEdges: choiceSafety?.unreachableChoiceEdges ?? 0,
      safeChoiceBranches: choiceSafety?.safeChoiceBranches ?? 0,
      reachableChoiceBranches: choiceSafety?.reachableChoiceBranches ?? 0,
      deadlockBranches: choiceSafety?.deadlockBranches ?? 0,
      sizeTierCorrect,
      difficultyRangeOk,
      difficultyScore,
      objectDistributionOk,
      finalPurpleDistanceOk,
      solutionLength: solution?.length ?? null,
      generationAttempt: maze?.generationAttempt ?? null,
      generationSeed: maze?.generationSeed ?? null,
      junctionCount: difficultyMetrics?.junctionCount ?? null,
      deadEndCount: difficultyMetrics?.deadEndCount ?? null,
      purpleExitDistances: purpleDistances,
      minRequiredDistance: stage.minFinalPurpleToExitPathDistance,
      deadlockChoiceBranches: choiceSafety?.deadlockChoiceBranches ?? [],
      reasons,
    };
    if (log) console.log(`Stage ${stage.stageId} · SOLVER: ${solvable ? 'PASS' : 'FAIL'} · CHOICE SAFE: ${result.choiceSafe ? 'PASS' : 'FAIL'} · BRANCHES: ${result.testedChoiceBranches}/${result.choicePlansConsidered} · CHOICE EDGES: ${result.reachableChoiceEdges} legal / ${result.unreachableChoiceEdges} unreachable · DEADLOCKS: ${result.deadlockBranches} · SIZE TIER: ${sizeTierCorrect ? 'PASS' : 'FAIL'} · DIFFICULTY: ${difficultyRangeOk ? 'PASS' : 'FAIL'} · OBJECTS: ${objectDistributionOk ? 'PASS' : 'FAIL'} · PURPLE → EXIT: ${finalPurpleDistanceOk ? 'PASS' : 'FAIL'} · OVERALL: ${valid ? 'VALID' : 'INVALID'}${reasons.length ? ` · ${reasons.join(', ')}` : ''}`);
    return result;
  });
  return results;
}

export { getBackgroundPartCount, getColorConfig, validateLevel };
