import test from 'node:test';
import assert from 'node:assert/strict';
import { getColorConfig, SIZE_TIERS } from '../js/levels.js';
import { cloneMaze, solveMaze, validateSolutionPath } from '../js/maze.js';
import { createRunState } from '../js/run-state.js';
import { takeTurn } from '../js/turn.js';
import {
  DAILY_GENERATOR_VERSION,
  DAILY_MAX_SEED_ATTEMPTS,
  DAILY_TIME_ZONE,
  clearDailyCache,
  generateDailyChallenge,
  getDailyChallenge,
  getDailySizeTier,
  getTaipeiDateKey,
  getTaipeiMidnightUnixSeconds,
} from '../js/daily.js';

test('Taipei date and midnight seed do not depend on the browser timezone', () => {
  const timestamp = Date.UTC(2026, 9, 5, 16, 0, 0);
  const previousTimezone = process.env.TZ;
  const dates = [];
  try {
    for (const timezone of ['Asia/Taipei', 'America/New_York', 'Europe/London', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      dates.push(getTaipeiDateKey(timestamp));
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }

  assert.deepEqual(dates, Array(4).fill('2026-10-06'));
  assert.equal(DAILY_TIME_ZONE, 'Asia/Taipei');
  assert.equal(getTaipeiMidnightUnixSeconds('2026-10-06'), 1791216000);
});

test('Taipei midnight changes the date and base seed by exactly one day', () => {
  const beforeMidnight = Date.UTC(2026, 9, 6, 15, 59, 59);
  const midnight = beforeMidnight + 1000;
  assert.equal(getTaipeiDateKey(beforeMidnight), '2026-10-06');
  assert.equal(getTaipeiDateKey(midnight), '2026-10-07');
  assert.equal(getTaipeiMidnightUnixSeconds('2026-10-07') - getTaipeiMidnightUnixSeconds('2026-10-06'), 86400);
});

test('daily Size Tier cycles deterministically through the five formal tiers', () => {
  const tiers = Array.from({ length: 10 }, (_, index) => getDailySizeTier(`2026-10-${String(index + 1).padStart(2, '0')}`));
  assert.deepEqual(new Set(tiers), new Set([1, 2, 3, 4, 5]));
  assert.ok(tiers.every(tier => tier >= 1 && tier <= 5));
  for (let tier = 1; tier <= 5; tier++) {
    const { mazeWidth, mazeHeight } = SIZE_TIERS[tier];
    assert.ok(mazeWidth <= SIZE_TIERS[5].mazeWidth && mazeHeight <= SIZE_TIERS[5].mazeHeight);
    assert.ok(mazeWidth <= 17 && mazeHeight <= 17);
  }
});

test('daily generation retries by seed +1 and passes full solvability and choice safety checks', async () => {
  const challenge = await generateDailyChallenge('2026-10-06');
  const { levelData, solution } = challenge;
  assert.equal(challenge.timezone, 'Asia/Taipei');
  assert.equal(challenge.generatorVersion, DAILY_GENERATOR_VERSION);
  assert.ok(DAILY_MAX_SEED_ATTEMPTS < 86400);
  assert.equal(challenge.sizeTier, getDailySizeTier(challenge.dateKey));
  assert.deepEqual([challenge.mazeWidth, challenge.mazeHeight], [SIZE_TIERS[challenge.sizeTier].mazeWidth, SIZE_TIERS[challenge.sizeTier].mazeHeight]);
  assert.equal(challenge.validationPassed, true);
  assert.equal(challenge.deadlockBranches, 0);
  assert.equal(challenge.finalSeed, challenge.baseSeed + challenge.attempt);
  assert.ok(challenge.attempt > 0, 'this fixture exercises a rejected Base Seed and +1 retries');
  assert.ok(challenge.attempt < DAILY_MAX_SEED_ATTEMPTS);
  assert.equal(levelData.isDaily, true);
  assert.equal(levelData.stageId, null, 'Daily has no formal Stage id');
  assert.equal(levelData.mazeTemplate.quality.choiceSafety.choiceSafe, true);
  assert.equal(validateSolutionPath(levelData.mazeTemplate, solution, getColorConfig(levelData).colorSequence), true);
});

test('same Taipei date produces the same final seed, maze, objects and solution', async () => {
  const first = await generateDailyChallenge('2026-10-06');
  const reloaded = await generateDailyChallenge('2026-10-06');
  assert.equal(reloaded.finalSeed, first.finalSeed);
  assert.deepEqual(reloaded.levelData.wallLayout, first.levelData.wallLayout);
  assert.deepEqual(reloaded.levelData.mazeTemplate.colors, first.levelData.mazeTemplate.colors);
  assert.deepEqual(reloaded.levelData.mazeTemplate.items, first.levelData.mazeTemplate.items);
  assert.deepEqual(reloaded.solution, first.solution);
});

test('Daily solution completes through normal turns and unlocks Full Vision before Exit', async () => {
  const challenge = await generateDailyChallenge('2026-10-06');
  const state = createRunState(challenge.levelData, cloneMaze(challenge.levelData.mazeTemplate));
  assert.deepEqual(solveMaze(state.maze, getColorConfig(state.level).colorSequence), challenge.solution);
  for (const direction of challenge.solution) {
    const turn = takeTurn(state, direction);
    assert.equal(turn.moved, true);
  }
  assert.equal(state.sequenceProgress, 12);
  assert.equal(state.fullVisionMode, true);
  assert.equal(state.won, true);
});

test('daily cache is reused within a date and expires on the next Taipei date', async () => {
  clearDailyCache();
  const firstMidnight = Date.UTC(2026, 9, 5, 16, 0, 0);
  const firstRequest = getDailyChallenge(firstMidnight);
  const duplicateRequest = getDailyChallenge(firstMidnight + 1000);
  assert.strictEqual(firstRequest, duplicateRequest);
  const today = await firstRequest;
  assert.strictEqual(await getDailyChallenge(firstMidnight + 2000), today);
  const tomorrow = await getDailyChallenge(firstMidnight + 86400000);
  assert.equal(tomorrow.dateKey, '2026-10-07');
  assert.notEqual(tomorrow, today);
  clearDailyCache();
});
