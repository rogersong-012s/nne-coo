import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALBUM_DESKTOP_PAGE_SIZE,
  ALBUM_MOBILE_PAGE_SIZE,
  getAlbumProgress,
  getAdjacentAlbumPageIndex,
  getAlbumPageEntries,
  getAlbumPageRanges,
  getUnlockedStageNeighbor,
} from '../js/album.js';

const stages = Array.from({ length: 100 }, (_, index) => ({
  stageId: index + 1,
  background: { image: '' },
}));

test('desktop album pages contain 1–20 through 81–100', () => {
  const pages = getAlbumPageRanges(100, ALBUM_DESKTOP_PAGE_SIZE);
  assert.equal(pages.length, 5);
  assert.deepEqual(pages[0], { start: 1, end: 20 });
  assert.deepEqual(pages[4], { start: 81, end: 100 });
});

test('mobile album pages contain ten Stages and include Stage 100 on the last page', () => {
  const pages = getAlbumPageRanges(100, ALBUM_MOBILE_PAGE_SIZE);
  assert.equal(pages.length, 10);
  assert.deepEqual(pages[9], { start: 91, end: 100 });
  const lastPage = getAlbumPageEntries(stages, new Set([100]), 9, ALBUM_MOBILE_PAGE_SIZE);
  assert.equal(lastPage.length, 10);
  assert.equal(lastPage.at(-1).stage.stageId, 100);
  assert.equal(lastPage.at(-1).unlocked, true);
});

test('locked entries have no background request path; unlocked entries share the stage fallback rules', () => {
  const entries = getAlbumPageEntries(stages.slice(0, 2), [1], 0, 20);
  assert.equal(entries[0].unlocked, true);
  assert.deepEqual(entries[0].imageCandidates, [
    'assets/background/level_1.png', 'assets/background/level_x.png',
  ]);
  assert.equal(entries[1].unlocked, false);
  assert.equal(entries[1].imageCandidates, null);
});

test('album progress counts distinct clears and marks 100 / 100 complete including Stage 100', () => {
  assert.deepEqual(getAlbumProgress([]), { count: 0, total: 100, complete: false });
  assert.deepEqual(getAlbumProgress([1, 5, 5, 0, 101]), { count: 2, total: 100, complete: false });
  assert.deepEqual(getAlbumProgress(Array.from({ length: 100 }, (_, index) => index + 1)), {
    count: 100, total: 100, complete: true,
  });
});

test('viewer navigation skips locked Stages', () => {
  const unlocked = [1, 2, 5, 8];
  assert.equal(getUnlockedStageNeighbor(unlocked, 2, 1), 5);
  assert.equal(getUnlockedStageNeighbor(unlocked, 5, -1), 2);
  assert.equal(getUnlockedStageNeighbor(unlocked, 8, 1), null);
});

test('album page keyboard navigation moves one page and stops at either boundary', () => {
  assert.equal(getAdjacentAlbumPageIndex(1, -1, 5), 0);
  assert.equal(getAdjacentAlbumPageIndex(1, 1, 5), 2);
  assert.equal(getAdjacentAlbumPageIndex(0, -1, 5), null);
  assert.equal(getAdjacentAlbumPageIndex(4, 1, 5), null);
});
