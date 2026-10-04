export function createRunState(level, maze, debug = false) {
  return {
    level, maze, player: { ...maze.spawn }, steps: 0, sequenceProgress: 0, completedTargetOrder: [],
    visionRange: level.visionRange, memoryLevel: level.initialMemoryLevel, movementHistory: [],
    colorMemory: new Map(), revealedBackgroundParts: 0, fullVisionMode: false,
    nneCollected: 0, cooCollected: 0, won: false, debug, clickMoveTarget: null,
  };
}
