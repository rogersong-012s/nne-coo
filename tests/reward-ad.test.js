import test from 'node:test';
import assert from 'node:assert/strict';
import { REWARD_ADS, createRewardAdModal } from '../js/reward-ad.js';

class FakeElement {
  constructor() {
    this.hidden = true;
    this.disabled = false;
    this.textContent = '';
    this.attributes = new Map();
    this.listeners = new Map();
    this.focusCount = 0;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { this.focusCount++; }
  dispatch(type, event = {}) { this.listeners.get(type)?.(event); }
}

function makeClock() {
  let time = 0, nextId = 1;
  const jobs = new Map();
  return {
    jobs,
    now: () => time,
    schedule(callback, delay) {
      const id = nextId++;
      jobs.set(id, { at: time + delay, callback });
      return id;
    },
    unschedule(id) { jobs.delete(id); },
    advance(milliseconds) {
      const end = time + milliseconds;
      while (true) {
        const next = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        const [id, job] = next;
        jobs.delete(id);
        time = job.at;
        job.callback();
      }
      time = end;
    },
  };
}

function makeFixture() {
  const root = new FakeElement(), dialog = new FakeElement(), brand = new FakeElement();
  const headline = new FakeElement(), body = new FakeElement(), countdown = new FakeElement();
  const action = new FakeElement(), opener = new FakeElement(), clock = makeClock();
  const calls = { opened: 0, closed: 0 };
  const modal = createRewardAdModal({
    root, dialog, brand, headline, body, countdown, action,
    onOpen: () => calls.opened++,
    onClose: () => calls.closed++,
    now: clock.now,
    schedule: clock.schedule,
    unschedule: clock.unschedule,
    getActiveElement: () => opener,
  });
  return { root, dialog, brand, headline, body, countdown, action, opener, clock, calls, modal };
}

test('NNE and COO reward ads use one modal and require the full countdown before completion', () => {
  const f = makeFixture();
  let completed = 0;
  assert.equal(f.modal.showRewardAdModal({ type: 'light', onComplete: () => completed++ }), true);
  assert.equal(f.root.hidden, false);
  assert.equal(f.root.attributes.get('aria-hidden'), 'false');
  assert.equal(f.brand.textContent, 'NNE');
  assert.equal(f.headline.textContent, REWARD_ADS.light.headline);
  assert.equal(f.body.textContent, REWARD_ADS.light.body);
  assert.equal(f.action.textContent, '關閉並亮燈');
  assert.equal(f.action.disabled, true);
  assert.equal(f.countdown.textContent, '3 秒後可繼續');
  assert.equal(f.modal.isOpen, true);

  f.action.dispatch('click');
  assert.equal(completed, 0, 'even a synthetic early CTA click cannot complete the reward');
  for (const key of ['Escape', 'Enter', ' ']) {
    const event = { key, code: key === ' ' ? 'Space' : '', prevented: false, stopped: false,
      preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    f.root.dispatch('keydown', event);
    assert.equal(event.prevented, true, `${key} is suppressed during the countdown`);
    assert.equal(event.stopped, true, `${key} cannot reach gameplay during the countdown`);
  }
  f.root.dispatch('click', { target: f.root });
  assert.equal(f.modal.isOpen, true, 'backdrop clicks have no close behavior');

  f.clock.advance(2999);
  assert.equal(f.action.disabled, true);
  assert.equal(f.modal.remainingSeconds, 1);
  f.clock.advance(1);
  assert.equal(f.action.disabled, false);
  assert.equal(f.countdown.textContent, '可以繼續');
  assert.equal(f.modal.remainingSeconds, 0);
  f.action.dispatch('click');
  assert.equal(f.modal.isOpen, false);
  assert.equal(f.root.hidden, true);
  assert.equal(f.root.attributes.get('aria-hidden'), 'true');
  assert.equal(f.calls.opened, 1);
  assert.equal(f.calls.closed, 1);
  assert.equal(f.opener.focusCount, 1);
  assert.equal(completed, 1);
});

test('COO uses the same wait flow and cancel clears its timer without completing', () => {
  const f = makeFixture();
  let completed = 0;
  f.modal.showRewardAdModal({ type: 'solution', onComplete: () => completed++ });
  assert.equal(f.brand.textContent, 'COO');
  assert.equal(f.headline.textContent, REWARD_ADS.solution.headline);
  assert.equal(f.action.textContent, '查看解答');
  assert.equal(f.clock.jobs.size, 1);
  assert.equal(f.modal.cancel(), true);
  assert.equal(f.modal.isOpen, false);
  assert.equal(f.clock.jobs.size, 0);
  f.clock.advance(5000);
  assert.equal(completed, 0, 'cancelled countdowns never start Auto Solve');
  assert.equal(f.calls.closed, 1);
});
