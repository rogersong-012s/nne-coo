import { ALLOW_MEMORY_CLICK_MOVE, AUTO_SOLVE_COUNTS_AS_CLEAR, CLICK_MOVE_STEP_INTERVAL, DEBUG, DEBUG_INPUT_PERFORMANCE } from './config.js?v=20261005-reward-ad-1';
import { GAME_STAGES, STAGES, getColorConfig, prepareStage, validateLevel } from './levels.js';
import { cloneMaze, allReachable, solveMaze, validateSolutionPath } from './maze.js';
import { ClickMoveController, createClickNavigationSnapshot, findClickMovePath } from './click-navigation.js?v=20261005-reward-ad-1';
import { canMovePlayerInDirection } from './player.js';
import { takeTurn } from './turn.js';
import { getVisionCells, updateColorMemory } from './memory.js';
import { buildBoard, clearAlbumCollectAnimation, clearPowerupNotice, fitBoard, hideTutorialOverlay, hideWin, playAlbumCollectAnimation, playFullVisionTransition, render, renderTutorialOverlay, showPowerupNotice, showToast, showWin, updateClickMoveMarker } from './ui.js?v=20261006-daily-entry-cleanup-1';
import { bindBoardInput, bindInput } from './input.js?v=20261005-reward-ad-1';
import { createRunState } from './run-state.js?v=20261005-reward-ad-1';
import { advanceTutorial, canMoveDuringTutorial, createTutorialState, currentTutorialStep, isTutorialMoveAllowed, tutorialActionCompleted } from './tutorial.js';
import { createAlbum, getAlbumProgress } from './album.js?v=20261005-album-unlock-fix-1';
import { addClearedStage, getInitialStageId, getPlayerState, setLastStage, setTutorialCompleted, shouldAddClearedStage } from './player-state.js?v=20261005-reward-ad-1';
import { createRewardAdModal } from './reward-ad.js?v=20261005-reward-ad-1';
import { getDailyChallenge, getTaipeiDateKey } from './daily.js';
import { DAILY_UI_TEXT } from './daily-ui.js?v=20261006-daily-copy-1';

let state, stageIndex = 0, autoSolveTimer = null, albumOpen = false, rewardAd;
let appView = 'start', albumReturnContext = 'start';
let gameMode = 'stage', dailyLoading = false;
const clickMoveController = new ClickMoveController({ interval: CLICK_MOVE_STEP_INTERVAL });
const select = document.getElementById('level-select');
const dailyHomeButton = document.getElementById('daily-home');
const cheatButton = document.getElementById('cheat');
const lightButton = document.getElementById('light-mode');
const appRoot = document.querySelector('.app');
const startScreen = document.getElementById('start-screen');
const dailyLevelControl = document.getElementById('daily-level-control');
const dailyLevelDate = document.getElementById('daily-level-date');
const startEnterButton = document.getElementById('start-enter');
const startAlbumButton = document.getElementById('start-album');
const startAlbumProgress = document.getElementById('start-album-progress');
const startDailyButton = document.getElementById('start-daily');
const startDailyDate = document.getElementById('start-daily-date');
const startDailyStatus = document.getElementById('start-daily-status');
const controls = [...document.querySelectorAll('[data-dir]')];
const now = () => globalThis.performance?.now?.() ?? Date.now();
GAME_STAGES.forEach((stage, index) => {
  const option = document.createElement('option'); option.value = index; option.textContent = stage.name; select.append(option);
});

function syncMovementControls() {
  const tutorialLocked = Boolean(state?.tutorial?.active && !canMoveDuringTutorial(state.tutorial));
  const autoSolveLocked = autoSolveTimer !== null;
  const viewLocked = appView !== 'game';
  const modalLocked = Boolean(rewardAd?.isOpen);
  const gameLocked = tutorialLocked || autoSolveLocked || albumOpen || viewLocked || modalLocked || Boolean(state?.won);
  controls.forEach(button => { button.disabled = gameLocked; });
  const tutorialCompleted = getPlayerState().tutorialCompleted;
  startDailyButton.disabled = dailyLoading || !tutorialCompleted;
  startDailyDate.textContent = tutorialCompleted
    ? getTaipeiDateKey().slice(5).replace('-', '/') : '完成教學後開放';
  startDailyButton.setAttribute('aria-label', tutorialCompleted ? '開始每日一關' : '請先完成教學以解鎖每日一關');
  startAlbumButton.disabled = dailyLoading;
  dailyHomeButton.hidden = !state || Boolean(state.level.isTutorial);
  lightButton.textContent = state?.lightModeActive ? '已亮燈' : state?.fullVisionMode ? '已全亮' : '亮燈';
  lightButton.disabled = !state || Boolean(state.level.isTutorial || state.lightModeActive || state.fullVisionMode) || gameLocked;
  lightButton.setAttribute('aria-label', lightButton.disabled
    ? '迷宮已亮燈或目前無法使用亮燈'
    : '開啟 NNE 廣告並點亮迷宮');
  cheatButton.disabled = !state || tutorialLocked || albumOpen || viewLocked || modalLocked || Boolean(state?.won);
  const isDaily = Boolean(state?.level.isDaily);
  select.hidden = isDaily;
  dailyLevelControl.hidden = !isDaily;
  if (isDaily) {
    const dateKey = state.level.dailyMetadata?.dateKey ?? getTaipeiDateKey();
    dailyLevelDate.dateTime = dateKey;
    dailyLevelDate.textContent = dateKey.slice(5).replace('-', '/');
  }
}

function updateStartAlbumProgress() {
  const progress = getAlbumProgress(getPlayerState().clearedStages);
  startAlbumProgress.textContent = `${progress.count} / ${progress.total}`;
}

function returnToStartScreen() {
  rewardAd?.cancel();
  if (albumOpen) album.close();
  hideWin();
  if (state) state.lightModeActive = false;
  appView = 'start';
  albumReturnContext = 'start';
  cancelClickMove(true);
  stopAutoSolve();
  hideTutorialOverlay();
  startScreen.hidden = false;
  startScreen.inert = false;
  appRoot.hidden = true;
  appRoot.inert = true;
  startEnterButton.disabled = false;
  startAlbumButton.disabled = false;
  startDailyStatus.textContent = '';
  updateStartAlbumProgress();
  syncMovementControls();
  startEnterButton.focus({ preventScroll: true });
}

function hideStartScreen() {
  appView = 'game';
  appRoot.hidden = false;
  appRoot.inert = false;
  startScreen.inert = true;
  startScreen.hidden = true;
  document.getElementById('board').focus({ preventScroll: true });
}

function enterGame() {
  if (appView !== 'start') return;
  const startStageId = getInitialStageId(getPlayerState());
  const savedIndex = GAME_STAGES.findIndex(stage => stage.stageId === startStageId);
  const nextStageIndex = savedIndex >= 0 ? savedIndex : 0;
  const nextStageId = GAME_STAGES[nextStageIndex].stageId;
  if (nextStageId > 0) setLastStage(nextStageId);
  hideStartScreen();
  start(nextStageIndex, 'stage');
}

async function enterDaily() {
  if (appView !== 'start' || dailyLoading) return;
  if (!getPlayerState().tutorialCompleted) {
    startDailyStatus.textContent = '請先完成教學，再來挑戰每日一關。';
    return;
  }

  dailyLoading = true;
  startEnterButton.disabled = true;
  const requestTimestamp = Date.now();
  startDailyDate.textContent = getTaipeiDateKey(requestTimestamp).slice(5).replace('-', '/');
  startDailyStatus.textContent = '';
  syncMovementControls();
  try {
    const challenge = await getDailyChallenge(requestTimestamp);
    dailyLoading = false;
    hideStartScreen();
    start(stageIndex, 'daily', challenge.levelData);
  } catch (error) {
    dailyLoading = false;
    startEnterButton.disabled = false;
    startDailyStatus.textContent = '每日關生成失敗，請稍後再試。';
    console.error('[DAILY] unable to enter challenge', error);
    syncMovementControls();
  }
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
  cheatButton.setAttribute('aria-label', '觀看本關解答（需先觀看 COO 廣告）');
  syncMovementControls();
}

rewardAd = createRewardAdModal({
  root: document.getElementById('reward-ad-overlay'),
  dialog: document.getElementById('reward-ad-dialog'),
  brand: document.getElementById('reward-ad-brand'),
  headline: document.getElementById('reward-ad-headline'),
  body: document.getElementById('reward-ad-body'),
  countdown: document.getElementById('reward-ad-countdown'),
  action: document.getElementById('reward-ad-action'),
  onOpen() {
    cancelClickMove();
    appRoot.inert = true;
    syncMovementControls();
  },
  onClose() {
    appRoot.inert = appView !== 'game';
    syncMovementControls();
  },
});

const album = createAlbum({
  stages: STAGES,
  onOpen() {
    albumReturnContext = appView === 'start' ? 'start' : 'game';
    appView = 'album';
    albumOpen = true;
    cancelClickMove();
    stopAutoSolve();
    appRoot.inert = true;
    if (albumReturnContext === 'start') startScreen.inert = true;
    syncMovementControls();
  },
  onClose() {
    albumOpen = false;
    appView = albumReturnContext;
    if (albumReturnContext === 'start') {
      appRoot.hidden = true;
      appRoot.inert = true;
      startScreen.hidden = false;
      startScreen.inert = false;
      updateStartAlbumProgress();
    } else {
      appRoot.hidden = false;
      appRoot.inert = false;
    }
    syncMovementControls();
    return albumReturnContext === 'start' ? startAlbumButton : null;
  },
});

function start(index = stageIndex, mode = gameMode, dailyLevel = null) {
  rewardAd.cancel();
  clearAlbumCollectAnimation();
  cancelClickMove(true);
  stopAutoSolve();
  hideTutorialOverlay();
  clearPowerupNotice();
  if (mode === 'stage') stageIndex = index;
  gameMode = mode;
  const level = mode === 'daily'
    ? dailyLevel ?? (state?.level?.isDaily ? state.level : null)
    : prepareStage(GAME_STAGES[stageIndex]);
  if (!level) throw new Error('Daily level data is unavailable.');
  validateLevel(level);
  const maze = cloneMaze(level.mazeTemplate);
  const sequence = getColorConfig(level).colorSequence;
  if (!allReachable(maze) || !validateSolutionPath(maze, maze.solutionPath, sequence)) throw new Error('產生了無解迷宮。');
  state = createRunState(level, maze, DEBUG);
  if (level.isTutorial) state.tutorial = createTutorialState();
  cheatButton.hidden = Boolean(level.isTutorial);
  lightButton.hidden = Boolean(level.isTutorial);
  const initialVision = getVisionCells(maze, state.player, state.visionRange).visibleCells;
  updateColorMemory(state, initialVision);
  select.value = String(index); hideWin(); buildBoard(state); render(state);
  syncMovementControls();
  if (state.tutorial?.active) renderTutorialOverlay(state.tutorial);
  showToast(level.isDaily ? DAILY_UI_TEXT.entryNotice : `${level.name} · 尋找紅色`);
}

function executeMove(direction, clickPerformance = null, { source = 'player' } = {}) {
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
    if (!state.level.isDaily && shouldAddClearedStage(source, AUTO_SOLVE_COUNTS_AS_CLEAR)) {
      const newlyUnlocked = state.level.stageId > 0
        && !getPlayerState().clearedStages.includes(state.level.stageId);
      addClearedStage(state.level.stageId);
      if (newlyUnlocked) playAlbumCollectAnimation();
    }
    stopAutoSolve();
    if (state.level.isTutorial) {
      setTutorialCompleted(true);
      setLastStage(1);
    }
    showWin(state, stageIndex < GAME_STAGES.length - 1);
  }
  return turn;
}

function move(direction) {
  if (appView !== 'game' || albumOpen || rewardAd.isOpen || autoSolveTimer !== null || state?.won) return;
  cancelClickMove();
  if (state?.tutorial?.active) {
    if (!canMoveDuringTutorial(state.tutorial)) return;
    if (!isTutorialMoveAllowed(state.tutorial, state.maze, state.player, direction)) return;
  }
  const turn = executeMove(direction);
  if (turn.moved) clickMoveController.noteExternalMove();
}

function requestClickMove(target, inputTiming = null) {
  if (appView !== 'game' || !state || albumOpen || rewardAd.isOpen || autoSolveTimer !== null || state.won) return;
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
      if (rewardAd.isOpen || autoSolveTimer !== null || appView !== 'game') return false;
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
  if (stageOneIndex >= 0) {
    setTutorialCompleted(true);
    setLastStage(1);
    start(stageOneIndex, 'stage');
  }
}

function runAutoSolve() {
  if (appView !== 'game' || !state || state.won || state.level.isTutorial || rewardAd.isOpen) return;
  cancelClickMove();
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
    const turn = executeMove(solution[stepIndex++], null, { source: 'auto-solve' });
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

function requestAutoSolve() {
  if (autoSolveTimer !== null) {
    runAutoSolve();
    return;
  }
  if (appView !== 'game' || !state || state.won || state.level.isTutorial || rewardAd.isOpen) return;
  rewardAd.showRewardAdModal({ type: 'solution', onComplete: runAutoSolve });
}

function requestLightMode() {
  if (appView !== 'game' || !state || state.won || state.level.isTutorial
    || state.lightModeActive || state.fullVisionMode || autoSolveTimer !== null || rewardAd.isOpen) return;
  rewardAd.showRewardAdModal({
    type: 'light',
    onComplete() {
      if (appView !== 'game' || !state || state.won) return;
      state.lightModeActive = true;
      render(state);
      syncMovementControls();
      showToast('迷宮已亮燈');
    },
  });
}

bindInput(move, () => appView !== 'game' || albumOpen || rewardAd.isOpen || Boolean(state?.won));
bindBoardInput(document.getElementById('board'), () => ({
  width: state.maze.width,
  height: state.maze.height,
}), requestClickMove);
document.getElementById('restart').addEventListener('click', () => {
  if (gameMode === 'daily') start(stageIndex, 'daily', state?.level);
  else start(stageIndex, 'stage');
});
dailyHomeButton.addEventListener('click', () => {
  returnToStartScreen();
});
startEnterButton.addEventListener('click', enterGame);
startDailyButton.addEventListener('click', enterDaily);
startAlbumButton.addEventListener('click', () => {
  if (appView === 'start') album.open();
});
document.getElementById('play-again').addEventListener('click', () => {
  if (gameMode === 'daily') start(stageIndex, 'daily', state?.level);
  else start(stageIndex, 'stage');
});
document.getElementById('next-level').addEventListener('click', () => {
  if (gameMode === 'daily') {
    returnToStartScreen();
    return;
  }
  if (stageIndex < GAME_STAGES.length - 1) {
    const nextIndex = stageIndex + 1;
    const nextStageId = GAME_STAGES[nextIndex].stageId;
    if (nextStageId > 0) setLastStage(nextStageId);
    start(nextIndex, 'stage');
  }
});
lightButton.addEventListener('click', requestLightMode);
cheatButton.addEventListener('click', requestAutoSolve);
document.getElementById('tutorial-next').addEventListener('click', nextTutorialStep);
document.getElementById('tutorial-skip').addEventListener('click', skipTutorial);
select.addEventListener('change', () => {
  if (gameMode !== 'stage') return;
  const nextIndex = Number(select.value);
  const selectedStageId = GAME_STAGES[nextIndex]?.stageId;
  if (selectedStageId > 0) setLastStage(selectedStageId);
  start(nextIndex, 'stage');
});
new ResizeObserver(() => { if (state) fitBoard(state); }).observe(document.getElementById('board-host'));
returnToStartScreen();
