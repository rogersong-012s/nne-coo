const DEFAULT_POSITIONS = ['bottom', 'top', 'right', 'left'];

function boundsOverlap(a, b) {
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

function padded(rect, amount) {
  return { left: rect.left - amount, top: rect.top - amount, right: rect.right + amount, bottom: rect.bottom + amount };
}

function clampRect(left, top, width, height, viewportWidth, viewportHeight, margins) {
  return {
    left: Math.min(Math.max(left, margins.left), Math.max(margins.left, viewportWidth - margins.right - width)),
    top: Math.min(Math.max(top, margins.top), Math.max(margins.top, viewportHeight - margins.bottom - height)),
  };
}

function candidateFor(anchor, placement, width, height, gap) {
  const centerX = (anchor.left + anchor.right) / 2, centerY = (anchor.top + anchor.bottom) / 2;
  switch (placement) {
    case 'top': return { left: centerX - width / 2, top: anchor.top - gap - height };
    case 'right': return { left: anchor.right + gap, top: centerY - height / 2 };
    case 'left': return { left: anchor.left - gap - width, top: centerY - height / 2 };
    default: return { left: centerX - width / 2, top: anchor.bottom + gap };
  }
}

/** Pick and clamp a tutorial card position, avoiding its focus and important game cells. */
export function chooseTutorialDialogPosition({
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
  focusRects = [],
  mazeRect = null,
  protectedRects = [],
  preferredPositions = DEFAULT_POSITIONS,
  action = false,
  safeMargin = 12,
  safeInsets = {},
  gap = 16,
}) {
  const margins = Object.fromEntries(['left', 'top', 'right', 'bottom'].map(side => [side, Math.max(safeMargin, safeInsets[side] ?? 0)]));
  const width = Math.min(cardWidth, Math.max(1, viewportWidth - margins.left - margins.right));
  const height = Math.min(cardHeight, Math.max(1, viewportHeight - margins.top - margins.bottom));
  const anchors = [...focusRects];
  if (mazeRect && !anchors.includes(mazeRect)) anchors.push(mazeRect);
  const positions = preferredPositions.length ? preferredPositions : DEFAULT_POSITIONS;
  const candidates = [];

  for (const anchor of anchors) {
    for (const placement of positions) {
      candidates.push({ ...candidateFor(anchor, placement, width, height, gap), placement });
    }
  }

  // Screen-edge candidates are useful on narrow or short mobile viewports where
  // no card-sized strip exists directly beside the highlighted element.
  for (const placement of positions) {
    const anchor = { left: margins.left, top: margins.top, right: viewportWidth - margins.right, bottom: viewportHeight - margins.bottom };
    const point = candidateFor(anchor, placement, width, height, gap);
    if (placement === 'top') point.top = margins.top;
    if (placement === 'bottom') point.top = viewportHeight - margins.bottom - height;
    if (placement === 'left') point.left = margins.left;
    if (placement === 'right') point.left = viewportWidth - margins.right - width;
    candidates.push({ ...point, placement });
  }

  const focusObstacles = focusRects.map(rect => padded(rect, 10));
  const importantObstacles = protectedRects.map(rect => padded(rect, 8));
  const options = (candidates.length ? candidates : [{ left: margins.left, top: margins.top, placement: 'top' }])
    .map((candidate, index) => {
      const clamped = clampRect(candidate.left, candidate.top, width, height, viewportWidth, viewportHeight, margins);
      const rect = { ...clamped, right: clamped.left + width, bottom: clamped.top + height };
      const protectedOverlap = [...focusObstacles, ...importantObstacles].reduce((sum, obstacle) => sum + boundsOverlap(rect, obstacle), 0);
      const mazeOverlap = mazeRect ? boundsOverlap(rect, mazeRect) : 0;
      const score = protectedOverlap * 100 + (action ? mazeOverlap * 1000 : mazeOverlap * 3) + index * 0.001;
      return { ...clamped, placement: candidate.placement, width, height, score };
    })
    .sort((a, b) => a.score - b.score);

  return options[0];
}
