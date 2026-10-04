import { DEBUG_INPUT_PERFORMANCE } from './config.js';

const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };

export function directionForKey(key) { return keys[key] ?? keys[key.toLowerCase()] ?? null; }

const now = () => globalThis.performance?.now?.() ?? Date.now();

export function cellFromBoardPoint(board, width, height, clientX, clientY) {
  if (!board || width < 1 || height < 1) return null;
  const rect = board.getBoundingClientRect();
  const innerWidth = board.clientWidth;
  const innerHeight = board.clientHeight;
  if (innerWidth <= 0 || innerHeight <= 0 || rect.width <= 0 || rect.height <= 0) return null;
  const localX = clientX - rect.left - board.clientLeft;
  const localY = clientY - rect.top - board.clientTop;
  if (localX < 0 || localY < 0 || localX >= innerWidth || localY >= innerHeight) return null;
  const x = Math.floor(localX / (innerWidth / width));
  const y = Math.floor(localY / (innerHeight / height));
  return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
}

export function bindBoardInput(board, getBoardState, onTarget) {
  if (!board) return;
  let lastPointerDownAt = null;
  if (DEBUG_INPUT_PERFORMANCE) {
    board.addEventListener('pointerdown', () => { lastPointerDownAt = now(); }, { passive: true });
  }
  // A click is generated once for mouse or a completed touch. Avoid parallel
  // pointerdown/touchend handlers, which would make one tap move twice.
  board.addEventListener('click', event => {
    const clickReceivedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
    const targetCell = event.target.closest?.('.cell');
    if (!targetCell || !board.contains(targetCell)) return;
    const { width, height } = getBoardState();
    const datasetCell = { x: Number(targetCell.dataset.x), y: Number(targetCell.dataset.y) };
    if (!Number.isInteger(datasetCell.x) || !Number.isInteger(datasetCell.y)
      || datasetCell.x < 0 || datasetCell.y < 0 || datasetCell.x >= width || datasetCell.y >= height) return;

    // The hit-tested .cell is the browser's authoritative target. Keep the
    // geometry conversion for responsive-board validation, but do not drop a
    // valid click when browser zoom, touch synthesis, or subpixel layout makes
    // the pointer-derived cell differ by a fraction from that hit target.
    const pointerCell = cellFromBoardPoint(board, width, height, event.clientX, event.clientY);
    const cell = pointerCell?.x === datasetCell.x && pointerCell?.y === datasetCell.y
      ? pointerCell
      : datasetCell;
    const cellResolvedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
    if (DEBUG_INPUT_PERFORMANCE) {
      const pointerLatency = lastPointerDownAt === null ? 'n/a' : `${(clickReceivedAt - lastPointerDownAt).toFixed(2)}ms`;
      console.info(`[Click Perf] click received; pointerdown → click ${pointerLatency}`);
      console.info(`[Click Perf] cell resolved +${(cellResolvedAt - clickReceivedAt).toFixed(2)}ms (${cell.x},${cell.y})`);
    }
    onTarget(cell, DEBUG_INPUT_PERFORMANCE ? { clickReceivedAt, cellResolvedAt } : null);
  });
}

export function bindInput(onMove, onDebug) {
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && event.target.matches('select, input, textarea')) return;
    if (event.key === '?' || event.key === '`') { onDebug(); return; }
    const direction = directionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    onMove(direction);
  });

  // Bottom direction pad buttons use clicks for both mouse and touch.
  document.querySelectorAll('[data-dir]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      onMove(button.dataset.dir);
    });
  });
}
