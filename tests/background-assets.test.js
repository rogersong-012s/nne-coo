import test from 'node:test';
import assert from 'node:assert/strict';
import { getBackgroundImageCandidates, preloadFirstAvailableImage } from '../js/background-assets.js';

test('Stage background candidates prefer level_N and then use level_x', () => {
  assert.deepEqual(getBackgroundImageCandidates(37), [
    'assets/background/level_37.png',
    'assets/background/level_x.png',
  ]);
  assert.deepEqual(getBackgroundImageCandidates(0), [
    'assets/background/level_0.png',
    'assets/background/level_x.png',
  ]);
});

test('a configured custom background overrides the Stage path', () => {
  assert.deepEqual(getBackgroundImageCandidates(37, ' custom/scene.png '), [
    'custom/scene.png',
    'assets/background/level_x.png',
  ]);
});

test('preload tries the fallback only after the Stage image fails', async () => {
  const attempted = [];
  class FakeImage {
    set src(url) {
      attempted.push(url);
      queueMicrotask(() => {
        if (url.endsWith('level_2.png')) this.onerror?.();
        else this.onload?.();
      });
    }
  }
  const result = await preloadFirstAvailableImage(getBackgroundImageCandidates(2), {
    imageFactory: () => new FakeImage(),
    baseURI: 'https://game.example/',
  });
  assert.deepEqual(attempted, [
    'https://game.example/assets/background/level_2.png',
    'https://game.example/assets/background/level_x.png',
  ]);
  assert.equal(result.path, 'assets/background/level_x.png');
});

test('preload uses a Stage-specific image when it exists', async () => {
  const attempted = [];
  class FakeImage {
    set src(url) {
      attempted.push(url);
      queueMicrotask(() => this.onload?.());
    }
  }
  const result = await preloadFirstAvailableImage(getBackgroundImageCandidates(1), {
    imageFactory: () => new FakeImage(),
    baseURI: 'https://game.example/',
  });
  assert.deepEqual(attempted, ['https://game.example/assets/background/level_1.png']);
  assert.equal(result.path, 'assets/background/level_1.png');
});

test('background failure resolves to no image without rejecting', async () => {
  class FakeImage {
    set src(_url) { queueMicrotask(() => this.onerror?.()); }
  }
  const result = await preloadFirstAvailableImage(['missing-a.png', 'missing-b.png'], {
    imageFactory: () => new FakeImage(),
    baseURI: 'https://game.example/',
  });
  assert.equal(result, null);
});
