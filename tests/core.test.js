import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getColorConfig, validateLevel } from '../js/levels.js';
import { cloneMaze, generateMaze, allReachable, hasOrderedRoute, isWalkable, solveMaze, validateSolutionPath } from '../js/maze.js';
import { cellVisibility, getEffectiveMemorySteps, getEffectiveVisionCells, getMemoryMarkers, getVisionCells, isFeatureVisible, positionKey, recordMovement, recentHistory, updateColorMemory } from '../js/memory.js';
import { currentRound, nextColor, resolveColor } from '../js/objectives.js';
import { collectItem } from '../js/items.js';
import { takeTurn } from '../js/turn.js';
import { bindInput, directionForKey, directionForSwipe, directionForTap, SWIPE_THRESHOLD, TAP_DEAD_ZONE } from '../js/input.js';
import { createRunState } from '../js/run-state.js';

function makeObjectiveState({ colors = ['red', 'orange', 'yellow'], rounds = 2 } = {}) {
  const baseColorOrder = [...colors];
  const level = {
    ...LEVELS[0], baseColorOrder, colorRounds: rounds,
    colorCopies: Object.fromEntries(baseColorOrder.map(color => [color, rounds])),
  };
  const targets = baseColorOrder.flatMap(color => Array.from({ length: rounds }, (_, index) => ({
    x: index + 1, y: baseColorOrder.indexOf(color) + 1,
    kind: 'color', id: `${color}_${index + 1}`, color, completed: false,
  })));
  return {
    level,
    maze: {
      width: 7, height: 7,
      tiles: Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => x && y && x < 6 && y < 6 ? 'floor' : 'wall')),
      spawn: { x: 1, y: 1 }, exit: { x: 5, y: 5 }, colors: targets, items: [],
    },
    player: { x: 1, y: 1 }, steps: 0, sequenceProgress: 0, completedTargetOrder: [],
    visionRange: level.visionRange, memoryLevel: level.initialMemoryLevel, movementHistory: [{ x: 1, y: 1 }],
    nneCollected: 0, cooCollected: 0, won: false,
  };
}

function pathDistance(maze, start, goal, blocked = new Set()) {
  const queue = [{ ...start, distance: 0 }], seen = new Set([`${start.x},${start.y}`]);
  const steps = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head], key = `${point.x},${point.y}`;
    if (point.x === goal.x && point.y === goal.y) return point.distance;
    for (const [dx, dy] of steps) {
      const x = point.x + dx, y = point.y + dy, nextKey = `${x},${y}`;
      if (x < 0 || y < 0 || x >= maze.width || y >= maze.height || maze.tiles[y][x] !== 'floor' || blocked.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey); queue.push({ x, y, distance: point.distance + 1 });
    }
  }
  return Infinity;
}

test('campaign has ten increasing difficulty tiers, configurable counts, and color rounds', () => {
  assert.equal(LEVELS.length, 10);
  assert.equal(new Set(LEVELS.map(level => level.seed)).size, 10);
  assert.deepEqual(LEVELS.map(level => level.mazeWidth), [11, 13, 15, 17, 17, 19, 21, 21, 23, 25]);
  assert.ok(new Set(LEVELS.map(level => level.mazeTemplate.quality.sectorById.start)).size >= 7);
  assert.ok(LEVELS.every((level, index) => index === 0 || level.mazeComplexity > LEVELS[index - 1].mazeComplexity));
  assert.ok(LEVELS.every((level, index) => index === 0 || level.nneCount >= LEVELS[index - 1].nneCount));
  assert.ok(LEVELS.every((level, index) => index === 0 || level.cooCount >= LEVELS[index - 1].cooCount));
  for (let index = 1; index < LEVELS.length; index++) {
    const previous = LEVELS[index - 1], level = LEVELS[index];
    if (previous.mazeWidth === level.mazeWidth && previous.mazeHeight === level.mazeHeight) {
      assert.notDeepEqual(generateMaze(previous).tiles, generateMaze(level).tiles);
    }
  }
  for (const level of LEVELS) {
    assert.equal(level.visionRange, 2);
    assert.equal(level.initialMemoryLevel, 3);
    assert.equal(level.itemEffects.nneVisionBonus, 1);
    assert.equal(level.itemEffects.cooMemoryBonus, 2);
    assert.equal(level.maxVisionRange, level.visionRange + level.nneCount);
    assert.equal(level.maxMemoryLevel, level.initialMemoryLevel + level.cooCount * 2);
    assert.equal(getEffectiveMemorySteps(level.initialMemoryLevel), 12);
    assert.equal(level.colorRounds, 2);
    assert.ok(level.branchDensity > 0);
    assert.ok(level.minTargetPathDistance >= 3);
    assert.ok(Object.values(level.colorCopies).every(count => count === 2));
    assert.deepEqual(getColorConfig(level).colorSequence, [
      'red', 'orange', 'yellow', 'green', 'blue', 'purple',
      'red', 'orange', 'yellow', 'green', 'blue', 'purple',
    ]);
  }
  assert.deepEqual(LEVELS.map(level => (level.earlyNneCount ?? 0) + (level.earlyCooCount ?? 0)), [0, 0, 0, 1, 1, 1, 2, 2, 3, 3]);
  const level3 = { ...LEVELS[0], colorRounds: 3, colorCopies: Object.fromEntries(LEVELS[0].baseColorOrder.map(color => [color, 3])) };
  assert.equal(getColorConfig(level3).colorSequence.length, 18);
  assert.equal(getColorConfig(level3).targetCount, 18);
  validateLevel(level3);
});

test('each level owns an independent 12-part background config and a scattered reveal order', () => {
  assert.equal(new Set(LEVELS.map(level => level.background)).size, 10);
  assert.equal(new Set(LEVELS.map(level => level.background.revealOrder)).size, 10);
  for (const level of LEVELS) {
    const config = level.background;
    assert.equal(config.image, 'assets/background/level_x.png');
    assert.equal(config.opacity, 0.4);
    assert.equal(config.completedOpacity, 0.6);
    assert.equal(config.revealRows, 3);
    assert.equal(config.revealColumns, 4);
    assert.equal(config.revealOrder.length, 12);
    assert.equal(new Set(config.revealOrder).size, 12);
    assert.notDeepEqual(config.revealOrder, Array.from({ length: 12 }, (_, index) => index));
    validateLevel(level);
  }
});

test('each seeded level produces a connected layout with unique targets and a valid solution', () => {
  for (const level of LEVELS) {
    validateLevel(level);
    const config = getColorConfig(level);
    assert.equal(level.wallLayout.length, level.mazeHeight);
    assert.deepEqual(level.mazeTemplate.solutionPath, level.solutionPath);
    assert.equal(level.mazeTemplate.spawn.x, level.start.x);
    assert.equal(level.mazeTemplate.exit.x, level.exit.x);
    for (const color of config.baseColorOrder) assert.equal(level.colorTargets[color].length, level.colorCopies[color]);
    assert.equal(level.items.nne.length, level.nneCount);
    assert.equal(level.items.coo.length, level.cooCount);
    assert.ok(level.mazeTemplate.quality.junctionCount >= Math.ceil(level.mazeWidth * level.mazeHeight * 0.07));
    for (let variation = 0; variation < 5; variation++) {
      const maze = generateMaze({ ...level, seed: level.seed + variation * 104729 });
      assert.equal(allReachable(maze), true);
      assert.equal(hasOrderedRoute(maze, config.colorSequence), true);
      assert.ok(validateSolutionPath(maze, maze.solutionPath, config.colorSequence));
      const points = [maze.spawn, maze.exit, ...maze.colors, ...maze.items];
      assert.equal(new Set(points.map(p => `${p.x},${p.y}`)).size, points.length);
      assert.equal(maze.colors.length, config.targetCount);
      assert.equal(maze.items.length, level.nneCount + level.cooCount);
      assert.ok(maze.colors.every(target => target.kind === 'color' && target.completed === false && !Object.hasOwn(target, 'everActivated') && isWalkable(maze, target.x, target.y)));
      assert.ok(maze.items.every(item => isWalkable(maze, item.x, item.y)));
      const earlyItems = maze.items.filter(item => item.earlyResource);
      assert.equal(earlyItems.length, (level.earlyNneCount ?? 0) + (level.earlyCooCount ?? 0));
      assert.equal(earlyItems.filter(item => item.kind === 'nne').length, level.earlyNneCount ?? 0);
      assert.equal(earlyItems.filter(item => item.kind === 'coo').length, level.earlyCooCount ?? 0);
      const blockedColors = new Set(maze.colors.map(target => `${target.x},${target.y}`));
      const solutionCells = new Set([`${maze.spawn.x},${maze.spawn.y}`]);
      let solutionPosition = { ...maze.spawn };
      const deltas = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      for (const direction of maze.solutionPath) {
        const [dx, dy] = deltas[direction];
        solutionPosition = { x: solutionPosition.x + dx, y: solutionPosition.y + dy };
        solutionCells.add(`${solutionPosition.x},${solutionPosition.y}`);
      }
      for (const item of earlyItems) {
        const distance = pathDistance(maze, maze.spawn, item, blockedColors);
        assert.ok(distance >= 2 && distance <= level.earlyResourceMaxDistance, `${level.name} ${item.id} should be an early reachable branch`);
        assert.ok(!solutionCells.has(`${item.x},${item.y}`), `${level.name} ${item.id} should stay off the solution route`);
      }
      assert.equal(new Set(maze.colors.map(target => target.id)).size, config.targetCount);
      for (const color of config.baseColorOrder) assert.equal(maze.colors.filter(target => target.color === color).length, level.colorCopies[color]);
      const itemSectors = new Set(Object.entries(maze.quality.sectorById).filter(([id]) => id !== 'start' && id !== 'exit').map(([, sector]) => sector));
      assert.ok(itemSectors.size >= 7, `${level.name} should use most of the 3x3 sectors`);
      const resourceSectors = new Set(maze.items.map(item => maze.quality.sectorById[item.id]));
      assert.ok(resourceSectors.size >= 5, `${level.name} NNE / COO should remain distributed beyond the spawn area`);
      const sectorCounts = Object.values(maze.quality.sectorById).reduce((counts, sector) => ({ ...counts, [sector]: (counts[sector] ?? 0) + 1 }), {});
      assert.ok(Math.max(...Object.values(sectorCounts)) <= 4, `${level.name} should cap sector clustering`);
      assert.ok(maze.quality.sequencePathDistances.every(item => item.distance >= level.minTargetPathDistance));
      assert.ok(maze.quality.sequencePathDistances.every(item => item.junctions > 0));
      assert.ok(maze.quality.junctionCount >= level.minimumJunctions);
      assert.notEqual(maze.quality.sectorById.start, maze.quality.sectorById.exit);
      for (const color of config.baseColorOrder) {
        const copies = maze.colors.filter(target => target.color === color);
        assert.ok(maze.quality.colorPathDistances[`${copies[0].id} → ${copies[1].id}`] >= level.minSameColorPathDistance);
      }
      assert.equal(maze.quality.solutionLength, maze.solutionPath.length);
    }
    assert.deepEqual(generateMaze(level), generateMaze(level));
  }
});

test('a configured three-round level generates 18 targets without hardcoded two-round placement', () => {
  const level = {
    ...LEVELS[0], colorRounds: 3,
    colorCopies: Object.fromEntries(LEVELS[0].baseColorOrder.map(color => [color, 3])),
  };
  validateLevel(level);
  for (let i = 0; i < 20; i++) {
    const maze = generateMaze({ ...level, seed: level.seed + i * 104729 });
    assert.equal(maze.colors.length, 18);
    assert.equal(hasOrderedRoute(maze, getColorConfig(level).colorSequence), true);
    for (const color of level.baseColorOrder) assert.equal(maze.colors.filter(target => target.color === color).length, 3);
  }
});

test('cloning a level template restores targets, items, walls, and solution path for restart/cheat', () => {
  const level = LEVELS.at(-1), template = level.mazeTemplate;
  const upgradedRun = createRunState(level, cloneMaze(template));
  assert.equal(upgradedRun.memoryLevel, 3);
  assert.equal(getEffectiveMemorySteps(upgradedRun.memoryLevel), 12);
  const nne = upgradedRun.maze.items.find(item => item.kind === 'nne');
  upgradedRun.player = { x: nne.x, y: nne.y };
  assert.equal(collectItem(upgradedRun), 'nne');
  assert.equal(upgradedRun.visionRange, level.visionRange + level.itemEffects.nneVisionBonus);
  const coos = upgradedRun.maze.items.filter(item => item.kind === 'coo').slice(0, 3);
  for (const [index, coo] of coos.entries()) {
    upgradedRun.player = { x: coo.x, y: coo.y };
    assert.equal(collectItem(upgradedRun), 'coo');
    assert.equal(upgradedRun.memoryLevel, 3 + (index + 1) * 2);
    assert.equal(getEffectiveMemorySteps(upgradedRun.memoryLevel), 20 + index * 8);
  }
  upgradedRun.sequenceProgress = 12;
  upgradedRun.revealedBackgroundParts = 12;
  upgradedRun.fullVisionMode = true;
  upgradedRun.movementHistory.push({ x: 1, y: 1 });
  const restarted = createRunState(level, cloneMaze(template));
  assert.equal(restarted.visionRange, level.visionRange);
  assert.equal(restarted.memoryLevel, level.initialMemoryLevel);
  assert.equal(getEffectiveMemorySteps(restarted.memoryLevel), 12);
  assert.equal(restarted.sequenceProgress, 0);
  assert.equal(restarted.revealedBackgroundParts, 0);
  assert.equal(restarted.fullVisionMode, false);
  assert.equal(restarted.movementHistory.length, 0);
  assert.equal(restarted.nneCollected, 0);
  assert.equal(restarted.cooCollected, 0);
  assert.equal(restarted.maze.items.length, level.nneCount + level.cooCount);

  const firstRun = cloneMaze(template);
  firstRun.colors[0].completed = true;
  firstRun.colors[0].everActivated = true;
  firstRun.colors[0].discovered = true;
  firstRun.items.pop();
  firstRun.tiles[template.spawn.y][template.spawn.x] = 'wall';
  firstRun.solutionPath.pop();
  const resetRun = cloneMaze(template);
  assert.ok(resetRun.colors.every(target => !target.completed));
  assert.ok(resetRun.colors.every(target => !Object.hasOwn(target, 'everActivated') && !Object.hasOwn(target, 'discovered')));
  assert.equal(resetRun.items.length, level.nneCount + level.cooCount);
  assert.equal(resetRun.items.filter(item => item.earlyResource).length, level.earlyNneCount + level.earlyCooCount);
  assert.equal(resetRun.tiles[template.spawn.y][template.spawn.x], 'floor');
  assert.deepEqual(resetRun.solutionPath, template.solutionPath);

  const statefulMaze = cloneMaze(template);
  statefulMaze.colors[0].completed = true;
  statefulMaze.colors[0].everActivated = true;
  statefulMaze.colors[0].discovered = true;
  const sanitized = cloneMaze(statefulMaze);
  assert.equal(sanitized.colors[0].completed, false);
  assert.ok(!Object.hasOwn(sanitized.colors[0], 'everActivated') && !Object.hasOwn(sanitized.colors[0], 'discovered'));
});

test('solver recomputes a legal route when a stored path no longer matches the map', () => {
  const level = { ...LEVELS[0], baseColorOrder: ['red'], colorRounds: 2, colorCopies: { red: 2 } };
  const maze = {
    width: 5, height: 5,
    tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => x > 0 && y > 0 && x < 4 && y < 4 ? 'floor' : 'wall')),
    spawn: { x: 1, y: 1 }, exit: { x: 3, y: 3 },
    colors: [
      { x: 2, y: 1, kind: 'color', id: 'red_1', color: 'red', completed: false },
      { x: 3, y: 1, kind: 'color', id: 'red_2', color: 'red', completed: false },
    ], items: [], solutionPath: ['left'],
  };
  const solution = solveMaze(maze, getColorConfig(level).colorSequence);
  assert.ok(solution);
  assert.ok(validateSolutionPath(maze, solution, getColorConfig(level).colorSequence));
});

test('VISION 1 reveals the player and at most one cell on each cardinal ray', () => {
  const tiles = Array.from({ length: 9 }, () => Array(9).fill('floor'));
  const vision = getVisionCells({ width: 9, height: 9, tiles }, { x: 4, y: 4 }, 1);
  assert.deepEqual([...vision.visibleCells].sort(), ['3,4', '4,3', '4,4', '4,5', '5,4']);
});

test('Full Vision treats all terrain as visible and clears symbol-only memory markers', () => {
  const maze = { width: 7, height: 7, tiles: Array.from({ length: 7 }, () => Array(7).fill('floor')) };
  const history = [{ x: 1, y: 1 }, { x: 2, y: 1 }];
  const vision = getEffectiveVisionCells(maze, { x: 3, y: 3 }, 1, true);
  assert.equal(vision.visibleCells.size, 49);
  assert.equal(vision.mainVisionCells.size, 5, 'debug ray sets still describe the ordinary Vision algorithm');
  const markers = getMemoryMarkers(maze, history, 3, vision.visibleCells);
  assert.equal(markers.memoryPathCells.size + markers.memoryWallCells.size, 0);
});

test('VISION 3 adds one side cell beside each main ray cell with remaining range', () => {
  const tiles = Array.from({ length: 9 }, () => Array(9).fill('floor'));
  const vision = getVisionCells({ width: 9, height: 9, tiles }, { x: 4, y: 4 }, 3);
  for (const key of ['4,4', '4,1', '4,7', '1,4', '7,4']) assert.ok(vision.mainVisionCells.has(key));
  for (const key of ['3,3', '5,3', '3,5', '5,5', '3,2', '5,2', '3,6', '5,6', '2,3', '2,5', '6,3', '6,5']) {
    assert.ok(vision.sideVisionCells.has(key), `${key} should be in side Vision`);
  }
  for (const key of ['3,1', '3,7', '1,3', '1,5', '6,2', '2,6']) assert.ok(!vision.visibleCells.has(key));
  assert.equal(vision.sideVisionCells.size, 12);
});

test('a wall stops its main ray and also produces side Vision when range remains', () => {
  const tiles = Array.from({ length: 9 }, () => Array(9).fill('floor'));
  tiles[4][6] = 'wall'; tiles[3][6] = 'wall';
  const vision = getVisionCells({ width: 9, height: 9, tiles }, { x: 4, y: 4 }, 4);
  assert.ok(vision.mainVisionCells.has('6,4'));
  assert.ok(!vision.visibleCells.has('7,4'));
  for (const key of ['5,3', '5,5', '6,3', '6,5']) assert.ok(vision.sideVisionCells.has(key));
  assert.equal(tiles[3][6], 'wall', 'a side-visible wall is still shown as its normal terrain');
  assert.ok(!vision.visibleCells.has('6,2') && !vision.visibleCells.has('6,6') && !vision.visibleCells.has('8,3'));
});

test('main ray cells at the range limit do not produce side Vision', () => {
  const tiles = Array.from({ length: 9 }, () => Array(9).fill('floor'));
  tiles[4][6] = 'wall';
  const vision = getVisionCells({ width: 9, height: 9, tiles }, { x: 4, y: 4 }, 2);
  assert.ok(vision.mainVisionCells.has('6,4'));
  assert.deepEqual([...vision.sideVisionCells].sort(), ['3,3', '3,5', '5,3', '5,5']);
  assert.ok(!vision.visibleCells.has('7,4') && !vision.sideVisionCells.has('6,3'));
});

test('side Vision is symmetric on all four rays and never spreads again', () => {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const tiles = Array.from({ length: 9 }, () => Array(9).fill('floor'));
    const wall = { x: 4 + dx * 2, y: 4 + dy * 2 };
    tiles[wall.y][wall.x] = 'wall';
    const vision = getVisionCells({ width: 9, height: 9, tiles }, { x: 4, y: 4 }, 4);
    const px = -dy, py = dx;
    const nearRay = { x: 4 + dx, y: 4 + dy };
    assert.ok(vision.mainVisionCells.has(`${wall.x},${wall.y}`), 'the wall itself remains visible in each direction');
    assert.ok(vision.sideVisionCells.has(`${nearRay.x + px},${nearRay.y + py}`));
    assert.ok(vision.sideVisionCells.has(`${nearRay.x - px},${nearRay.y - py}`));
    assert.ok(vision.sideVisionCells.has(`${wall.x + px},${wall.y + py}`));
    assert.ok(vision.sideVisionCells.has(`${wall.x - px},${wall.y - py}`));
    assert.ok(!vision.visibleCells.has(`${wall.x + dx},${wall.y + dy}`));
    assert.ok(!vision.visibleCells.has(`${wall.x + px * 2},${wall.y + py * 2}`), 'side cells never emit their own side Vision');
  }
});

test('a ray ending at the map boundary exposes sides from its visible main cells only', () => {
  const tiles = Array.from({ length: 7 }, () => Array(7).fill('floor'));
  const withRange = getVisionCells({ width: 7, height: 7, tiles }, { x: 5, y: 3 }, 3);
  assert.ok(withRange.visibleCells.has('6,3'));
  assert.ok(withRange.sideVisionCells.has('6,2') && withRange.sideVisionCells.has('6,4'));
  const noRange = getVisionCells({ width: 7, height: 7, tiles }, { x: 5, y: 3 }, 1);
  assert.equal(noRange.sideVisionCells.size, 0);
  assert.ok(!noRange.visibleCells.has('6,2') && !noRange.visibleCells.has('6,4'));
});

test('memory keeps deduplicated path dots and only adjacent wall markers outside current Vision', () => {
  const history = [];
  for (const p of [{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 2, y: 3 }]) recordMovement(history, p);
  const maze = {
    width: 7, height: 7,
    tiles: Array.from({ length: 7 }, () => Array(7).fill('floor')),
  };
  maze.tiles[2][2] = 'wall';
  maze.tiles[3][3] = 'wall'; // Shared by two recent positions; render one marker.
  maze.tiles[4][4] = 'wall';
  const visible = new Set(['4,3', '4,4']);
  const { memoryPathCells, memoryWallCells } = getMemoryMarkers(maze, history, 3, visible);
  assert.deepEqual([...memoryPathCells].sort(), ['2,3']);
  assert.deepEqual([...memoryWallCells].sort(), ['2,2', '3,3']);
  assert.ok(!memoryPathCells.has('4,3'), 'current Vision suppresses the remembered path dot');
  assert.ok(!memoryWallCells.has('4,4'), 'current Vision suppresses the remembered wall cross');
  assert.ok(!memoryWallCells.has('2,4'), 'adjacent floor cells leave no marker');
  assert.deepEqual(history.map(positionKey), ['1,3', '2,3', '4,3', '2,3']);
});

test('movement history keeps repeated visits as separate movement events', () => {
  const history = [];
  for (const p of [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 1 }]) recordMovement(history, p);
  assert.deepEqual(history.map(positionKey), ['1,1', '2,1', '3,1', '2,1', '1,1']);
});

test('effective memory step count limits path dots and recalculates wall crosses as old positions expire', () => {
  const history = [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }];
  const maze = {
    width: 8, height: 6,
    tiles: Array.from({ length: 6 }, () => Array(8).fill('floor')),
  };
  maze.tiles[2][1] = 'wall'; // Only adjacent to the oldest position in this selected window.
  maze.tiles[3][3] = 'wall';
  const first = getMemoryMarkers(maze, history, 3);
  assert.deepEqual([...first.memoryPathCells].sort(), ['2,2', '3,2', '4,2']);
  assert.ok(first.memoryWallCells.has('1,2'));
  assert.equal(recentHistory(history, 3).length, 3);

  history.push({ x: 5, y: 2 });
  const afterNextMove = getMemoryMarkers(maze, history, 3);
  assert.deepEqual([...afterNextMove.memoryPathCells].sort(), ['3,2', '4,2', '5,2']);
  assert.ok(!afterNextMove.memoryWallCells.has('1,2'));
  assert.ok(afterNextMove.memoryWallCells.has('3,3'), 'a wall stays while a newer position still borders it');
  assert.equal(recentHistory(history, 5).length, 5);
});

test('Vision reveals terrain and color targets follow separate timed visibility rules', () => {
  const visible = new Set(['2,2']);
  assert.deepEqual(cellVisibility({ x: 1, y: 0 }, visible), { visible: false, reveal: false });
  assert.deepEqual(cellVisibility({ x: 0, y: 0 }, visible), { visible: false, reveal: false });
  assert.deepEqual(cellVisibility({ x: 2, y: 2 }, visible), { visible: true, reveal: true });
  assert.deepEqual(cellVisibility({ x: 0, y: 0 }, visible, true), { visible: false, reveal: true });
  assert.equal(isFeatureVisible({ kind: 'color' }, false, false), false);
  assert.equal(isFeatureVisible({ kind: 'color' }, true, false), true);
  assert.equal(isFeatureVisible({ kind: 'color' }, false, true), true);
  assert.equal(isFeatureVisible({ kind: 'color', completed: true }, true, true, true), false);
  for (const kind of ['nne', 'coo', 'exit']) assert.equal(isFeatureVisible({ kind }, false, false), true);
  assert.equal(isFeatureVisible({ kind: 'wall' }, false, false), false);
  assert.equal(isFeatureVisible({ kind: 'wall' }, false, false, true), true);
});

test('Color Memory starts on Vision, pauses in sight, fades on successful moves, refreshes, and clears on pickup', () => {
  const state = {
    memoryLevel: 3,
    colorMemory: new Map(),
    maze: { colors: [
      { x: 3, y: 3, id: 'red_1', color: 'red', kind: 'color', completed: false },
      { x: 5, y: 3, id: 'purple_1', color: 'purple', kind: 'color', completed: false },
    ] },
  };
  updateColorMemory(state, new Set(['3,3', '5,3'])); // Both correct and wrong colors are remembered.
  assert.equal(getEffectiveMemorySteps(state.memoryLevel), 12);
  assert.deepEqual([...state.colorMemory], [['red_1', 12], ['purple_1', 12]]);

  updateColorMemory(state, new Set(['1,1']), true);
  assert.equal(state.colorMemory.get('red_1'), 11);
  updateColorMemory(state, new Set(['5,3']), true);
  assert.equal(state.colorMemory.get('purple_1'), 12, 'a visible target refreshes without losing a step');
  state.memoryLevel = 4;
  updateColorMemory(state, new Set(['5,3']));
  assert.equal(state.colorMemory.get('purple_1'), 16, 'a later sighting refreshes using the current MEM level');

  for (let step = 0; step < 16; step++) updateColorMemory(state, new Set(), true);
  assert.equal(state.colorMemory.has('purple_1'), false, 'the target is forgotten after its effective memory window');

  state.colorMemory.set('red_1', 16);
  state.maze.colors[0].completed = true;
  updateColorMemory(state, new Set(['3,3']));
  assert.equal(state.colorMemory.has('red_1'), false, 'collected targets immediately leave color memory');
});

test('any uncompleted matching target works, while each physical color tile completes once', () => {
  const state = makeObjectiveState();
  assert.equal(resolveColor(state, 'red_2').type, 'correct');
  assert.equal(state.maze.colors.find(target => target.id === 'red_2').completed, true);
  assert.ok(!Object.hasOwn(state.maze.colors.find(target => target.id === 'red_2'), 'everActivated'));
  assert.equal(state.maze.colors.find(target => target.id === 'red_1').completed, false);
  assert.equal(resolveColor(state, 'red_2').type, 'revisit');
  assert.equal(state.sequenceProgress, 1);
  assert.equal(resolveColor(state, 'orange_1').type, 'correct');
  assert.equal(resolveColor(state, 'yellow_1').type, 'round-complete');
  assert.equal(currentRound(state), 2);
  assert.equal(nextColor(state), 'red');
  assert.equal(resolveColor(state, 'red_2').type, 'revisit');
  assert.equal(state.sequenceProgress, 3);
  assert.equal(resolveColor(state, 'red_1').type, 'correct');
  assert.equal(resolveColor(state, 'orange_2').type, 'correct');
  assert.equal(resolveColor(state, 'yellow_2').type, 'complete');
  assert.equal(state.sequenceProgress, 6);
  assert.equal(currentRound(state), 2);
  assert.equal(nextColor(state), null);
});

test('wrong direct color resolution is blocked without resetting progress or upgrades', () => {
  const state = makeObjectiveState();
  state.visionRange = 4; state.memoryLevel = 8;
  assert.equal(resolveColor(state, 'red_1').type, 'correct');
  assert.equal(resolveColor(state, 'red_1').type, 'revisit');
  assert.equal(state.sequenceProgress, 1);
  assert.equal(resolveColor(state, 'yellow_1').type, 'blocked');
  assert.equal(state.sequenceProgress, 1);
  assert.deepEqual(state.completedTargetOrder, ['red_1']);
  assert.equal(state.maze.colors.find(target => target.id === 'red_1').completed, true);
  assert.equal(isFeatureVisible(state.maze.colors.find(target => target.id === 'red_1'), true, true), false);
  assert.deepEqual(state.player, { x: 1, y: 1 });
  assert.deepEqual(state.movementHistory, [{ x: 1, y: 1 }]);
  assert.equal(state.visionRange, 4);
  assert.equal(state.memoryLevel, 8);
  assert.equal(state.nneCollected, 0);
  assert.equal(state.cooCollected, 0);
});

test('wrong uncollected colors act as doors and collisions consume no step or memory', () => {
  const level = {
    ...LEVELS[0], baseColorOrder: ['red', 'orange'], colorRounds: 1,
    colorCopies: { red: 1, orange: 1 },
  };
  const tiles = Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => x && y && x < 4 && y < 4 ? 'floor' : 'wall'));
  const maze = {
    width: 5, height: 5, tiles, spawn: { x: 1, y: 1 }, exit: { x: 3, y: 3 }, items: [],
    colors: [
      { x: 2, y: 1, id: 'red_1', color: 'red', kind: 'color', completed: false },
      { x: 3, y: 1, id: 'orange_1', color: 'orange', kind: 'color', completed: false },
      { x: 2, y: 2, id: 'blue_extra', color: 'blue', kind: 'color', completed: false },
    ],
  };
  const state = {
    level, maze, player: { ...maze.spawn }, steps: 0, sequenceProgress: 0, completedTargetOrder: [],
    visionRange: LEVELS[0].visionRange, memoryLevel: LEVELS[0].initialMemoryLevel, movementHistory: [], colorMemory: new Map(),
    nneCollected: 0, cooCollected: 0, won: false,
  };

  const red = takeTurn(state, 'right');
  assert.equal(red.moved, true);
  assert.equal(state.sequenceProgress, 1);
  assert.equal(maze.colors.find(target => target.id === 'red_1').completed, true);
  assert.equal(maze.colors.find(target => target.id === 'blue_extra').completed, false);
  const before = {
    player: { ...state.player }, steps: state.steps, history: structuredClone(state.movementHistory),
    progress: state.sequenceProgress, memory: new Map(state.colorMemory),
  };

  const blocked = takeTurn(state, 'down');
  assert.deepEqual(blocked, { moved: false, reason: 'color-locked', targetId: 'blue_extra' });
  assert.deepEqual(state.player, before.player);
  assert.equal(state.steps, before.steps);
  assert.deepEqual(state.movementHistory, before.history);
  assert.equal(state.sequenceProgress, before.progress);
  assert.deepEqual(state.colorMemory, before.memory);

  assert.equal(takeTurn(state, 'right').moved, true, 'the currently required color can be entered');
  assert.equal(state.sequenceProgress, 2);
  assert.equal(takeTurn(state, 'left').moved, true, 'a collected color tile becomes ordinary floor');
  assert.equal(state.sequenceProgress, 2, 'walking through a collected target cannot trigger again');
  assert.equal(takeTurn(state, 'down').reason, 'color-locked', 'uncollected extra colors remain blocked after the sequence ends');
});

test('solver routes around wrong-color gates and rejects stored paths through them', () => {
  const level = {
    ...LEVELS[0], baseColorOrder: ['red', 'orange'], colorRounds: 1,
    colorCopies: { red: 1, orange: 1 },
  };
  const maze = {
    width: 5, height: 5,
    tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => x && y && x < 4 && y < 4 ? 'floor' : 'wall')),
    spawn: { x: 1, y: 1 }, exit: { x: 3, y: 3 },
    colors: [
      { x: 2, y: 1, id: 'red_1', color: 'red', kind: 'color', completed: false },
      { x: 1, y: 2, id: 'orange_1', color: 'orange', kind: 'color', completed: false },
      { x: 3, y: 1, id: 'blue_extra', color: 'blue', kind: 'color', completed: false },
    ],
    items: [], solutionPath: ['right', 'right', 'down', 'down'],
  };
  const sequence = getColorConfig(level).colorSequence;
  assert.equal(validateSolutionPath(maze, maze.solutionPath, sequence), false);
  const solution = solveMaze(maze, sequence);
  assert.ok(solution);
  assert.ok(validateSolutionPath(maze, solution, sequence));
  let position = { ...maze.spawn }, progress = 0;
  for (const direction of solution) {
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
    position = { x: position.x + dx, y: position.y + dy };
    const target = maze.colors.find(item => item.x === position.x && item.y === position.y);
    if (target && target.color === sequence[progress]) progress++;
    assert.notEqual(target?.id, 'blue_extra');
  }
});

test('NNE extends vision by one and COO immediately extends the selected memory history', () => {
  const maze = generateMaze(LEVELS[0]);
  maze.width = 41; maze.height = 41;
  maze.tiles = Array.from({ length: maze.height }, () => Array(maze.width).fill('floor'));
  maze.tiles[1][10] = 'wall';
  maze.items = [{ x: 2, y: 2, kind: 'nne' }, { x: 3, y: 2, kind: 'coo' }];
  maze.colors = [{ x: 5, y: 2, id: 'red_1', color: 'red', kind: 'color', completed: false }];
  const state = {
    maze, player: { x: 2, y: 2 }, level: LEVELS[0], visionRange: LEVELS[0].visionRange,
    memoryLevel: LEVELS[0].initialMemoryLevel, movementHistory: Array.from({ length: 30 }, (_, i) => ({ x: i + 1, y: 1 })),
    colorMemory: new Map(), nneCollected: 0, cooCollected: 0,
  };
  const baseVision = getVisionCells(maze, state.player, state.visionRange);
  assert.ok(baseVision.visibleCells.has('4,2'));
  assert.ok(!baseVision.visibleCells.has('5,2'));
  assert.equal(collectItem(state), 'nne'); assert.equal(state.visionRange, 3); assert.equal(collectItem(state), null);
  const boostedVision = getVisionCells(maze, state.player, state.visionRange);
  assert.ok(boostedVision.mainVisionCells.has('5,2'));
  assert.ok(boostedVision.sideVisionCells.has('4,1') && boostedVision.sideVisionCells.has('4,3'));
  assert.ok(!boostedVision.visibleCells.has('5,1'), 'NNE side cells do not emit secondary Vision');
  const baseEffectiveMemory = getEffectiveMemorySteps(state.memoryLevel);
  assert.equal(state.memoryLevel, 3);
  assert.equal(baseEffectiveMemory, 12);
  assert.equal(recentHistory(state.movementHistory, baseEffectiveMemory).length, 12);
  const beforeCoo = getMemoryMarkers(maze, state.movementHistory, baseEffectiveMemory);
  state.player = { x: 3, y: 2 }; assert.equal(collectItem(state), 'coo'); assert.equal(state.memoryLevel, 5);
  const upgradedEffectiveMemory = getEffectiveMemorySteps(state.memoryLevel);
  assert.equal(upgradedEffectiveMemory, 20);
  assert.equal(recentHistory(state.movementHistory, upgradedEffectiveMemory).length, 20);
  const afterCoo = getMemoryMarkers(maze, state.movementHistory, upgradedEffectiveMemory);
  assert.equal(afterCoo.memoryPathCells.size, beforeCoo.memoryPathCells.size + 8);
  assert.ok(afterCoo.memoryPathCells.has('11,1') && !beforeCoo.memoryPathCells.has('11,1'));
  assert.ok(!beforeCoo.memoryWallCells.has('10,1') && afterCoo.memoryWallCells.has('10,1'));
  updateColorMemory(state, getVisionCells(maze, state.player, state.visionRange).visibleCells, true);
  assert.equal(state.colorMemory.get('red_1'), 20, 'a color seen after COO receives the larger memory duration');
  assert.equal(state.nneCollected, 1); assert.equal(state.cooCollected, 1);
});

test('only successful player moves add movement history', () => {
  const maze = generateMaze(LEVELS[0]);
  const rememberedTarget = maze.colors[0];
  const state = {
    maze, player: { ...maze.spawn }, steps: 0, movementHistory: [], level: LEVELS[0],
    visionRange: LEVELS[0].visionRange, memoryLevel: LEVELS[0].initialMemoryLevel, sequenceProgress: 0, completedTargetOrder: [],
    colorMemory: new Map([[rememberedTarget.id, 2]]),
    won: false, nneCollected: 0, cooCollected: 0,
  };
  assert.equal(takeTurn(state, 'left').moved, false);
  assert.equal(state.steps, 0); assert.equal(state.movementHistory.length, 0);
  assert.equal(state.colorMemory.get(rememberedTarget.id), 2, 'a wall collision does not advance color memory');
  const direction = [['right', 1, 0], ['down', 0, 1]].find(([, dx, dy]) => isWalkable(maze, state.player.x + dx, state.player.y + dy))[0];
  assert.equal(takeTurn(state, direction).moved, true);
  assert.equal(state.steps, 1); assert.equal(state.movementHistory.length, 1);
  state.won = true; assert.equal(takeTurn(state, direction).moved, false);
  assert.equal(state.steps, 1); assert.equal(state.movementHistory.length, 1);
});

test('PC direction keys map to one-step movement directions', () => {
  for (const [key, direction] of Object.entries({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right', W: 'up', A: 'left', S: 'down', D: 'right' })) {
    assert.equal(directionForKey(key), direction);
  }
  assert.equal(directionForKey('Enter'), null);
});

test('mobile swipe and relative tap resolve to one cardinal direction with thresholds', () => {
  assert.equal(SWIPE_THRESHOLD, 30);
  assert.equal(TAP_DEAD_ZONE, 24);
  for (const [dx, dy, expected] of [[80, 4, 'right'], [-80, 4, 'left'], [4, -80, 'up'], [4, 80, 'down']]) {
    assert.equal(directionForSwipe(dx, dy), expected, 'long swipes still resolve to one cell direction');
  }
  assert.equal(directionForSwipe(18, 0), null, 'sub-threshold movement is not treated as a swipe');
  for (const [x, y, expected] of [[100, 50, 'up'], [100, 150, 'down'], [50, 100, 'left'], [150, 100, 'right']]) {
    assert.equal(directionForTap(x, y, 100, 100), expected);
  }
  assert.equal(directionForTap(115, 112, 100, 100), null, 'taps inside the player dead zone do not move');
  assert.equal(directionForTap(130, 130, 100, 100), 'down', 'diagonal ties prioritize vertical direction');
});

test('mobile maze pointer gesture dispatches only once and all inputs share the move callback', () => {
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const listeners = new Map(), boardListeners = new Map(), moves = [];
  const playerCell = { getBoundingClientRect: () => ({ left: 90, top: 90, width: 20, height: 20 }) };
  const board = {
    addEventListener: (type, listener) => boardListeners.set(type, listener),
    querySelector: selector => selector === '.cell.player' ? playerCell : null,
    setPointerCapture() {},
  };
  const buttons = ['up', 'left', 'down', 'right'].map(dir => ({
    dataset: { dir }, addEventListener: (type, listener) => listeners.set(`button:${dir}`, listener),
  }));
  globalThis.HTMLElement = class { matches() { return false; } };
  globalThis.window = {
    addEventListener: (type, listener) => listeners.set(`window:${type}`, listener),
    matchMedia: () => ({ matches: true }),
  };
  globalThis.document = {
    querySelectorAll: () => buttons,
    getElementById: id => id === 'board' ? board : null,
  };
  try {
    bindInput(direction => moves.push(direction), () => {});
    const dispatchGesture = (startX, startY, endX, endY) => {
      const event = (x, y) => ({ pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, preventDefault() {} });
      boardListeners.get('pointerdown')(event(startX, startY));
      boardListeners.get('pointerup')(event(endX, endY));
      boardListeners.get('pointerup')(event(endX, endY)); // Duplicate end / synthesized follow-up cannot move again.
    };
    dispatchGesture(50, 100, 130, 104);
    assert.deepEqual(moves, ['right']);
    dispatchGesture(100, 150, 100, 50);
    assert.deepEqual(moves, ['right', 'up']);
    dispatchGesture(100, 100, 111, 108);
    assert.deepEqual(moves, ['right', 'up'], 'a tap in the player dead zone does nothing');
    dispatchGesture(100, 60, 100, 60);
    dispatchGesture(100, 140, 100, 140);
    dispatchGesture(60, 100, 60, 100);
    dispatchGesture(140, 100, 140, 100);
    assert.deepEqual(moves, ['right', 'up', 'up', 'down', 'left', 'right'], 'relative taps dispatch each of the four directions once');
    listeners.get('button:left')({ preventDefault() {} });
    assert.deepEqual(moves, ['right', 'up', 'up', 'down', 'left', 'right', 'left'], 'direction buttons use the same movement callback');
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});

test('mobile direction buttons move on pointer input', () => {
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const listeners = new Map();
  const buttons = ['up', 'left', 'down', 'right'].map(dir => ({
    dataset: { dir }, addEventListener: (type, listener) => listeners.set(dir, listener),
  }));
  globalThis.HTMLElement = class { matches() { return false; } };
  globalThis.window = { addEventListener: (type, listener) => listeners.set(`window:${type}`, listener) };
  globalThis.document = { querySelectorAll: () => buttons };
  try {
    const moves = [];
    bindInput(direction => moves.push(direction), () => {});
    listeners.get('window:keydown')({ key: 'ArrowUp', preventDefault() {}, target: null });
    listeners.get('left')({ preventDefault() {} });
    assert.deepEqual(moves, ['up', 'left']);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});

test('Auto Solve can execute each of the ten gated campaign solutions through the exit', () => {
  for (const level of LEVELS) {
    const maze = generateMaze(level);
    const sequence = getColorConfig(level).colorSequence;
    const solution = solveMaze(maze, sequence);
    assert.ok(solution);
    const state = {
      level, maze, player: { ...maze.spawn }, steps: 0, sequenceProgress: 0, completedTargetOrder: [],
      visionRange: level.visionRange, memoryLevel: level.initialMemoryLevel, movementHistory: [],
      revealedBackgroundParts: 0, fullVisionMode: false,
      nneCollected: 0, cooCollected: 0, won: false,
    };
    for (const direction of solution) {
      const previousVision = state.visionRange, previousMemoryLevel = state.memoryLevel;
      const turn = takeTurn(state, direction);
      assert.equal(turn.moved, true, `${level.name}: ${direction}`);
      if (turn.item === 'nne') assert.equal(state.visionRange, previousVision + level.itemEffects.nneVisionBonus, `${level.name}: NNE applies its configured bonus`);
      if (turn.item === 'coo') assert.equal(state.memoryLevel, previousMemoryLevel + level.itemEffects.cooMemoryBonus, `${level.name}: COO applies its configured bonus`);
      assert.equal(state.revealedBackgroundParts, state.sequenceProgress, `${level.name}: one image part per color target`);
      assert.equal(state.fullVisionMode, state.sequenceProgress === sequence.length, `${level.name}: Full Vision starts on the final target`);
    }
    assert.equal(state.sequenceProgress, sequence.length);
    assert.equal(state.revealedBackgroundParts, 12);
    assert.equal(state.fullVisionMode, true);
    assert.equal(getEffectiveVisionCells(maze, state.player, state.visionRange, state.fullVisionMode).visibleCells.size, maze.width * maze.height);
    assert.equal(state.won, true);
    assert.ok(state.maze.colors.every(target => target.completed));
    assert.ok(state.nneCollected >= Number(level.nneCount > 0));
    assert.ok(state.cooCollected >= Number(level.cooCount > 0));
    assert.equal(state.visionRange, level.visionRange + state.nneCollected * level.itemEffects.nneVisionBonus);
    assert.equal(state.memoryLevel, level.initialMemoryLevel + state.cooCollected * level.itemEffects.cooMemoryBonus);
    assert.equal(getEffectiveMemorySteps(state.memoryLevel), state.memoryLevel * 4);
    assert.equal(state.steps, solution.length);
  }
});

test('the exit stays locked after round one and unlocks only after the last distinct target', () => {
  const level = { ...LEVELS[0], baseColorOrder: ['red'], colorRounds: 2, colorCopies: { red: 2 } };
  const tiles = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => x && y && x < 6 && y < 6 ? 'floor' : 'wall'));
  const maze = {
    width: 7, height: 7, tiles, spawn: { x: 1, y: 1 }, exit: { x: 2, y: 1 },
    colors: [
      { x: 1, y: 2, kind: 'color', id: 'red_1', color: 'red', completed: false },
      { x: 2, y: 2, kind: 'color', id: 'red_2', color: 'red', completed: false },
    ], items: [],
  };
  const state = {
    level, maze, player: { ...maze.spawn }, steps: 0, sequenceProgress: 0, completedTargetOrder: [],
    visionRange: 1, memoryLevel: level.initialMemoryLevel, movementHistory: [], nneCollected: 0, cooCollected: 0, won: false,
  };
  assert.equal(takeTurn(state, 'right').exitLocked, true);
  takeTurn(state, 'left');
  assert.equal(takeTurn(state, 'down').colorResult.type, 'round-complete');
  assert.equal(takeTurn(state, 'right').colorResult.type, 'complete');
  assert.equal(state.won, false);
  assert.equal(takeTurn(state, 'up').won, true);
  assert.equal(state.sequenceProgress, 2);
});
