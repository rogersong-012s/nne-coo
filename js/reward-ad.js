export const REWARD_ADS = Object.freeze({
  light: Object.freeze({
    brand: 'NNE',
    headline: '看得更遠，找到更多可能。',
    body: '這裡未來會放 NNE 的正式廣告內容。',
    waitSeconds: 3,
    actionLabel: '關閉並亮燈',
  }),
  solution: Object.freeze({
    brand: 'COO',
    headline: '記住線索，找到出口。',
    body: '這裡未來會放 COO 的正式廣告內容。',
    waitSeconds: 3,
    actionLabel: '查看解答',
  }),
});

export function createRewardAdModal({
  root,
  dialog,
  brand,
  headline,
  body,
  countdown,
  action,
  onOpen = () => {},
  onClose = () => {},
  now = () => Date.now(),
  schedule = (callback, delay) => globalThis.setTimeout(callback, delay),
  unschedule = timer => globalThis.clearTimeout(timer),
  getActiveElement = () => globalThis.document?.activeElement ?? null,
} = {}) {
  let active = null;
  let timer = null;
  let generation = 0;

  function remainingSeconds() {
    if (!active) return 0;
    return Math.max(0, Math.ceil((active.deadline - now()) / 1000));
  }

  function scheduleCountdown(token) {
    if (!active || active.token !== token) return;
    const remaining = remainingSeconds();
    countdown.textContent = remaining > 0 ? `${remaining} 秒後可繼續` : '可以繼續';
    action.disabled = remaining > 0;
    if (remaining === 0) {
      timer = null;
      action.focus?.({ preventScroll: true });
      return;
    }
    timer = schedule(() => {
      timer = null;
      scheduleCountdown(token);
    }, Math.max(1, Math.min(1000, active.deadline - now())));
  }

  function close() {
    if (!active) return false;
    if (timer !== null) unschedule(timer);
    timer = null;
    const returnFocus = active.returnFocus;
    active = null;
    generation++;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    action.disabled = true;
    onClose();
    returnFocus?.focus?.({ preventScroll: true });
    return true;
  }

  function showRewardAdModal({ type, onComplete } = {}) {
    const ad = REWARD_ADS[type];
    if (!ad) return false;
    close();
    const token = ++generation;
    active = {
      token,
      deadline: now() + Math.max(0, ad.waitSeconds) * 1000,
      onComplete,
      returnFocus: getActiveElement(),
    };
    brand.textContent = ad.brand;
    headline.textContent = ad.headline;
    body.textContent = ad.body;
    action.textContent = ad.actionLabel;
    action.disabled = true;
    root.hidden = false;
    root.setAttribute('aria-hidden', 'false');
    onOpen();
    dialog.focus?.({ preventScroll: true });
    scheduleCountdown(token);
    return true;
  }

  action.addEventListener('click', () => {
    if (!active) return;
    if (remainingSeconds() > 0) {
      return;
    }
    const onComplete = active.onComplete;
    close();
    onComplete?.();
  });

  root.addEventListener('keydown', event => {
    if (!active) return;
    const isEscape = event.key === 'Escape';
    const isEarlyActivation = remainingSeconds() > 0
      && (event.key === 'Enter' || event.key === ' ' || event.code === 'Space');
    if (!isEscape && !isEarlyActivation) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  return {
    showRewardAdModal,
    cancel: close,
    get isOpen() { return active !== null; },
    get remainingSeconds() { return remainingSeconds(); },
  };
}
