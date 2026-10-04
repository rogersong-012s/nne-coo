const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };

export function directionForKey(key) { return keys[key] ?? keys[key.toLowerCase()] ?? null; }

export function directionForAdjacentCell(player, cell) {
  const dx = cell.x - player.x, dy = cell.y - player.y;
  if (dx === 0 && dy === -1) return 'up';
  if (dx === 0 && dy === 1) return 'down';
  if (dx === -1 && dy === 0) return 'left';
  if (dx === 1 && dy === 0) return 'right';
  return null;
}

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

export function bindBoardInput(board, getBoardState, onMove) {
  if (!board) return;
  // A click is generated once for mouse or a completed touch. Avoid parallel
  // pointerdown/touchend handlers, which would make one tap move twice.
  board.addEventListener('click', event => {
    const targetCell = event.target.closest?.('.cell');
    if (!targetCell || !board.contains(targetCell)) return;
    const { width, height, player } = getBoardState();
    const cell = cellFromBoardPoint(board, width, height, event.clientX, event.clientY);
    if (!cell || cell.x !== Number(targetCell.dataset.x) || cell.y !== Number(targetCell.dataset.y)) return;
    const direction = directionForAdjacentCell(player, cell);
    if (direction) onMove(direction);
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
