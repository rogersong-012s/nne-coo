const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' };

export function directionForKey(key) { return keys[key] ?? keys[key.toLowerCase()] ?? null; }

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

  // Bottom controls and the four maze perimeter arrows share one input path.
  // A single click handler supports touch, mouse, and keyboard activation without
  // also handling pointerdown and accidentally moving twice.
  document.querySelectorAll('[data-dir]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      onMove(button.dataset.dir);
    });
  });
}
