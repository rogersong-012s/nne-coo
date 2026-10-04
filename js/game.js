import { ALLOW_MEMORY_CLICK_MOVE, CLICK_MOVE_STEP_INTERVAL, DEBUG, DEBUG_INPUT_PERFORMANCE } from './config.js';
import { GAME_STAGES, getColorConfig, prepareStage, validateLevel } from './levels.js';
import { cloneMaze, allReachable, solveMaze, validateSolutionPath } from './maze.js';
import { ClickMoveController, createClickNavigationSnapshot, findClickMovePath } from './click-navigation.js';
import { canMovePlayerInDirection } from './player.js';
import { takeTurn } from './turn.js';
import { getVisionCells, updateColorMemory } from './memory.js';
import { buildBoard, clearPowerupNotice, fitBoard, hideTutorialOverlay, hideWin, playFullVisionTransition, render, renderTutorialOverlay, showPowerupNotice, showToast, showWin, updateClickMoveMarker } from './ui.js';
import { bindBoardInput, bindInput } from './input.js';
import { createRunState } from './run-state.js';
import { advanceTutorial, canMoveDuringTutorial, createTutorialState, currentTutorialStep, isTutorialMoveAllowed, tutorialActionCompleted } from './tutorial.js';

const INITIAL_STAGE_ID = 1; // Change to 0 later to start first-time players in the tutorial.
let state, stageIndex = GAME_STAGES.findIndex(stage => stage.stageId === INITIAL_STAGE_ID), autoSolveTimer = null;
const clickMoveController = new ClickMoveController({ interval: CLICK_MOVE_STEP_INTERVAL });
const select = document.getElementById('level-select');
const cheatButton = document.getElementById('cheat');
const controls = [...document.querySelectorAll('[data-dir]')];
const now = () => globalThis.performance?.now?.() ?? Date.now();
GAME_STAGES.forEach((stage, index) => {
  const option = document.createElement('option'); option.value = index; option.textContent = stage.name; select.append(option);
});

function syncMovementControls() {
  const tutorialLocked = Boolean(state?.tutorial?.active && !canMoveDuringTutorial(state.tutorial));
  const autoSolveLocked = autoSolveTimer !== null;
  controls.forEach(button => { button.disabled = tutorialLocked || autoSolveLocked; });
}

function cancelClickMove(resetCadence = false) {
  clickMoveController.cancel();
  if (resetCadence) clickMoveController.resetCadence();
  if (state) state.clickMoveTarget = null;
  updateClickMoveMarker(null);
}

function stopAutoSolve() {
  if (autoSolveTimer !== null) clearInterval(autoSolveTimer);
  autoSolveTimer = null;
  cheatButton.classList.remove('running');
  cheatButton.setAttribute('aria-label', '重置並自動執行本關解答');
  syncMovementControls();
}

function start(index = stageIndex) {
  cancelClickMove(true);
  stopAutoSolve();
  hideTutorialOverlay();
  clearPowerupNotice();
  stageIndex = index;
  const level = prepareStage(GAME_STAGES[stageIndex]);
  validateLevel(level);
  const maze = cloneMaze(level.mazeTemplate);
  const sequence = getColorConfig(level).colorSequence;
  if (!allReachable(maze) || !validateSolutionPath(maze, maze.solutionPath, sequence)) throw new Error('產生了無解迷宮。');
  state = createRunState(level, maze, DEBUG);
  if (level.isTutorial) state.tutorial = createTutorialState();
  cheatButton.hidden = Boolean(level.isTutorial);
  const initialVision = getVisionCells(maze, state.player, state.visionRange).visibleCells;
  updateColorMemory(state, initialVision);
  select.value = String(index); hideWin(); buildBoard(state); render(state);
  syncMovementControls();
  if (state.tutorial?.active) renderTutorialOverlay(state.tutorial);
  showToast(`${level.name} · 尋找紅色`);
}

function executeMove(direction, clickPerformance = null) {
  const moveStartedAt = clickPerformance && !clickPerformance.firstMoveLogged ? now() : null;
  const wasFullVisionMode = state.fullVisionMode;
  const tutorialStep = currentTutorialStep(state.tutorial);
  const previousPlayer = { ...state.player };
  const turn = takeTurn(state, direction);
  if (!turn.moved) {
    if (turn.reason === 'color-locked') showToast('順序未到，暫時無法通行');
    return turn;
  }
  if (tutorialActionCompleted(tutorialStep, turn, state.maze, state.tutorial, previousPlayer, state.player)) {
    advanceTutorial(state.tutorial, true);
  }
  if (state.tutorial?.active && !canMoveDuringTutorial(state.tutorial)) cancelClickMove();
  const renderStartedAt = moveStartedAt === null ? null : now();
  render(state);
  if (moveStartedAt !== null) {
    const renderFinishedAt = now();
    clickPerformance.firstMoveLogged = true;
    console.info(`[Click Perf] first movement logic +${(renderStartedAt - clickPerformance.clickReceivedAt).toFixed(2)}ms`);
    console.info(`[Click Perf] turn logic ${(renderStartedAt - moveStartedAt).toFixed(2)}ms`);
    console.info(`[Click Perf] first movement render ${(renderFinishedAt - renderStartedAt).toFixed(2)}ms`);
    console.info(`[Click Perf] DOM update complete +${(renderFinishedAt - clickPerformance.clickReceivedAt).toFixed(2)}ms`);
    requestAnimationFrame(() => {
      console.info(`[Click Perf] first animation-frame callback (pre-paint) +${(now() - clickPerformance.clickReceivedAt).toFixed(2)}ms`);
    });
  }
  if (state.tutorial?.active) renderTutorialOverlay(state.tutorial);
  else hideTutorialOverlay();
  syncMovementControls();
  if (!wasFullVisionMode && state.fullVisionMode) playFullVisionTransition();
  if (turn.item === 'nne') showPowerupNotice('NNE GET!', 'EYE +1', 'nne');
  else if (turn.item === 'coo') showPowerupNotice('COO GET!', 'MEM +2', 'coo');
  else if (turn.colorResult?.type === 'complete') showToast(state.level.isTutorial ? '短版彩序完成 · 全視野開啟 · 前往出口' : '12 顆完成 · 全視野開啟 · 前往出口', 'success');
  else if (turn.colorResult?.type === 'round-complete') {
    const { colorRounds } = getColorConfig(state.level);
    showToast(`第 ${turn.colorResult.completedRound} 輪完成${turn.colorResult.completedRound < colorRounds ? `！第 ${turn.colorResult.completedRound + 1} 輪：再次尋找紅色` : ''}`, 'success');
  } else if (turn.colorResult?.type === 'correct') showToast('順序正確！', 'success');
  else if (turn.exitLocked && !state.level.isTutorial) showToast('尚未完成彩序 · 出口鎖定', 'mistake');

  if (state.won) {
    cancelClickMove();
    stopAutoSolve();
    showWin(state, stageIndex < GAME_STAGES.length - 1);
  }
  return turn;
}

function move(direction) {
  if (autoSolveTimer !== null) return;
  cancelClickMove();
  if (state?.tutorial?.active) {
    if (!canMoveDuringTutorial(state.tutorial)) return;
    if (!isTutorialMoveAllowed(state.tutorial, state.maze, state.player, direction)) return;
  }
  const turn = executeMove(direction);
  if (turn.moved) clickMoveController.noteExternalMove();
}

function requestClickMove(target, inputTiming = null) {
  if (!state || autoSolveTimer !== null || state.won) return;
  if (state.tutorial?.active && !canMoveDuringTutorial(state.tutorial)) return;
  cancelClickMove();
  const clickReceivedAt = inputTiming?.clickReceivedAt ?? now();
  const clickPerformance = DEBUG_INPUT_PERFORMANCE ? { clickReceivedAt, firstMoveLogged: false } : null;
  if (DEBUG_INPUT_PERFORMANCE) console.info(`[Click Perf] click received +0.00ms`);
  const snapshotStartedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
  const navigation = createClickNavigationSnapshot(state, ALLOW_MEMORY_CLICK_MOVE);
  if (DEBUG_INPUT_PERFORMANCE) {
    console.info(`[Click Perf] navigation snapshot ${(now() - snapshotStartedAt).toFixed(2)}ms`);
  }
  const bfsStartedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
  if (DEBUG_INPUT_PERFORMANCE) console.info(`[Click Perf] BFS started +${(bfsStartedAt - clickReceivedAt).toFixed(2)}ms`);
  const path = findClickMovePath(navigation, target);
  if (DEBUG_INPUT_PERFORMANCE) {
    console.info(`[Click Perf] BFS ${(now() - bfsStartedAt).toFixed(2)}ms · path ${path?.length ?? 'unreachable'} step(s)`);
  }
  if (!path || path.length === 0) {
    return;
  }

  state.clickMoveTarget = { ...target };
  const feedbackStartedAt = DEBUG_INPUT_PERFORMANCE ? now() : null;
  updateClickMoveMarker(target);
  if (DEBUG_INPUT_PERFORMANCE) console.info(`[Click Perf] target feedback ${(now() - feedbackStartedAt).toFixed(2)}ms`);
  clickMoveController.start(path, target, {
    canStep: direction => {
      if (state.tutorial?.active && (!canMoveDuringTutorial(state.tutorial)
        || !isTutorialMoveAllowed(state.tutorial, state.maze, state.player, direction))) return false;
      return canMovePlayerInDirection(state, direction).allowed;
    },
    step: direction => executeMove(direction, clickPerformance),
    onFinish: reason => {
      if (clickPerformance && DEBUG_INPUT_PERFORMANCE) {
        console.info(`[Click Perf] route ${reason} · ${path.length} step(s) · total +${(now() - clickReceivedAt).toFixed(2)}ms`);
      }
      if (!state) return;
      state.clickMoveTarget = null;
      updateClickMoveMarker(null);
    },
  });
}

function nextTutorialStep() {
  if (!state?.tutorial?.active || !advanceTutorial(state.tutorial)) return;
  if (state.tutorial.active) renderTutorialOverlay(state.tutorial);
  else hideTutorialOverlay();
  syncMovementControls();
}

function skipTutorial() {
  const stageOneIndex = GAME_STAGES.findIndex(stage => stage.stageId === 1);
  if (stageOneIndex >= 0) start(stageOneIndex);
}

function runAutoSolve() {
  cancelClickMove();
  if (state?.level.isTutorial) return;
  if (autoSolveTimer !== null) {
    stopAutoSolve();
    showToast('自動解答已停止');
    return;
  }

  start(stageIndex);
  const sequence = getColorConfig(state.level).colorSequence;
  const solution = solveMaze(state.maze, sequence);
  if (!solution) {
    showToast('找不到本關解答路徑', 'mistake');
    return;
  }

  cheatButton.classList.add('running');
  cheatButton.setAttribute('aria-label', '停止自動解答');
  syncMovementControls();
  let stepIndex = 0;
  autoSolveTimer = setInterval(() => {
    const turn = executeMove(solution[stepIndex++]);
    if (!turn.moved) {
      stopAutoSolve();
      showToast('解答路徑中斷', 'mistake');
      return;
    }
    clickMoveController.noteExternalMove();
    if (state.won) return;
    if (stepIndex >= solution.length) {
      stopAutoSolve();
      showToast('解答已結束但出口未通關', 'mistake');
    }
  }, 160);
  syncMovementControls();
}

bindInput(move, () => { state.debug = !state.debug; render(state); });
bindBoardInput(document.getElementById('board'), () => ({
  width: state.maze.width,
  height: state.maze.height,
}), requestClickMove);
document.getElementById('restart').addEventListener('click', () => start());
document.getElementById('play-again').addEventListener('click', () => start());
document.getElementById('next-level').addEventListener('click', () => { if (stageIndex < GAME_STAGES.length - 1) start(stageIndex + 1); });
document.getElementById('debug').addEventListener('click', () => { state.debug = !state.debug; render(state); });
cheatButton.addEventListener('click', runAutoSolve);
document.getElementById('tutorial-next').addEventListener('click', nextTutorialStep);
document.getElementById('tutorial-skip').addEventListener('click', skipTutorial);
select.addEventListener('change', () => start(Number(select.value)));
new ResizeObserver(() => { if (state) fitBoard(state); }).observe(document.getElementById('board-host'));
start(stageIndex);
