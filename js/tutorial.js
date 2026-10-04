import { DIRECTION } from './config.js';

const INFO = (id, target, title, body, extra = {}) => ({ id, actionType: 'info', target, title, body, ...extra });
const ACTION = (id, action, target, title, body, extra = {}) => ({ id, actionType: 'action', action, target, title, body, ...extra });

export const TUTORIAL_STEPS = Object.freeze([
  INFO('welcome', null, '歡迎來到彩序迷宮', '正式關卡要依序收集紅、橙、黃、綠、藍、紫，完成兩輪共 12 顆後前往出口。本教學會用短版流程帶你實際走一次。', { maskMode: 'full' }),
  INFO('maze', '#board', '這是迷宮', '在這裡探索、找顏色並收集道具。地形會受到目前視野與記憶影響。'),
  INFO('player', '.cell.player', '這是你的位置', '● 是玩家角色。可使用 WASD、方向鍵、下方方向控制，或點擊相鄰可通行格移動。'),
  INFO('stats', '[data-tutorial-target="stats"]', 'STEP / EYE / MEM', 'STEP 是移動步數；EYE 是視野範圍；MEM 是記憶能力值。實際記憶距離為 MEM × 4 步。'),
  INFO('sequence', '#order-panel', '彩序很重要', '正式關卡依序收集紅 → 橙 → 黃 → 綠 → 藍 → 紫，完整做兩輪，共 12 顆。'),
  INFO('exit-intro', '.cell.exit', '出口在這裡', '還沒完成彩序時，出口不會讓你過關。不過別擔心，你仍然可以從這裡通過。', { preferredPositions: ['top', 'bottom', 'right', 'left'] }),
  ACTION('move-one', { type: 'move', direction: 'down' }, '.cell.player', '朝出口移動一步', '請往下移動一格，接著我們會實際穿過尚未解鎖的出口。'),
  INFO('vision', '#board', '視野有限而且會被牆擋住', '你只能看見有限範圍。EYE 越高，看得越遠；視線沿直線延伸，撞到牆就停止。'),
  ACTION('pass-through-exit', { type: 'pass-through-exit' }, '.cell.exit, .cell.player', '試著穿過出口', '先走進出口格，再從另一側走出去。完成彩序前，它只是普通通道，不會讓你過關。', { preferredPositions: ['top', 'bottom', 'right', 'left'] }),
  INFO('memory', '#memory', '記憶不等於完整地圖', '白點表示最近走過的位置；紅叉表示記得那裡是牆。離開視野後，普通地形不會一直完整顯示。'),
  ACTION('collect-red', { type: 'collect-color', color: 'red' }, '.cell.color-red', '第一個目標是紅色', '現在只能進入紅色目標。其他尚未輪到的顏色會像障礙物一樣擋路。'),
  INFO('wrong-color', '.cell.color-yellow', '錯誤顏色目前不可通行', '黃色還沒輪到，所以現在不能進入。等彩序輪到黃色後，它才會開放通行。'),
  ACTION('collect-nne', { type: 'collect-item', kind: 'nne' }, '.cell.nne', '收集 NNE', '移動到青色 ✦ NNE。每取得一個 NNE，EYE +1，視野會增加。'),
  ACTION('collect-coo', { type: 'collect-item', kind: 'coo' }, '.cell.coo', '收集 COO', '移動到紫色 ✧ COO。每取得一個 COO，MEM +2，路線與顏色記憶都會延長。'),
  INFO('background', '#board', '背景圖片會逐步揭露', '每完成一顆彩色目標，就會揭露一部分背景圖片。正式關卡完成全部 12 顆後，圖片會完整顯示。'),
  ACTION('collect-orange', { type: 'collect-color', color: 'orange' }, '.cell.color-orange', '現在輪到橙色', '沿迷宮走到橙色菱形。只有目前輪到的顏色能被收集。'),
  ACTION('collect-yellow', { type: 'collect-color', color: 'yellow' }, '.cell.color-yellow', '接著收集黃色', '再找到黃色菱形。Stage 0 以紅、橙、黃示範短版彩序。'),
  INFO('full-reveal', '.cell.exit', '出口已經解鎖', '完成 Stage 0 的三顆彩色目標後，會開啟 Full Vision 並揭露完整圖片。現在走到出口就能通關。', { preferredPositions: ['top', 'bottom', 'right', 'left'] }),
  ACTION('reach-exit', { type: 'reach-exit' }, '.cell.exit', '走到出口完成教學', '短版彩序完成了。走到已解鎖的出口，完成 Stage 0。', { preferredPositions: ['top', 'bottom', 'right', 'left'] }),
].map(step => Object.freeze({
  maskMode: step.maskMode ?? (step.actionType === 'action' ? 'maze-open' : 'spotlight'),
  allowGameplayInput: step.actionType === 'action',
  dialogPlacement: 'auto',
  preferredPositions: step.preferredPositions ?? (step.actionType === 'action' ? ['top', 'bottom', 'right', 'left'] : ['bottom', 'top', 'right', 'left']),
  ...step,
})));

export function createTutorialState() {
  return { active: true, completed: false, stepIndex: 0, exitPassageEntered: false };
}

export function currentTutorialStep(tutorialState) {
  return tutorialState?.active ? TUTORIAL_STEPS[tutorialState.stepIndex] ?? null : null;
}

export function canMoveDuringTutorial(tutorialState) {
  return currentTutorialStep(tutorialState)?.allowGameplayInput === true;
}

export function isTutorialMoveAllowed(tutorialState, maze, player, direction) {
  const step = currentTutorialStep(tutorialState);
  if (!canMoveDuringTutorial(tutorialState)) return false;
  const delta = DIRECTION[direction];
  if (!delta) return false;
  if (step.action.type === 'move' && step.action.direction && direction !== step.action.direction) return false;

  const next = { x: player.x + delta[0], y: player.y + delta[1] };
  const item = maze.items.find(entry => entry.x === next.x && entry.y === next.y);
  if (item && !(step.action.type === 'collect-item' && step.action.kind === item.kind)) return false;

  const target = maze.colors.find(entry => entry.x === next.x && entry.y === next.y && !entry.completed);
  if (target && !(step.action.type === 'collect-color' && step.action.color === target.color)) return false;

  const atExit = next.x === maze.exit.x && next.y === maze.exit.y;
  // A locked exit is ordinary walkable floor. The tutorial only gates access
  // until the dedicated passage lesson; normal Stages have no such gate.
  return !atExit || ['pass-through-exit', 'reach-exit'].includes(step.action.type);
}

export function tutorialActionCompleted(step, turn, maze, tutorialState, previousPosition, nextPosition) {
  if (step?.actionType !== 'action' || !turn?.moved) return false;
  switch (step.action.type) {
    case 'move': return true;
    case 'collect-color': {
      const result = turn.colorResult;
      const target = result && maze.colors.find(entry => entry.id === result.targetId);
      return Boolean(target && target.color === step.action.color && ['correct', 'round-complete', 'complete'].includes(result.type));
    }
    case 'collect-item': return turn.item === step.action.kind;
    case 'pass-through-exit': {
      const isExit = position => position?.x === maze.exit.x && position?.y === maze.exit.y;
      if (isExit(nextPosition)) {
        tutorialState.exitPassageEntered = true;
        return false;
      }
      return tutorialState.exitPassageEntered && isExit(previousPosition);
    }
    case 'reach-exit': return turn.won === true;
    default: return false;
  }
}

export function advanceTutorial(tutorialState, actionCompleted = false) {
  const step = currentTutorialStep(tutorialState);
  if (!step || (step.actionType === 'action') !== actionCompleted) return false;
  if (step.action?.type === 'pass-through-exit') tutorialState.exitPassageEntered = false;
  tutorialState.stepIndex++;
  if (tutorialState.stepIndex >= TUTORIAL_STEPS.length) {
    tutorialState.active = false;
    tutorialState.completed = true;
  }
  return true;
}
