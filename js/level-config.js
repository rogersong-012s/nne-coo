export function getColorConfig(level) {
  const baseColorOrder = level.baseColorOrder;
  const colorSequence = Array.from({ length: level.colorRounds }, () => [...baseColorOrder]).flat();
  const targetCount = Object.values(level.colorCopies).reduce((sum, count) => sum + count, 0);
  return { baseColorOrder, colorRounds: level.colorRounds, colorCopies: level.colorCopies, colorSequence, targetCount };
}

export function getBackgroundPartCount(level) {
  return (level.background?.revealRows ?? 3) * (level.background?.revealColumns ?? 4);
}

export function validateLevel(level) {
  if (level.mazeWidth < 7 || level.mazeHeight < 7 || level.mazeWidth % 2 !== 1 || level.mazeHeight % 2 !== 1) throw new Error('迷宮尺寸需為至少 7 的奇數。');
  if (level.visionRange < 1 || !Number.isInteger(level.initialMemoryLevel) || level.initialMemoryLevel < 1) throw new Error('視野或記憶設定無效。');
  if (!Number.isInteger(level.colorRounds) || level.colorRounds < 1 || !level.baseColorOrder.length || new Set(level.baseColorOrder).size !== level.baseColorOrder.length) throw new Error('彩序輪數或基礎顏色順序無效。');
  if (!Number.isInteger(level.seed)) throw new Error('每關需設定整數 seed，才能穩定重現版圖。');
  if (![level.nneCount, level.cooCount].every(count => Number.isInteger(count) && count >= 0)) throw new Error('NNE / COO 數量設定無效。');
  const effects = level.itemEffects;
  if (!effects || !Number.isInteger(effects.nneVisionBonus) || effects.nneVisionBonus < 1
    || !Number.isInteger(effects.cooMemoryBonus) || effects.cooMemoryBonus < 1) {
    throw new Error('NNE / COO 強化幅度設定無效。');
  }
  if (!Number.isInteger(level.maxVisionRange) || level.maxVisionRange < level.visionRange
    || !Number.isInteger(level.maxMemoryLevel) || level.maxMemoryLevel < level.initialMemoryLevel) {
    throw new Error('VISION / MEMORY 強化上限設定無效。');
  }
  const background = level.background;
  if (!background || typeof background.image !== 'string'
    || !Number.isFinite(background.opacity) || background.opacity < 0 || background.opacity > 1
    || !Number.isFinite(background.completedOpacity) || background.completedOpacity < 0 || background.completedOpacity > 1
    || !Number.isInteger(background.revealRows) || background.revealRows < 1
    || !Number.isInteger(background.revealColumns) || background.revealColumns < 1) {
    throw new Error('背景圖片設定無效。');
  }
  const backgroundPartCount = getBackgroundPartCount(level);
  if (!Array.isArray(background.revealOrder) || background.revealOrder.length !== backgroundPartCount
    || new Set(background.revealOrder).size !== backgroundPartCount
    || background.revealOrder.some(index => !Number.isInteger(index) || index < 0 || index >= backgroundPartCount)) {
    throw new Error('背景揭露順序必須剛好包含每個區塊一次。');
  }
  const earlyNneCount = level.earlyNneCount ?? 0, earlyCooCount = level.earlyCooCount ?? 0;
  if (![earlyNneCount, earlyCooCount].every(count => Number.isInteger(count) && count >= 0)
    || earlyNneCount > level.nneCount || earlyCooCount > level.cooCount
    || (earlyNneCount + earlyCooCount > 0 && (!Number.isInteger(level.earlyResourceMaxDistance) || level.earlyResourceMaxDistance < 2))) {
    throw new Error('出生附近 NNE / COO 設定無效。');
  }
  if (!Number.isFinite(level.branchDensity) || level.branchDensity < 0 || level.branchDensity > 1) throw new Error('branchDensity 需介於 0 與 1。');
  if (!Number.isInteger(level.minimumJunctions) || level.minimumJunctions < 0) throw new Error('minimumJunctions 需為非負整數。');
  if (!Number.isInteger(level.minTargetPathDistance) || level.minTargetPathDistance < 1 || !Number.isInteger(level.minSameColorPathDistance) || level.minSameColorPathDistance < 1) throw new Error('彩色目標路徑距離設定無效。');
  const { colorSequence, targetCount } = getColorConfig(level);
  const configuredColors = Object.keys(level.colorCopies).sort();
  if (configuredColors.length !== level.baseColorOrder.length || configuredColors.some(color => !level.baseColorOrder.includes(color))) throw new Error('colorCopies 必須對應所有基礎顏色。');
  for (const color of level.baseColorOrder) {
    const required = colorSequence.filter(item => item === color).length;
    if (!Number.isInteger(level.colorCopies[color]) || level.colorCopies[color] < required) throw new Error(`${color} 的目標數量不足以完成所有彩序輪次。`);
  }
  if (targetCount + level.nneCount + level.cooCount + 2 > Math.floor(level.mazeWidth * level.mazeHeight / 3)) throw new Error('道具和目標數量超過地圖容量。');
  if (level.mazeComplexity < 0 || level.mazeComplexity > 1) throw new Error('迷宮複雜度需介於 0 與 1。');
  if (level.start.x < 1 || level.start.y < 1 || level.start.x >= level.mazeWidth - 1 || level.start.y >= level.mazeHeight - 1 || level.start.x % 2 !== 1 || level.start.y % 2 !== 1) throw new Error('起點需位於迷宮奇數格中心。');
}
