import { DIRECTION } from './config.js';
import { getColorConfig } from './level-config.js';

const key = ({ x, y }) => `${x},${y}`;
const CARDINALS = Object.entries(DIRECTION);
const makeRandom = seed => {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};
const GENERATION_ATTEMPT_LIMIT = 1000;
const randomIndex = (random, length) => Math.floor(random() * length);
const shuffle = (array, random) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomIndex(random, i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
const neighbors = (p, width, height) => CARDINALS
  .map(([, [dx, dy]]) => ({ x: p.x + dx, y: p.y + dy }))
  .filter(q => q.x >= 0 && q.y >= 0 && q.x < width && q.y < height);

function distances(tiles, width, height, origin) {
  const found = new Map([[key(origin), 0]]), queue = [origin];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], distance = found.get(key(p));
    for (const q of neighbors(p, width, height)) if (tiles[q.y][q.x] === 'floor' && !found.has(key(q))) {
      found.set(key(q), distance + 1); queue.push(q);
    }
  }
  return found;
}

function shortestPaths(tiles, width, height, from, blocked = new Set()) {
  const previous = new Map([[key(from), null]]), points = new Map([[key(from), from]]);
  const found = new Map([[key(from), 0]]), queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const p = queue[head], distance = found.get(key(p));
    for (const q of neighbors(p, width, height)) if (tiles[q.y][q.x] === 'floor' && !blocked.has(key(q)) && !previous.has(key(q))) {
      previous.set(key(q), key(p)); points.set(key(q), q); found.set(key(q), distance + 1); queue.push(q);
    }
  }
  return { previous, points, distances: found };
}

function restorePath(tree, to) {
  if (!tree.previous.has(key(to))) return null;
  const path = [];
  for (let id = key(to); id !== null; id = tree.previous.get(id)) path.push(tree.points.get(id));
  return path.reverse();
}

function route(tiles, width, height, from, to, blocked = new Set()) {
  return restorePath(shortestPaths(tiles, width, height, from, blocked), to);
}

function pathToDirections(path) {
  return path.slice(1).map((point, index) => {
    const previous = path[index];
    const delta = [point.x - previous.x, point.y - previous.y];
    return CARDINALS.find(([, direction]) => direction[0] === delta[0] && direction[1] === delta[1])?.[0];
  });
}

function pathTurnCount(path) {
  let turns = 0;
  for (let index = 2; index < path.length; index++) {
    const previousDirection = [path[index - 1].x - path[index - 2].x, path[index - 1].y - path[index - 2].y];
    const currentDirection = [path[index].x - path[index - 1].x, path[index].y - path[index - 1].y];
    if (previousDirection[0] !== currentDirection[0] || previousDirection[1] !== currentDirection[1]) turns++;
  }
  return turns;
}

const floorDegree = (tiles, width, height, p) => neighbors(p, width, height)
  .filter(q => tiles[q.y][q.x] === 'floor').length;

function sectorOf(position, width, height) {
  const column = Math.min(2, Math.floor(position.x * 3 / width)) + 1;
  const row = Math.min(2, Math.floor(position.y * 3 / height)) + 1;
  return `R${row}C${column}`;
}

function routeJunctions(tiles, width, height, path) {
  return path.slice(1, -1).filter(p => floorDegree(tiles, width, height, p) >= 3).length;
}

const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');

export function analyzeChokePoints(maze) {
  const discovery = new Map(), low = new Map(), subtreeSize = new Map();
  const componentSizesAfterRemoval = new Map(), bridgeEdges = [];
  const totalFloors = maze.tiles.flat().filter(tile => tile === 'floor').length;
  // Treat only separators between substantial regions as major choke points.
  // A small fixed floor avoids classifying most of a compact tutorial maze as
  // a major choke merely because its total walkable area is small.
  const majorComponentSize = Math.max(5, Math.ceil(totalFloors * 0.12));
  let clock = 0;

  function visit(point, parent = null) {
    const pointKey = key(point);
    discovery.set(pointKey, ++clock);
    low.set(pointKey, discovery.get(pointKey));
    let size = 1, childCount = 0, separatedChildSizes = [];

    for (const adjacent of neighbors(point, maze.width, maze.height)) {
      if (maze.tiles[adjacent.y][adjacent.x] !== 'floor') continue;
      const adjacentKey = key(adjacent);
      if (!discovery.has(adjacentKey)) {
        childCount++;
        size += visit(adjacent, pointKey);
        low.set(pointKey, Math.min(low.get(pointKey), low.get(adjacentKey)));
        if (low.get(adjacentKey) > discovery.get(pointKey)) bridgeEdges.push(edgeKey(point, adjacent));
        if (parent === null || low.get(adjacentKey) >= discovery.get(pointKey)) separatedChildSizes.push(subtreeSize.get(adjacentKey));
      } else if (adjacentKey !== parent) {
        low.set(pointKey, Math.min(low.get(pointKey), discovery.get(adjacentKey)));
      }
    }

    subtreeSize.set(pointKey, size);
    if (separatedChildSizes.length > 0 && (parent !== null || childCount > 1)) {
      const remainder = totalFloors - 1 - separatedChildSizes.reduce((sum, count) => sum + count, 0);
      const parts = [...separatedChildSizes, ...(remainder > 0 ? [remainder] : [])];
      componentSizesAfterRemoval.set(pointKey, parts);
    }
    return size;
  }

  const root = maze.spawn;
  if (maze.tiles[root.y]?.[root.x] === 'floor') visit(root);
  const articulationPoints = [...componentSizesAfterRemoval].map(([position, componentSizes]) => {
    const [x, y] = position.split(',').map(Number);
    const majorParts = componentSizes.filter(size => size >= majorComponentSize).length;
    return {
      x, y,
      componentSizes,
      major: majorParts >= 2,
      separatedFloorCount: totalFloors - 1 - Math.max(...componentSizes),
    };
  });
  const majorChokePoints = articulationPoints.filter(point => point.major);
  return {
    totalFloors,
    articulationPoints,
    majorChokePoints,
    bridgeEdges: [...new Set(bridgeEdges)],
    majorComponentSize,
  };
}

export function getMazeQuality(maze, sequenceTargetIds = maze.sequenceTargetIds ?? []) {
  let junctionCount = 0, deadEndCount = 0;
  for (let y = 1; y < maze.height - 1; y++) for (let x = 1; x < maze.width - 1; x++) {
    if (maze.tiles[y][x] !== 'floor') continue;
    const degree = floorDegree(maze.tiles, maze.width, maze.height, { x, y });
    if (degree >= 3) junctionCount++;
    if (degree === 1) deadEndCount++;
  }

  const sectorById = { start: sectorOf(maze.spawn, maze.width, maze.height), exit: sectorOf(maze.exit, maze.width, maze.height) };
  maze.colors.forEach(target => { sectorById[target.id] = sectorOf(target, maze.width, maze.height); });
  maze.items.forEach((item, index) => { sectorById[item.id ?? `${item.kind}_${index + 1}`] = sectorOf(item, maze.width, maze.height); });
  const colorPathDistances = {}, sequencePathDistances = [];
  for (let i = 0; i < maze.colors.length; i++) {
    const target = maze.colors[i], dist = distances(maze.tiles, maze.width, maze.height, target);
    for (const other of maze.colors.slice(i + 1)) colorPathDistances[`${target.id} → ${other.id}`] = dist.get(key(other)) ?? null;
  }
  for (let i = 0; i < sequenceTargetIds.length - 1; i++) {
    const from = maze.colors.find(target => target.id === sequenceTargetIds[i]);
    const to = maze.colors.find(target => target.id === sequenceTargetIds[i + 1]);
    const path = from && to ? route(maze.tiles, maze.width, maze.height, from, to) : null;
    sequencePathDistances.push({
      from: sequenceTargetIds[i], to: sequenceTargetIds[i + 1],
      distance: path ? path.length - 1 : null,
      junctions: path ? routeJunctions(maze.tiles, maze.width, maze.height, path) : 0,
    });
  }
  const exitDistances = distances(maze.tiles, maze.width, maze.height, maze.exit);
  const purpleExitDistances = Object.fromEntries(maze.colors
    .filter(target => target.color === 'purple')
    .map(target => [target.id, exitDistances.get(key(target)) ?? null]));
  const finalPurple = maze.colors.find(target => target.id === sequenceTargetIds.at(-1));
  const finishingPath = finalPurple ? route(maze.tiles, maze.width, maze.height, finalPurple, maze.exit) : null;
  const finishingWalkTurns = finishingPath ? pathTurnCount(finishingPath) : 0;
  const chokePoints = analyzeChokePoints(maze);
  const articulationKeys = new Set(chokePoints.articulationPoints.map(key));
  const majorChokeKeys = new Set(chokePoints.majorChokePoints.map(key));
  const colorArticulationIds = maze.colors.filter(target => articulationKeys.has(key(target))).map(target => target.id);
  const colorMajorChokeIds = maze.colors.filter(target => majorChokeKeys.has(key(target))).map(target => target.id);
  return {
    junctionCount, deadEndCount, sectorById, colorPathDistances, sequencePathDistances,
    purpleExitDistances,
    minPurpleExitDistance: Math.min(...Object.values(purpleExitDistances).filter(Number.isFinite)),
    finalPurpleToExitDistance: finalPurple ? exitDistances.get(key(finalPurple)) ?? null : null,
    finishingWalkTurns,
    articulationPointCount: chokePoints.articulationPoints.length,
    majorChokePointCount: chokePoints.majorChokePoints.length,
    colorArticulationIds,
    colorMajorChokeIds,
    chokePoints,
    solutionLength: maze.solutionPath?.length ?? 0,
  };
}

export function validateSolutionPath(maze, solutionPath, colorSequence) {
  if (!Array.isArray(solutionPath) || !Array.isArray(colorSequence)) return false;
  let position = { ...maze.spawn }, progress = 0;
  const completed = new Set();

  for (const direction of solutionPath) {
    const delta = DIRECTION[direction];
    if (!delta) return false;
    position = { x: position.x + delta[0], y: position.y + delta[1] };
    if (!isWalkable(maze, position.x, position.y)) return false;
    const target = maze.colors.find(item => item.x === position.x && item.y === position.y);
    if (target && !completed.has(target.id)) {
      if (progress >= colorSequence.length || target.color !== colorSequence[progress]) return false;
      completed.add(target.id);
      progress++;
    }
  }

  return position.x === maze.exit.x && position.y === maze.exit.y && progress === colorSequence.length;
}

function searchSolution(maze, colorSequence) {
  const targetAt = new Map(maze.colors.map((target, index) => [key(target), { target, index }]));
  const queue = [{ position: { ...maze.spawn }, progress: 0, mask: 0, parent: -1, direction: null }];
  const visited = new Set([`${key(maze.spawn)}|0|0`]);
  const stateLimit = 450000;

  for (let head = 0; head < queue.length && queue.length <= stateLimit; head++) {
    const node = queue[head];
    if (key(node.position) === key(maze.exit) && node.progress === colorSequence.length) {
      const path = [];
      for (let index = head; queue[index].parent >= 0; index = queue[index].parent) path.push(queue[index].direction);
      return path.reverse();
    }
    for (const [direction, [dx, dy]] of CARDINALS) {
      const position = { x: node.position.x + dx, y: node.position.y + dy };
      if (!isWalkable(maze, position.x, position.y)) continue;
      let progress = node.progress, mask = node.mask;
      const entry = targetAt.get(key(position));
      if (entry) {
        const bit = 1 << entry.index;
        if (!(mask & bit)) {
          if (entry.target.color !== colorSequence[progress]) continue;
          mask |= bit; progress++;
        }
      }
      const stateKey = `${key(position)}|${progress}|${mask}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      queue.push({ position, progress, mask, parent: head, direction });
    }
  }
  return null;
}

export function solveMaze(maze, colorSequence) {
  if (Array.isArray(maze.solutionPath) && validateSolutionPath(maze, maze.solutionPath, colorSequence)) return [...maze.solutionPath];
  return searchSolution(maze, colorSequence);
}

export function hasOrderedRoute(maze, colorSequence) {
  return Boolean(solveMaze(maze, colorSequence));
}

function findReachableChoice(maze, fromState, targetId, targetIndexAt) {
  const targetIndex = maze.colors.findIndex(target => target.id === targetId);
  if (targetIndex < 0) return null;
  const queue = [fromState.position], seen = new Set([key(fromState.position)]);
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const adjacent of neighbors(point, maze.width, maze.height)) {
      if (maze.tiles[adjacent.y][adjacent.x] !== 'floor') continue;
      const adjacentKey = key(adjacent), colorIndex = targetIndexAt.get(adjacentKey);
      if (colorIndex !== undefined && !(fromState.mask & (1 << colorIndex))) {
        if (colorIndex !== targetIndex) continue;
        return { position: adjacent, mask: fromState.mask | (1 << targetIndex) };
      }
      if (seen.has(adjacentKey)) continue;
      seen.add(adjacentKey);
      queue.push(adjacent);
    }
  }
  return null;
}

function canFinishFixedPlan(maze, startPosition, completedMask, targetPlan, targetIndexAt) {
  const queue = [{ position: startPosition, progress: 0, mask: completedMask }];
  const visited = new Set([`${key(startPosition)}|0|${completedMask}`]);
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    if (key(node.position) === key(maze.exit) && node.progress === targetPlan.length) return true;
    for (const adjacent of neighbors(node.position, maze.width, maze.height)) {
      if (maze.tiles[adjacent.y][adjacent.x] !== 'floor') continue;
      let progress = node.progress, mask = node.mask;
      const colorIndex = targetIndexAt.get(key(adjacent));
      if (colorIndex !== undefined && !(mask & (1 << colorIndex))) {
        if (maze.colors[colorIndex].id !== targetPlan[progress]) continue;
        mask |= 1 << colorIndex;
        progress++;
      }
      const stateKey = `${key(adjacent)}|${progress}|${mask}`;
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      queue.push({ position: adjacent, progress, mask });
    }
  }
  return false;
}

/**
 * Checks every reachable first-round physical-target choice, then searches the
 * remaining game using the same locked-target rule as movePlayer.
 */
export function validateChoiceSafety(maze, colorSequence, baseColorOrder) {
  const firstRoundLength = baseColorOrder.length;
  const targetsByColor = new Map(baseColorOrder.map(color => [color, maze.colors.filter(target => target.color === color)]));
  const targetIndexAt = new Map(maze.colors.map((target, index) => [key(target), index]));
  const report = {
    choiceSafe: false,
    choicesPerRound: firstRoundLength,
    choicePlansConsidered: 2 ** firstRoundLength,
    testedChoiceBranches: 0,
    choiceEdgesTested: 0,
    reachableChoiceEdges: 0,
    unreachableChoiceEdges: 0,
    reachableChoiceBranches: 0,
    safeChoiceBranches: 0,
    deadlockBranches: 0,
    deadlockChoiceBranches: [],
  };

  if (colorSequence.length !== firstRoundLength * 2
    || colorSequence.slice(0, firstRoundLength).some((color, index) => color !== baseColorOrder[index])
    || colorSequence.slice(firstRoundLength).some((color, index) => color !== baseColorOrder[index])
    || baseColorOrder.some(color => targetsByColor.get(color)?.length !== 2)) {
    report.deadlockBranches = 1;
    report.deadlockChoiceBranches.push({ choices: [], reason: 'UNSUPPORTED_CHOICE_TREE_CONFIG' });
    return report;
  }

  function recordDeadlock(choices, reason) {
    report.deadlockBranches++;
    report.deadlockChoiceBranches.push({ choices: [...choices], reason });
  }

  function visitChoicePrefix(colorIndex, state, choices) {
    if (colorIndex === firstRoundLength) {
      report.reachableChoiceBranches++;
      report.testedChoiceBranches++;
      const remainingPlan = colorSequence.slice(firstRoundLength).map(color => {
        const targetIndex = maze.colors.findIndex((target, index) => target.color === color && !(state.mask & (1 << index)));
        return targetIndex < 0 ? null : maze.colors[targetIndex].id;
      });
      if (remainingPlan.some(targetId => targetId === null)) {
        recordDeadlock(choices, 'SECOND_ROUND_TARGET_MISSING');
        return;
      }
      if (!canFinishFixedPlan(maze, state.position, state.mask, remainingPlan, targetIndexAt)) {
        recordDeadlock(choices, 'NO_COMPLETION_AFTER_LEGAL_FIRST_ROUND_CHOICES');
        return;
      }
      report.safeChoiceBranches++;
      return;
    }

    const expectedColor = baseColorOrder[colorIndex];
    const availableTargets = targetsByColor.get(expectedColor).filter(target => {
      const targetIndex = maze.colors.indexOf(target);
      return !(state.mask & (1 << targetIndex));
    });
    let reachableChildren = 0;
    for (const target of availableTargets) {
      report.choiceEdgesTested++;
      const child = findReachableChoice(maze, state, target.id, targetIndexAt);
      if (!child) {
        report.unreachableChoiceEdges++;
        continue;
      }
      reachableChildren++;
      report.reachableChoiceEdges++;
      visitChoicePrefix(colorIndex + 1, child, [...choices, target.id]);
    }
    if (reachableChildren === 0) recordDeadlock(choices, `NO_REACHABLE_${expectedColor.toUpperCase()}_CHOICE`);
  }

  visitChoicePrefix(0, { position: { ...maze.spawn }, mask: 0 }, []);
  report.choiceSafe = report.deadlockBranches === 0 && report.safeChoiceBranches === report.reachableChoiceBranches;
  return report;
}

function pickSpreadPosition(candidates, occupied, sectorCounts, level, random, diversityCounts = null) {
  const viable = candidates.filter(point => !occupied.has(key(point)));
  if (!viable.length) return null;
  const positions = [...occupied].map(value => {
    const [x, y] = value.split(',').map(Number); return { x, y };
  });
  const scored = viable.map(point => {
    const sector = sectorOf(point, level.mazeWidth, level.mazeHeight);
    const minManhattan = positions.length ? Math.min(...positions.map(p => Math.abs(p.x - point.x) + Math.abs(p.y - point.y))) : 0;
    const diversityPenalty = (diversityCounts?.get(sector) ?? 0) * 100;
    return { point, score: diversityPenalty + (sectorCounts.get(sector) ?? 0) * 10 - Math.min(minManhattan, 8) + random() * 0.5 };
  }).sort((a, b) => a.score - b.score);
  return scored[randomIndex(random, Math.min(4, scored.length))].point;
}

function buildMission(level, tiles, floor, spawn, random, colorSequence, colorCopies, majorChokeKeys) {
  const { baseColorOrder } = getColorConfig(level);
  const extraRounds = Math.max(0, Math.ceil((colorSequence.length - 12) / 6));
  const minTargetDistance = Math.max(2, level.minTargetPathDistance - extraRounds);
  const minSameColorDistance = Math.max(minTargetDistance + 1, level.minSameColorPathDistance - extraRounds * 2);
  const sectorCounts = new Map(), occupied = new Set([key(spawn)]);
  const addSector = p => {
    const sector = sectorOf(p, level.mazeWidth, level.mazeHeight);
    sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
  };
  addSector(spawn);

  const colors = [], sequenceTargets = [], walk = [{ ...spawn }], walked = new Set([key(spawn)]);
  const copiesUsed = Object.fromEntries(baseColorOrder.map(color => [color, 0]));
  let current = spawn;
  for (let index = 0; index < colorSequence.length; index++) {
    const color = colorSequence[index];
    const fromCurrent = shortestPaths(tiles, level.mazeWidth, level.mazeHeight, current);
    const priorDistances = colors.map(target => distances(tiles, level.mazeWidth, level.mazeHeight, target));
    const candidates = [];
    for (const point of floor) {
      const pointKey = key(point), distance = fromCurrent.distances.get(pointKey);
      if (!distance || occupied.has(pointKey) || walked.has(pointKey) || distance < minTargetDistance || majorChokeKeys.has(pointKey)) continue;
      let spaced = true;
      for (let previousIndex = 0; previousIndex < colors.length; previousIndex++) {
        const prior = colors[previousIndex], priorDistance = priorDistances[previousIndex].get(pointKey) ?? Infinity;
        const minimum = prior.color === color ? minSameColorDistance : minTargetDistance;
        if (priorDistance < minimum) { spaced = false; break; }
      }
      if (!spaced) continue;
      const path = restorePath(fromCurrent, point);
      const junctions = routeJunctions(tiles, level.mazeWidth, level.mazeHeight, path);
      const requiresJunction = index > 0 && (colorSequence.length <= 12 || index % 2 === 1);
      if (requiresJunction && junctions === 0) continue;
      const sector = sectorOf(point, level.mazeWidth, level.mazeHeight);
      const idealDistance = minTargetDistance + 1 + Math.round(level.mazeComplexity * 1.5);
      const score = (sectorCounts.get(sector) ?? 0) * 4
        + Math.abs(distance - idealDistance)
        - Math.min(junctions, 3) * 0.8
        + random() * 0.5;
      candidates.push({ point, path, score });
    }
    candidates.sort((a, b) => a.score - b.score);
    if (!candidates.length) throw new Error(`第 ${index + 1} 個彩色目標找不到分散且經過岔路的位置。`);
    const chosen = candidates[randomIndex(random, Math.min(4, candidates.length))];
    const copy = ++copiesUsed[color];
    const target = { ...chosen.point, kind: 'color', id: `${color}_${copy}`, color, completed: false };
    colors.push(target); sequenceTargets.push(target.id); occupied.add(key(target)); addSector(target);
    for (const point of chosen.path.slice(1)) walk.push({ ...point });
    for (const point of chosen.path) walked.add(key(point));
    current = chosen.point;
  }

  const extraColors = [];
  for (const color of baseColorOrder) for (let copy = copiesUsed[color] + 1; copy <= colorCopies[color]; copy++) {
    extraColors.push({ kind: 'color', id: `${color}_${copy}`, color, completed: false });
  }
  for (const target of extraColors) {
    const sameColor = colors.filter(item => item.color === target.color);
    const candidateSlots = floor.filter(p => !occupied.has(key(p)) && !walked.has(key(p)) && !majorChokeKeys.has(key(p)));
    const fromSameColor = sameColor.map(item => distances(tiles, level.mazeWidth, level.mazeHeight, item));
    const spacedSlots = candidateSlots.filter(p => fromSameColor.every(map => (map.get(key(p)) ?? Infinity) >= level.minSameColorPathDistance));
    const chosen = pickSpreadPosition(spacedSlots.length ? spacedSlots : candidateSlots, occupied, sectorCounts, level, random);
    if (!chosen) throw new Error('迷宮沒有足夠的分散位置放置額外彩色目標。');
    Object.assign(target, chosen); colors.push(target); occupied.add(key(target)); addSector(target);
  }

  const minimumSpawnExitDistance = Math.max(colorSequence.length, Math.round((level.mazeWidth + level.mazeHeight) * 0.55));
  const spawnDistances = distances(tiles, level.mazeWidth, level.mazeHeight, spawn);
  const purpleTargets = colors.filter(target => target.color === 'purple');
  if (!purpleTargets.length) throw new Error('出口距離驗證需要至少一個紫色目標。');
  const purpleDistanceMaps = purpleTargets.map(target => distances(tiles, level.mazeWidth, level.mazeHeight, target));
  const desiredFinishDistance = (level.minFinalPurpleToExitPathDistance + level.maxFinalPurpleToExitPathDistance) / 2;
  const viableExits = floor.filter(point => {
    const pointKey = key(point);
    if (occupied.has(pointKey) || (spawnDistances.get(pointKey) ?? -Infinity) < minimumSpawnExitDistance) return false;
    return purpleDistanceMaps.every(map => {
      const distance = map.get(pointKey) ?? Infinity;
      return distance >= level.minFinalPurpleToExitPathDistance && distance <= level.maxFinalPurpleToExitPathDistance;
    });
  });
  if (!viableExits.length) throw new Error('找不到同時符合兩顆紫色收尾距離的出口位置。');
  const otherSectors = viableExits.filter(point => sectorOf(point, level.mazeWidth, level.mazeHeight) !== sectorOf(spawn, level.mazeWidth, level.mazeHeight));
  const exitPool = otherSectors.length ? otherSectors : viableExits;
  const scoredExits = exitPool.map(point => {
    const purpleDistances = purpleDistanceMaps.map(map => map.get(key(point)));
    const averageDistance = purpleDistances.reduce((sum, distance) => sum + distance, 0) / purpleDistances.length;
    const turns = purpleTargets.map(target => pathTurnCount(route(tiles, level.mazeWidth, level.mazeHeight, target, point) ?? []));
    const averageTurns = turns.reduce((sum, count) => sum + count, 0) / turns.length;
    const mostTurns = Math.max(...turns), fewestTurns = Math.min(...turns);
    const turnRangePenalty = Math.max(0, mostTurns - 4) * 2 + Math.max(0, 2 - fewestTurns) * 2;
    return { point, score: Math.abs(averageDistance - desiredFinishDistance) + Math.abs(averageTurns - 3) * 1.5 + turnRangePenalty + random() * 0.25 };
  }).sort((a, b) => a.score - b.score);
  const exit = scoredExits[0].point;
  occupied.add(key(exit)); addSector(exit);
  const exitPath = route(tiles, level.mazeWidth, level.mazeHeight, current, exit);
  if (!exitPath) throw new Error('彩序完成後無法抵達出口。');
  for (const point of exitPath.slice(1)) walk.push({ ...point });
  for (const point of exitPath) walked.add(key(point));

  const items = [], itemSectorCounts = new Map(), pathSlots = [...new Map(walk.map(point => [key(point), point])).values()]
    .filter(point => !occupied.has(key(point)));
  const addItem = item => {
    items.push(item);
    const sector = sectorOf(item, level.mazeWidth, level.mazeHeight);
    itemSectorCounts.set(sector, (itemSectorCounts.get(sector) ?? 0) + 1);
    occupied.add(key(item));
    addSector(item);
  };
  const itemCounts = { nne: level.nneCount, coo: level.cooCount };
  const nextItemIds = { nne: 1, coo: 1 };

  // Early upgrades live on short, optional branches near spawn. Their access
  // paths avoid color targets, so collecting one never depends on sequence progress.
  const earlyCounts = { nne: level.earlyNneCount ?? 0, coo: level.earlyCooCount ?? 0 };
  if (earlyCounts.nne + earlyCounts.coo > 0) {
    const earlyBlocked = new Set(occupied);
    earlyBlocked.delete(key(spawn));
    const earlyReachable = shortestPaths(tiles, level.mazeWidth, level.mazeHeight, spawn, earlyBlocked).distances;
    const branchCandidates = floor.filter(point => {
      const pointKey = key(point), distance = earlyReachable.get(pointKey);
      if (distance < 2 || distance > level.earlyResourceMaxDistance || occupied.has(pointKey) || walked.has(pointKey)) return false;
      return neighbors(point, level.mazeWidth, level.mazeHeight).some(adjacent =>
        walked.has(key(adjacent)) && !occupied.has(key(adjacent)) && earlyReachable.has(key(adjacent)));
    });

    for (const kind of ['nne', 'coo']) for (let index = 0; index < earlyCounts[kind]; index++) {
      const position = pickSpreadPosition(branchCandidates, occupied, sectorCounts, level, random, itemSectorCounts);
      if (!position) throw new Error(`出生點附近找不到不阻擋彩序的 ${kind.toUpperCase()} 支線位置。`);
      const item = { ...position, kind, id: `${kind}_${nextItemIds[kind]++}`, earlyResource: true };
      addItem(item); itemCounts[kind]--;
    }
  }

  for (const kind of ['nne', 'coo']) {
    if (!itemCounts[kind]) continue;
    const position = pickSpreadPosition(pathSlots, occupied, sectorCounts, level, random, itemSectorCounts);
    if (!position) throw new Error(`解答路徑缺少可放置 ${kind.toUpperCase()} 的空格。`);
    const item = { ...position, kind, id: `${kind}_${nextItemIds[kind]++}` };
    addItem(item);
    pathSlots.splice(pathSlots.findIndex(p => key(p) === key(item)), 1);
    itemCounts[kind]--;
  }
  for (const kind of ['nne', 'coo']) for (let index = 0; index < itemCounts[kind]; index++) {
    const position = pickSpreadPosition(floor, occupied, sectorCounts, level, random, itemSectorCounts);
    if (!position) throw new Error(`迷宮沒有足夠空間放置 ${kind.toUpperCase()}。`);
    const item = { ...position, kind, id: `${kind}_${nextItemIds[kind]++}` };
    addItem(item);
  }
  return { exit, colors, items, walk, sequenceTargets };
}

function generateMazeAttempt(level, attempt, seedIncrement) {
  const width = level.mazeWidth, height = level.mazeHeight;
  const { colorSequence, colorCopies } = getColorConfig(level);
  const random = makeRandom(level.seed + attempt * seedIncrement);
  const tiles = Array.from({ length: height }, () => Array(width).fill('wall'));
  const start = { ...level.start }, stack = [start];
  tiles[start.y][start.x] = 'floor';
  while (stack.length) {
    const p = stack.at(-1);
    const options = shuffle([[0, -2], [2, 0], [0, 2], [-2, 0]], random)
      .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy, midX: p.x + dx / 2, midY: p.y + dy / 2 }))
      .filter(q => q.x > 0 && q.y > 0 && q.x < width - 1 && q.y < height - 1 && tiles[q.y][q.x] === 'wall');
    if (!options.length) { stack.pop(); continue; }
    const q = options[0]; tiles[q.midY][q.midX] = tiles[q.y][q.x] = 'floor'; stack.push(q);
  }

  const branchWalls = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (tiles[y][x] === 'wall') branchWalls.push({ x, y });
  for (const p of shuffle(branchWalls, random)) {
    if (random() >= level.branchDensity) continue;
    const adjacentFloors = neighbors(p, width, height).filter(q => tiles[q.y][q.x] === 'floor').length;
    if (adjacentFloors >= 2) tiles[p.y][p.x] = 'floor';
  }

  const floor = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) if (tiles[y][x] === 'floor') floor.push({ x, y });
  const spawn = { ...start }, reachable = distances(tiles, width, height, spawn);
  if (reachable.size !== floor.length) throw new Error('迷宮道路不連通。');
  const targetCount = Object.values(colorCopies).reduce((sum, count) => sum + count, 0);
  if (floor.length < targetCount + level.nneCount + level.cooCount + 2) throw new Error('迷宮沒有足夠的可用道路格。');
  const avoidMajorColorChokes = level.avoidMajorColorChokes ?? (level.stageId >= 1 && level.stageId <= 20);
  const majorChokeKeys = avoidMajorColorChokes
    ? new Set(analyzeChokePoints({ tiles, width, height, spawn }).majorChokePoints.map(key))
    : new Set();
  // Keep the target-placement random stream independent of moving exit selection later in generation.
  random();
  const mission = buildMission(level, tiles, floor, spawn, random, colorSequence, colorCopies, majorChokeKeys);
  const solutionPath = pathToDirections(mission.walk);
  const maze = { width, height, tiles, spawn, exit: { ...mission.exit }, colors: mission.colors, items: mission.items, solutionPath, sequenceTargetIds: mission.sequenceTargets };
  if (!validateSolutionPath(maze, solutionPath, colorSequence)) throw new Error('生成的解答無法依序完成所有彩色目標。');
  maze.quality = getMazeQuality(maze, mission.sequenceTargets);
  if (Object.values(maze.quality.purpleExitDistances).length !== colorCopies.purple
    || Object.values(maze.quality.purpleExitDistances).some(distance => distance < level.minFinalPurpleToExitPathDistance || distance > level.maxFinalPurpleToExitPathDistance)) {
    throw new Error(`兩顆紫色距出口需介於 ${level.minFinalPurpleToExitPathDistance}–${level.maxFinalPurpleToExitPathDistance} 格。`);
  }
  if (maze.quality.junctionCount < level.minimumJunctions) throw new Error('岔路數不足，重新生成版圖。');
  return maze;
}

export function generateMaze(level, { maxAttempts = GENERATION_ATTEMPT_LIMIT, seedIncrement = 104729 } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('maxAttempts must be a positive integer.');
  if (!Number.isInteger(seedIncrement) || seedIncrement < 1) throw new RangeError('seedIncrement must be a positive integer.');
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const maze = generateMazeAttempt(level, attempt, seedIncrement);
      const colorConfig = getColorConfig(level);
      const shouldValidateChoiceSafety = level.choiceSafeValidation
        && colorConfig.colorRounds === 2
        && colorConfig.baseColorOrder.length === 6
        && colorConfig.colorSequence.length === 12
        && Object.values(colorConfig.colorCopies).every(count => count === 2);
      if (shouldValidateChoiceSafety) {
        const choiceSafety = validateChoiceSafety(maze, colorConfig.colorSequence, colorConfig.baseColorOrder);
        maze.quality.choiceSafety = choiceSafety;
        if (!choiceSafety.choiceSafe) {
          lastError = new Error(`存在 ${choiceSafety.deadlockBranches} 個合法選擇死鎖分支。`);
          continue;
        }
      }
      maze.generationAttempt = attempt;
      maze.generationSeed = level.seed + attempt * seedIncrement;
      return maze;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`無法產生符合關卡條件的迷宮（嘗試 ${maxAttempts} 次）：${lastError?.message ?? '設定無效'}`);
}

export function cloneMaze(maze) {
  return {
    ...maze,
    tiles: maze.tiles.map(row => [...row]),
    spawn: { ...maze.spawn },
    exit: { ...maze.exit },
    colors: maze.colors.map(({ completed, everActivated, discovered, everCompleted, activated, ...target }) => ({ ...target, completed: false })),
    items: maze.items.map(item => ({ ...item })),
    solutionPath: [...maze.solutionPath],
    sequenceTargetIds: [...(maze.sequenceTargetIds ?? [])],
  };
}

export function isWalkable(maze, x, y) {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height && maze.tiles[y][x] === 'floor';
}

export function allReachable(maze) {
  const seen = distances(maze.tiles, maze.width, maze.height, maze.spawn);
  return [...maze.colors, ...maze.items, maze.exit].every(p => seen.has(key(p)));
}
