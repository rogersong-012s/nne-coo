import { ALLOW_MEMORY_CLICK_MOVE, COLOR_LIBRARY, DEBUG_INPUT_PERFORMANCE, PLAYER_MOVE_TRANSITION_MS } from './config.js';
import { createClickNavigationSnapshot, getClickMoveReachableCells } from './click-navigation.js';
import { cellVisibility, getEffectiveMemorySteps, isFeatureVisible, positionKey, recentHistory } from './memory.js';
import { currentRound, nextColor } from './objectives.js';
import { STAGES, getColorConfig } from './levels.js';
import { currentTutorialStep, TUTORIAL_STEPS } from './tutorial.js';
import { chooseTutorialDialogPosition } from './tutorial-layout.js';

const $ = id => document.getElementById(id);
const refs = {
  board: $('board'), host: $('board-host'), order: $('order'), toast: $('toast'), win: $('win'), debug: $('debug-panel'), notice: null, player: null,
  tutorial: $('tutorial-overlay'), tutorialCard: $('tutorial-card'), tutorialSvg: $('tutorial-spotlight'), tutorialMask: $('tutorial-spotlight-mask'),
  tutorialMaskBase: $('tutorial-mask-base'), tutorialCutouts: $('tutorial-cutouts'), tutorialDim: $('tutorial-dim'), tutorialOutlines: $('tutorial-outlines'),
};
let toastTimer, powerupNoticeTimer = null, powerupNoticeGeneration = 0;
const reportedBackgroundFailures = new Set();
let displayedTutorialStep = null;
let fittedCellSize = 25;

const SVG_NS = 'http://www.w3.org/2000/svg';
const now = () => globalThis.performance?.now?.() ?? Date.now();

function tutorialTargetElements(step) {
  const selectors = [step?.target, step?.fallback].flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean);
  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return [element];
      }
    } catch { /* A malformed optional selector simply has no spotlight target. */ }
  }
  return [];
}

function layoutTutorialSpotlight() {
  if (refs.tutorial.hidden || !displayedTutorialStep) return;
  const width = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  refs.tutorialSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  refs.tutorialSvg.setAttribute('width', String(width));
  refs.tutorialSvg.setAttribute('height', String(height));
  refs.tutorialMask.setAttribute('x', '0'); refs.tutorialMask.setAttribute('y', '0');
  refs.tutorialMask.setAttribute('width', String(width)); refs.tutorialMask.setAttribute('height', String(height));
  refs.tutorialMaskBase.setAttribute('x', '0'); refs.tutorialMaskBase.setAttribute('y', '0');
  refs.tutorialMaskBase.setAttribute('width', String(width)); refs.tutorialMaskBase.setAttribute('height', String(height));
  refs.tutorialDim.setAttribute('x', '0'); refs.tutorialDim.setAttribute('y', '0');
  refs.tutorialDim.setAttribute('width', String(width)); refs.tutorialDim.setAttribute('height', String(height));
  refs.tutorialCutouts.replaceChildren(); refs.tutorialOutlines.replaceChildren();

  const step = displayedTutorialStep;
  const targets = tutorialTargetElements(step);
  const targetRects = targets.map(element => element.getBoundingClientRect());
  const mazeHostRect = refs.host?.getBoundingClientRect();
  const boardRect = refs.board?.getBoundingClientRect();
  const mazeIsOpen = step.maskMode === 'maze-open' || step.maskMode === 'none-on-maze';
  const maskTargets = mazeIsOpen ? (refs.host ? [refs.host] : []) : step.maskMode === 'full' ? [] : targets;
  const maskRects = maskTargets.map(element => element.getBoundingClientRect());
  const isCell = element => element.classList.contains('cell');
  maskTargets.forEach((element, index) => {
    const rect = maskRects[index];
    const pad = mazeIsOpen ? 0 : step.highlightPadding ?? (isCell(element) ? 4 : 8);
    const x = Math.max(0, rect.left - pad), y = Math.max(0, rect.top - pad);
    const right = Math.min(width, rect.right + pad), bottom = Math.min(height, rect.bottom + pad);
    const cutout = document.createElementNS(SVG_NS, 'rect');
    cutout.setAttribute('x', String(x)); cutout.setAttribute('y', String(y));
    cutout.setAttribute('width', String(Math.max(0, right - x))); cutout.setAttribute('height', String(Math.max(0, bottom - y)));
    cutout.setAttribute('rx', isCell(element) ? '5' : '10');
    cutout.setAttribute('fill', 'black'); refs.tutorialCutouts.append(cutout);

    if (!mazeIsOpen) {
      const outline = document.createElementNS(SVG_NS, 'rect');
      outline.setAttribute('x', String(x)); outline.setAttribute('y', String(y));
      outline.setAttribute('width', String(Math.max(0, right - x))); outline.setAttribute('height', String(Math.max(0, bottom - y)));
      outline.setAttribute('rx', isCell(element) ? '5' : '10');
      outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', '#a8e8ff'); outline.setAttribute('stroke-width', '2');
      refs.tutorialOutlines.append(outline);
    }
  });

  const protectedRects = [...document.querySelectorAll('.cell.player, .cell.exit, .cell.nne, .cell.coo, .cell.color')]
    .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
  const rootStyle = getComputedStyle(document.documentElement);
  const safeInsets = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side => [
    side,
    Number.parseFloat(rootStyle.getPropertyValue(`--tutorial-safe-${side}`)) || 0,
  ]));
  const safeLeft = Math.max(12, safeInsets.left), safeRight = Math.max(12, safeInsets.right);
  const leftSideWidth = boardRect?.width ? boardRect.left - safeLeft - 16 : 0;
  const rightSideWidth = boardRect?.width ? width - safeRight - boardRect.right - 16 : 0;
  const sideWidth = Math.max(leftSideWidth, rightSideWidth);
  const needsMazeSeparation = step.allowGameplayInput || targets.includes(refs.board);
  refs.tutorialCard.style.width = needsMazeSeparation && width > 700 && sideWidth >= 260
    ? `${Math.min(420, sideWidth)}px`
    : '';
  const cardRect = refs.tutorialCard.getBoundingClientRect();
  const position = chooseTutorialDialogPosition({
    viewportWidth: width,
    viewportHeight: height,
    cardWidth: cardRect.width,
    cardHeight: cardRect.height,
    focusRects: mazeIsOpen ? [] : targetRects,
    mazeRect: boardRect?.width ? boardRect : mazeHostRect,
    protectedRects,
    preferredPositions: step.preferredPositions,
    action: step.allowGameplayInput,
    safeInsets,
  });
  refs.tutorialCard.style.left = `${position.left}px`;
  refs.tutorialCard.style.top = `${position.top}px`;
  refs.tutorialCard.dataset.placement = position.placement;
}

export function renderTutorialOverlay(tutorialState) {
  const step = currentTutorialStep(tutorialState);
  if (!step) { hideTutorialOverlay(); return; }
  displayedTutorialStep = step;
  refs.tutorial.hidden = false;
  $('tutorial-progress').textContent = `TUTORIAL · ${tutorialState.stepIndex + 1} / ${TUTORIAL_STEPS.length}`;
  $('tutorial-title').textContent = step.title;
  $('tutorial-body').textContent = step.body;
  refs.tutorialCard.setAttribute('aria-modal', String(step.actionType === 'info'));
  refs.tutorial.dataset.inputMode = step.allowGameplayInput ? 'action' : 'locked';
  refs.tutorial.dataset.maskMode = step.maskMode;
  $('tutorial-next').hidden = step.actionType === 'action';
  layoutTutorialSpotlight();
  requestAnimationFrame(layoutTutorialSpotlight);
  if (!step.allowGameplayInput) $('tutorial-next').focus({ preventScroll: true });
}

export function hideTutorialOverlay() {
  displayedTutorialStep = null;
  if (!refs.tutorial) return;
  refs.tutorial.hidden = true;
  refs.tutorialCutouts.replaceChildren(); refs.tutorialOutlines.replaceChildren();
}

window.addEventListener('resize', layoutTutorialSpotlight);
window.addEventListener('orientationchange', layoutTutorialSpotlight);
window.visualViewport?.addEventListener('resize', layoutTutorialSpotlight);
window.visualViewport?.addEventListener('scroll', layoutTutorialSpotlight);

export function fitBoard(state) {
  const rect = refs.host.getBoundingClientRect();
  const border = 4;
  const availableWidth = Math.max(1, rect.width - border);
  const availableHeight = Math.max(1, rect.height - border);
  const size = Math.max(1, Math.floor(Math.min(availableWidth / state.maze.width, availableHeight / state.maze.height)));
  fittedCellSize = size;
  const boardWidth = size * state.maze.width + border;
  const boardHeight = size * state.maze.height + border;
  refs.board.style.width = `${boardWidth}px`;
  refs.board.style.height = `${boardHeight}px`;
  refs.board.style.setProperty('--cell', `${size}px`);
  refs.board.style.setProperty('--player-move-transition', `${PLAYER_MOVE_TRANSITION_MS}ms`);
  refs.player?.classList.add('position-reset');
  updatePlayerMarkerPosition(state);
  if (refs.player) requestAnimationFrame(() => refs.player?.classList.remove('position-reset'));
  requestAnimationFrame(layoutTutorialSpotlight);
}

function updatePlayerMarkerPosition(state) {
  if (!refs.player) return;
  refs.player.style.transform = `translate3d(${state.player.x * fittedCellSize}px, ${state.player.y * fittedCellSize}px, 0)`;
}

export function updateClickMoveMarker(target) {
  refs.board.querySelector('.click-move-destination')?.classList.remove('click-move-destination');
  if (!target) return;
  refs.board.querySelector(`.cell[data-x="${target.x}"][data-y="${target.y}"]`)
    ?.classList.add('click-move-destination');
}

function createBackgroundLayer(state) {
  const config = state.level.background;
  if (!config) return null;
  const layer = document.createElement('div');
  layer.className = 'board-background';
  layer.setAttribute('aria-hidden', 'true');
  layer.dataset.ready = 'false';
  const { revealRows: rows, revealColumns: columns, image } = config;
  layer.style.setProperty('--background-columns', String(columns));
  layer.style.setProperty('--background-rows', String(rows));

  for (let index = 0; index < rows * columns; index++) {
    const part = document.createElement('span');
    const row = Math.floor(index / columns), column = index % columns;
    part.className = 'background-part';
    part.dataset.partIndex = String(index);
    part.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    part.style.backgroundPosition = `${columns === 1 ? 0 : column * 100 / (columns - 1)}% ${rows === 1 ? 0 : row * 100 / (rows - 1)}%`;
    layer.append(part);
  }
  refs.board.append(layer);

  const warn = reason => {
    if (!layer.isConnected) return;
    layer.remove();
    state.backgroundLoadError = `${image}: ${reason}`;
    if (!reportedBackgroundFailures.has(image)) {
      console.warn(`Background image unavailable; continuing without it: ${state.backgroundLoadError}`);
      reportedBackgroundFailures.add(image);
    }
    if (state.debug) render(state);
  };
  if (!image.trim()) {
    warn('empty image path');
    return layer;
  }

  const loader = new Image();
  loader.onload = () => {
    if (!layer.isConnected) return;
    const imageUrl = new URL(image, document.baseURI).href;
    for (const part of layer.children) part.style.backgroundImage = `url("${imageUrl}")`;
    layer.dataset.ready = 'true';
    requestAnimationFrame(() => { if (layer.isConnected) render(state); });
  };
  loader.onerror = () => warn('load failed');
  try { loader.src = new URL(image, document.baseURI).href; }
  catch { warn('invalid image path'); }
  return layer;
}

function renderBackground(state) {
  const layer = refs.board.querySelector('.board-background');
  refs.board.classList.toggle('full-vision-mode', Boolean(state.fullVisionMode));
  if (!layer) return;

  const config = state.level.background;
  const revealedCount = Math.max(0, Math.min(config.revealOrder.length, state.revealedBackgroundParts ?? 0));
  const revealed = new Set(config.revealOrder.slice(0, revealedCount));
  const opacity = state.fullVisionMode ? config.completedOpacity : config.opacity;
  for (const part of layer.children) {
    part.style.setProperty('--part-opacity', String(opacity));
    part.classList.toggle('revealed', layer.dataset.ready === 'true' && revealed.has(Number(part.dataset.partIndex)));
  }
}

export function buildBoard(state) {
  clearPowerupNotice();
  refs.board.replaceChildren();
  refs.board.style.gridTemplateColumns = `repeat(${state.maze.width}, var(--cell))`;
  createBackgroundLayer(state);
  for (let y = 0; y < state.maze.height; y++) for (let x = 0; x < state.maze.width; x++) {
    const cell = document.createElement('div');
    cell.className = 'cell'; cell.setAttribute('role', 'gridcell'); cell.dataset.x = x; cell.dataset.y = y;
    const content = document.createElement('span'); content.className = 'cell-content';
    const memoryMarker = document.createElement('span'); memoryMarker.className = 'memory-marker'; memoryMarker.setAttribute('aria-hidden', 'true');
    const debug = document.createElement('small'); debug.className = 'cell-debug'; debug.setAttribute('aria-hidden', 'true');
    cell.append(content, memoryMarker, debug); refs.board.append(cell);
  }
  const player = document.createElement('span');
  player.className = 'player-token';
  player.setAttribute('aria-hidden', 'true');
  player.textContent = '●';
  refs.player = player;
  refs.board.append(player);
  const notice = document.createElement('div');
  notice.className = 'powerup-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-atomic', 'true');
  const title = document.createElement('strong'); title.className = 'powerup-title';
  const detail = document.createElement('span'); detail.className = 'powerup-detail';
  notice.append(title, detail);
  refs.notice = notice;
  refs.board.append(notice);
  fitBoard(state);
}

function debugText(state, vision, memoryPathCells, memoryWallCells, effectiveMemorySteps) {
  const locations = cells => [...cells].join('  ') || '（空）';
  const recent = recentHistory(state.movementHistory, effectiveMemorySteps);
  const unknownCells = new Set();
  for (let y = 0; y < state.maze.height; y++) for (let x = 0; x < state.maze.width; x++) {
    const key = `${x},${y}`;
    if (!vision.visibleCells.has(key)) unknownCells.add(key);
  }
  const { colorSequence, colorRounds } = getColorConfig(state.level);
  const targetColor = nextColor(state);
  const list = items => items.length ? items.map((p, i) => `${i + 1}:(${p.x},${p.y})`).join('  ') : '（空）';
  const itemLocations = kind => {
    const items = state.level.items?.[kind] ?? state.maze.items.filter(item => item.kind === kind);
    const remaining = new Set(state.maze.items.map(item => item.id));
    return items.length ? items.map(item => `${item.id}:(${item.x},${item.y})${item.earlyResource ? ' [EARLY BRANCH]' : ''} [${remaining.has(item.id) ? 'AVAILABLE' : 'COLLECTED'}]`).join('  ') : '（空）';
  };
  const sameColorDistances = state.level.baseColorOrder.map(color => {
    const copies = state.maze.colors.filter(target => target.color === color);
    if (copies.length < 2) return null;
    const distance = state.maze.quality?.colorPathDistances?.[`${copies[0].id} → ${copies[1].id}`];
    return `${copies[0].id} ↔ ${copies[1].id}: ${distance ?? '?'}`;
  }).filter(Boolean);
  const purpleExitDistances = state.maze.quality?.purpleExitDistances ?? {};
  const purpleExitSummary = Object.entries(purpleExitDistances).map(([id, distance]) => `${id}: ${distance}`).join(' · ') || '未知';
  return [
    `STAGE: ${state.level.stageId} / ${STAGES.length}`,
    `SIZE TIER: ${state.level.sizeTier}`,
    `MAZE SIZE: ${state.maze.width} × ${state.maze.height}`,
    `SOLUTION LENGTH: ${state.maze.quality?.solutionLength ?? state.maze.solutionPath.length}`,
    `FINAL PURPLE → EXIT DISTANCE: ${state.maze.quality?.finalPurpleToExitDistance ?? '未知'} (${purpleExitSummary})`,
    `MIN REQUIRED DISTANCE: ${state.level.minFinalPurpleToExitPathDistance}`,
    `SOLVER: ${state.level.solverResult?.status ?? 'VALID'}`,
    `DEBUG 位置 (${state.player.x},${state.player.y})`,
    `MEM LEVEL: ${state.memoryLevel}`,
    `EFFECTIVE MEMORY: ${effectiveMemorySteps} STEPS`,
    `FULL VISION MODE: ${state.fullVisionMode ? 'ON' : 'OFF'} · 背景 ${state.revealedBackgroundParts ?? 0} / ${state.level.background.revealOrder.length}`,
    ...(state.backgroundLoadError ? [`BACKGROUND WARNING: ${state.backgroundLoadError}`] : []),
    `VISION RANGE: ${state.visionRange}`,
    `MAIN VISION (${vision.mainVisionCells.size} 格)\n${locations(vision.mainVisionCells)}`,
    `SIDE VISION (${vision.sideVisionCells.size} 格)\n${locations(vision.sideVisionCells)}`,
    `目前可見格 (${vision.visibleCells.size} 格)\n${locations(vision.visibleCells)}`,
    `NNE POSITION\n${itemLocations('nne')}`,
    `COO POSITION\n${itemLocations('coo')}`,
    `movementHistory 共 ${state.movementHistory.length} 筆\n${list(state.movementHistory)}`,
    `顯示中的最近 ${effectiveMemorySteps} 筆（${recent.length}）\n${list(recent)}`,
    `memoryPathCells 白點 (${memoryPathCells.size} 格)\n${locations(memoryPathCells)}`,
    `memoryWallCells 紅叉 (${memoryWallCells.size} 格)\n${locations(memoryWallCells)}`,
    `colorMemory${state.fullVisionMode ? '（Full Vision 停用）' : '（id:剩餘成功移動）'}\n${state.fullVisionMode ? '（已停止）' : state.colorMemory?.size ? [...state.colorMemory].map(([id, remaining]) => `${id}:${remaining}`).join('  ') : '（空）'}`,
    `未知地形（視野外；Debug 地圖仍會揭露）(${unknownCells.size} 格)\n${locations(unknownCells)}`,
    `sequenceProgress: ${state.sequenceProgress} / ${colorSequence.length}\ncurrentTarget: ${targetColor ?? 'none'}\ncurrentRound: ${currentRound(state)} / ${colorRounds}`,
    `彩色目標\n${state.maze.colors.map(target => `${target.id} [${target.color}] [${target.completed ? 'CONSUMED' : target.color === targetColor ? 'ACTIVE' : 'LOCKED'}]`).join('\n')}`,
    `物件 sector\n${Object.entries(state.maze.quality?.sectorById ?? {}).map(([id, sector]) => `${id}: ${sector}`).join('  ')}`,
    `同色目標實際路徑距離\n${sameColorDistances.join('  ') || '（無重複顏色）'}`,
    `相鄰彩序目標實際路徑距離 / 中間路口\n${(state.maze.quality?.sequencePathDistances ?? []).map(item => `${item.from} → ${item.to}: ${item.distance} 步 / ${item.junctions} 路口`).join('  ')}`,
    `路口 ${state.maze.quality?.junctionCount ?? '?'} · 死路端點 ${state.maze.quality?.deadEndCount ?? '?'} · 解答 ${state.maze.quality?.solutionLength ?? state.maze.solutionPath.length} 步`,
  ].join('\n\n');
}

export function render(state) {
  const effectiveMemorySteps = getEffectiveMemorySteps(state.memoryLevel);
  $('steps').textContent = state.steps; $('vision').textContent = state.visionRange; $('memory').textContent = state.memoryLevel;
  $('level-name').textContent = state.level.isTutorial ? '0 · 教學' : `${state.level.stageId} / ${STAGES.length}`;
  $('debug').textContent = state.debug ? 'DEBUG ON' : 'DEBUG OFF'; $('debug').setAttribute('aria-pressed', String(state.debug));
  const { baseColorOrder, colorRounds, colorSequence } = getColorConfig(state.level);
  const targetColor = nextColor(state);
  refs.order.replaceChildren();
  refs.order.setAttribute('aria-label', `${colorRounds} 輪彩序，共 ${colorSequence.length} 個目標`);
  colorSequence.forEach((id, index) => {
    if (index > 0) {
      const arrow = document.createElement('span'); arrow.className = 'sequence-arrow'; arrow.textContent = '›'; arrow.setAttribute('aria-hidden', 'true');
      refs.order.append(arrow);
    }
    const round = Math.floor(index / baseColorOrder.length) + 1;
    const el = document.createElement('span');
    el.className = `order-chip ${index < state.sequenceProgress ? 'done' : index === state.sequenceProgress ? 'current' : 'pending'}`;
    el.style.setProperty('--accent', COLOR_LIBRARY[id]?.color ?? '#ddd');
    const status = index < state.sequenceProgress ? '已完成' : index === state.sequenceProgress ? '目前目標' : '尚未完成';
    el.setAttribute('aria-label', `第 ${round} 輪 ${COLOR_LIBRARY[id]?.label ?? id}：${status}`);
    el.title = `第 ${round} 輪 · ${COLOR_LIBRARY[id]?.label ?? id} · ${status}`;
    refs.order.append(el);
  });
  const round = currentRound(state);
  $('order-hint').textContent = state.sequenceProgress === colorSequence.length
    ? `${state.sequenceProgress} / ${colorSequence.length} · 出口已解鎖！`
    : `${state.sequenceProgress} / ${colorSequence.length} · 第 ${round} 輪 · 目標：${COLOR_LIBRARY[targetColor]?.label ?? targetColor}`;

  renderBackground(state);
  const navigation = createClickNavigationSnapshot(state, ALLOW_MEMORY_CLICK_MOVE);
  const { vision, memoryPathCells, memoryWallCells } = navigation;
  const reachableStartedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
  const clickMoveReachableCells = getClickMoveReachableCells(navigation);
  if (DEBUG_INPUT_PERFORMANCE) console.info(`[Click Perf] render reachability BFS ${(now() - reachableStartedAt).toFixed(2)}ms`);
  const positions = new Map();
  for (const color of state.maze.colors) positions.set(positionKey(color), color);
  for (const item of state.maze.items) positions.set(positionKey(item), item);
  positions.set(positionKey(state.maze.exit), { ...state.maze.exit, kind: 'exit' });

  for (const cell of refs.board.querySelectorAll('.cell')) {
    const x = Number(cell.dataset.x), y = Number(cell.dataset.y), key = `${x},${y}`;
    const { visible, reveal } = cellVisibility({ x, y }, vision.visibleCells, state.debug);
    const live = positions.get(key);
    const colorRemaining = live?.kind === 'color' ? (state.colorMemory?.get(live.id) ?? 0) : 0;
    const colorRemembered = !visible && colorRemaining > 0;
    const tutorialColorVisible = state.level.isTutorial && live?.kind === 'color' && !live.completed;
    const feature = tutorialColorVisible || isFeatureVisible(live, visible, colorRemembered, state.debug) ? live : null;
    const terrain = reveal ? state.maze.tiles[y][x] : null;
    const content = cell.children[0], memoryMarker = cell.children[1], debugTag = cell.children[2];
    const showMemoryPath = !visible && memoryPathCells.has(key);
    const showMemoryWall = !visible && memoryWallCells.has(key);
    cell.className = `cell ${terrain ? `revealed ${terrain}` : 'unknown'}`;
    if (state.clickMoveTarget?.x === x && state.clickMoveTarget?.y === y) cell.classList.add('click-move-destination');
    if (visible) cell.classList.add('vision-current');
    if (state.debug) cell.classList.add('debug-map');
    if (showMemoryPath) cell.classList.add('memory-path-marker');
    if (showMemoryWall) cell.classList.add('memory-wall-marker');
    if (vision.mainVisionCells.has(key)) cell.classList.add('main-visible');
    if (vision.sideVisionCells.has(key)) cell.classList.add('side-visible');
    content.textContent = '';
    memoryMarker.className = `memory-marker${showMemoryPath ? ' memory-path' : ''}${showMemoryWall ? ' memory-wall' : ''}`;
    cell.style.removeProperty('--feature-color');

    if (feature) {
      if (feature.kind === 'color') {
        cell.classList.add('color', `color-${feature.color}`, feature.color === targetColor ? 'color-active' : 'color-pending');
        if (colorRemembered) cell.classList.add('color-memory');
        cell.style.setProperty('--feature-color', COLOR_LIBRARY[feature.color]?.color ?? '#ff58c7');
        content.textContent = '◆';
      } else if (feature.kind === 'exit') {
        cell.classList.add('exit', state.sequenceProgress === colorSequence.length ? 'unlocked' : 'locked'); content.textContent = '▣';
      } else { cell.classList.add(feature.kind); content.textContent = feature.kind === 'nne' ? '✦' : '✧'; }
    }
    if (clickMoveReachableCells.has(key)) {
      if (vision.visibleCells.has(key) || ['exit', 'nne', 'coo'].includes(feature?.kind)) cell.classList.add('click-move-available');
      else if (ALLOW_MEMORY_CLICK_MOVE) cell.classList.add('memory-click-move-available');
    }
    const isPlayer = x === state.player.x && y === state.player.y;
    if (isPlayer) { cell.classList.add('player'); content.textContent = ''; }
    debugTag.textContent = state.debug ? key : '';
    const markerLabel = showMemoryPath && showMemoryWall ? '記憶位置 記憶牆' : showMemoryPath ? '記憶位置' : showMemoryWall ? '記憶牆' : '';
    cell.setAttribute('aria-label', `${key} ${terrain ?? '未知地形'} ${feature?.kind ?? ''} ${isPlayer ? '玩家' : ''} ${markerLabel}`.trim());
  }
  updatePlayerMarkerPosition(state);
  refs.debug.hidden = !state.debug;
  if (state.debug) refs.debug.textContent = debugText(state, vision, memoryPathCells, memoryWallCells, effectiveMemorySteps);
}

export function showToast(message, kind = '') {
  clearTimeout(toastTimer); refs.toast.textContent = message; refs.toast.className = `toast show ${kind}`;
  toastTimer = setTimeout(() => { refs.toast.className = 'toast'; }, 1750);
  if (kind === 'mistake') { refs.board.classList.remove('shake'); void refs.board.offsetWidth; refs.board.classList.add('shake'); }
  if (kind === 'vision') { refs.board.classList.remove('expand'); void refs.board.offsetWidth; refs.board.classList.add('expand'); }
}

export function clearPowerupNotice() {
  if (powerupNoticeTimer !== null) clearTimeout(powerupNoticeTimer);
  powerupNoticeTimer = null;
  powerupNoticeGeneration++;
  if (!refs.notice) return;
  refs.notice.className = 'powerup-notice';
  refs.notice.removeAttribute('aria-label');
  refs.notice.querySelector('.powerup-title').textContent = '';
  refs.notice.querySelector('.powerup-detail').textContent = '';
}

export function showPowerupNotice(titleText, detailText, kind) {
  if (!refs.notice) return;
  if (powerupNoticeTimer !== null) clearTimeout(powerupNoticeTimer);
  powerupNoticeTimer = null;
  const generation = ++powerupNoticeGeneration;
  const notice = refs.notice;
  const title = notice.querySelector('.powerup-title');
  const detail = notice.querySelector('.powerup-detail');
  notice.className = 'powerup-notice';
  title.textContent = '';
  detail.textContent = '';
  void notice.offsetWidth;
  notice.classList.add(kind);
  title.textContent = titleText;
  detail.textContent = detailText;
  notice.setAttribute('aria-label', `${titleText} ${detailText}`);
  requestAnimationFrame(() => {
    if (generation === powerupNoticeGeneration && refs.notice === notice) notice.classList.add('show');
  });
  powerupNoticeTimer = setTimeout(() => {
    if (generation === powerupNoticeGeneration && refs.notice === notice) clearPowerupNotice();
  }, 1200);
}

export function showWin(state, nextAvailable) {
  const result = $('results'); result.replaceChildren();
  [['總步數', state.steps], ['NNE', state.nneCollected], ['COO', state.cooCollected], ['最終視野', state.visionRange], ['最終 MEM', state.memoryLevel]].forEach(([label, value]) => {
    const el = document.createElement('div'); el.innerHTML = `<span>${label}</span><strong>${value}</strong>`; result.append(el);
  });
  if (state.level.isTutorial) {
    $('win-title').textContent = 'TUTORIAL COMPLETE';
    $('win-description').textContent = '你已完成 Stage 0 教學。準備好後，前往 Stage 1 開始正式關卡。';
    $('play-again').textContent = '重玩教學';
  } else {
    $('win-title').textContent = nextAvailable ? `STAGE ${state.level.stageId} CLEAR` : 'ALL STAGES CLEAR';
    $('win-description').textContent = nextAvailable ? '成功走出彩序迷宮' : '你已完成全部 100 個 Stage。';
    $('play-again').textContent = '重新開始';
  }
  $('next-level').disabled = !nextAvailable;
  $('next-level').textContent = state.level.isTutorial ? '前往 Stage 1' : nextAvailable ? 'NEXT STAGE' : 'ALL STAGES CLEAR';
  refs.win.hidden = false;
}
export function playFullVisionTransition() {
  refs.board.classList.remove('final-reveal');
  void refs.board.offsetWidth;
  refs.board.classList.add('final-reveal');
  setTimeout(() => refs.board.classList.remove('final-reveal'), 950);
}
export function hideWin() { refs.win.hidden = true; }
