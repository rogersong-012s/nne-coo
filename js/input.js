const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };

export const SWIPE_THRESHOLD = 30;
export const TAP_DEAD_ZONE = 24;

export function directionForKey(key) { return keys[key] ?? keys[key.toLowerCase()] ?? null; }

export function directionForSwipe(deltaX, deltaY, threshold = SWIPE_THRESHOLD) {
  if (Math.hypot(deltaX, deltaY) < threshold) return null;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? 'right' : 'left';
  return deltaY > 0 ? 'down' : 'up';
}

export function directionForTap(tapX, tapY, playerX, playerY, deadZone = TAP_DEAD_ZONE) {
  const dx = tapX - playerX, dy = tapY - playerY;
  if (Math.hypot(dx, dy) <= deadZone) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
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

  document.querySelectorAll('[data-dir]').forEach(button => {
    button.addEventListener('pointerdown', event => { event.preventDefault(); onMove(button.dataset.dir); });
  });

  const board = document.getElementById?.('board');
  if (!board?.addEventListener) return;

  const mobileViewport = window.matchMedia?.('(max-width: 700px)');
  const isMobileViewport = () => mobileViewport?.matches ?? window.innerWidth <= 700;
  let pointerGesture = null;
  let gestureHandled = false;

  board.addEventListener('pointerdown', event => {
    if (!isMobileViewport() || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (pointerGesture) return;
    pointerGesture = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    gestureHandled = false;
    try { board.setPointerCapture?.(event.pointerId); } catch { /* Pointer capture is optional on older browsers. */ }
    event.preventDefault();
  });

  board.addEventListener('pointerup', event => {
    if (!pointerGesture || pointerGesture.pointerId !== event.pointerId || !isMobileViewport()) return;
    const gesture = pointerGesture;
    pointerGesture = null;
    if (gestureHandled) return;
    gestureHandled = true;

    const deltaX = event.clientX - gesture.startX, deltaY = event.clientY - gesture.startY;
    let direction = directionForSwipe(deltaX, deltaY);
    if (!direction) {
      const playerCell = board.querySelector?.('.cell.player');
      if (!playerCell) return;
      const rect = playerCell.getBoundingClientRect();
      direction = directionForTap(event.clientX, event.clientY, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    if (direction) onMove(direction);
    event.preventDefault();
  });

  const clearGesture = event => {
    if (!pointerGesture || (event.pointerId !== undefined && pointerGesture.pointerId !== event.pointerId)) return;
    pointerGesture = null;
    gestureHandled = false;
  };
  board.addEventListener('pointercancel', clearGesture);
  board.addEventListener('lostpointercapture', clearGesture);
}
