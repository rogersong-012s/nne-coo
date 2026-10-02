export function collectItem(state) {
  const i = state.maze.items.findIndex(p => p.x === state.player.x && p.y === state.player.y);
  if (i < 0) return null;
  const [item] = state.maze.items.splice(i, 1);
  const effects = state.level.itemEffects ?? { nneVisionBonus: 1, cooMemoryBonus: 2 };
  if (item.kind === 'nne') {
    state.nneCollected++;
    state.visionRange = Math.min(state.level.maxVisionRange, state.visionRange + effects.nneVisionBonus);
  } else {
    state.cooCollected++;
    state.memoryLevel = Math.min(state.level.maxMemoryLevel, state.memoryLevel + effects.cooMemoryBonus);
  }
  return item.kind;
}
