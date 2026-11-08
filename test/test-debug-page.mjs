/**
 * Smoke-tests the generated debug page without a browser:
 *  - extracts the inlined client.js blob from `debug/index.html` and boots it
 *    with the same lightweight stubs the page uses (verifying the page's boot
 *    path compiles and exposes the engines);
 *  - syntactically parses the page's own inline script;
 *  - runs a few game transitions to prove the embedded engines work.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const htmlPath = new URL('../debug/index.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('ok   -', name);
  } catch (error) {
    failures.push(name + ': ' + error.message);
    console.log('FAIL -', name, '::', error.message);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let b64;
let pageScript = '';
check('page contains the inline client blob and page script', () => {
  const blob = html.match(/window\.__CLIENT_B64__\s*=\s*"([A-Za-z0-9+/=]+)"/);
  assert(blob, 'client blob missing');
  b64 = blob[1];
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert(scripts.length >= 2, 'expected boot blob script and page script');
  pageScript = scripts[scripts.length - 1];
  assert(pageScript.includes('requestAnimationFrame(frame)'), 'page script looks truncated');
});

check('page script parses as JavaScript', () => {
  new Function(pageScript);
});

const clientSource = Buffer.from(b64, 'base64').toString('utf8');

function boot() {
  const loadCalls = [];
  const styles = [];
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (definition) => loadCalls.push(definition) },
      __THINK_GAME_DEBUG__: true,
    },
    document: {
      createElement: (tag) => ({ tag, dataset: {}, textContent: '', style: {} }),
      head: { appendChild: (node) => styles.push(node) },
      body: { appendChild() {} },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(clientSource, sandbox, { filename: 'debug-inline-client.js' });
  assert(loadCalls.length === 1, 'module loader definition');
  const mod = loadCalls[0].factory((name) => {
    throw new Error('unexpected require: ' + name);
  });
  const fakeCtx = {
    effect: (callback) => {
      const disposer = callback();
      return typeof disposer === 'function' ? disposer : () => {};
    },
    locale: { register: () => () => {}, bind: () => (key) => key },
    get: () => undefined,
  };
  mod.apply(fakeCtx);
  assert(styles.length >= 1 && String(styles[0].textContent).includes('.dtg-strip'), 'stylesheet injected');
  assert(mod.__internals, 'internals exposed by the build patch');
  return mod.__internals;
}

let I;
check('inline client boots and exposes internals', () => {
  I = boot();
  assert(Array.isArray(I.KINDS) && I.KINDS.length === 7, 'seven game kinds');
});

check('breakout / snake / reaction run a few frames', () => {
  const breakout = I.createGame('breakout');
  I.startOrResume(breakout);
  I.stepGame(breakout, 0.016);
  assert(breakout.phase === 'playing', 'breakout running');
  const snake = I.createGame('snake');
  I.keyDown(snake, ' ');
  I.stepGame(snake, snake.interval + 0.01);
  assert(snake.snake.length >= 3, 'snake alive');
  const reaction = I.createGame('reaction');
  I.pointerDown(reaction, 5, 5);
  I.stepGame(reaction, 0.01);
  assert(reaction.phase === 'playing' && reaction.target !== null, 'reaction running');
});

check('2048 / memory / stack / flappy run a few frames', () => {
  const game2048 = I.createGame('2048');
  I.layoutGame(game2048, 480, 150);
  I.keyDown(game2048, 'ArrowLeft');
  assert(game2048.phase === 'playing', '2048 running');
  const memory = I.createGame('memory');
  I.layoutGame(memory, 480, 150);
  const cell = memory.cells[0];
  I.pointerDown(memory, cell.x + cell.w / 2, cell.y + cell.h / 2);
  assert(memory.phase === 'playing' && memory.cards[0].state === 'up', 'memory flipped');
  const stack = I.createGame('stack');
  I.layoutGame(stack, 480, 150);
  I.startOrResume(stack);
  assert(stack.phase === 'playing', 'stack running');
  const flappy = I.createGame('flappy');
  I.layoutGame(flappy, 480, 150);
  I.startOrResume(flappy);
  I.keyDown(flappy, ' ');
  I.stepGame(flappy, 0.05);
  assert(flappy.phase === 'playing' && flappy.pipes.length >= 1, 'flappy running');
});

check('drawGame renders without throwing (no-op canvas context)', () => {
  const palette = { brand: '#000', onBrand: '#fff', success: '#0f0', warn: '#fa0', text: '#777', border: '#ddd', layer: '#eee' };
  const calls = [];
  const ctx = new Proxy({}, {
    get(target, prop) {
      if (prop === 'canvas') return { width: 300, height: 150 };
      return (...args) => { calls.push([prop, args.length]); };
    },
    set() { return true; },
  });
  for (const kind of I.KINDS) {
    const game = I.createGame(kind);
    I.drawGame(ctx, game, palette);
  }
  assert(calls.length > 0, 'draw calls happened');
});

console.log('');
if (failures.length) {
  console.log('FAILED', failures.length, 'checks');
  process.exitCode = 1;
} else {
  console.log('all checks passed');
}
