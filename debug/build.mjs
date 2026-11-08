/**
 * Builds a self-contained debug page for think-game.
 *
 * The page inlines the shipped `client.js` (base64) and boots its REAL game
 * engines plus the plugin's injected panel stylesheet, so the debug view is
 * the same code as the DSH plugin — not a separate re-implementation.
 *
 * It also inlines the DSH light/dark theme token blocks read from the installed
 * app.asar, so the panel and canvas palette behave like the real shell.
 *
 * usage: node think-game/debug/build.mjs
 *        DSH_ASAR=/path/to/app.asar node think-game/debug/build.mjs   (theme tokens)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const root = join(here, '..');
const clientPath = join(root, 'client.js');
const outPath = join(here, 'index.html');
const asarCandidates = [
  process.env.DSH_ASAR,
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Programs/DeepSeek Harness/resources/app.asar') : '',
  process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, 'DeepSeek Harness/resources/app.asar') : '',
  process.env.HOME ? join(process.env.HOME, '.config/DeepSeek Harness/resources/app.asar') : '',
  '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar',
].filter(Boolean);
const defaultAsar = asarCandidates.find((candidate) => existsSync(candidate)) || asarCandidates[0] || '';

function readFromAsar(archivePath, innerPath) {
  const archive = readFileSync(archivePath);
  const headerCandidates = [];
  for (const start of [8, 12, 16]) {
    const jsonSize = start === 16 ? archive.readUInt32LE(12) : start === 12 ? archive.readUInt32LE(8) : archive.readUInt32LE(4);
    if (!(jsonSize > 0 && jsonSize < archive.length)) continue;
    try {
      const text = archive.toString('utf8', start, start + jsonSize);
      if (text.trimStart().startsWith('{')) headerCandidates.push({ start, jsonSize, header: JSON.parse(text) });
    } catch { /* try next */ }
  }
  if (!headerCandidates.length) throw new Error('could not parse asar header');
  const { start, jsonSize, header } = headerCandidates[0];
  const dataStart = start + jsonSize;
  let node = header;
  for (const part of innerPath.split('/').filter(Boolean)) {
    node = node.files?.[part];
    if (!node) throw new Error('asar entry not found: ' + innerPath);
  }
  if (!node.files && node.offset !== undefined) {
    return archive.subarray(dataStart + Number(node.offset), dataStart + Number(node.offset) + Number(node.size));
  }
  throw new Error('asar entry is not a file: ' + innerPath);
}

function extractThemeCss() {
  const asar = process.env.DSH_ASAR || defaultAsar;
  try {
    const themeBundle = readFromAsar(asar, 'dsh/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js').toString('utf8');
    const match = themeBundle.match(/design_platform_css_default\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (!match) throw new Error('theme CSS assignment not found');
    const css = JSON.parse('"' + match[1] + '"');
    if (!css.includes('--dsw-alias-bg-base')) throw new Error('theme CSS missing tokens');
    console.log('theme tokens: read from app.asar (' + Buffer.byteLength(css) + ' bytes)');
    return css;
  } catch (error) {
    console.warn('theme tokens unavailable, using fallback palette:', error.message);
    return 'body{--dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f5f5f5;' +
      '--dsw-alias-label-primary:#0f1115;--dsw-alias-label-secondary:#61666b;--dsw-alias-label-tertiary:#545557;' +
      '--dsw-alias-label-primary-inverted:#ffffff;--dsw-alias-border-l1:#0000000a;--dsw-alias-border-l2:#0000001a;' +
      '--dsw-alias-brand-primary:#0f1115;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-warn-primary:#f59e0b;' +
      '--dsw-alias-state-idle-primary:#d4d4d4;--dsw-alias-state-error-primary:#ec1313}' +
      'body[data-ds-dark-theme]{--dsw-alias-bg-base:#151517;--dsw-alias-bg-layer-1:#232324;--dsw-alias-bg-layer-2:#2c2c2e;' +
      '--dsw-alias-label-primary:#ebeef2;--dsw-alias-label-secondary:#cfd3d6;--dsw-alias-label-tertiary:#adb2b8;' +
      '--dsw-alias-label-primary-inverted:#0f1115;--dsw-alias-border-l1:#ffffff0f;--dsw-alias-border-l2:#ffffff1f;' +
      '--dsw-alias-brand-primary:#ebeef2;--dsw-alias-state-success-primary:#22c55e;--dsw-alias-state-warn-primary:#f59e0b;' +
      '--dsw-alias-state-idle-primary:#545557;--dsw-alias-state-error-primary:#f25a5a}';
  }
}

const themeCss = extractThemeCss();
let clientSource = readFileSync(clientPath, 'utf8');
const exposeMarker = "return { inject: ['locale'], apply: apply };";
if (!clientSource.includes(exposeMarker)) throw new Error('client.js return marker not found (was the plugin refactored?)');
clientSource = clientSource.replace(
  exposeMarker,
  "return { inject: ['locale'], apply: apply, __internals: { createGame, resetGame, layoutGame, stepGame, startOrResume, togglePause, hudOf, keyDown, keyUp, pointerDown, pointerMove, drawGame, createSfx, KINDS } };",
);
const clientB64 = Buffer.from(clientSource, 'utf8').toString('base64');
const digest = createHash('sha256').update(clientSource).digest('hex').slice(0, 12);

const pageCss = `
:root { color-scheme: light dark; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  transition: background-color .2s ease, color .2s ease;
}
.dbg { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; }
.dbg-head { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-bottom: 16px; }
.dbg-head h1 { font-size: 17px; margin: 0 8px 0 0; font-weight: 600; }
.dbg-head .sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbg-head .spacer { flex: auto; }
.dbg-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 16px; }
.dbg-tools label { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbg-layout { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
.dbg-main { flex: none; }
.dbg-side { flex: 1 1 340px; min-width: 300px; }
.dbg-panel-wrap { width: 540px; max-width: 100%; padding: 8px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 12px; }
.dbg-think { display: flex; align-items: center; gap: 8px; width: 540px; max-width: 100%; padding: 0 10px; color: var(--dsw-alias-label-tertiary); font-size: calc(13px + var(--dsh-content-font-delta, 0px)); line-height: 24px; }
.dbg-think-icon { width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-brand-primary); opacity: .8; }
.dbg-think-note { width: 540px; max-width: 100%; margin: 0 0 8px 10px; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
/* The plugin injects its own .dtg-* stylesheet at runtime; this only adds frame context. */
.dbg-row { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; margin-top: 12px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dbg-row input[type="text"] { flex: 1 1 220px; min-width: 160px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; padding: 4px 8px; }
.dbg-side h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--dsw-alias-label-tertiary); margin: 0 0 6px; }
.dbg-side section { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 10px 12px; margin-bottom: 12px; }
.dbg-side pre { margin: 0; font: 12px/1.45 ui-monospace, "Cascadia Code", Consolas, monospace; white-space: pre-wrap; word-break: break-word; }
.dbg-side ol { margin: 0; padding-left: 18px; max-height: 230px; overflow: auto; font-size: 12px; }
.dbg-side li { margin: 1px 0; }
.dbg-side p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dbg-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; margin-top: 8px; }
.dbg-note code { font: 12px ui-monospace, Consolas, monospace; background: var(--dsw-alias-bg-layer-2); border-radius: 4px; padding: 0 4px; }
@media (max-width: 700px) { .dbg-panel-wrap { width: 100%; } }
`;

const pageScript = String.raw`
(function () {
  'use strict';
  var KINDS = ['breakout', 'snake', 'reaction', '2048', 'memory', 'stack', 'flappy'];
  var TAB_LABEL = { breakout: '砖块', snake: '贪吃蛇', reaction: '反应力', '2048': '2048', memory: '记忆', stack: '堆塔', flappy: '飞行' };
  var HINT = {
    breakout: '鼠标或 ← → 移动 · 空格发球 · P 暂停 · R 重开',
    snake: '方向键 / WASD 或鼠标转向 · 空格开始 · P 暂停 · R 重开',
    reaction: '点击目标或按 1–9 · P 暂停 · R 重开',
    '2048': '方向键 / WASD 滑动方块 · P 暂停 · R 重开',
    memory: '点击翻牌配对 · P 暂停 · R 重开',
    stack: '空格或点击放下方块 · P 暂停 · R 重开',
    flappy: '空格或点击向上飞 · P 暂停 · R 重开',
  };
  var READY = {
    breakout: '点击画面或按空格发球',
    snake: '按空格或点击画面开始',
    reaction: '点击目标或按 1–9 开始',
    '2048': '按方向键 / WASD 开始',
    memory: '点击卡片开始',
    stack: '按空格或点击放下第一块',
    flappy: '按空格或点击起飞',
  };
  var OVER = {
    breakout: '本局结束 · 重开一局',
    snake: '撞到了 · 重开一局',
    reaction: '本局结束 · 重开一局',
    '2048': '没有可移动的方块 · 重开一局',
    memory: '全部配对完成 · 重开换一副牌',
    stack: '没接住 · 重开一局',
    flappy: '撞到了 · 重开一局',
  };
  var METRIC_LABEL = { score: '得分{n}', level: '第{n}关', lives: '机会{n}', length: '长度{n}', hits: '命中{n}', avg: '均{n}ms', misses: '失误{n}', tile: '最大{n}', pairs: '配对{n}', moves: '步数{n}', height: '高度{n}' };
  var STAGE_H = 150;
  var ICONS = {
    play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 3.2c0-.8.9-1.3 1.6-.9l6 4.1c.6.4.6 1.3 0 1.7l-6 4.1c-.7.4-1.6-.1-1.6-.9V3.2z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1.2"/><rect x="9" y="3" width="3" height="10" rx="1.2"/></svg>',
    restart: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.8 8a4.8 4.8 0 1 1-1.6-3.6"/><path d="M13 2.9v2.7H10.3"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4"/></svg>',
    check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5"/></svg>',
    sound: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 6.1h2.1L8 3.6v8.8L5.3 9.9H3.2z" fill="currentColor" stroke="none"/><path d="M10.3 6a3 3 0 0 1 0 4"/><path d="M12 4.5a5.2 5.2 0 0 1 0 7"/></svg>',
    soundOff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 6.1h2.1L8 3.6v8.8L5.3 9.9H3.2z" fill="currentColor" stroke="none"/><path d="M10.4 6.4l3 3.2M13.4 6.4l-3 3.2"/></svg>',
  };

  function $(id) { return document.getElementById(id); }
  function decodeB64(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* --- boot the REAL shipped module with a tiny React/Cordis stub --------- */
  var ReactStub = {
    createElement: function () { return null; },
    Fragment: 'Fragment',
    useState: function (init) { return [init, function () {}]; },
    useRef: function (init) { return { current: init }; },
    useEffect: function () {},
    useMemo: function () {},
    Component: (function () {
      function C(props) { this.props = props; this.state = { failed: false }; }
      C.getDerivedStateFromError = function () { return { failed: true }; };
      C.prototype.componentDidCatch = function () {};
      C.prototype.render = function () { return null; };
      return C;
    })(),
  };
  window.__ModuleLoader__ = { load: function (definition) { window.__THINK_GAME_DEF__ = definition; } };
  var source = decodeB64(window.__CLIENT_B64__);
  window.__THINK_GAME_DEBUG__ = true;
  (0, eval)(source);
  var definition = window.__THINK_GAME_DEF__;
  if (!definition) throw new Error('client.js did not register with the module loader');
  var mod = definition.factory(function (name) {
    if (name === 'react') return ReactStub;
    throw new Error('unexpected require: ' + name);
  });
  var fakeCtx = {
    effect: function (callback) { try { callback(); } catch (e) {} return function () {}; },
    locale: { register: function () { return function () {}; }, bind: function () { return function (key) { return key; }; } },
    slots: {
      inject: function (key, callback) { try { callback(); } catch (e) {} return function () {}; },
      register: function (options, component) { window.__THINK_GAME_BODY__ = component; return function () {}; },
    },
    get: function () { return undefined; },
  };
  mod.apply(fakeCtx);
  var I = mod.__internals;
  if (!I) throw new Error('client.js internals unavailable');
  var sfx = I.createSfx ? I.createSfx() : null;

  /* --- debug state ------------------------------------------------------- */
  var games = {};
  var pinned = '';
  try { pinned = window.localStorage.getItem('dsh-think-game:pinned') || ''; } catch (e) { pinned = ''; }
  if (KINDS.indexOf(pinned) < 0) pinned = '';
  var kind = pinned || 'breakout';
  var panelVisible = true;
  var simulatedRunning = true;
  var logLines = [];
  var stage = $('stage');
  var canvas = $('canvas');
  var ctx2d = canvas.getContext('2d');

  function ensure(k) { if (!games[k]) games[k] = I.createGame(k); return games[k]; }
  function game() { return ensure(kind); }
  function log(message) {
    var stamp = new Date().toLocaleTimeString();
    logLines.push(stamp + '  ' + message);
    if (logLines.length > 120) logLines.shift();
    var list = $('log');
    list.innerHTML = '';
    for (var i = logLines.length - 1; i >= 0; i -= 1) {
      var li = document.createElement('li');
      li.textContent = logLines[i];
      list.appendChild(li);
    }
  }
  function palette() {
    var style = getComputedStyle(stage);
    function read(name, back) {
      var value = (style.getPropertyValue(name) || '').trim();
      return value || back;
    }
    return {
      brand: read('--dsw-alias-brand-primary', '#0f1115'),
      onBrand: read('--dsw-alias-label-primary-inverted', '#ffffff'),
      success: read('--dsw-alias-state-success-primary', '#22c55e'),
      warn: read('--dsw-alias-state-warn-primary', '#f59e0b'),
      text: read('--dsw-alias-label-secondary', '#61666b'),
      border: read('--dsw-alias-border-l2', '#0000001a'),
      layer: read('--dsw-alias-bg-layer-2', '#f5f5f5'),
    };
  }

  /* --- panel chrome (same class names as the plugin) --------------------- */
  $('challengeName').textContent = TAB_LABEL[kind];
  $('challengeLabel').textContent = pinned === '' ? '本轮挑战：' : '固定挑战：';
  $('switchBtn').innerHTML = '<span class="dtg-challenge-name" id="challengeName">' + TAB_LABEL[kind] + '</span><span class="dtg-chevron" id="chevron">' + ICONS.chevron + '</span>';
  $('menu').innerHTML = '';
  var menuModes = [{ value: '', label: '随机' }].concat(KINDS.map(function (item) { return { value: item, label: TAB_LABEL[item] }; }));
  menuModes.forEach(function (mode) {
    var option = document.createElement('button');
    option.type = 'button';
    option.className = 'dtg-menu-item';
    option.setAttribute('role', 'menuitemradio');
    option.setAttribute('aria-checked', mode.value === pinned ? 'true' : 'false');
    option.setAttribute('data-kind', mode.value);
    option.innerHTML = '<span>' + mode.label + '</span><span class="dtg-check">' + ICONS.check + '</span>';
    option.addEventListener('click', function () { choose(mode.value); closeMenu(); });
    $('menu').appendChild(option);
  });
  $('btnRestart').innerHTML = ICONS.restart;
  $('btnPause').innerHTML = ICONS.play;
  function renderSound() {
    var muted = sfx ? sfx.isMuted() : true;
    $('btnSound').innerHTML = muted ? ICONS.soundOff : ICONS.sound;
    $('btnSound').setAttribute('aria-label', muted ? '开启声音' : '静音');
    $('btnSound').setAttribute('aria-pressed', muted ? 'true' : 'false');
  }
  renderSound();
  $('btnSound').addEventListener('click', function () {
    if (!sfx) return;
    var next = !sfx.isMuted();
    sfx.setMuted(next);
    if (!next) {
      sfx.unlock();
      sfx.play('start');
    }
    renderSound();
    log('音效：' + (next ? '静音' : '开启'));
  });
  $('switchBtn').addEventListener('click', function (event) {
    event.stopPropagation();
    if ($('menu').hidden) openMenu();
    else closeMenu();
  });
  function openMenu() {
    $('menu').hidden = false;
    $('switchBtn').setAttribute('aria-expanded', 'true');
    var current = $('menu').querySelector('[aria-checked="true"]');
    if (current) current.focus();
  }
  function closeMenu() {
    $('menu').hidden = true;
    $('switchBtn').setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('pointerdown', function (event) {
    if ($('menu').hidden) return;
    if ($('panel').contains(event.target)) return;
    closeMenu();
  }, true);
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(); });

  function choose(next) {
    if (next === pinned) { closeMenu(); return; }
    pinned = next;
    try { window.localStorage.setItem('dsh-think-game:pinned', pinned); } catch (e) { /* ignore */ }
    if (pinned === '') {
      var pool = KINDS.filter(function (item) { return item !== kind; });
      kind = pool[Math.floor(Math.random() * pool.length)] || kind;
    } else {
      kind = pinned;
    }
    var current = ensure(kind);
    resize();
    $('challengeLabel').textContent = pinned === '' ? '本轮挑战：' : '固定挑战：';
    var options = $('menu').children;
    for (var i = 0; i < options.length; i += 1) options[i].setAttribute('aria-checked', options[i].getAttribute('data-kind') === pinned ? 'true' : 'false');
    log('切换到 ' + TAB_LABEL[kind] + (pinned === '' ? '（随机）' : '（固定）'));
    focusStage();
    updateUi();
  }

  function resize() {
    var rect = stage.getBoundingClientRect();
    var width = Math.max(180, Math.round(rect.width || 320));
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(STAGE_H * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    I.layoutGame(game(), width, STAGE_H);
  }

  function hiddenOrClosing() { return !panelVisible; }

  function updateUi() {
    var current = game();
    var hud = I.hudOf(current);
    $('panel').setAttribute('data-game', kind);
    $('panel').setAttribute('data-closing', panelVisible ? 'false' : 'true');
    $('hint').textContent = HINT[kind];
    $('metrics').innerHTML = '';
    hud.metrics.forEach(function (pair) {
      var span = document.createElement('span');
      var label = (METRIC_LABEL[pair[0]] || pair[0]).replace('{n}', String(pair[1]));
      span.textContent = label;
      $('metrics').appendChild(span);
    });
    var pauseLabel = hud.phase === 'ready' ? '开始' : hud.phase === 'paused' ? '继续' : '暂停';
    if (hud.phase === 'over') {
      $('btnPause').style.display = 'none';
    } else {
      $('btnPause').style.display = '';
      $('btnPause').innerHTML = hud.phase === 'playing' && !hud.paused ? ICONS.pause : ICONS.play;
      $('btnPause').setAttribute('aria-label', pauseLabel);
    }
    $('btnRestart').setAttribute('aria-label', '重开');
    var live = simulatedRunning && hud.phase === 'playing' && !hud.paused;
    $('panel').querySelector('.dtg-dot').setAttribute('data-live', live ? 'true' : 'false');
    var overlay = null;
    if (hud.phase === 'over') overlay = 'over';
    else if (hud.phase === 'ready') overlay = 'ready';
    else if (hud.paused) overlay = 'paused';
    var overlayBox = $('overlay');
    var overlayText = $('overlayText');
    if (!overlay || !panelVisible) {
      overlayBox.style.display = 'none';
    } else {
      overlayBox.style.display = '';
      overlayText.textContent = overlay === 'paused' ? '已暂停 · 空格继续' : overlay === 'ready' ? READY[kind] : OVER[kind];
    }
    $('state').textContent = JSON.stringify({
      game: kind, phase: hud.phase, paused: hud.paused, metrics: hud.metrics,
      running: simulatedRunning, panelVisible: panelVisible,
    }, null, 2);
  }

  /* --- main loop --------------------------------------------------------- */
  var last = 0;
  function frame(ts) {
    var dt = last ? Math.min(0.033, (ts - last) / 1000) : 0;
    last = ts;
    var current = game();
    if (panelVisible) {
      if (!simulatedRunning) current.paused = true;
      I.stepGame(current, dt);
      if (Array.isArray(current.sfx)) {
        while (current.sfx.length > 0) {
          var cue = current.sfx.shift();
          if (sfx) sfx.play(cue);
          log('音效 ' + cue);
        }
      }
      ctx2d.save();
      ctx2d.setTransform(1, 0, 0, 1, 0, 0);
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.restore();
      // drawGame is exposed by the build's patched internals.
      I.drawGame(ctx2d, current, palette());
    }
    updateUi();
    requestAnimationFrame(frame);
  }

  /* --- focus / keyboard isolation --------------------------------------- */
  function focusStage() {
    try { stage.focus({ preventScroll: true }); } catch (e) { stage.focus(); }
    log('游戏区获得焦点（现在键盘只控制游戏）');
  }
  stage.addEventListener('keydown', function (event) {
    if (!panelVisible) return;
    if (sfx) sfx.unlock();
    var handled = I.keyDown(game(), event.key);
    if (handled) event.preventDefault();
    log('游戏区按键 ' + event.key + (handled ? '' : '（未处理）'));
  });
  stage.addEventListener('keyup', function (event) { I.keyUp(game(), event.key); });
  stage.addEventListener('pointerdown', function (event) {
    if (sfx) sfx.unlock();
    focusStage();
    var rect = stage.getBoundingClientRect();
    var point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    I.pointerDown(game(), point.x, point.y);
    log('游戏区点击 (' + Math.round(point.x) + ', ' + Math.round(point.y) + ')');
  });
  stage.addEventListener('pointermove', function (event) {
    var rect = stage.getBoundingClientRect();
    var point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    I.pointerMove(game(), point.x, point.y);
  });
  stage.addEventListener('focus', function () { log('focusin 游戏区'); });
  stage.addEventListener('blur', function () { log('focusout 游戏区（自动暂停）'); });

  $('btnPause').addEventListener('click', function () { I.togglePause(game()); log('按钮：' + $('btnPause').textContent); updateUi(); });
  $('btnRestart').addEventListener('click', function () { I.resetGame(game()); log('按钮：重开'); updateUi(); });
  $('focusStage').addEventListener('click', focusStage);

  $('typeBox').addEventListener('keydown', function (event) {
    log('输入框按键 ' + event.key + '（游戏未收到）');
  });

  function setPanelVisible(next) {
    panelVisible = next;
    $('panel').style.display = next ? '' : 'none';
    if (!next) log('模拟：思考结束 → 暂停并淡出/卸载');
    else {
      $('panel').setAttribute('data-closing', 'false');
      log('模拟：思考开始 → 面板出现（游戏状态保留）');
    }
    updateUi();
  }

  $('running').addEventListener('change', function (event) {
    simulatedRunning = event.target.checked;
    if (simulatedRunning) {
      setPanelVisible(true);
    } else {
      // Mirror the plugin: freeze immediately, fade via [data-closing], then remove.
      game().paused = true;
      $('panel').setAttribute('data-closing', 'true');
      log('模拟：running=false → 冻结 + 280ms 淡出');
      updateUi();
      setTimeout(function () { setPanelVisible(false); }, 320);
    }
  });

  $('resetSession').addEventListener('click', function () {
    games = {};
    log('已重置全部游戏状态');
    resize();
    updateUi();
  });

  function applyTheme() {
    var choice = $('theme').value;
    var dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    log('主题：' + (dark ? 'dark' : 'light'));
  }
  $('theme').addEventListener('change', applyTheme);

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if ($('theme').value === 'system') applyTheme();
    });
  }

  new ResizeObserver(function () { resize(); }).observe(stage);
  resize();
  applyTheme();
  updateUi();
  log('调试页已加载：内联真实 client.js（sha256:' + window.__CLIENT_DIGEST__ + '）');
  requestAnimationFrame(frame);
})();
`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>think-game 调试页 · 砖块 / 贪吃蛇 / 反应力 / 2048 / 记忆 / 堆塔 / 飞行</title>
<style id="ds-theme-tokens">${themeCss}</style>
<style>${pageCss}</style>
</head>
<body>
<div class="dbg">
  <header class="dbg-head">
    <h1>think-game 调试页</h1>
    <span class="sub">内联真实 <code>client.js</code>（sha256:${digest}）· 与插件同一套游戏引擎和面板样式</span>
    <span class="spacer"></span>
    <label class="dbg-tools">主题
      <select id="theme">
        <option value="light">浅色</option>
        <option value="dark">深色</option>
        <option value="system" selected>跟随系统</option>
      </select>
    </label>
  </header>

  <div class="dbg-tools">
    <label><input type="checkbox" id="running" checked> 模拟思考中（running）</label>
    <button id="focusStage" type="button">聚焦游戏区</button>
    <button id="resetSession" type="button">重置全部状态</button>
    <span class="dbg-note">取消勾选可预览思考结束时的暂停 + 淡出/收起。</span>
  </div>

  <div class="dbg-layout">
    <div class="dbg-main">
      <div class="dbg-think"><span class="dbg-think-icon"></span><span>深度求索中，用时 36 秒 ···</span></div>
      <div class="dbg-think-note">↑ 模拟 DSH 折叠的思考模块；真实插件会自动把游戏面板插在它下方（无需展开）。</div>
      <div class="dbg-panel-wrap">
        <div class="dtg-panel" id="panel" data-game="breakout" data-closing="false" role="group" aria-label="思考小游戏">
          <div class="dtg-head">
            <span class="dtg-dot" data-live="false"></span>
            <span class="dtg-name">思考小游戏</span>
            <span class="dtg-metrics" id="metrics"></span>
            <span class="dtg-actions">
              <button type="button" class="dtg-icon-btn" id="btnSound" aria-label="静音"></button>
              <button type="button" class="dtg-icon-btn" id="btnPause" aria-label="开始"></button>
              <button type="button" class="dtg-icon-btn" id="btnRestart" aria-label="重开"></button>
            </span>
          </div>
          <div class="dtg-stage" id="stage" tabindex="0" role="application" aria-label="思考等待小游戏">
            <canvas class="dtg-canvas" id="canvas" aria-hidden="true"></canvas>
            <div class="dtg-overlay" id="overlay"><span class="dtg-pill" id="overlayText"></span></div>
          </div>
          <div class="dtg-foot">
            <span class="dtg-challenge">
              <span class="dtg-challenge-label" id="challengeLabel">本轮挑战：</span>
              <span class="dtg-switch">
                <button type="button" class="dtg-switch-btn" id="switchBtn" aria-haspopup="menu" aria-expanded="false" aria-label="切换"></button>
                <div class="dtg-menu" id="menu" role="menu" hidden></div>
              </span>
            </span>
            <div class="dtg-hint" id="hint"></div>
          </div>
        </div>
      </div>
      <div class="dbg-row">
        <input id="typeBox" type="text" placeholder="在这里打字：游戏区未聚焦时按键不应影响游戏">
        <span>焦点隔离测试</span>
      </div>
      <p class="dbg-note">这些游戏操作与插件完全一致：点一下画面再按方向键/空格；在输入框打字不会被游戏抢键；面板按钮和标签均可点击。主题切换会同步更新面板与 canvas 配色。</p>
    </div>

    <aside class="dbg-side">
      <section>
        <h3>当前状态</h3>
        <pre id="state">{}</pre>
      </section>
      <section>
        <h3>事件日志</h3>
        <ol id="log"></ol>
      </section>
      <section>
        <h3>说明</h3>
        <p>此页由 <code>node think-game/debug/build.mjs</code> 生成：把当前 <code>client.js</code> 内联并以轻量 React/Cordis stub 启动，
          所以跑的是插件里真实的游戏引擎（<code>createGame/stepGame/drawGame/hudOf/keyDown/pointerDown</code>）和插件注入的 <code>.dtg-*</code> 样式，
          主题 token 来自已安装的 DSH app.asar。改动 <code>client.js</code> 后重新生成即可。</p>
      </section>
    </aside>
  </div>
</div>
<script>window.__CLIENT_B64__ = "${clientB64}"; window.__CLIENT_DIGEST__ = "${digest}";</script>
<script>${pageScript}</script>
</body>
</html>
`;

mkdirSync(here, { recursive: true });
writeFileSync(outPath, html, 'utf8');
console.log('wrote ' + outPath + ' (' + Buffer.byteLength(html) + ' bytes)');
