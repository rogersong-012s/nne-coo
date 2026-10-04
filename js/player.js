import { DIRECTION } from './config.js';
import { isWalkable } from './maze.js';
import { nextColor } from './objectives.js';

export function canMovePlayerTo(state, x, y) {
  if (state.won) return { allowed: false, reason: 'blocked' };
  if (!isWalkable(state.maze, x, y)) return { allowed: false, reason: 'wall' };
  const target = state.maze.colors.find(color => color.x === x && color.y === y && !color.completed);
  if (target && target.color !== nextColor(state)) return { allowed: false, reason: 'color-locked', targetId: target.id };
  return { allowed: true, target };
}

export function canMovePlayerInDirection(state, direction) {
  const delta = DIRECTION[direction];
  if (!delta || state.won) return { allowed: false, reason: 'blocked' };
  return canMovePlayerTo(state, state.player.x + delta[0], state.player.y + delta[1]);
}

export function movePlayer(state, direction) {
  const delta = DIRECTION[direction];
  if (!delta || state.won) return { moved: false, reason: 'blocked' };
  const x = state.player.x + delta[0], y = state.player.y + delta[1];
  const validation = canMovePlayerTo(state, x, y);
  if (!validation.allowed) return { moved: false, reason: validation.reason, targetId: validation.targetId };
  state.player = { x, y }; state.steps++;
  return { moved: true };
}
