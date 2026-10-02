import { getColorConfig } from './levels.js';

export function resolveColor(state, targetId) {
  const target = state.maze.colors.find(item => item.id === targetId);
  if (!target) return { type: 'ignored' };
  if (target.completed) return { type: 'revisit', targetId };

  const { baseColorOrder, colorSequence } = getColorConfig(state.level);
  const expected = colorSequence[state.sequenceProgress];
  if (target.color !== expected) return { type: 'blocked', targetId, expected: expected ?? null };

  target.completed = true;
  state.completedTargetOrder.push(target.id);
  state.sequenceProgress++;
  if (state.sequenceProgress === colorSequence.length) return { type: 'complete', targetId };
  if (state.sequenceProgress % baseColorOrder.length === 0) return { type: 'round-complete', targetId, completedRound: state.sequenceProgress / baseColorOrder.length };
  return { type: 'correct', targetId };
}

export function nextColor(state) {
  return getColorConfig(state.level).colorSequence[state.sequenceProgress] ?? null;
}

export function currentRound(state) {
  const { baseColorOrder, colorRounds } = getColorConfig(state.level);
  if (state.sequenceProgress >= baseColorOrder.length * colorRounds) return colorRounds;
  return Math.floor(state.sequenceProgress / baseColorOrder.length) + 1;
}
