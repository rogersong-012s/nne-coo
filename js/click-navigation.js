import { ALLOW_MEMORY_CLICK_MOVE, CLICK_MOVE_STEP_INTERVAL, DIRECTION } from './config.js';
import { canMovePlayerTo } from './player.js';
import { getEffectiveMemorySteps, getEffectiveVisionCells, getMemoryMarkers, positionKey } from './memory.js';

const entries = Object.entries(DIRECTION);

export function createClickNavigationSnapshot(state, allowMemoryNavigation = ALLOW_MEMORY_CLICK_MOVE) {
  const vision = getEffectiveVisionCells(state.maze, state.player, state.visionRange, state.fullVisionMode || state.lightModeActive);
  const markers = state.fullVisionMode || state.lightModeActive
    ? { memoryPathCells: new Set(), memoryWallCells: new Set() }
    : getMemoryMarkers(state.maze, state.movementHistory, getEffectiveMemorySteps(state.memoryLevel), vision.visibleCells);
  const colorMemoryTargets = new Set();
  const knownSpecialTargets = new Set([positionKey(state.maze.exit)]);
  for (const item of state.maze.items) {
    if (item.kind === 'nne' || item.kind === 'coo') knownSpecialTargets.add(positionKey(item));
  }
  if (allowMemoryNavigation) {
    for (const target of state.maze.colors) {
      if (!target.completed && (state.colorMemory?.get(target.id) ?? 0) > 0) colorMemoryTargets.add(positionKey(target));
    }
  }
  return {
    state,
    start: { ...state.player },
    vision,
    visibleCells: vision.visibleCells,
    memoryPathCells: markers.memoryPathCells,
    memoryWallCells: markers.memoryWallCells,
    colorMemoryTargets,
    knownSpecialTargets,
    allowMemoryNavigation,
  };
}

function isPathNodeKnown(snapshot, key) {
  return snapshot.visibleCells.has(key)
    || (snapshot.allowMemoryNavigation && snapshot.memoryPathCells.has(key));
}

function isWalkableKnownNode(snapshot, x, y) {
  const key = `${x},${y}`;
  if (!isPathNodeKnown(snapshot, key) || snapshot.memoryWallCells.has(key)) return false;
  return canMovePlayerTo(snapshot.state, x, y).allowed;
}

function isMemoryColorGoal(snapshot, key) {
  return snapshot.allowMemoryNavigation
    && snapshot.colorMemoryTargets.has(key)
    && !snapshot.visibleCells.has(key);
}

function isKnownSpecialGoal(snapshot, key) {
  return snapshot.knownSpecialTargets?.has(key) ?? false;
}

function reconstructDirections(previous, endKey) {
  const directions = [];
  for (let key = endKey; previous.get(key)?.from !== null; ) {
    const step = previous.get(key);
    if (!step) return null;
    directions.push(step.direction);
    key = step.from;
  }
  return directions.reverse();
}

function breadthFirstSearch(snapshot, target = null) {
  const startKey = positionKey(snapshot.start);
  const targetKey = target ? positionKey(target) : null;
  const previous = new Map([[startKey, { from: null, direction: null }]]);
  const queue = [{ ...snapshot.start }];

  if (targetKey === startKey) return { previous, path: [] };
  if (target && !isPathNodeKnown(snapshot, targetKey)
    && !isMemoryColorGoal(snapshot, targetKey) && !isKnownSpecialGoal(snapshot, targetKey)) return null;
  if (target && !canMovePlayerTo(snapshot.state, target.x, target.y).allowed) return null;
  if (target && snapshot.memoryWallCells.has(targetKey)) return null;

  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const [direction, [dx, dy]] of entries) {
      const x = point.x + dx, y = point.y + dy, key = `${x},${y}`;
      if (previous.has(key)) continue;
      const isGoal = key === targetKey;
      if (snapshot.memoryWallCells.has(key)) continue;
      if (!isGoal && !isWalkableKnownNode(snapshot, x, y)) continue;
      if (isGoal && !isPathNodeKnown(snapshot, key)
        && !isMemoryColorGoal(snapshot, key) && !isKnownSpecialGoal(snapshot, key)) continue;
      if (!canMovePlayerTo(snapshot.state, x, y).allowed) continue;

      previous.set(key, { from: positionKey(point), direction });
      if (isGoal) return { previous, path: reconstructDirections(previous, key) };
      queue.push({ x, y });
    }
  }

  return target ? null : { previous, path: null };
}

export function findClickMovePath(snapshot, target) {
  if (!snapshot || !target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return null;
  if (target.x < 0 || target.y < 0 || target.x >= snapshot.state.maze.width || target.y >= snapshot.state.maze.height) return null;
  return breadthFirstSearch(snapshot, target)?.path ?? null;
}

export function getClickMoveReachableCells(snapshot) {
  if (!snapshot) return new Set();
  const tree = breadthFirstSearch(snapshot);
  if (!tree) return new Set();
  const reachable = new Set([...tree.previous.keys()].filter(key => key !== positionKey(snapshot.start)));

  // A remembered color may be clicked as a terminal destination, but it never
  // becomes a bridge through which the search can continue.
  if (snapshot.allowMemoryNavigation) {
    for (const key of snapshot.colorMemoryTargets) {
      if (snapshot.visibleCells.has(key) || snapshot.memoryWallCells.has(key)) continue;
      const target = snapshot.state.maze.colors.find(color => positionKey(color) === key);
      if (!target || !canMovePlayerTo(snapshot.state, target.x, target.y).allowed) continue;
      const [x, y] = key.split(',').map(Number);
      if (entries.some(([, [dx, dy]]) => tree.previous.has(`${x + dx},${y + dy}`))) reachable.add(key);
    }
  }
  for (const key of snapshot.knownSpecialTargets ?? []) {
    if (snapshot.visibleCells.has(key) || snapshot.memoryWallCells.has(key)) continue;
    const [x, y] = key.split(',').map(Number);
    if (!canMovePlayerTo(snapshot.state, x, y).allowed) continue;
    if (entries.some(([, [dx, dy]]) => tree.previous.has(`${x + dx},${y + dy}`))) reachable.add(key);
  }
  return reachable;
}

export class ClickMoveController {
  constructor({
    interval = CLICK_MOVE_STEP_INTERVAL,
    schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
    unschedule = timer => globalThis.clearTimeout(timer),
    now = () => globalThis.performance?.now?.() ?? Date.now(),
  } = {}) {
    this.interval = interval;
    this.schedule = schedule;
    this.unschedule = unschedule;
    this.now = now;
    this.active = false;
    this.target = null;
    this.path = [];
    this.token = 0;
    this.timer = null;
    this.handlers = null;
    this.lastStepAt = null;
  }

  cancel() {
    this.token++;
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null;
    this.active = false;
    this.target = null;
    this.path = [];
    this.handlers = null;
  }

  resetCadence() {
    this.lastStepAt = null;
  }

  noteExternalMove(at = this.now()) {
    this.lastStepAt = at;
  }

  start(path, target, { canStep, step, onFinish = () => {} }) {
    this.cancel();
    if (!Array.isArray(path) || path.length === 0) return;
    const token = this.token;
    this.active = true;
    this.target = { ...target };
    this.path = [...path];
    this.handlers = { canStep, step, onFinish };

    const finish = reason => {
      if (token !== this.token || !this.active) return;
      const onFinishCallback = this.handlers?.onFinish;
      this.timer = null;
      this.active = false;
      this.target = null;
      this.path = [];
      this.handlers = null;
      this.token++;
      onFinishCallback?.(reason);
    };

    const scheduleNextStep = () => {
      const remaining = this.lastStepAt === null
        ? 0
        : Math.max(0, this.lastStepAt + this.interval - this.now());
      if (remaining === 0) tick();
      else this.timer = this.schedule(tick, remaining);
    };

    const tick = () => {
      if (token !== this.token || !this.active) return;
      this.timer = null;
      const direction = this.path[0];
      if (!this.handlers.canStep(direction)) { finish('blocked'); return; }
      const stepStartedAt = this.now();
      const result = this.handlers.step(direction, { isFinalStep: this.path.length === 1 });
      if (result?.moved) this.lastStepAt = stepStartedAt;
      if (token !== this.token || !this.active) return;
      if (!result?.moved) { finish('blocked'); return; }
      this.path.shift();
      if (this.path.length === 0) { finish('complete'); return; }
      scheduleNextStep();
    };

    // The first route starts immediately, but replacements share the same
    // movement cadence so rapid retargeting cannot insert extra steps.
    scheduleNextStep();
  }
}
