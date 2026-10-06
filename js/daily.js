import { SIZE_TIERS, STAGES, getColorConfig } from './levels.js';
import { allReachable, generateMaze, isWalkable, validateChoiceSafety, validateSolutionPath } from './maze.js';
import { validateLevel } from './level-config.js';

export const DAILY_TIME_ZONE = 'Asia/Taipei';
export const DAILY_GENERATOR_VERSION = 1;
export const DAILY_MAX_SEED_ATTEMPTS = 5000;
const SECONDS_PER_DAY = 86400;
const TAIPEI_OFFSET_SECONDS = 8 * 60 * 60;
const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: DAILY_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

let dailyCache = null;
let latestRequestedDate = '';
const dailyGenerations = new Map();

export function getTaipeiDateKey(timestampMs = Date.now()) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(new Date(timestampMs))
    .filter(part => part.type !== 'literal')
    .map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getTaipeiMidnightUnixSeconds(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey ?? '');
  if (!match) throw new RangeError(`Invalid Taipei date key: ${dateKey}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const utcMidnightMs = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcMidnightMs);
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() !== month - 1 || normalized.getUTCDate() !== day) {
    throw new RangeError(`Invalid Taipei date key: ${dateKey}`);
  }
  return Math.floor(utcMidnightMs / 1000) - TAIPEI_OFFSET_SECONDS;
}

export function getDailySizeTier(dateKey) {
  const baseSeed = getTaipeiMidnightUnixSeconds(dateKey);
  const dayIndex = Math.floor(baseSeed / SECONDS_PER_DAY);
  const tierOffset = ((dayIndex % 5) + 5) % 5;
  return tierOffset + 1;
}

function makeDailyLevel(dateKey, baseSeed, sizeTier, seed) {
  const firstStageIndex = (sizeTier - 1) * 20;
  const template = STAGES[firstStageIndex + 9];
  const level = { ...template };
  for (const field of ['mazeTemplate', 'wallLayout', 'exit', 'colorTargets', 'items', 'solutionPath', 'solverResult', 'choiceSafeResult']) {
    delete level[field];
  }
  Object.assign(level, {
    id: `daily-${dateKey}`,
    stageId: null,
    number: null,
    name: '每日一關',
    sizeTier,
    seed,
    start: { ...template.start },
    isTutorial: false,
    isDaily: true,
    avoidMajorColorChokes: sizeTier === 1,
    dailyMetadata: {
      dateKey,
      timezone: DAILY_TIME_ZONE,
      generatorVersion: DAILY_GENERATOR_VERSION,
      baseSeed,
      finalSeed: seed,
      attempt: seed - baseSeed,
      sizeTier,
      mazeWidth: SIZE_TIERS[sizeTier].mazeWidth,
      mazeHeight: SIZE_TIERS[sizeTier].mazeHeight,
      validationPassed: false,
    },
    baseColorOrder: [...template.baseColorOrder],
    colorCopies: { ...template.colorCopies },
    itemEffects: { ...template.itemEffects },
    background: { ...template.background, image: 'assets/background/level_x.png', revealOrder: [...template.background.revealOrder] },
  });
  return level;
}

export function validateDailyCandidate(level, maze) {
  validateLevel(level);
  const { baseColorOrder, colorSequence, colorCopies, targetCount } = getColorConfig(level);
  if (!allReachable(maze)) throw new Error('MAZE NOT FULLY CONNECTED');
  if (!validateSolutionPath(maze, maze.solutionPath, colorSequence)) throw new Error('SOLVER PATH INVALID');

  const choiceSafety = maze.quality?.choiceSafety ?? validateChoiceSafety(maze, colorSequence, baseColorOrder);
  if (!choiceSafety.choiceSafe || choiceSafety.deadlockBranches !== 0
    || choiceSafety.safeChoiceBranches !== choiceSafety.reachableChoiceBranches) {
    throw new Error(`CHOICE SAFETY FAILED: ${choiceSafety.deadlockBranches} deadlock branches`);
  }

  const quality = maze.quality;
  if (!quality || quality.sequencePathDistances.length !== colorSequence.length - 1
    || quality.sequencePathDistances.some(item => item.distance < level.minTargetPathDistance || item.junctions <= 0)) {
    throw new Error('COLOR TARGET DISTANCES INVALID');
  }
  for (const color of baseColorOrder) {
    const copies = maze.colors.filter(target => target.color === color);
    if (copies.length !== colorCopies[color]
      || quality.colorPathDistances[`${copies[0]?.id} → ${copies[1]?.id}`] < level.minSameColorPathDistance) {
      throw new Error(`${color.toUpperCase()} PLACEMENT INVALID`);
    }
  }
  if (level.avoidMajorColorChokes && quality.colorMajorChokeIds.length) throw new Error('COLOR TARGET ON A MAJOR CHOKE');

  const purpleDistances = Object.values(quality.purpleExitDistances ?? {});
  if (purpleDistances.length !== colorCopies.purple
    || purpleDistances.some(distance => distance < level.minFinalPurpleToExitPathDistance
      || distance > level.maxFinalPurpleToExitPathDistance)) {
    throw new Error('PURPLE TO EXIT DISTANCE INVALID');
  }

  const occupied = [maze.spawn, maze.exit, ...maze.colors, ...maze.items];
  if (!occupied.every(point => isWalkable(maze, point.x, point.y))
    || new Set(occupied.map(point => `${point.x},${point.y}`)).size !== occupied.length
    || maze.colors.length !== targetCount
    || maze.items.filter(item => item.kind === 'nne').length !== level.nneCount
    || maze.items.filter(item => item.kind === 'coo').length !== level.cooCount
    || new Set(maze.items.map(item => quality.sectorById[item.id])).size < 5) {
    throw new Error('OBJECT PLACEMENT INVALID');
  }
  return { choiceSafety };
}

async function yieldToBrowser() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

export async function generateDailyChallenge(dateKey, onProgress = () => {}) {
  const baseSeed = getTaipeiMidnightUnixSeconds(dateKey);
  const sizeTier = getDailySizeTier(dateKey);
  let lastError = null;

  for (let attempt = 0; attempt < DAILY_MAX_SEED_ATTEMPTS; attempt++) {
    await yieldToBrowser();
    const seed = baseSeed + attempt;
    const level = makeDailyLevel(dateKey, baseSeed, sizeTier, seed);
    try {
      const maze = generateMaze(level, { maxAttempts: 1, seedIncrement: 1 });
      const { choiceSafety } = validateDailyCandidate(level, maze);
      level.start = { ...maze.spawn };
      level.exit = { ...maze.exit };
      level.wallLayout = maze.tiles.map(row => row.map(tile => tile === 'wall' ? '#' : '.').join(''));
      level.colorTargets = Object.fromEntries(level.baseColorOrder.map(color => [color,
        maze.colors.filter(target => target.color === color).map(({ x, y, id }) => ({ x, y, id, color, completed: false }))]));
      level.items = {
        nne: maze.items.filter(item => item.kind === 'nne').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'nne', earlyResource: Boolean(earlyResource) })),
        coo: maze.items.filter(item => item.kind === 'coo').map(({ x, y, id, earlyResource }) => ({ x, y, id, kind: 'coo', earlyResource: Boolean(earlyResource) })),
      };
      level.solutionPath = [...maze.solutionPath];
      level.solverResult = { status: 'VALID', solutionLength: maze.solutionPath.length };
      level.choiceSafeResult = choiceSafety;
      level.mazeTemplate = maze;
      level.dailyMetadata = {
        ...level.dailyMetadata,
        finalSeed: seed,
        attempt,
        mazeWidth: maze.width,
        mazeHeight: maze.height,
        validationPassed: true,
        deadlockBranches: choiceSafety.deadlockBranches,
        testedChoiceBranches: choiceSafety.testedChoiceBranches,
        solutionLength: maze.solutionPath.length,
      };
      const metadata = { ...level.dailyMetadata };
      console.info('[DAILY] validated challenge', metadata);
      return { ...metadata, levelData: level, solution: [...level.solutionPath] };
    } catch (error) {
      lastError = error;
      if ((attempt + 1) % 25 === 0) onProgress(attempt + 1);
    }
  }

  const error = new Error(`每日關生成失敗：已嘗試 ${DAILY_MAX_SEED_ATTEMPTS} 個 Seed。`);
  console.error('[DAILY] challenge generation exhausted', { dateKey, sizeTier, lastError });
  throw error;
}

export function getDailyChallenge(timestampMs = Date.now(), onProgress = () => {}) {
  const dateKey = getTaipeiDateKey(timestampMs);
  if (dailyCache?.dateKey === dateKey && dailyCache.generatorVersion === DAILY_GENERATOR_VERSION) {
    return Promise.resolve(dailyCache);
  }
  if (dailyGenerations.has(dateKey)) return dailyGenerations.get(dateKey);

  latestRequestedDate = dateKey;
  const generation = generateDailyChallenge(dateKey, onProgress).then(challenge => {
    if (latestRequestedDate === dateKey) dailyCache = challenge;
    return challenge;
  }).finally(() => dailyGenerations.delete(dateKey));
  dailyGenerations.set(dateKey, generation);
  return generation;
}

export function clearDailyCache() {
  dailyCache = null;
  dailyGenerations.clear();
  latestRequestedDate = '';
}
