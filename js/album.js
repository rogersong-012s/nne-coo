// Keep this URL identical to game.js so album and gameplay share one in-memory
// player-state module as well as the same persisted localStorage record.
import { getPlayerState } from './player-state.js?v=20261005-reward-ad-1';
import { getBackgroundImageCandidates, preloadFirstAvailableImage } from './background-assets.js';

export const ALBUM_DESKTOP_PAGE_SIZE = 20;
export const ALBUM_MOBILE_PAGE_SIZE = 10;
const MOBILE_QUERY = '(max-width: 700px)';

export function getAlbumProgress(clearedStages, totalStages = 100) {
  const values = clearedStages instanceof Set ? [...clearedStages] : Array.isArray(clearedStages) ? clearedStages : [];
  const valid = new Set(values.filter(stage => Number.isInteger(stage) && stage >= 1 && stage <= totalStages));
  return { count: valid.size, total: totalStages, complete: valid.size >= totalStages };
}

export function getUnlockedStageNeighbor(stageIds, currentStageId, direction) {
  const index = stageIds.indexOf(currentStageId);
  return stageIds[index + Math.sign(direction)] ?? null;
}

export function getAdjacentAlbumPageIndex(pageIndex, direction, pageCount) {
  if (!Number.isInteger(pageIndex) || !Number.isInteger(pageCount) || pageCount < 1) return null;
  const nextIndex = pageIndex + Math.sign(direction);
  return nextIndex >= 0 && nextIndex < pageCount ? nextIndex : null;
}

export function getAlbumPageRanges(totalStages = 100, pageSize = ALBUM_DESKTOP_PAGE_SIZE) {
  if (!Number.isInteger(totalStages) || totalStages < 1 || !Number.isInteger(pageSize) || pageSize < 1) return [];
  const pageCount = Math.ceil(totalStages / pageSize);
  return Array.from({ length: pageCount }, (_, index) => ({
    start: index * pageSize + 1,
    end: Math.min(totalStages, (index + 1) * pageSize),
  }));
}

export function getAlbumPageEntries(stages, clearedStages, pageIndex = 0, pageSize = ALBUM_DESKTOP_PAGE_SIZE) {
  if (!Array.isArray(stages) || !Number.isInteger(pageIndex) || pageIndex < 0
    || !Number.isInteger(pageSize) || pageSize < 1) return [];
  const cleared = clearedStages instanceof Set ? clearedStages : new Set(clearedStages ?? []);
  return stages.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).map(stage => {
    const unlocked = cleared.has(stage.stageId);
    return {
      stage,
      unlocked,
      // A locked card has no image path at all, so it cannot request its asset.
      imageCandidates: unlocked ? getBackgroundImageCandidates(stage.stageId, stage.background?.image) : null,
    };
  });
}

export function createAlbum({ stages, onOpen = () => {}, onClose = () => {} }) {
  const overlay = document.getElementById('album-overlay');
  const panel = document.getElementById('album-panel');
  const viewer = document.getElementById('album-viewer');
  const opener = document.getElementById('album-open');
  const grid = document.getElementById('album-grid');
  const count = document.getElementById('album-count');
  const complete = document.getElementById('album-complete');
  const pageSelect = document.getElementById('album-page-select');
  const previousPage = document.getElementById('album-page-previous');
  const nextPage = document.getElementById('album-page-next');
  const viewerTitle = document.getElementById('album-viewer-title');
  const viewerImage = document.getElementById('album-viewer-image');
  const viewerImageWrap = viewer.querySelector('.album-viewer-image-wrap');
  const viewerMessage = document.getElementById('album-viewer-message');
  const previousImage = document.getElementById('album-viewer-previous');
  const nextImage = document.getElementById('album-viewer-next');

  let pageIndex = 0;
  let pageSize = 0;
  let cardGeneration = 0;
  let viewerGeneration = 0;
  let viewerStageId = null;
  let focusedCard = null;

  const isOpen = () => !overlay.hidden;
  const isViewerOpen = () => !viewer.hidden;
  const availableStageIds = () => {
    const cleared = new Set(getPlayerState().clearedStages);
    return stages.filter(stage => cleared.has(stage.stageId)).map(stage => stage.stageId);
  };
  const currentPageSize = () => window.matchMedia(MOBILE_QUERY).matches
    ? ALBUM_MOBILE_PAGE_SIZE : ALBUM_DESKTOP_PAGE_SIZE;

  function syncPageOptions() {
    const ranges = getAlbumPageRanges(stages.length, pageSize);
    pageSelect.replaceChildren(...ranges.map(({ start, end }, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${start}–${end}`;
      return option;
    }));
    pageSelect.value = String(pageIndex);
    previousPage.disabled = pageIndex === 0;
    nextPage.disabled = pageIndex >= ranges.length - 1;
  }

  function renderPage() {
    if (!isOpen()) return;
    const nextSize = currentPageSize();
    if (nextSize !== pageSize) {
      const firstStageOnOldPage = pageIndex * (pageSize || nextSize) + 1;
      pageSize = nextSize;
      pageIndex = Math.floor((firstStageOnOldPage - 1) / pageSize);
    }
    const clearedStages = getPlayerState().clearedStages;
    const unlocked = new Set(clearedStages);
    const total = stages.length;
    const progress = getAlbumProgress(clearedStages, total);
    const ranges = getAlbumPageRanges(total, pageSize);
    pageIndex = Math.max(0, Math.min(pageIndex, ranges.length - 1));
    const entries = getAlbumPageEntries(stages, unlocked, pageIndex, pageSize);
    const generation = ++cardGeneration;

    count.textContent = `${progress.count} / ${progress.total}`;
    complete.hidden = !progress.complete;
    syncPageOptions();
    grid.replaceChildren();

    for (const entry of entries) {
      const { stage } = entry;
      const card = document.createElement(entry.unlocked ? 'button' : 'div');
      card.className = `album-card ${entry.unlocked ? 'unlocked' : 'locked'}`;
      if (entry.unlocked) {
        card.type = 'button';
        card.setAttribute('aria-label', `查看 Stage ${stage.stageId} 圖片`);
      } else {
        card.setAttribute('aria-label', `Stage ${stage.stageId}，尚未解鎖`);
      }

      const thumbnail = document.createElement('span');
      thumbnail.className = 'album-thumbnail';
      if (entry.unlocked) {
        const image = document.createElement('img');
        image.className = 'album-thumbnail-image';
        image.alt = `Stage ${stage.stageId} 背景圖片`;
        image.loading = 'lazy';
        image.decoding = 'async';
        const fallback = document.createElement('span');
        fallback.className = 'album-thumbnail-missing';
        fallback.textContent = '圖片尚未提供';
        thumbnail.append(image, fallback);
        const imageRequest = preloadFirstAvailableImage(entry.imageCandidates);
        imageRequest.then(result => {
          if (generation !== cardGeneration || !isOpen() || !image.isConnected) return;
          if (!result) {
            thumbnail.classList.add('missing-image');
            return;
          }
          image.src = result.url;
          image.dataset.source = result.path;
          thumbnail.classList.add('image-ready');
        });
        image.addEventListener('error', () => {
          if (generation !== cardGeneration || !image.isConnected) return;
          thumbnail.classList.remove('image-ready');
          thumbnail.classList.add('missing-image');
        });
        card.addEventListener('click', () => openViewer(stage.stageId, card));
      } else {
        const lock = document.createElement('span');
        lock.className = 'album-lock';
        lock.textContent = '🔒';
        lock.setAttribute('aria-hidden', 'true');
        thumbnail.append(lock);
        const lockedLabel = document.createElement('span');
        lockedLabel.className = 'album-locked-label';
        lockedLabel.textContent = 'LOCKED';
        thumbnail.append(lockedLabel);
      }

      const caption = document.createElement('span');
      caption.className = 'album-card-caption';
      const stageName = document.createElement('span');
      stageName.textContent = `Stage ${stage.stageId}`;
      caption.append(stageName);
      if (entry.unlocked) {
        const clearBadge = document.createElement('span');
        clearBadge.className = 'album-clear-badge';
        clearBadge.textContent = '✓';
        clearBadge.setAttribute('aria-label', '已通關');
        caption.append(clearBadge);
      }
      card.append(thumbnail, caption);
      grid.append(card);
    }
  }

  function renderViewerStage(stageId) {
    const stage = stages.find(candidate => candidate.stageId === stageId);
    if (!stage || !availableStageIds().includes(stageId)) return;
    viewerStageId = stageId;
    const imageGeneration = ++viewerGeneration;
    viewerTitle.textContent = `Stage ${stageId}`;
    viewerImage.removeAttribute('src');
    viewerImage.hidden = true;
    viewerMessage.textContent = '載入圖片…';

    const unlockedIds = availableStageIds();
    const index = unlockedIds.indexOf(stageId);
    previousImage.disabled = index <= 0;
    nextImage.disabled = index < 0 || index >= unlockedIds.length - 1;

    preloadFirstAvailableImage(getBackgroundImageCandidates(stageId, stage.background?.image)).then(result => {
      if (imageGeneration !== viewerGeneration || !isViewerOpen() || viewerStageId !== stageId) return;
      if (!result) {
        viewerMessage.textContent = 'Image unavailable';
        return;
      }
      viewerImage.src = result.url;
      viewerImage.alt = `Stage ${stageId} 背景圖片`;
      viewerImage.dataset.source = result.path;
      viewerImage.hidden = false;
      viewerMessage.textContent = '';
    });
  }

  viewerImage.addEventListener('error', () => {
    if (!isViewerOpen()) return;
    viewerImage.hidden = true;
    viewerMessage.textContent = 'Image unavailable';
  });

  function openViewer(stageId, card) {
    if (!new Set(getPlayerState().clearedStages).has(stageId)) return;
    focusedCard = card;
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    viewer.hidden = false;
    renderViewerStage(stageId);
    document.getElementById('album-viewer-close').focus();
  }

  function closeViewer(restoreFocus = true) {
    if (!isViewerOpen()) return;
    viewerGeneration++;
    viewer.hidden = true;
    viewerImage.removeAttribute('src');
    viewerImage.hidden = true;
    viewerStageId = null;
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    if (restoreFocus) {
      if (focusedCard?.isConnected) focusedCard.focus();
      else document.getElementById('album-close').focus();
    }
  }

  function moveViewer(direction) {
    if (!isViewerOpen()) return;
    const unlockedIds = availableStageIds();
    const nextId = getUnlockedStageNeighbor(unlockedIds, viewerStageId, direction);
    if (nextId !== null) renderViewerStage(nextId);
  }

  function changePage(direction) {
    if (!isOpen() || isViewerOpen()) return;
    const pageCount = getAlbumPageRanges(stages.length, pageSize).length;
    const nextIndex = getAdjacentAlbumPageIndex(pageIndex, direction, pageCount);
    if (nextIndex === null) return;
    pageIndex = nextIndex;
    renderPage();
  }

  function open() {
    if (isOpen()) return;
    onOpen();
    pageIndex = 0;
    panel.hidden = false;
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    viewer.hidden = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('album-open');
    renderPage();
    document.getElementById('album-close').focus();
  }

  function close() {
    if (!isOpen()) return;
    closeViewer(false);
    cardGeneration++;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('album-open');
    const returnFocusTarget = onClose();
    (returnFocusTarget ?? opener).focus();
  }

  opener.addEventListener('click', open);
  document.getElementById('album-close').addEventListener('click', close);
  document.getElementById('album-viewer-close').addEventListener('click', () => closeViewer());
  previousPage.addEventListener('click', () => changePage(-1));
  nextPage.addEventListener('click', () => changePage(1));
  pageSelect.addEventListener('change', () => { pageIndex = Number(pageSelect.value); renderPage(); });
  previousImage.addEventListener('click', () => moveViewer(-1));
  nextImage.addEventListener('click', () => moveViewer(1));
  viewer.addEventListener('click', event => {
    if (event.target === viewer || event.target === viewerImageWrap || event.target === viewerMessage) closeViewer();
  });
  viewerImage.addEventListener('click', event => event.stopPropagation());
  overlay.addEventListener('click', event => {
    if (event.target === overlay && !isViewerOpen()) close();
  });
  window.addEventListener('resize', () => {
    if (isOpen() && currentPageSize() !== pageSize) renderPage();
  });
  window.addEventListener('keydown', event => {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (isViewerOpen()) closeViewer();
      else close();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (isViewerOpen()) moveViewer(direction);
      else changePage(direction);
      return;
    }
    if (event.target instanceof HTMLElement && event.target.matches('select, input, textarea')) return;
    if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  overlay.setAttribute('aria-hidden', 'true');
  return { open, close, isOpen };
}
