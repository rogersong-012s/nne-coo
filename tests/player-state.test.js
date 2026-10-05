import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PLAYER_STATE_STORAGE_KEY,
  addClearedStage,
  getInitialStageId,
  loadPlayerState,
  normalizePlayerState,
  savePlayerState,
  shouldAddClearedStage,
} from '../js/player-state.js';

function createStorage(value = null) {
  const values = new Map(value === null ? [] : [[PLAYER_STATE_STORAGE_KEY, value]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, next) => values.set(key, next),
    removeItem: key => values.delete(key),
    values,
  };
}

test('a first visit and incomplete tutorial always start at Stage 0', () => {
  assert.deepEqual(loadPlayerState(createStorage()), { lastStage: null, tutorialCompleted: false, clearedStages: [] });
  assert.equal(getInitialStageId({ lastStage: null, tutorialCompleted: false }), 0);
  assert.equal(getInitialStageId({ lastStage: 58, tutorialCompleted: false }), 0);
});

test('completed tutorial resumes a valid formal Stage and defaults invalid values to Stage 1', () => {
  assert.equal(getInitialStageId({ lastStage: 58, tutorialCompleted: true }), 58);
  for (const lastStage of [null, 0, -1, 101, '58', Number.NaN, undefined]) {
    assert.equal(getInitialStageId({ lastStage, tutorialCompleted: true }), 1);
  }
});

test('startup stage resolution defaults to the loaded saved player state', () => {
  const storage = createStorage();
  savePlayerState({ lastStage: 58, tutorialCompleted: true }, storage);
  assert.equal(getInitialStageId(), 58);
  savePlayerState({ lastStage: null, tutorialCompleted: false }, storage);
  assert.equal(getInitialStageId(), 0);
});

test('malformed or unavailable storage returns a safe first-visit state', () => {
  assert.deepEqual(loadPlayerState(createStorage('{broken')), { lastStage: null, tutorialCompleted: false, clearedStages: [] });
  assert.deepEqual(loadPlayerState({ getItem() { throw new Error('blocked'); } }), { lastStage: null, tutorialCompleted: false, clearedStages: [] });
  assert.deepEqual(normalizePlayerState(null), { lastStage: null, tutorialCompleted: false, clearedStages: [] });
});

test('save API stores only the supported progress fields', () => {
  const storage = createStorage();
  const saved = savePlayerState({ lastStage: 100, tutorialCompleted: true, steps: 200 }, storage);
  assert.deepEqual(saved, { lastStage: 100, tutorialCompleted: true, clearedStages: [] });
  assert.deepEqual(JSON.parse(storage.getItem(PLAYER_STATE_STORAGE_KEY)), saved);
});

test('completed players cannot persist Stage 0 as their resume Stage', () => {
  assert.deepEqual(normalizePlayerState({ lastStage: 0, tutorialCompleted: true }), {
    lastStage: null,
    tutorialCompleted: true,
    clearedStages: [],
  });
});

test('legacy saves migrate in place and sanitize cleared Stage ids', () => {
  const storage = createStorage(JSON.stringify({
    lastStage: 42,
    tutorialCompleted: true,
    clearedStages: [1, 2, 2, 999, -1, 'x', 100],
  }));
  const migrated = loadPlayerState(storage);
  assert.deepEqual(migrated, { lastStage: 42, tutorialCompleted: true, clearedStages: [1, 2, 100] });
  assert.deepEqual(JSON.parse(storage.getItem(PLAYER_STATE_STORAGE_KEY)), migrated);

  const oldSave = createStorage(JSON.stringify({ lastStage: 37, tutorialCompleted: true }));
  assert.deepEqual(loadPlayerState(oldSave), { lastStage: 37, tutorialCompleted: true, clearedStages: [] });
  assert.deepEqual(JSON.parse(oldSave.getItem(PLAYER_STATE_STORAGE_KEY)), {
    lastStage: 37, tutorialCompleted: true, clearedStages: [],
  });
});

test('a Stage unlock is unique, accepts Stage 100, and rejects tutorial or invalid ids', () => {
  const storage = createStorage();
  savePlayerState({ lastStage: 37, tutorialCompleted: true, clearedStages: [5] }, storage);
  addClearedStage(5, storage);
  addClearedStage(100, storage);
  addClearedStage(0, storage);
  addClearedStage(101, storage);
  assert.deepEqual(JSON.parse(storage.getItem(PLAYER_STATE_STORAGE_KEY)), {
    lastStage: 37, tutorialCompleted: true, clearedStages: [5, 100],
  });
});

test('collection summary reaches exactly 100 unique formal Stages', () => {
  const storage = createStorage();
  savePlayerState({ lastStage: 100, tutorialCompleted: true }, storage);
  for (let stage = 1; stage <= 100; stage++) addClearedStage(stage, storage);
  const collection = JSON.parse(storage.getItem(PLAYER_STATE_STORAGE_KEY)).clearedStages;
  assert.equal(collection.length, 100);
  assert.equal(collection.includes(100), true);
});

test('manual, click and Auto Solve completion all count as Stage clears', () => {
  assert.equal(shouldAddClearedStage('player'), true);
  assert.equal(shouldAddClearedStage('click-to-move'), true);
  assert.equal(shouldAddClearedStage('auto-solve'), true);
  assert.equal(shouldAddClearedStage('auto-solve', false), false, 'an explicit opt-out remains available to non-game callers');
});

test('gameplay and album share the same player-state module URL', async () => {
  const sources = await Promise.all(['../js/game.js', '../js/album.js'].map(path =>
    readFile(new URL(path, import.meta.url), 'utf8')));
  const moduleUrls = sources.map(source => {
    const match = source.match(/from ['"](\.\/player-state\.js(?:\?[^'"]*)?)['"]/);
    assert.ok(match, 'expected a player-state.js import');
    return match[1];
  });

  assert.equal(moduleUrls[0], moduleUrls[1], 'separate URLs create separate module state caches');
});
