import { DEBUG } from './config.js';
import { STAGES, getColorConfig, prepareStage, validateLevel } from './levels.js';
import { cloneMaze, allReachable, solveMaze, validateSolutionPath } from './maze.js';
import { takeTurn } from './turn.js';
import { getVisionCells, updateColorMemory } from './memory.js';
import { buildBoard, clearPowerupNotice, fitBoard, hideWin, playFullVisionTransition, render, showPowerupNotice, showToast, showWin } from './ui.js';
import { bindInput } from './input.js';
import { createRunState } from './run-state.js';

let state, stageIndex = 0, autoSolveTimer = null;
const select = document.getElementById('level-select');
const cheatButton = document.getElementById('cheat');
const controls = [...document.querySelectorAll('[data-dir]')];
STAGES.forEach((stage, index) => {
  const option = document.createElement('option'); option.value = index; option.textContent = stage.name; select.append(option);
});

function stopAutoSolve() {
  if (autoSolveTimer !== null) clearInterval(autoSolveTimer);
  autoSolveTimer = null;
  cheatButton.classList.remove('running');
  cheatButton.setAttribute('aria-label', '重置並自動執行本關解答');
  controls.forEach(button => { button.disabled = false; });
}

function start(index = stageIndex) {
  stopAutoSolve();
  clearPowerupNotice();
  stageIndex = index;
  const level = prepareStage(STAGES[stageIndex]);
  validateLevel(level);
  const maze = cloneMaze(level.mazeTemplate);
  const sequence = getColorConfig(level).colorSequence;
  if (!allReachable(maze) || !validateSolutionPath(maze, maze.solutionPath, sequence)) throw new Error('產生了無解迷宮。');
  state = createRunState(level, maze, DEBUG);
  const initialVision = getVisionCells(maze, state.player, state.visionRange).visibleCells;
  updateColorMemory(state, initialVision);
  select.value = String(index); hideWin(); buildBoard(state); render(state);
  showToast(`${level.name} · 尋找紅色`);
}

function executeMove(direction) {
  const wasFullVisionMode = state.fullVisionMode;
  const turn = takeTurn(state, direction);
  if (!turn.moved) {
    if (turn.reason === 'color-locked') showToast('順序未到，暫時無法通行');
    return turn;
  }
  render(state);
  if (!wasFullVisionMode && state.fullVisionMode) playFullVisionTransition();
  if (turn.item === 'nne') showPowerupNotice('NNE GET!', 'EYE +1', 'nne');
  else if (turn.item === 'coo') showPowerupNotice('COO GET!', 'MEM +2', 'coo');
  else if (turn.colorResult?.type === 'complete') showToast('12 顆完成 · 全視野開啟 · 前往出口', 'success');
  else if (turn.colorResult?.type === 'round-complete') {
    const { colorRounds } = getColorConfig(state.level);
    showToast(`第 ${turn.colorResult.completedRound} 輪完成${turn.colorResult.completedRound < colorRounds ? `！第 ${turn.colorResult.completedRound + 1} 輪：再次尋找紅色` : ''}`, 'success');
  } else if (turn.colorResult?.type === 'correct') showToast('順序正確！', 'success');
  else if (turn.exitLocked) showToast('尚未完成彩序 · 出口鎖定', 'mistake');

  if (state.won) {
    stopAutoSolve();
    showWin(state, stageIndex < STAGES.length - 1);
  }
  return turn;
}

function move(direction) {
  if (autoSolveTimer !== null) return;
  executeMove(direction);
}

function runAutoSolve() {
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
  controls.forEach(button => { button.disabled = true; });
  let stepIndex = 0;
  autoSolveTimer = setInterval(() => {
    const turn = executeMove(solution[stepIndex++]);
    if (!turn.moved) {
      stopAutoSolve();
      showToast('解答路徑中斷', 'mistake');
      return;
    }
    if (state.won) return;
    if (stepIndex >= solution.length) {
      stopAutoSolve();
      showToast('解答已結束但出口未通關', 'mistake');
    }
  }, 160);
}

bindInput(move, () => { state.debug = !state.debug; render(state); });
document.getElementById('restart').addEventListener('click', () => start());
document.getElementById('play-again').addEventListener('click', () => start());
document.getElementById('next-level').addEventListener('click', () => { if (stageIndex < STAGES.length - 1) start(stageIndex + 1); });
document.getElementById('debug').addEventListener('click', () => { state.debug = !state.debug; render(state); });
cheatButton.addEventListener('click', runAutoSolve);
select.addEventListener('change', () => start(Number(select.value)));
new ResizeObserver(() => { if (state) fitBoard(state); }).observe(document.getElementById('board-host'));
start();
