import { COLOR_LIBRARY } from './config.js';
import { cellVisibility, getEffectiveMemorySteps, getEffectiveVisionCells, getMemoryMarkers, isFeatureVisible, positionKey, recentHistory } from './memory.js';
import { currentRound, nextColor } from './objectives.js';
import { getColorConfig } from './levels.js';

const $ = id => document.getElementById(id);
const refs = { board: $('board'), host: $('board-host'), order: $('order'), toast: $('toast'), win: $('win'), debug: $('debug-panel'), notice: null };
let toastTimer, powerupNoticeTimer = null, powerupNoticeGeneration = 0;
const reportedBackgroundFailures = new Set();

export function fitBoard(state) {
  const rect = refs.host.getBoundingClientRect();
  const size = Math.max(1, Math.floor(Math.min(rect.width / state.maze.width, rect.height / state.maze.height)));
  refs.board.style.width = `${size * state.maze.width}px`;
  refs.board.style.height = `${size * state.maze.height}px`;
  refs.board.style.setProperty('--cell', `${size}px`);
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
  return [
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
  $('steps').textContent = state.steps; $('vision').textContent = state.visionRange; $('memory').textContent = state.memoryLevel; $('level-name').textContent = `${String(state.level.number).padStart(2, '0')}/10`;
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
  const vision = getEffectiveVisionCells(state.maze, state.player, state.visionRange, state.fullVisionMode);
  const { memoryPathCells, memoryWallCells } = state.fullVisionMode
    ? { memoryPathCells: new Set(), memoryWallCells: new Set() }
    : getMemoryMarkers(state.maze, state.movementHistory, effectiveMemorySteps, vision.visibleCells);
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
    const feature = isFeatureVisible(live, visible, colorRemembered, state.debug) ? live : null;
    const terrain = reveal ? state.maze.tiles[y][x] : null;
    const content = cell.children[0], memoryMarker = cell.children[1], debugTag = cell.children[2];
    const showMemoryPath = !visible && memoryPathCells.has(key);
    const showMemoryWall = !visible && memoryWallCells.has(key);
    cell.className = `cell ${terrain ? `revealed ${terrain}` : 'unknown'}`;
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
        cell.classList.add('color', feature.color === targetColor ? 'color-active' : 'color-pending');
        if (colorRemembered) cell.classList.add('color-memory');
        cell.style.setProperty('--feature-color', COLOR_LIBRARY[feature.color]?.color ?? '#ff58c7');
        content.textContent = '◆';
      } else if (feature.kind === 'exit') {
        cell.classList.add('exit', state.sequenceProgress === colorSequence.length ? 'unlocked' : 'locked'); content.textContent = '▣';
      } else { cell.classList.add(feature.kind); content.textContent = feature.kind === 'nne' ? '✦' : '✧'; }
    }
    if (x === state.player.x && y === state.player.y) { cell.classList.add('player'); content.textContent = '●'; }
    debugTag.textContent = state.debug ? key : '';
    const markerLabel = showMemoryPath && showMemoryWall ? '記憶位置 記憶牆' : showMemoryPath ? '記憶位置' : showMemoryWall ? '記憶牆' : '';
    cell.setAttribute('aria-label', `${key} ${terrain ?? '未知地形'} ${feature?.kind ?? ''} ${markerLabel}`.trim());
  }
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
  $('next-level').disabled = !nextAvailable; $('next-level').textContent = nextAvailable ? '下一關' : '已完成所有關卡';
  refs.win.hidden = false;
}
export function playFullVisionTransition() {
  refs.board.classList.remove('final-reveal');
  void refs.board.offsetWidth;
  refs.board.classList.add('final-reveal');
  setTimeout(() => refs.board.classList.remove('final-reveal'), 950);
}
export function hideWin() { refs.win.hidden = true; }
