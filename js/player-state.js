export const PLAYER_STATE_STORAGE_KEY = 'nnecoo_player_state';
export const MIN_FORMAL_STAGE = 1;
export const MAX_FORMAL_STAGE = 100;

const emptyPlayerState = () => ({ lastStage: null, tutorialCompleted: false, clearedStages: [] });
const isFormalStage = stage => Number.isInteger(stage)
  && stage >= MIN_FORMAL_STAGE && stage <= MAX_FORMAL_STAGE;

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage; }
  catch { return null; }
}

export function normalizePlayerState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyPlayerState();
  const clearedStages = Array.isArray(value.clearedStages)
    ? [...new Set(value.clearedStages.filter(isFormalStage))]
    : [];
  return {
    lastStage: isFormalStage(value.lastStage) ? value.lastStage : null,
    tutorialCompleted: value.tutorialCompleted === true,
    clearedStages,
  };
}

export function loadPlayerState(storage) {
  try {
    const target = getStorage(storage);
    if (!target) return emptyPlayerState();
    const raw = target.getItem(PLAYER_STATE_STORAGE_KEY);
    if (raw === null) return emptyPlayerState();
    const normalized = normalizePlayerState(JSON.parse(raw));
    const serialized = JSON.stringify(normalized);
    if (raw !== serialized) {
      try { target.setItem(PLAYER_STATE_STORAGE_KEY, serialized); }
      catch { /* Migration is best-effort; the normalized state is still usable. */ }
    }
    return normalized;
  } catch {
    return emptyPlayerState();
  }
}

export function getInitialStageId(playerState = currentPlayerState) {
  const saved = normalizePlayerState(playerState);
  if (!saved.tutorialCompleted) return 0;
  return saved.lastStage ?? 1;
}

let currentPlayerState = loadPlayerState();

export function getPlayerState() {
  return { ...currentPlayerState, clearedStages: [...currentPlayerState.clearedStages] };
}

export function savePlayerState(nextState = currentPlayerState, storage) {
  currentPlayerState = normalizePlayerState(nextState);
  try {
    getStorage(storage)?.setItem(PLAYER_STATE_STORAGE_KEY, JSON.stringify(currentPlayerState));
  } catch { /* Storage can be disabled or full; gameplay must remain available. */ }
  return getPlayerState();
}

export function setLastStage(stageId) {
  if (!isFormalStage(stageId)) return getPlayerState();
  return savePlayerState({ ...currentPlayerState, lastStage: stageId });
}

export function setTutorialCompleted(completed = true) {
  return savePlayerState({ ...currentPlayerState, tutorialCompleted: completed === true });
}

export function addClearedStage(stageId, storage) {
  if (!isFormalStage(stageId)) return getPlayerState();
  return savePlayerState({
    ...currentPlayerState,
    clearedStages: [...new Set([...currentPlayerState.clearedStages, stageId])],
  }, storage);
}

export function shouldAddClearedStage(source = 'player', autoSolveCountsAsClear = false) {
  return source !== 'auto-solve' || autoSolveCountsAsClear === true;
}

export function clearPlayerState(storage) {
  currentPlayerState = emptyPlayerState();
  try { getStorage(storage)?.removeItem(PLAYER_STATE_STORAGE_KEY); }
  catch { /* Keep the in-memory safe default if storage is unavailable. */ }
  return getPlayerState();
}

if (typeof window !== 'undefined') {
  window.resetNnecooProgress = clearPlayerState;
}
