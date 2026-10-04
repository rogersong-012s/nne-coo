import { DIRECTION } from './config.js';

export const TUTORIAL_STEPS = Object.freeze([
  {
    id: 'welcome', actionType: 'info', target: null,
    title: '歡迎來到彩序迷宮',
    body: '正式關卡要依序收集紅、橙、黃、綠、藍、紫，完成兩輪共 12 顆後前往出口。本教學會用短版流程帶你實際走一次。',
  },
  {
    id: 'maze', actionType: 'info', target: '#board', placement: 'top',
    title: '這是迷宮',
    body: '在這裡探索、找顏色並收集道具。地形會受到目前視野與記憶影響。',
  },
  {
    id: 'player', actionType: 'info', target: '.cell.player', fallback: '#board', placement: 'top',
    title: '這是你的位置',
    body: '● 是玩家角色。每次移動一格，可以使用 WASD、方向鍵、下方方向控制，或直接點擊上下左右相鄰格。',
  },
  {
    id: 'stats', actionType: 'info', target: '[data-tutorial-target="stats"]',
    title: 'STEP / EYE / MEM',
    body: 'STEP 是移動步數；EYE 是視野範圍；MEM 是記憶能力值。實際記憶距離為 MEM × 4 步。',
  },
  {
    id: 'sequence', actionType: 'info', target: '#order-panel',
    title: '彩序很重要',
    body: '正式關卡依序收集紅 → 橙 → 黃 → 綠 → 藍 → 紫，完整做兩輪，共 12 顆。',
  },
  {
    id: 'exit', actionType: 'info', target: '.cell.exit', fallback: '#board', placement: 'top',
    title: '出口會在最後解鎖',
    body: '出口一開始就會顯示。正式關卡完成 12 顆目標後才能通關。',
  },
  {
    id: 'move-one', actionType: 'action', action: { type: 'move' }, target: '.controls button, #board', placement: 'top',
    title: '試著移動一步',
    body: '往任意可通行方向成功移動一格，完成後教學會自動繼續。',
  },
  {
    id: 'vision', actionType: 'info', target: '.cell.vision-current', fallback: '#board', placement: 'top',
    title: '視野有限而且會被牆擋住',
    body: '你只能看見有限範圍。EYE 越高，看得越遠；視線沿直線延伸，撞到牆就停止。',
  },
  {
    id: 'memory', actionType: 'info', target: '.cell.memory-path-marker, .cell.memory-wall-marker', fallback: '#memory',
    title: '記憶不等於完整地圖',
    body: '白點表示最近走過的位置；紅叉表示記得那裡是牆。離開視野後，普通地形不會一直完整顯示。',
  },
  {
    id: 'collect-red', actionType: 'action', action: { type: 'collect-color', color: 'red' }, target: '.cell.color-red', fallback: '#order-panel', placement: 'top',
    title: '第一個目標是紅色',
    body: '現在只能進入紅色目標。其他尚未輪到的顏色會像障礙物一樣擋路。',
  },
  {
    id: 'wrong-color', actionType: 'info', target: '.cell.color-yellow', fallback: '#order-panel', placement: 'top',
    title: '錯誤顏色目前不可通行',
    body: '黃色還沒輪到，所以現在不能進入。等彩序輪到黃色後，它才會開放通行。',
  },
  {
    id: 'collect-nne', actionType: 'action', action: { type: 'collect-item', kind: 'nne' }, target: '.cell.nne', fallback: '#board', placement: 'top',
    title: '收集 NNE',
    body: '移動到青色 ✦ NNE。每取得一個 NNE，EYE +1，視野會增加。',
  },
  {
    id: 'collect-coo', actionType: 'action', action: { type: 'collect-item', kind: 'coo' }, target: '.cell.coo', fallback: '#board', placement: 'top',
    title: '收集 COO',
    body: '移動到紫色 ✧ COO。每取得一個 COO，MEM +2，路線與顏色記憶都會延長。',
  },
  {
    id: 'background', actionType: 'info', target: '.board-background', fallback: '#board', placement: 'top',
    title: '背景圖片會逐步揭露',
    body: '每完成一顆彩色目標，就會揭露一部分背景圖片。正式關卡完成全部 12 顆後，圖片會完整顯示。',
  },
  {
    id: 'full-reveal', actionType: 'info', target: '#order-panel, .cell.exit, .board-background', fallback: '#board', placement: 'top',
    title: '完成彩序後前往出口',
    body: '正式關卡完成 12 顆後會開啟 Full Vision、揭露完整圖片並解鎖出口。Stage 0 是短版示範，完成紅、橙、黃三顆後也會進入此狀態。',
  },
  {
    id: 'collect-orange', actionType: 'action', action: { type: 'collect-color', color: 'orange' }, target: '.cell.color-orange', fallback: '#order-panel', placement: 'top',
    title: '現在輪到橙色',
    body: '沿迷宮走到橙色菱形。只有目前輪到的顏色能被收集。',
  },
  {
    id: 'collect-yellow', actionType: 'action', action: { type: 'collect-color', color: 'yellow' }, target: '.cell.color-yellow', fallback: '#order-panel', placement: 'top',
    title: '接著收集黃色',
    body: '再找到黃色菱形。Stage 0 以紅、橙、黃示範短版彩序。',
  },
  {
    id: 'reach-exit', actionType: 'action', action: { type: 'reach-exit' }, target: '.cell.exit', fallback: '#board', placement: 'top',
    title: '走到出口完成教學',
    body: '短版彩序完成了。走到已解鎖的出口，完成 Stage 0。',
  },
]);

export function createTutorialState() {
  return { active: true, completed: false, stepIndex: 0 };
}

export function currentTutorialStep(tutorialState) {
  return tutorialState?.active ? TUTORIAL_STEPS[tutorialState.stepIndex] ?? null : null;
}

export function canMoveDuringTutorial(tutorialState) {
  return currentTutorialStep(tutorialState)?.actionType === 'action';
}

export function isTutorialMoveAllowed(tutorialState, maze, player, direction) {
  const step = currentTutorialStep(tutorialState);
  if (step?.actionType !== 'action') return false;
  const delta = DIRECTION[direction];
  if (!delta) return false;

  const next = { x: player.x + delta[0], y: player.y + delta[1] };
  const action = step.action;
  const item = maze.items.find(entry => entry.x === next.x && entry.y === next.y);
  if (item && !(action.type === 'collect-item' && action.kind === item.kind)) return false;

  const target = maze.colors.find(entry => entry.x === next.x && entry.y === next.y && !entry.completed);
  if (target && !(action.type === 'collect-color' && action.color === target.color)) return false;

  const atExit = next.x === maze.exit.x && next.y === maze.exit.y;
  return !atExit || action.type === 'reach-exit';
}

export function tutorialActionCompleted(step, turn, maze) {
  if (step?.actionType !== 'action' || !turn?.moved) return false;
  switch (step.action.type) {
    case 'move': return true;
    case 'collect-color': {
      const result = turn.colorResult;
      const target = result && maze.colors.find(entry => entry.id === result.targetId);
      return Boolean(target && target.color === step.action.color && ['correct', 'round-complete', 'complete'].includes(result.type));
    }
    case 'collect-item': return turn.item === step.action.kind;
    case 'reach-exit': return turn.won === true;
    default: return false;
  }
}

export function advanceTutorial(tutorialState, actionCompleted = false) {
  const step = currentTutorialStep(tutorialState);
  if (!step || (step.actionType === 'action') !== actionCompleted) return false;
  tutorialState.stepIndex++;
  if (tutorialState.stepIndex >= TUTORIAL_STEPS.length) {
    tutorialState.active = false;
    tutorialState.completed = true;
  }
  return true;
}
