export const DEBUG = false;
export const GAME_CONFIG = Object.freeze({ memoryStepMultiplier: 4 });

export const COLOR_LIBRARY = Object.freeze({
  red: { label: '紅', symbol: '🔴', color: '#ff637d' },
  orange: { label: '橙', symbol: '🟠', color: '#ffa465' },
  yellow: { label: '黃', symbol: '🟡', color: '#f4d668' },
  green: { label: '綠', symbol: '🟢', color: '#61d9a1' },
  blue: { label: '藍', symbol: '🔵', color: '#6ab9ff' },
  purple: { label: '紫', symbol: '🟣', color: '#bd91ff' },
});

export const DIRECTION = Object.freeze({
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0],
});
