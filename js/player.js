import { DIRECTION } from './config.js';
import { isWalkable } from './maze.js';
import { nextColor } from './objectives.js';

export function movePlayer(state, direction) {
  const delta = DIRECTION[direction]; if (!delta || state.won) return { moved: false, reason: 'blocked' };
  const x = state.player.x + delta[0], y = state.player.y + delta[1];
  if (!isWalkable(state.maze, x, y)) return { moved: false, reason: 'wall' };
  const target = state.maze.colors.find(color => color.x === x && color.y === y && !color.completed);
  if (target && target.color !== nextColor(state)) return { moved: false, reason: 'color-locked', targetId: target.id };
  state.player = { x, y }; state.steps++;
  return { moved: true };
}
