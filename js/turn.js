import { movePlayer } from './player.js';
import { collectItem } from './items.js';
import { getEffectiveVisionCells, recordMovement, updateColorMemory } from './memory.js';
import { resolveColor } from './objectives.js';
import { getBackgroundPartCount, getColorConfig } from './levels.js';

export function takeTurn(state, direction) {
  const movement = movePlayer(state, direction);
  if (!movement.moved) return movement;
  recordMovement(state.movementHistory, state.player);
  const item = collectItem(state);
  const color = state.maze.colors.find(p => p.x === state.player.x && p.y === state.player.y && !p.completed);
  const colorResult = color ? resolveColor(state, color.id) : null;
  if (colorResult && ['correct', 'round-complete', 'complete'].includes(colorResult.type)) {
    state.revealedBackgroundParts = Math.min(
      getBackgroundPartCount(state.level),
      (state.revealedBackgroundParts ?? 0) + 1,
    );
  }
  const colorSequence = getColorConfig(state.level).colorSequence;
  state.fullVisionMode = state.sequenceProgress >= colorSequence.length;
  if (state.fullVisionMode) state.revealedBackgroundParts = getBackgroundPartCount(state.level);
  const atExit = state.player.x === state.maze.exit.x && state.player.y === state.maze.exit.y;
  if (atExit && state.fullVisionMode) state.won = true;
  const vision = getEffectiveVisionCells(state.maze, state.player, state.visionRange, state.fullVisionMode);
  updateColorMemory(state, vision.visibleCells, true);
  return { moved: true, item, colorResult, exitLocked: atExit && !state.won, won: state.won };
}
