import { GAME_CONFIG } from './config.js';

const RAYS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const PERMANENT_FEATURES = new Set(['exit', 'nne', 'coo']);
export const positionKey = ({ x, y }) => `${x},${y}`;

export function getEffectiveMemorySteps(memoryLevel) {
  return Math.max(0, Math.floor(memoryLevel ?? 0)) * GAME_CONFIG.memoryStepMultiplier;
}

export function isFeatureVisible(feature, currentlyVisible, colorRemembered = false, debug = false) {
  if (!feature) return false;
  if (feature.kind === 'color' && feature.completed) return false;
  if (debug || PERMANENT_FEATURES.has(feature.kind)) return true;
  return currentlyVisible || colorRemembered;
}

export function getVisionCells(maze, player, visionRange) {
  const mainVisionCells = new Set([positionKey(player)]);
  const sideCandidates = new Set();

  for (const [dx, dy] of RAYS) {
    for (let distance = 1; distance <= visionRange; distance++) {
      const x = player.x + dx * distance, y = player.y + dy * distance;
      if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) break;
      const key = `${x},${y}`;
      mainVisionCells.add(key);

      const remainingVision = visionRange - distance;
      addPerpendicularCells(sideCandidates, x, y, dx, dy, maze.width, maze.height, remainingVision);
      if (maze.tiles[y][x] === 'wall') break; // Show the wall, then stop this ray.
    }
  }

  // Side cells are a one-cell fringe from the main rays. They never become
  // ray origins; if a side cell is also a cardinal ray cell, main vision wins.
  const sideVisionCells = new Set([...sideCandidates].filter(key => !mainVisionCells.has(key)));
  const visibleCells = new Set([...mainVisionCells, ...sideVisionCells]);
  return { visibleCells, mainVisionCells, sideVisionCells };
}

export function getEffectiveVisionCells(maze, player, visionRange, fullVisionMode = false) {
  const vision = getVisionCells(maze, player, visionRange);
  if (!fullVisionMode) return vision;

  const visibleCells = new Set();
  for (let y = 0; y < maze.height; y++) for (let x = 0; x < maze.width; x++) visibleCells.add(`${x},${y}`);
  return { ...vision, visibleCells };
}

function addPerpendicularCells(candidates, x, y, dx, dy, width, height, remainingVision) {
  if (remainingVision < 1) return;
  // Side cells are relative to the ray direction and are added only once.
  const sideX = -dy, sideY = dx;
  for (const sign of [-1, 1]) {
    const sx = x + sideX * sign, sy = y + sideY * sign;
    if (sx >= 0 && sy >= 0 && sx < width && sy < height) candidates.add(`${sx},${sy}`);
  }
}

/**
 * Build the symbol-only memory layer. Terrain is never revealed by these sets:
 * a path set entry means only “the player stood here”, and a wall set entry
 * means only “a recent position had a wall on this side”.
 */
export function getMemoryMarkers(maze, movementHistory, effectiveMemorySteps, visibleCells = new Set()) {
  const memoryPathCells = new Set();
  const memoryWallCells = new Set();

  for (const position of recentHistory(movementHistory, effectiveMemorySteps)) {
    if (position.x < 0 || position.y < 0 || position.x >= maze.width || position.y >= maze.height) continue;

    const pathKey = positionKey(position);
    if (!visibleCells.has(pathKey)) memoryPathCells.add(pathKey);

    for (const [dx, dy] of RAYS) {
      const x = position.x + dx, y = position.y + dy;
      if (x < 0 || y < 0 || x >= maze.width || y >= maze.height) continue;
      if (maze.tiles[y]?.[x] !== 'wall') continue;
      const wallKey = `${x},${y}`;
      if (!visibleCells.has(wallKey)) memoryWallCells.add(wallKey);
    }
  }

  return { memoryPathCells, memoryWallCells };
}

/**
 * Track uncollected color targets that have entered the player's real Vision.
 * The Map key is target id and its value is the remaining successful moves.
 */
export function updateColorMemory(state, visibleCells, successfulMove = false) {
  if (!(state.colorMemory instanceof Map)) state.colorMemory = new Map();
  const memories = state.colorMemory;
  const activeIds = new Set();

  for (const target of state.maze.colors) {
    activeIds.add(target.id);
    if (target.completed) {
      memories.delete(target.id);
      continue;
    }

    if (visibleCells.has(positionKey(target))) {
      memories.set(target.id, getEffectiveMemorySteps(state.memoryLevel));
      continue;
    }
    if (!successfulMove || !memories.has(target.id)) continue;

    const remaining = memories.get(target.id) - 1;
    if (remaining <= 0) memories.delete(target.id);
    else memories.set(target.id, remaining);
  }

  for (const id of memories.keys()) if (!activeIds.has(id)) memories.delete(id);
  return memories;
}

export function recordMovement(history, player) {
  history.push({ x: player.x, y: player.y });
}

/** Terrain is shown only by current Vision (or the full-map debug override). */
export function cellVisibility(position, visibleCells, debug = false) {
  const visible = visibleCells.has(positionKey(position));
  return { visible, reveal: visible || debug };
}

export function recentHistory(movementHistory, effectiveMemorySteps) {
  const count = Math.max(0, Math.floor(effectiveMemorySteps));
  return count === 0 ? [] : movementHistory.slice(-count);
}
