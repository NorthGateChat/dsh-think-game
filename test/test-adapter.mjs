/**
 * Adapter contract tests.
 *
 * DSH's chat markup is not a public extension API, so this suite pins the DOM
 * shape the flow adapter relies on. It runs against a tiny purpose-built DOM
 * shim (no browser, no jsdom) and exercises every detection path plus the
 * "selectors broke" warning and session-key logic.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const MARKER = "return { inject: ['locale'], apply: apply };";
if (!SOURCE.includes(MARKER)) throw new Error('client.js return marker not found');
const PATCHED = SOURCE.replace(
  MARKER,
  "return { inject: ['locale'], apply: apply, __internals: { findLiveModule, flowRoot, liveSessionKey, hasProgress } };",
);

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok   -', name);
  } catch (error) {
    failures += 1;
    console.log('FAIL -', name, '::', error.message);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error((message || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

/* --- minimal DOM ------------------------------------------------------- */

function splitTopLevel(selector) {
  const parts = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (quote !== '') {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '[') depth += 1;
    else if (ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(selector.slice(start).trim());
  return parts;
}

function matchesCompound(el, compound) {
  let rest = compound.trim();
  if (rest === '') return false;
  const tagMatch = rest.match(/^([a-zA-Z][\w-]*)/);
  if (tagMatch !== null) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  let i = 0;
  while (i < rest.length) {
    const ch = rest[i];
    if (ch === '.') {
      let end = i + 1;
      while (end < rest.length && /[\w-]/.test(rest[end])) end += 1;
      const name = rest.slice(i + 1, end);
      if (!String(el.className || '').split(/\s+/).includes(name)) return false;
      i = end;
    } else if (ch === '[') {
      const end = rest.indexOf(']', i + 1);
      if (end < 0) return false;
      const body = rest.slice(i + 1, end);
      const attr = body.match(/^([\w-]+)(?:(=|\*=)"([^"]*)")?$/);
      if (attr === null) return false;
      const value = el.getAttribute(attr[1]);
      if (attr[2] === undefined) {
        if (value === null) return false;
      } else if (attr[2] === '*=') {
        if (value === null || String(value).indexOf(attr[3]) < 0) return false;
      } else if (value !== attr[3]) {
        return false;
      }
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return true;
}

function matches(el, selector) {
  return splitTopLevel(selector).some((part) => matchesCompound(el, part));
}

class FakeElement {
  constructor(tag, options) {
    const opts = options || {};
    this.tagName = String(tag).toUpperCase();
    this.attrs = new Map();
    this.children = [];
    this.parentElement = null;
    this.className = opts.className || '';
    this.textContent = opts.text || '';
    this.isConnected = true;
    if (this.className) this.attrs.set('class', this.className);
    const attrs = opts.attrs || {};
    for (const key of Object.keys(attrs)) this.attrs.set(key, String(attrs[key]));
  }
  getAttribute(name) {
    return this.attrs.has(name) ? this.attrs.get(name) : null;
  }
  hasAttribute(name) {
    return this.attrs.has(name);
  }
  setAttribute(name, value) {
    this.attrs.set(name, String(value));
    if (name === 'class') this.className = String(value);
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }
  matches(selector) { return matches(this, selector); }
  closest(selector) {
    let node = this;
    while (node !== null && node !== undefined) {
      if (matches(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
  descendants() {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
  querySelectorAll(selector) {
    return this.descendants().filter((element) => matches(element, selector));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

function buildDocument() {
  const body = new FakeElement('body');
  const document = {
    body,
    querySelector(selector) {
      return body.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      return body.querySelectorAll(selector);
    },
  };
  return { body, document };
}

/* vm loader capture */
function boot() {
  const { body, document } = buildDocument();
  const warnings = [];
  const window = {};
  let definition = null;
  window.__ModuleLoader__ = { load: (def) => { definition = def; } };
  const sandbox = {
    window,
    document,
    console: { warn: (...args) => warnings.push(args.join(' ')), log: () => {} },
    Math,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(PATCHED, sandbox, { filename: 'client.js' });
  if (definition === null) throw new Error('module definition not captured');
  const mod = definition.factory(() => { throw new Error('unexpected require'); });
  return { I: mod.__internals, body, document, window, warnings };
}

function el(tag, options) {
  return new FakeElement(tag, options);
}
function flowSlot() {
  return el('div', { attrs: { 'data-slot': 'conversation.chat.flow' } });
}

/* --- tests ------------------------------------------------------------- */

check('running-status row wins and sits directly in the flow slot', () => {
  const { I, body } = boot();
  const flow = flowSlot();
  body.append(flow);
  const status = el('div', { className: 'status-running', text: '深度求索中，用时 3 秒' });
  flow.append(status);
  const live = I.findLiveModule();
  assert(live !== null, 'live module');
  assert(live.root === status, 'root is running status');
  assert(live.parent === flow, 'parent is flow');
});

check('process header shimmer is detected through flowRoot', () => {
  const { I, body } = boot();
  const flow = flowSlot();
  body.append(flow);
  const row = el('div');
  const header = el('button', { attrs: { 'data-process-activity': '' } });
  const shimmer = el('span', { attrs: { 'data-shimmer': '' } });
  header.append(shimmer);
  row.append(header);
  flow.append(row);
  const live = I.findLiveModule();
  assert(live !== null, 'live module');
  assert(live.root === row, 'root row');
  assert(live.parent === flow, 'parent flow');
});

check('turn-process box is detected by its flow kind', () => {
  const { I, body } = boot();
  const flow = flowSlot();
  body.append(flow);
  const box = el('div', { attrs: { 'data-chat-flow-kind': 'turn-process' }, text: '深度求索' });
  box.append(el('span', { attrs: { 'data-shimmer': '' } }));
  flow.append(box);
  const live = I.findLiveModule();
  assert(live !== null, 'live module');
  assert(live.root === box, 'root box');
});

check('running Think row is detected', () => {
  const { I, body } = boot();
  const flow = flowSlot();
  body.append(flow);
  const row = el('div', { attrs: { 'data-variant': 'think', 'data-state': 'running' } });
  flow.append(row);
  const live = I.findLiveModule();
  assert(live !== null, 'live module');
  assert(live.root === row, 'root think row');
});

check('busy/shimmer fallback keeps working when known headers change', () => {
  const { I, body } = boot();
  const flow = flowSlot();
  body.append(flow);
  const row = el('div');
  const busy = el('div', { attrs: { 'aria-busy': 'true' } });
  row.append(busy);
  flow.append(row);
  const live = I.findLiveModule();
  assert(live !== null, 'live module');
  assert(live.root === row, 'fallback root');
  assert(live.parent === flow, 'fallback parent');
});

check('liveSessionKey prefers a session ancestor id', () => {
  const { I, body } = boot();
  const session = el('div', { attrs: { 'data-session-id': 'session-42' } });
  const flow = flowSlot();
  const root = el('div');
  session.append(flow);
  flow.append(root);
  body.append(session);
  const key = I.liveSessionKey({ root, parent: flow });
  equal(key, 'session-42', 'session key');
});

check('unmatched running markers warn once and expose adapter health', () => {
  const { I, body, window, warnings } = boot();
  const flow = flowSlot();
  body.append(flow);
  const marker = el('div', { attrs: { 'data-shimmer': '' }, className: 'mystery-running' });
  marker.isConnected = false; /* found by the marker probe, skipped by detection */
  flow.append(marker);
  let live = null;
  for (let i = 0; i < 10; i += 1) live = I.findLiveModule();
  equal(live, null, 'no false positive');
  equal(warnings.length, 1, 'warn once');
  assert(window.__thinkGameAdapter && typeof window.__thinkGameAdapter.warning === 'string', 'health warning');
});

check('hasProgress handles all games and finished states', () => {
  const { I } = boot();
  equal(I.hasProgress(null), false, 'null');
  equal(I.hasProgress({ kind: 'breakout', phase: 'ready', score: 0, level: 1, lives: 3 }), false, 'fresh breakout');
  equal(I.hasProgress({ kind: 'breakout', phase: 'ready', score: 10, level: 1, lives: 3 }), true, 'breakout score');
  equal(I.hasProgress({ kind: 'snake', phase: 'playing', score: 0 }), false, 'fresh snake');
  equal(I.hasProgress({ kind: 'snake', phase: 'playing', score: 10 }), true, 'snake score');
  equal(I.hasProgress({ kind: 'reaction', phase: 'playing', hits: 0 }), false, 'fresh reaction');
  equal(I.hasProgress({ kind: 'reaction', phase: 'playing', hits: 2 }), true, 'reaction hits');
  equal(I.hasProgress({ kind: '2048', phase: 'playing', score: 8 }), true, '2048 score');
  equal(I.hasProgress({ kind: '2048', phase: 'playing', score: 0 }), false, 'fresh 2048');
  equal(I.hasProgress({ kind: 'memory', phase: 'playing', pairs: 1 }), true, 'memory pairs');
  equal(I.hasProgress({ kind: 'stack', phase: 'playing', blocks: [{}, {}] }), true, 'stack height');
  equal(I.hasProgress({ kind: 'flappy', phase: 'playing', score: 1 }), true, 'flappy score');
  equal(I.hasProgress({ kind: 'breakout', phase: 'over', score: 100, level: 2, lives: 0 }), false, 'finished game');
});

console.log('');
if (failures > 0) {
  console.log('FAILED', failures, 'check(s)');
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
