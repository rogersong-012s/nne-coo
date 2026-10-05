export function getBackgroundImageCandidates(stageId, configuredImage = '') {
  const customImage = typeof configuredImage === 'string' ? configuredImage.trim() : '';
  const preferredImage = customImage || `assets/background/level_${stageId}.png`;
  return [...new Set([preferredImage, 'assets/background/level_x.png'])];
}

export function preloadFirstAvailableImage(candidates, {
  imageFactory = () => new Image(),
  baseURI = globalThis.document?.baseURI ?? 'http://localhost/',
} = {}) {
  return new Promise(resolve => {
    let nextIndex = 0;
    const tryNext = () => {
      if (nextIndex >= candidates.length) {
        resolve(null);
        return;
      }

      const path = candidates[nextIndex++];
      let url;
      try { url = new URL(path, baseURI).href; }
      catch { tryNext(); return; }

      let image;
      try { image = imageFactory(); }
      catch { tryNext(); return; }

      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        tryNext();
      };
      image.onload = () => {
        if (settled) return;
        settled = true;
        resolve({ path, url });
      };
      image.onerror = fail;
      try { image.src = url; }
      catch { fail(); }
    };
    tryNext();
  });
}
