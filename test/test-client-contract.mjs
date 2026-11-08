/**
 * Pre-activation contract + game-logic tests for the think-game client module.
 *
 * This does NOT render React or the DOM. It loads the shipped client module,
 * captures the factory the browser module loader would call, runs `apply` with a
 * mocked Cordis context, and exercises the pure arcade simulations living in the
 * same closure: Breakout, Snake and Reflex.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const patched = source.replace(
	"return { inject: ['locale'], apply: apply };",
	"return { inject: ['locale'], apply: apply, __internals: { createGame, resetGame, layoutGame, stepGame, startOrResume, togglePause, hudOf, sameHud, keyDown, keyUp, pointerDown, pointerMove, drawGame, createSfx, KINDS } };",
);
if (patched === source) throw new Error('test harness could not expose internals');

const loadCalls = [];
const appended = [];
const sandbox = {
	window: {
		__ModuleLoader__: {
			load(definition) {
				loadCalls.push(definition);
			},
		},
	},
	document: {
		createElement(tag) {
			return { tag, dataset: {}, textContent: '', style: {} };
		},
		head: {
			appendChild(node) {
				appended.push(node);
			},
		},
		body: {
			appendChild() {},
		},
		querySelector() {
			return null;
		},
		querySelectorAll() {
			return [];
		},
	},
	console,
	Math,
	Date,
	setTimeout,
	clearTimeout,
	setInterval,
	clearInterval,
	ResizeObserver: class {
		observe() {}
		disconnect() {}
	},
};
sandbox.globalThis = sandbox;

vm.runInNewContext(patched, sandbox, { filename: 'client.js' });

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
function equal(actual, expected, message) {
	assert(actual === expected, (message || 'value') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

check('module loader received one definition', () => {
	equal(loadCalls.length, 1);
	equal(loadCalls[0].id, 'dsh-think-game');
});

const ReactComponent = class {
	constructor(props) {
		this.props = props;
		this.state = { failed: false };
	}
};
const React = {
	createElement() {
		return null;
	},
	Fragment: 'Fragment',
	useState(initial) {
		return [initial, () => {}];
	},
	useRef(initial) {
		return { current: initial };
	},
	useEffect() {},
	useMemo() {},
	Component: ReactComponent,
};

const definition = loadCalls[0];
const mod = definition.factory((name) => {
	if (name === 'react') return React;
	throw new Error('unexpected require: ' + name);
});

check('module declares hard dependencies', () => {
	assert(Array.isArray(mod.inject) && mod.inject.includes('locale'), 'inject must include locale');
	equal(typeof mod.apply, 'function');
});

const effects = [];
const registrations = [];
const localeRegistrations = [];
const injectWaits = [];
const ctx = {
	effect(callback) {
		const disposer = callback();
		effects.push(typeof disposer === 'function' ? disposer : () => {});
		return () => {};
	},
	locale: {
		register(namespace, dicts) {
			localeRegistrations.push({ namespace, dicts });
			return () => {};
		},
	},
	slots: {
		inject(key, callback) {
			injectWaits.push({ key, callback });
			return () => {};
		},
		register(options, component) {
			registrations.push({ options, component });
			return () => {};
		},
	},
};
mod.apply(ctx);

check('injects styles and locale dictionaries through ctx.effect', () => {
	assert(effects.length >= 2, 'effect count >= 2 (plugin effects)');
	assert(appended.length >= 1, 'style element must be appended');
	assert(String(appended[0].textContent).includes('.dtg-menu'), 'stylesheet content');
});

check('registers the locale namespace with key parity and new game copy', () => {
	equal(localeRegistrations.length, 1);
	equal(localeRegistrations[0].namespace, 'thinkGame');
	const { en, zh } = localeRegistrations[0].dicts;
	assert(en && zh, 'en and zh dictionaries');
	const enKeys = Object.keys(en).sort();
	const zhKeys = Object.keys(zh).sort();
	equal(JSON.stringify(zhKeys), JSON.stringify(enKeys), 'locale key parity');
	equal(zh.tabSnake, '贪吃蛇');
	equal(zh.tabReaction, '反应力');
	assert(en['hint.snake'].length > 0 && zh['hint.reaction'].length > 0, 'per-game hints');
});

check('no longer replaces the reasoning body slot', () => {
	equal(registrations.length, 0, 'the flow adapter does not register a slot entry');
	equal(injectWaits.length, 0, 'no slot waits');
});

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */
const internals = mod.__internals;

check('exposes three game kinds', () => {
	equal(JSON.stringify(internals.KINDS), JSON.stringify(['breakout', 'snake', 'reaction']));
});

check('sfx kit is safe without WebAudio and mute can be toggled', () => {
	const sfx = internals.createSfx();
	assert(sfx && typeof sfx.play === 'function' && typeof sfx.unlock === 'function', 'sfx surface');
	equal(sfx.isMuted(), false);
	sfx.play('brick');
	sfx.setMuted(true);
	equal(sfx.isMuted(), true);
	sfx.play('done');
	sfx.setMuted(false);
	equal(sfx.isMuted(), false);
});

check('engines emit sound cues', () => {
	const game = internals.createGame('breakout');
	internals.startOrResume(game);
	assert(game.sfx.includes('start'), 'start cue');
	equal(Array.isArray(game.sfx), true);
});

/* ------------------------------------------------------------------ */
/* Breakout                                                            */
/* ------------------------------------------------------------------ */
let breakout = internals.createGame('breakout');

check('breakout: starts ready with 3 lives and a varied brick field', () => {
	equal(breakout.phase, 'ready');
	equal(breakout.lives, 3);
	equal(breakout.score, 0);
	assert(breakout.bricks.length >= 4, 'bricks present');
	assert(breakout.bricks.length <= breakout.cols * breakout.rows, 'not more bricks than the grid');
	assert(breakout.bricks.every((brick) => brick.alive), 'all bricks alive');
	assert(['full', 'checker', 'pyramid', 'diamond', 'columns', 'stripe', 'random'].includes(breakout.pattern), 'pattern name');
	assert(breakout.bricks.every((brick) => [0, 1, 2].includes(brick.tint)), 'per-row tint assigned');
});

check('breakout: new rounds vary their brick layout', () => {
	const signatures = new Set();
	for (let i = 0; i < 24; i += 1) {
		const game = internals.createGame('breakout');
		signatures.add(game.pattern + ':' + game.bricks.length + ':' + game.rowTints.join(''));
	}
	assert(signatures.size >= 2, 'layouts should vary between games, got ' + signatures.size);
});

check('breakout: serve launches the ball upward', () => {
	internals.startOrResume(breakout);
	equal(breakout.phase, 'playing');
	equal(breakout.paused, false);
	assert(breakout.ball.vy < 0, 'ball must move up');
});

check('breakout: pause toggles during play', () => {
	internals.togglePause(breakout);
	equal(breakout.paused, true);
	internals.togglePause(breakout);
	equal(breakout.paused, false);
});

check('breakout: missing the paddle costs exactly one life and re-arms', () => {
	const before = breakout.lives;
	breakout.ball.y = breakout.H + 10;
	breakout.ball.vy = 200;
	internals.stepGame(breakout, 0.016);
	equal(breakout.lives, before - 1);
	equal(breakout.phase, 'ready');
});

check('breakout: three misses end the round; restart recovers', () => {
	for (let i = 0; i < 3; i += 1) {
		if (breakout.phase === 'ready') internals.startOrResume(breakout);
		breakout.ball.y = breakout.H + 10;
		breakout.ball.vy = 200;
		internals.stepGame(breakout, 0.016);
	}
	equal(breakout.phase, 'over');
	equal(breakout.lives, 0);
	internals.resetGame(breakout);
	equal(breakout.phase, 'ready');
	equal(breakout.lives, 3);
});

check('breakout: clearing every brick levels up and rebuilds the field', () => {
	internals.startOrResume(breakout);
	const level = breakout.level;
	for (const brick of breakout.bricks) brick.alive = false;
	breakout.ball.y = 40;
	breakout.ball.vy = -50;
	breakout.ball.vx = 10;
	internals.stepGame(breakout, 0.016);
	equal(breakout.level, level + 1);
	assert(breakout.bricks.length > 0 && breakout.bricks.every((brick) => brick.alive), 'new bricks');
});

check('breakout: pointer and arrow keys move the paddle', () => {
	internals.resetGame(breakout);
	internals.startOrResume(breakout);
	breakout.pointerX = -500;
	internals.stepGame(breakout, 0.016);
	equal(breakout.paddle.x, breakout.paddle.w / 2);
	breakout.pointerX = null;
	breakout.paddle.x = 200;
	const start = breakout.paddle.x;
	internals.keyDown(breakout, 'ArrowLeft');
	internals.stepGame(breakout, 0.05);
	internals.keyUp(breakout, 'ArrowLeft');
	assert(breakout.paddle.x < start, 'arrow key moved paddle left');
	internals.keyDown(breakout, 'ArrowRight');
	internals.stepGame(breakout, 0.05);
	internals.keyUp(breakout, 'ArrowRight');
	assert(breakout.paddle.x > start - 30, 'right key moved paddle back');
	equal(breakout.phase, 'playing', 'still playing');
});

/* ------------------------------------------------------------------ */
/* Snake                                                               */
/* ------------------------------------------------------------------ */
const snake = internals.createGame('snake');

check('snake: starts ready with 3 segments and food', () => {
	equal(snake.kind, 'snake');
	equal(snake.phase, 'ready');
	equal(snake.snake.length, 3);
	assert(snake.cols > 8 && snake.rows > 5, 'grid sized');
	assert(snake.food.x >= 0 && snake.food.x < snake.cols, 'food in bounds');
});

check('snake: space starts, then it advances on its interval', () => {
	internals.keyDown(snake, ' ');
	equal(snake.phase, 'playing');
	const headX = snake.snake[0].x;
	internals.stepGame(snake, snake.interval + 0.01);
	equal(snake.snake[0].x, headX + 1, 'head moved right');
	equal(snake.snake.length, 3, 'tail dropped without food');
});

check('snake: arrow/WASD sets direction and rejects reversal', () => {
	internals.keyDown(snake, 'ArrowUp');
	equal(snake.pending.y, -1);
	internals.keyDown(snake, 'ArrowDown');
	equal(snake.pending.y, -1, 'reversal ignored');
	/* Face right again for the food test. */
	internals.keyDown(snake, 'ArrowRight');
	equal(snake.pending.y === 0 || snake.pending.x === 1, true, 'pending right after opposite up');
});

check('snake: eating food grows the snake and scores', () => {
	internals.keyDown(snake, 'ArrowRight');
	const head = snake.snake[0];
	snake.food = { x: head.x + snake.dir.x, y: head.y + snake.dir.y };
	const score = snake.score;
	internals.stepGame(snake, snake.interval + 0.01);
	equal(snake.score, score + 10);
	equal(snake.snake.length, 4);
});

check('snake: hitting the wall ends the round; restart re-arms', () => {
	snake.pending = { x: 1, y: 0 };
	snake.dir = { x: 1, y: 0 };
	snake.snake = [{ x: snake.cols - 1, y: 2 }, { x: snake.cols - 2, y: 2 }, { x: snake.cols - 3, y: 2 }];
	internals.stepGame(snake, snake.interval + 0.01);
	equal(snake.phase, 'over');
	internals.resetGame(snake);
	equal(snake.phase, 'ready');
	equal(snake.snake.length, 3);
});

check('snake: pointer steering picks the dominant axis', () => {
	internals.startOrResume(snake);
	const head = snake.snake[0];
	const cell = snake.cell;
	internals.pointerMove(snake, (head.x + 0.5) * cell + 10 * cell, (head.y + 0.5) * cell);
	equal(snake.pending.x, 1);
	internals.pointerMove(snake, (head.x + 0.5) * cell, (head.y + 0.5) * cell - 10 * cell);
	equal(snake.pending.y, -1);
});

/* ------------------------------------------------------------------ */
/* Reaction (Reflex)                                                   */
/* ------------------------------------------------------------------ */
const reaction = internals.createGame('reaction');

check('reaction: starts ready with a 3x3 cell layout', () => {
	equal(reaction.phase, 'ready');
	equal(reaction.cells.length, 9);
	assert(reaction.rounds >= 8, 'round count');
});

check('reaction: click starts and spawns a target', () => {
	internals.pointerDown(reaction, 5, 5);
	equal(reaction.phase, 'playing');
	assert(reaction.target !== null && reaction.target >= 0 && reaction.target <= 8, 'target index');
});

check('reaction: matching key hits, wrong key misses', () => {
	const target = reaction.target;
	internals.keyDown(reaction, String(target + 1));
	equal(reaction.hits, 1);
	reaction.nextAt = Date.now() - 1;
	internals.stepGame(reaction, 0.01);
	assert(reaction.target !== null, 'next target spawned');
	const second = reaction.target;
	const wrong = (second + 1) % 9;
	internals.keyDown(reaction, String(wrong + 1));
	equal(reaction.misses, 1);
});

check('reaction: rounds finish into game over and restart re-arms', () => {
	let guard = 0;
	while (reaction.phase === 'playing' && guard < 200) {
		guard += 1;
		if (reaction.target === null) {
			reaction.nextAt = Date.now() - 1;
			internals.stepGame(reaction, 0.01);
		}
		if (reaction.target === null) break;
		internals.keyDown(reaction, String(reaction.target + 1));
	}
	equal(reaction.phase, 'over');
	internals.resetGame(reaction);
	equal(reaction.phase, 'ready');
	equal(reaction.hits, 0);
	equal(reaction.misses, 0);
});

check('reaction: click on the active cell scores through the pointer path', () => {
	internals.resetGame(reaction);
	internals.pointerDown(reaction, 0, 0);
	assert(reaction.target !== null, 'target after start');
	const target = reaction.target;
	const cell = reaction.cells[target];
	internals.pointerDown(reaction, cell.x + cell.w / 2, cell.y + cell.h / 2);
	equal(reaction.hits, 1);
});

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */
check('hud exposes per-game metric sets and stays stable', () => {
	const b = internals.hudOf(internals.createGame('breakout'));
	const s = internals.hudOf(internals.createGame('snake'));
	const r = internals.hudOf(internals.createGame('reaction'));
	equal(b.metrics.length, 3);
	equal(s.metrics.length, 2);
	equal(r.metrics.length, 3);
	assert(internals.sameHud(b, internals.hudOf(internals.createGame('breakout'))), 'same hud');
});

check('layout resizes all three games', () => {
	for (const kind of internals.KINDS) {
		const game = internals.createGame(kind);
		internals.layoutGame(game, 640, 150);
		equal(game.W, 640);
		if (kind === 'snake') assert(game.cols > 20, 'snake cols grow');
		if (kind === 'reaction') equal(game.cells.length, 9);
	}
});

console.log('');
if (failures.length) {
	console.log('FAILED', failures.length, 'checks');
	process.exitCode = 1;
} else {
	console.log('all checks passed');
}
