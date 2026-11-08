/**
 * Think arcade — a client plugin for the DSH Web shell.
 *
 * The public slot API only exposes the reasoning body while the Think row is
 * expanded. The arcade should instead sit directly below the live "thinking /
 * deep-diving" module in the chat flow, visible without expanding anything, so
 * this plugin attaches its own panel next to that module: it renders three
 * games with the plugin's own theme-aware chrome and follows the live module
 * from step to step, fading out when the module closes.
 *
 * Three games share one lifecycle, one theme-aware chrome and one focus model:
 *   - breakout: paddle + bricks (mouse or ← →, Space to serve)
 *   - snake:    grid snake (arrows / WASD or mouse steering)
 *   - reaction: 3×3 reflex targets (click or keys 1–9)
 *
 * Plain JavaScript on purpose: the package needs no build step and no runtime
 * dependency beyond what the shell already ships.
 */
window.__ModuleLoader__.load({
	id: 'dsh-think-game',
	factory(require) {
		const NS = 'thinkGame';
		const STAGE_H = 150;
		const KINDS = ['breakout', 'snake', 'reaction'];

		const EN = {
			title: 'Think arcade',
			tabBreakout: 'Breakout',
			tabSnake: 'Snake',
			tabReaction: 'Reflex',
			randomGame: 'Random',
			challenge: 'Challenge: ',
			challengePinned: 'Pinned: ',
			switchGame: 'Switch',
			soundMute: 'Mute',
			soundUnmute: 'Unmute',
			hideGame: 'Hide game',
			hideTurn: 'Hide for this turn',
			hide30: 'Hide for 30 minutes',
			hideToday: 'Hide for today',
			hiddenTurn: 'Game hidden for this turn',
			hidden30: 'Game hidden for 30 minutes',
			hiddenToday: 'Game hidden for today',
			restore: 'Restore',
			continueGame: 'Continue',
			continueScore: 'Continue · {n} pts',
			bestScore: 'Best {n}',
			bestLength: 'Longest {n}',
			bestAvg: 'Fastest {n}ms',
			hint: 'Hint',
			score: 'Score {score}',
			level: 'Level {level}',
			lives: 'Lives {lives}',
			length: 'Length {length}',
			hits: 'Hits {hits}',
			avg: 'Avg {ms}ms',
			misses: 'Misses {misses}',
			start: 'Start',
			pause: 'Pause',
			resume: 'Resume',
			restart: 'Restart',
			paused: 'Paused · Space to continue',
			'breakout.ready': 'Click the field or press Space to serve',
			'breakout.over': 'Round over · Restart to play again',
			'snake.ready': 'Press Space or click to start',
			'snake.over': 'Crashed · Restart to try again',
			'reaction.ready': 'Click a target or press 1–9 to start',
			'reaction.over': 'Round over · Restart to play again',
			'hint.breakout': 'Mouse or ← → · Space serve · P pause · R restart',
			'hint.snake': 'Arrows / WASD or mouse to steer · Space start · P pause · R restart',
			'hint.reaction': 'Click a target or press 1–9 · P pause · R restart',
			'aria.breakout': 'Reasoning waiting game: Breakout',
			'aria.snake': 'Reasoning waiting game: Snake',
			'aria.reaction': 'Reasoning waiting game: Reflex',
			copy: 'Copy',
			copied: 'Copied',
			codeTitle: 'Code block',
			wrap: 'Wrap lines',
			unwrap: 'Unwrap lines',
			footnotes: 'Footnotes',
		};

		const ZH = {
			title: '思考小游戏',
			tabBreakout: '砖块',
			tabSnake: '贪吃蛇',
			tabReaction: '反应力',
			randomGame: '随机',
			challenge: '本轮挑战：',
			challengePinned: '固定挑战：',
			switchGame: '切换',
			soundMute: '静音',
			soundUnmute: '开启声音',
			hideGame: '隐藏小游戏',
			hideTurn: '本轮隐藏',
			hide30: '30 分钟内不显示',
			hideToday: '今天不再显示',
			hiddenTurn: '小游戏已隐藏（本轮）',
			hidden30: '小游戏已隐藏（30 分钟）',
			hiddenToday: '小游戏已隐藏（今天）',
			restore: '恢复',
			continueGame: '继续',
			continueScore: '继续上局 · 得分 {n}',
			bestScore: '最高 {n}',
			bestLength: '最长 {n}',
			bestAvg: '最快 {n}ms',
			hint: '提示',
			score: '得分 {score}',
			level: '第 {level} 关',
			lives: '机会 {lives}',
			length: '长度 {length}',
			hits: '命中 {hits}',
			avg: '均 {ms}ms',
			misses: '失误 {misses}',
			start: '开始',
			pause: '暂停',
			resume: '继续',
			restart: '重开',
			paused: '已暂停 · 空格继续',
			'breakout.ready': '点击画面或按空格发球',
			'breakout.over': '本局结束 · 重开一局',
			'snake.ready': '按空格或点击画面开始',
			'snake.over': '撞到了 · 重开一局',
			'reaction.ready': '点击目标或按 1–9 开始',
			'reaction.over': '本局结束 · 重开一局',
			'hint.breakout': '鼠标或 ← → 移动 · 空格发球 · P 暂停 · R 重开',
			'hint.snake': '方向键 / WASD 或鼠标转向 · 空格开始 · P 暂停 · R 重开',
			'hint.reaction': '点击目标或按 1–9 · P 暂停 · R 重开',
			'aria.breakout': '思考等待小游戏：打砖块',
			'aria.snake': '思考等待小游戏：贪吃蛇',
			'aria.reaction': '思考等待小游戏：反应力',
			copy: '复制',
			copied: '已复制',
			codeTitle: '代码块',
			wrap: '自动换行',
			unwrap: '不换行',
			footnotes: '脚注',
		};

		/* Theme-aware styles. Only --dsw-alias-* tokens are used for surfaces and
		 * controls, so light/dark follows the shell without a listener. */
		const CSS = [
			/* A restrained, Apple-like material: hairline border, soft depth, calm type. */
			'.dtg-panel{display:flex;flex-direction:column;gap:10px;margin:8px 0 2px;padding:12px 14px;',
			'max-width:520px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg,16px);',
			'background:var(--dsw-alias-bg-layer-1);',
			'color:var(--dsw-alias-label-primary);font-size:calc(12px + var(--dsh-content-font-delta-secondary,0px));',
			'line-height:1.4;box-shadow:0 1px 2px rgba(0,0,0,.04),0 10px 30px rgba(0,0,0,.05);',
			'opacity:1;animation:dtg-in .3s cubic-bezier(.22,1,.36,1) both;',
			'transition:opacity .24s ease,transform .24s ease}',
			'.dtg-panel[data-closing="true"]{opacity:0;transform:translateY(-3px);pointer-events:none;animation:none}',
			'@keyframes dtg-in{from{opacity:0;transform:translateY(5px) scale(.995)}to{opacity:1;transform:none}}',
			'.dtg-head{display:flex;align-items:center;gap:8px;min-height:24px}',
			'.dtg-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);opacity:.9}',
			'.dtg-dot[data-live="true"]{background:var(--dsw-alias-brand-primary);',
			'box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);',
			'animation:dtg-pulse 1.8s ease-in-out infinite}',
			'@keyframes dtg-pulse{0%,100%{opacity:1}50%{opacity:.4}}',
			'.dtg-name{font-size:11px;font-weight:400;letter-spacing:.02em;color:var(--dsw-alias-label-secondary);',
			'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.dtg-metrics{display:flex;align-items:baseline;color:var(--dsw-alias-label-tertiary);font-size:11px;',
			'font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
			'.dtg-metrics span+span::before{content:"·";margin:0 5px;opacity:.6}',
			'.dtg-actions{margin-inline-start:auto;display:flex;gap:2px;align-items:center}',
			'.dtg-icon-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;',
			'border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;',
			'padding:0;transition:background .15s ease,color .15s ease,transform .12s ease}',
			'.dtg-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.dtg-icon-btn:active{transform:scale(.92)}',
			'.dtg-icon-btn:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);outline-offset:1px}',
			'.dtg-icon-btn svg{width:14px;height:14px;display:block}',
			'.dtg-stage{position:relative;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);',
			'background:var(--dsw-alias-bg-base);',
			'overflow:hidden;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none}',
			'.dtg-stage:focus{outline:none}',
			'.dtg-stage:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);outline-offset:3px}',
			'.dtg-canvas{display:block;width:100%;height:150px}',
			'.dtg-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;',
			'background:color-mix(in srgb,var(--dsw-alias-bg-base) 45%,transparent);pointer-events:none}',
			'.dtg-pill{border:.5px solid var(--dsw-alias-border-l1);border-radius:999px;',
			'background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 84%,transparent);',
			'backdrop-filter:saturate(160%) blur(10px);-webkit-backdrop-filter:saturate(160%) blur(10px);',
			'color:var(--dsw-alias-label-primary);padding:4px 12px;font-size:11px;letter-spacing:.01em;',
			'box-shadow:0 2px 10px rgba(0,0,0,.08)}',
			'.dtg-foot{display:flex;align-items:center;gap:8px;margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:11px}',
			'.dtg-challenge{display:inline-flex;align-items:center;gap:2px;white-space:nowrap;min-width:0}',
			'.dtg-challenge-label{color:var(--dsw-alias-label-tertiary)}',
			'.dtg-switch{position:relative;display:inline-flex}',
			'.dtg-switch-btn{appearance:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);',
			'font:inherit;font-size:11px;font-weight:400;line-height:18px;padding:1px 3px;display:inline-flex;align-items:center;gap:2px;cursor:pointer;',
			'transition:background .15s ease,color .15s ease}',
			'.dtg-switch-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.dtg-switch-btn[aria-expanded="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
			'.dtg-switch-btn:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);outline-offset:1px}',
			'.dtg-switch-btn svg{width:9px;height:9px;opacity:.7;transition:transform .2s cubic-bezier(.22,1,.36,1)}',
			'.dtg-switch-btn[aria-expanded="true"] svg{transform:rotate(180deg)}',
			'.dtg-menu{position:absolute;left:0;bottom:calc(100% + 6px);min-width:132px;padding:4px;display:flex;flex-direction:column;gap:1px;',
			'border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,8px);',
			'background:var(--dsw-specific-menu,var(--dsw-alias-bg-overlay));',
			'backdrop-filter:saturate(160%) blur(12px);-webkit-backdrop-filter:saturate(160%) blur(12px);',
			'box-shadow:0 10px 30px rgba(0,0,0,.14),0 1px 2px rgba(0,0,0,.06);z-index:20;',
			'animation:dtg-menu-in .16s cubic-bezier(.22,1,.36,1)}',
			'@keyframes dtg-menu-in{from{opacity:0;transform:translateY(4px) scale(.98)}to{opacity:1;transform:none}}',
			'.dtg-menu[hidden]{display:none}',
			'.dtg-menu-item{appearance:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);',
			'font:inherit;font-size:12px;line-height:26px;padding:0 8px;display:flex;align-items:center;justify-content:space-between;',
			'gap:8px;cursor:pointer;transition:background .12s ease}',
			'.dtg-menu-item:hover,.dtg-menu-item:focus-visible{background:var(--dsw-alias-bg-layer-2);outline:none}',
			'.dtg-menu-item[aria-checked="true"]{font-weight:400}',
			'.dtg-menu-item svg{width:12px;height:12px;color:var(--dsw-alias-brand-primary);visibility:hidden}',
			'.dtg-menu-item[aria-checked="true"] svg{visibility:visible}',
			'.dtg-hint{margin-inline-start:auto;min-width:0;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right}',
			'.dtg-hidden-bar{display:none;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:11px}',
			'.dtg-restore{appearance:none;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);',
			'font:inherit;font-size:11px;line-height:18px;padding:1px 6px;cursor:pointer;transition:background .15s ease,color .15s ease}',
			'.dtg-restore:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.dtg-restore:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);outline-offset:1px}',
			'.dtg-close-wrap{position:relative;display:inline-flex}',
			'.dtg-close-wrap .dtg-menu{left:auto;right:0;min-width:152px}',
			'.dtg-switch .dtg-menu{min-width:200px}',
			'.dtg-best{margin-inline-start:auto;padding-inline-start:10px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-variant-numeric:tabular-nums;white-space:nowrap}',
			'.dtg-panel[data-snoozed="true"]{display:inline-flex;flex-direction:row;gap:0;width:auto;max-width:100%;padding:4px 10px;',
			'border-radius:999px;border-color:transparent;background:transparent;box-shadow:none;animation:none;opacity:1}',
			'.dtg-panel[data-suspended="true"]{display:inline-flex;flex-direction:row;gap:0;width:auto;max-width:100%;padding:4px 10px;',
			'border-radius:999px;border-color:transparent;background:transparent;box-shadow:none;animation:none;opacity:1}',
			'.dtg-panel[data-snoozed="true"] > .dtg-head,.dtg-panel[data-snoozed="true"] > .dtg-stage,',
			'.dtg-panel[data-snoozed="true"] > .dtg-foot,.dtg-panel[data-suspended="true"] > .dtg-head,',
			'.dtg-panel[data-suspended="true"] > .dtg-stage,.dtg-panel[data-suspended="true"] > .dtg-foot{display:none}',
			'.dtg-panel[data-snoozed="true"] .dtg-hidden-bar,.dtg-panel[data-suspended="true"] .dtg-hidden-bar{display:flex}',
			'@media (prefers-reduced-motion:reduce){.dtg-panel{animation:none;opacity:1;transition:none}',
			'.dtg-switch-btn,.dtg-icon-btn{transition:none}}',
			'.dtg-text-fallback{white-space:pre-wrap}',
			'.dtg-strip{display:none}',
			'.dtg-strip[data-tg-active]{display:block}',
			'.dtg-panel[data-snoozed="true"].dtg-strip[data-tg-active]{display:inline-flex}',
			'.dtg-panel[data-suspended="true"].dtg-strip[data-tg-active]{display:inline-flex}',
		].join('');

		/* Inline SVG glyphs keep the chrome dependency-free. */
		const ICONS = {
			play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M5.5 3.2c0-.8.9-1.3 1.6-.9l6 4.1c.6.4.6 1.3 0 1.7l-6 4.1c-.7.4-1.6-.1-1.6-.9V3.2z"/></svg>',
			pause: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="4" y="3" width="3" height="10" rx="1.2"/><rect x="9" y="3" width="3" height="10" rx="1.2"/></svg>',
			restart: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.8 8a4.8 4.8 0 1 1-1.6-3.6"/><path d="M13 2.9v2.7H10.3"/></svg>',
			chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4"/></svg>',
			check: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 5"/></svg>',
			sound: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 6.1h2.1L8 3.6v8.8L5.3 9.9H3.2z" fill="currentColor" stroke="none"/><path d="M10.3 6a3 3 0 0 1 0 4"/><path d="M12 4.5a5.2 5.2 0 0 1 0 7"/></svg>',
			soundOff: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.2 6.1h2.1L8 3.6v8.8L5.3 9.9H3.2z" fill="currentColor" stroke="none"/><path d="M10.4 6.4l3 3.2M13.4 6.4l-3 3.2"/></svg>',
			close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6"/></svg>',
		};


		/* ------------------------------------------------------------------ */
		/* Shared model helpers                                                */
		/* ------------------------------------------------------------------ */

		function clamp(value, min, max) {
			return value < min ? min : value > max ? max : value;
		}

		function randomInt(max) {
			return Math.floor(Math.random() * max);
		}

		function emitSfx(game, name) {
			if (game !== null && game !== undefined && Array.isArray(game.sfx)) game.sfx.push(name);
		}

		/* Tiny WebAudio kit: no audio files, no dependencies. The context is created
		 * on the first user gesture (browsers block autoplay); everything is quiet
		 * and can be muted from the panel header. */
		function createSfx() {
			const STORAGE_KEY = 'dsh-think-game:sound-muted';
			let ctx = null;
			let muted = false;
			try {
				muted = window.localStorage.getItem(STORAGE_KEY) === '1';
			} catch (error) {
				muted = false;
			}
			function context() {
				if (typeof window === 'undefined' || muted) return null;
				const AudioCtor = window.AudioContext || window.webkitAudioContext;
				if (!AudioCtor) return null;
				if (ctx === null) {
					try { ctx = new AudioCtor(); } catch (error) { return null; }
				}
				if (ctx.state === 'suspended') {
					try { ctx.resume(); } catch (error) { /* ignore */ }
				}
				return ctx;
			}
			function tone(freq, duration, type, volume, delay, endFreq) {
				const audio = context();
				if (audio === null) return;
				const start = audio.currentTime + (delay || 0);
				const osc = audio.createOscillator();
				const gain = audio.createGain();
				osc.type = type || 'sine';
				osc.frequency.setValueAtTime(Math.max(40, freq), start);
				if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), start + duration);
				gain.gain.setValueAtTime(0.0001, start);
				gain.gain.exponentialRampToValueAtTime(volume || 0.03, start + 0.008);
				gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
				osc.connect(gain);
				gain.connect(audio.destination);
				osc.start(start);
				osc.stop(start + duration + 0.03);
			}
			function play(name) {
				if (muted) return;
				if (name === 'start') tone(440, 0.07, 'sine', 0.022, 0, 560);
				else if (name === 'resume') tone(420, 0.06, 'sine', 0.018, 0, 500);
				else if (name === 'paddle') tone(185, 0.05, 'sine', 0.03);
				else if (name === 'brick') tone(560, 0.06, 'triangle', 0.026, 0, 720);
				else if (name === 'lose') tone(240, 0.16, 'sawtooth', 0.02, 0, 110);
				else if (name === 'level') { tone(640, 0.08, 'sine', 0.024); tone(880, 0.12, 'sine', 0.022, 0.08); }
				else if (name === 'eat') tone(700, 0.05, 'triangle', 0.026, 0, 940);
				else if (name === 'die') tone(180, 0.22, 'sawtooth', 0.022, 0, 70);
				else if (name === 'hit') tone(880, 0.05, 'sine', 0.024);
				else if (name === 'miss') tone(200, 0.09, 'triangle', 0.02, 0, 140);
				else if (name === 'done') { tone(520, 0.07, 'sine', 0.02); tone(660, 0.07, 'sine', 0.02, 0.07); tone(880, 0.12, 'sine', 0.02, 0.14); }
				else if (name === 'over') tone(260, 0.12, 'sine', 0.018, 0, 150);
			}
			return {
				play: play,
				unlock: function () { context(); },
				isMuted: function () { return muted; },
				setMuted: function (next) {
					muted = next === true;
					try { window.localStorage.setItem(STORAGE_KEY, muted ? '1' : '0'); } catch (error) { /* ignore */ }
				},
			};
		}

		function createGame(kind) {
			if (kind === 'snake') return createSnake();
			if (kind === 'reaction') return createReaction();
			return createBreakout();
		}

		function resetGame(game) {
			if (game.kind === 'snake') return resetSnake(game);
			if (game.kind === 'reaction') return resetReaction(game);
			return resetBreakout(game);
		}

		function layoutGame(game, width, height) {
			if (game.kind === 'snake') return layoutSnake(game, width, height);
			if (game.kind === 'reaction') return layoutReaction(game, width, height);
			return layoutBreakout(game, width, height);
		}

		function stepGame(game, dt) {
			if (game.kind === 'snake') return stepSnake(game, dt);
			if (game.kind === 'reaction') return stepReaction(game, dt);
			return stepBreakout(game, dt);
		}

		function drawGame(ctx, game, palette) {
			if (game.kind === 'snake') return drawSnake(ctx, game, palette);
			if (game.kind === 'reaction') return drawReaction(ctx, game, palette);
			return drawBreakout(ctx, game, palette);
		}

		function startOrResume(game) {
			if (game.kind === 'snake') {
				if (game.phase === 'over') return resetSnake(game);
				if (game.phase === 'ready') {
					game.phase = 'playing';
					game.paused = false;
					emitSfx(game, 'start');
					return;
				}
				game.paused = false;
				return;
			}
			if (game.kind === 'reaction') {
				if (game.phase === 'over') {
					resetReaction(game);
					return startReaction(game);
				}
				if (game.phase === 'ready') return startReaction(game);
				game.paused = false;
				return;
			}
			if (game.phase === 'over') return resetBreakout(game);
			if (game.phase === 'ready') return serveBreakout(game);
			game.paused = false;
		}

		function togglePause(game) {
			if (game.phase === 'over') {
				resetGame(game);
				return;
			}
			if (game.phase === 'ready') {
				startOrResume(game);
				return;
			}
			game.paused = !game.paused;
			if (!game.paused) emitSfx(game, 'resume');
		}

		function hudOf(game) {
			if (game.kind === 'snake') {
				return {
					phase: game.phase,
					paused: game.paused,
					score: game.score,
					metrics: [
						['score', game.score],
						['length', game.snake.length],
					],
				};
			}
			if (game.kind === 'reaction') {
				const avg = game.hits > 0 ? Math.round(game.totalMs / game.hits) : 0;
				return {
					phase: game.phase,
					paused: game.paused,
					score: game.score,
					metrics: [
						['hits', game.hits],
						['avg', avg],
						['misses', game.misses],
					],
				};
			}
			return {
				phase: game.phase,
				paused: game.paused,
				score: game.score,
				metrics: [
					['score', game.score],
					['level', game.level],
					['lives', game.lives],
				],
			};
		}

		function sameHud(a, b) {
			return JSON.stringify(a) === JSON.stringify(b);
		}

		function overlayOf(game) {
			if (game.phase === 'over') return game.kind + '.over';
			if (game.phase === 'ready') return game.kind + '.ready';
			if (game.paused) return 'paused';
			return null;
		}

		function keyDown(game, key) {
			const lower = key.toLowerCase();
			if (lower === 'p') {
				togglePause(game);
				return true;
			}
			if (lower === 'r') {
				resetGame(game);
				return true;
			}
			if (key === ' ' || key === 'Spacebar' || key === 'Space') {
				startOrResume(game);
				return true;
			}
			if (game.kind === 'snake') {
				const dir = directionOf(lower);
				if (dir !== null) {
					const pending = game.pending;
					if (dir.x !== -pending.x || dir.y !== -pending.y) game.pending = dir;
					if (game.phase === 'ready') startOrResume(game);
					return true;
				}
				return false;
			}
			if (game.kind === 'reaction') {
				if (/^[1-9]$/.test(key)) {
					if (game.phase === 'ready') {
						startReaction(game);
						hitCell(game, Number(key) - 1);
					} else if (game.phase === 'playing' && !game.paused) {
						if (game.target === Number(key) - 1) hitTarget(game, Number(key) - 1);
						else missTarget(game);
					}
					return true;
				}
				return false;
			}
			if (key === 'ArrowLeft' || lower === 'a') {
				game.keys.left = true;
				game.pointerX = null;
				return true;
			}
			if (key === 'ArrowRight' || lower === 'd') {
				game.keys.right = true;
				game.pointerX = null;
				return true;
			}
			return false;
		}

		function keyUp(game, key) {
			const lower = key.toLowerCase();
			if (key === 'ArrowLeft' || lower === 'a') game.keys.left = false;
			if (key === 'ArrowRight' || lower === 'd') game.keys.right = false;
		}

		function pointerMove(game, x, y) {
			if (game.kind === 'snake') {
				if (game.phase !== 'playing' || game.paused) return;
				const cell = game.cell;
				const head = game.snake[0];
				if (!head) return;
				const cx = (head.x + 0.5) * cell;
				const cy = (head.y + 0.5) * cell;
				const dx = x - cx;
				const dy = y - cy;
				if (Math.abs(dx) < cell && Math.abs(dy) < cell) return;
				const dir = Math.abs(dx) > Math.abs(dy) ? { x: dx > 0 ? 1 : -1, y: 0 } : { x: 0, y: dy > 0 ? 1 : -1 };
				if (dir.x !== -game.pending.x || dir.y !== -game.pending.y) game.pending = dir;
				return;
			}
			if (game.kind === 'reaction') {
				game.hover = { x: x, y: y };
				return;
			}
			game.pointerX = x;
		}

		function pointerDown(game, x, y) {
			if (game.kind === 'reaction') {
				if (game.phase === 'ready') {
					startReaction(game);
					return;
				}
				if (game.phase === 'over') {
					resetReaction(game);
					startReaction(game);
					return;
				}
				if (game.paused) {
					game.paused = false;
					return;
				}
				const cell = cellAt(game, x, y);
				if (cell === game.target) hitTarget(game, cell);
				else if (game.target !== null) missTarget(game);
				return;
			}
			if (game.kind === 'snake') {
				if (game.phase === 'ready' || game.phase === 'over') startOrResume(game);
				else game.paused = false;
				return;
			}
			game.pointerX = x;
			startOrResume(game);
		}

		function directionOf(key) {
			if (key === 'arrowleft' || key === 'a') return { x: -1, y: 0 };
			if (key === 'arrowright' || key === 'd') return { x: 1, y: 0 };
			if (key === 'arrowup' || key === 'w') return { x: 0, y: -1 };
			if (key === 'arrowdown' || key === 's') return { x: 0, y: 1 };
			return null;
		}

		/* ------------------------------------------------------------------ */
		/* Breakout                                                            */
		/* ------------------------------------------------------------------ */

		function createBreakout() {
			const game = {
				kind: 'breakout',
				phase: 'ready',
				paused: false,
				score: 0,
				level: 1,
				lives: 3,
				rally: 0,
				W: 320,
				H: STAGE_H,
				cols: 6,
				rows: 3,
				paddle: { x: 160, w: 58, h: 5, y: STAGE_H - 9 },
				ball: { x: 160, y: STAGE_H - 16, r: 3.6, vx: 0, vy: 0 },
				bricks: [],
				keys: { left: false, right: false },
				pointerX: null,
				sfx: [],
			};
			buildBreakoutBricks(game);
			return game;
		}

		function breakoutCols(width) {
			return clamp(Math.round((width - 12) / 42), 4, 8);
		}

		function breakoutRows(level) {
			return Math.min(5, 2 + Math.min(3, Math.max(1, level)));
		}

		function breakoutSpeed(game) {
			return Math.min(340, 168 + (game.level - 1) * 16);
		}

		function breakoutMetrics(game) {
			const W = game.W;
			const H = game.H;
			const padX = 6;
			const gap = 3;
			const cols = game.cols;
			const brickW = (W - padX * 2 - gap * (cols - 1)) / cols;
			const brickH = 10;
			const top = 9;
			const paddleW = clamp(W * 0.18, 44, 92);
			const paddleH = 5;
			const paddleY = H - 9;
			const ballR = 3.6;
			return { W, H, padX, gap, cols, brickW, brickH, top, paddleW, paddleH, paddleY, ballR };
		}

		function brickRect(brick, m) {
			return {
				x: m.padX + brick.col * (m.brickW + m.gap),
				y: m.top + brick.row * (m.brickH + m.gap),
				w: m.brickW,
				h: m.brickH,
			};
		}

		function buildBreakoutBricks(game) {
			game.cols = breakoutCols(game.W);
			game.rows = breakoutRows(game.level);
			const patterns = ['full', 'checker', 'pyramid', 'diamond', 'columns', 'stripe', 'random'];
			const pattern = patterns[randomInt(patterns.length)];
			game.pattern = pattern;
			const center = (game.cols - 1) / 2;
			const middleRow = (game.rows - 1) / 2;
			const tints = [0, 1, 2];
			for (let i = tints.length - 1; i > 0; i -= 1) {
				const j = randomInt(i + 1);
				const swap = tints[i];
				tints[i] = tints[j];
				tints[j] = swap;
			}
			game.rowTints = tints;
			const bricks = [];
			for (let row = 0; row < game.rows; row += 1) {
				for (let col = 0; col < game.cols; col += 1) {
					let keep = true;
					if (pattern === 'checker') keep = (row + col) % 2 === 0;
					else if (pattern === 'pyramid') keep = col >= row && col < game.cols - row;
					else if (pattern === 'diamond') keep = Math.abs(col - center) + Math.abs(row - middleRow) <= Math.min(center, middleRow) + 1.5;
					else if (pattern === 'columns') keep = col % 2 === 0;
					else if (pattern === 'stripe') keep = row % 2 === 0;
					else if (pattern === 'random') keep = Math.random() > 0.2;
					if (!keep) continue;
					bricks.push({ col: col, row: row, alive: true, tint: tints[row % 3] });
				}
			}
			/* Never leave a level emptier than a usable board. */
			if (bricks.length < Math.max(4, game.cols)) {
				game.pattern = 'full';
				game.rows = breakoutRows(game.level);
				bricks.length = 0;
				for (let row = 0; row < game.rows; row += 1) {
					for (let col = 0; col < game.cols; col += 1) bricks.push({ col: col, row: row, alive: true, tint: tints[row % 3] });
				}
			}
			game.bricks = bricks;
		}

		function layoutBreakout(game, width, height) {
			if (width > 0) game.W = width;
			if (height > 0) game.H = height;
			const m = breakoutMetrics(game);
			if (game.cols !== m.cols) {
				game.cols = m.cols;
				buildBreakoutBricks(game);
			}
			game.paddle.w = m.paddleW;
			game.paddle.h = m.paddleH;
			game.paddle.y = m.paddleY;
			game.paddle.x = clamp(game.paddle.x, m.paddleW / 2, m.W - m.paddleW / 2);
			if (game.phase === 'ready' || game.phase === 'over') {
				game.ball.x = game.paddle.x;
				game.ball.y = m.paddleY - m.ballR - 1;
			}
			game.ball.x = clamp(game.ball.x, game.ball.r, m.W - game.ball.r);
			game.ball.y = clamp(game.ball.y, game.ball.r, m.H + game.ball.r);
		}

		function resetBreakoutBall(game) {
			const m = breakoutMetrics(game);
			game.ball.x = game.paddle.x;
			game.ball.y = m.paddleY - m.ballR - 1;
			game.ball.vx = 0;
			game.ball.vy = 0;
		}

		function serveBreakout(game) {
			if (game.phase !== 'ready') return;
			game.phase = 'playing';
			game.paused = false;
			game.rally = 0;
			emitSfx(game, 'start');
			resetBreakoutBall(game);
			const speed = breakoutSpeed(game);
			const angle = (Math.random() * 2 - 1) * 0.42;
			game.ball.vx = Math.sin(angle) * speed;
			game.ball.vy = -Math.cos(angle) * speed;
		}

		function resetBreakout(game) {
			game.score = 0;
			game.level = 1;
			game.lives = 3;
			game.paused = false;
			game.phase = 'ready';
			game.rally = 0;
			buildBreakoutBricks(game);
			layoutBreakout(game, game.W, game.H);
			resetBreakoutBall(game);
		}

		function stepBreakout(game, dt) {
			const m = breakoutMetrics(game);
			if (game.keys.left) game.paddle.x -= 330 * dt;
			if (game.keys.right) game.paddle.x += 330 * dt;
			if (!game.keys.left && !game.keys.right && game.pointerX !== null && game.pointerX !== undefined) {
				game.paddle.x = game.pointerX;
			}
			game.paddle.x = clamp(game.paddle.x, m.paddleW / 2, m.W - m.paddleW / 2);
			if (game.phase === 'ready') {
				game.ball.x = game.paddle.x;
				game.ball.y = m.paddleY - m.ballR - 1;
				return;
			}
			if (game.phase !== 'playing' || game.paused) return;

			const ball = game.ball;
			const speed = Math.hypot(ball.vx, ball.vy) || breakoutSpeed(game);
			const sub = Math.max(1, Math.ceil((speed * dt) / (ball.r * 1.4)));
			const sdt = dt / sub;

			for (let i = 0; i < sub; i += 1) {
				ball.x += ball.vx * sdt;
				ball.y += ball.vy * sdt;
				if (ball.x < ball.r) {
					ball.x = ball.r;
					ball.vx = Math.abs(ball.vx);
				} else if (ball.x > m.W - ball.r) {
					ball.x = m.W - ball.r;
					ball.vx = -Math.abs(ball.vx);
				}
				if (ball.y < ball.r) {
					ball.y = ball.r;
					ball.vy = Math.abs(ball.vy);
				}
				if (ball.vy > 0 && ball.y + ball.r >= m.paddleY && ball.y - ball.r <= m.paddleY + m.paddleH) {
					const left = game.paddle.x - m.paddleW / 2;
					const right = game.paddle.x + m.paddleW / 2;
					if (ball.x >= left - ball.r && ball.x <= right + ball.r) {
						const hit = clamp((ball.x - game.paddle.x) / (m.paddleW / 2), -1, 1);
						const angle = hit * 1.02;
						const boosted = Math.min(360, Math.max(speed, breakoutSpeed(game)) + 6);
						ball.vx = Math.sin(angle) * boosted;
						ball.vy = -Math.abs(Math.cos(angle)) * boosted;
						ball.y = m.paddleY - ball.r - 0.5;
						game.rally += 1;
						emitSfx(game, 'paddle');
					}
				}
				let hitBrick = null;
				for (let b = 0; b < game.bricks.length; b += 1) {
					const brick = game.bricks[b];
					if (!brick.alive) continue;
					const rect = brickRect(brick, m);
					const cx = clamp(ball.x, rect.x, rect.x + rect.w);
					const cy = clamp(ball.y, rect.y, rect.y + rect.h);
					const dx = ball.x - cx;
					const dy = ball.y - cy;
					if (dx * dx + dy * dy > ball.r * ball.r) continue;
					hitBrick = { brick: brick, dx: dx, dy: dy };
					break;
				}
				if (hitBrick !== null) {
					hitBrick.brick.alive = false;
					game.score += 10 + (game.level - 1) * 2;
					emitSfx(game, 'brick');
					if (Math.abs(hitBrick.dx) > Math.abs(hitBrick.dy)) {
						ball.vx = (hitBrick.dx >= 0 ? 1 : -1) * Math.abs(ball.vx);
					} else {
						ball.vy = (hitBrick.dy >= 0 ? 1 : -1) * Math.abs(ball.vy);
					}
				}
				if (ball.y - ball.r > m.H) {
					game.lives -= 1;
					emitSfx(game, 'lose');
					game.paused = false;
					if (game.lives <= 0) {
						game.lives = 0;
						game.phase = 'over';
						game.paused = true;
						game.ball.vx = 0;
						game.ball.vy = 0;
						emitSfx(game, 'over');
						return;
					}
					game.phase = 'ready';
					game.ball.vx = 0;
					game.ball.vy = 0;
					resetBreakoutBall(game);
					return;
				}
			}
			if (game.bricks.length > 0 && game.bricks.every((brick) => !brick.alive)) {
				game.level += 1;
				game.score += 50;
				game.phase = 'ready';
				game.paused = false;
				emitSfx(game, 'level');
				game.ball.vx = 0;
				game.ball.vy = 0;
				buildBreakoutBricks(game);
				layoutBreakout(game, game.W, game.H);
				resetBreakoutBall(game);
			}
		}

		function drawBreakout(ctx, game, palette) {
			const m = breakoutMetrics(game);
			ctx.clearRect(0, 0, m.W, m.H);
			const rowAlphas = [0.16, 0.38, 0.66];
			for (let i = 0; i < game.bricks.length; i += 1) {
				const brick = game.bricks[i];
				if (!brick.alive) continue;
				const rect = brickRect(brick, m);
				const tint = brick.tint === undefined ? brick.row : brick.tint;
				ctx.fillStyle = palette.brand;
				ctx.globalAlpha = rowAlphas[tint % rowAlphas.length];
				roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3.5);
				ctx.fill();
				ctx.globalAlpha = 1;
			}
			ctx.fillStyle = palette.brand;
			ctx.globalAlpha = 0.94;
			roundRect(ctx, game.paddle.x - m.paddleW / 2, m.paddleY, m.paddleW, m.paddleH, m.paddleH / 2);
			ctx.fill();
			ctx.globalAlpha = 1;
			ctx.save();
			ctx.fillStyle = palette.brand;
			ctx.shadowColor = palette.brand;
			ctx.shadowBlur = 7;
			ctx.beginPath();
			ctx.arc(game.ball.x, game.ball.y, game.ball.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}

		/* ------------------------------------------------------------------ */
		/* Snake                                                               */
		/* ------------------------------------------------------------------ */

		function createSnake() {
			const game = {
				kind: 'snake',
				phase: 'ready',
				paused: false,
				score: 0,
				W: 320,
				H: STAGE_H,
				cell: 12,
				cols: 1,
				rows: 1,
				snake: [],
				dir: { x: 1, y: 0 },
				pending: { x: 1, y: 0 },
				food: { x: 0, y: 0 },
				tick: 0,
				interval: 0.17,
				sfx: [],
			};
			layoutSnake(game, 320, STAGE_H);
			return game;
		}

		function snakeGrid(game) {
			const cell = game.cell;
			const cols = Math.max(8, Math.floor((game.W - 2) / cell));
			const rows = Math.max(5, Math.floor((game.H - 2) / cell));
			return { cell: cell, cols: cols, rows: rows };
		}

		function spawnFood(game) {
			const occupied = new Set(game.snake.map((part) => part.x + ',' + part.y));
			for (let tries = 0; tries < 200; tries += 1) {
				const x = randomInt(game.cols);
				const y = randomInt(game.rows);
				if (!occupied.has(x + ',' + y)) {
					game.food = { x: x, y: y };
					return;
				}
			}
			game.food = { x: 0, y: 0 };
		}

		function layoutSnake(game, width, height) {
			if (width > 0) game.W = width;
			if (height > 0) game.H = height;
			const grid = snakeGrid(game);
			if (grid.cols !== game.cols || grid.rows !== game.rows || game.snake.length === 0) {
				game.cols = grid.cols;
				game.rows = grid.rows;
				resetSnake(game);
			}
		}

		function resetSnake(game) {
			const centerX = Math.floor(game.cols / 2);
			const centerY = Math.floor(game.rows / 2);
			game.score = 0;
			game.paused = false;
			game.phase = 'ready';
			game.tick = 0;
			game.interval = 0.17;
			game.dir = { x: 1, y: 0 };
			game.pending = { x: 1, y: 0 };
			game.snake = [
				{ x: centerX, y: centerY },
				{ x: centerX - 1, y: centerY },
				{ x: centerX - 2, y: centerY },
			];
			spawnFood(game);
		}

		function stepSnake(game, dt) {
			if (game.phase !== 'playing' || game.paused) return;
			game.tick += dt;
			while (game.tick >= game.interval) {
				game.tick -= game.interval;
				game.dir = game.pending;
				const head = game.snake[0];
				const next = { x: head.x + game.dir.x, y: head.y + game.dir.y };
				if (next.x < 0 || next.y < 0 || next.x >= game.cols || next.y >= game.rows) {
					game.phase = 'over';
					game.paused = true;
					emitSfx(game, 'die');
					return;
				}
				if (game.snake.some((part) => part.x === next.x && part.y === next.y)) {
					game.phase = 'over';
					game.paused = true;
					emitSfx(game, 'die');
					return;
				}
				game.snake.unshift(next);
				if (next.x === game.food.x && next.y === game.food.y) {
					game.score += 10;
					emitSfx(game, 'eat');
					game.interval = Math.max(0.085, 0.17 - game.score * 0.0018);
					spawnFood(game);
				} else {
					game.snake.pop();
				}
			}
		}

		function drawSnake(ctx, game, palette) {
			ctx.clearRect(0, 0, game.W, game.H);
			const cell = game.cell;
			const offsetX = Math.round((game.W - game.cols * cell) / 2);
			const offsetY = Math.round((game.H - game.rows * cell) / 2);
			ctx.strokeStyle = palette.border;
			ctx.globalAlpha = 0.18;
			for (let x = 0; x <= game.cols; x += 1) {
				ctx.beginPath();
				ctx.moveTo(offsetX + x * cell, offsetY);
				ctx.lineTo(offsetX + x * cell, offsetY + game.rows * cell);
				ctx.stroke();
			}
			for (let y = 0; y <= game.rows; y += 1) {
				ctx.beginPath();
				ctx.moveTo(offsetX, offsetY + y * cell);
				ctx.lineTo(offsetX + game.cols * cell, offsetY + y * cell);
				ctx.stroke();
			}
			ctx.globalAlpha = 1;
			ctx.save();
			ctx.strokeStyle = palette.brand;
			ctx.lineWidth = 1.5;
			ctx.globalAlpha = 0.85;
			ctx.beginPath();
			ctx.arc(offsetX + (game.food.x + 0.5) * cell, offsetY + (game.food.y + 0.5) * cell, cell * 0.28, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
			for (let i = game.snake.length - 1; i >= 0; i -= 1) {
				const part = game.snake[i];
				ctx.fillStyle = palette.brand;
				ctx.globalAlpha = i === 0 ? 0.95 : 0.5;
				roundRect(ctx, offsetX + part.x * cell + 1.5, offsetY + part.y * cell + 1.5, cell - 3, cell - 3, 3.2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		}

		/* ------------------------------------------------------------------ */
		/* Reaction                                                            */
		/* ------------------------------------------------------------------ */

		function createReaction() {
			const game = {
				kind: 'reaction',
				phase: 'ready',
				paused: false,
				score: 0,
				hits: 0,
				misses: 0,
				totalMs: 0,
				rounds: 12,
				target: null,
				previous: null,
				shownAt: 0,
				deadline: 0,
				nextAt: 0,
				hover: null,
				W: 320,
				H: STAGE_H,
				cells: [],
				sfx: [],
			};
			layoutReaction(game, 320, STAGE_H);
			return game;
		}

		function layoutReaction(game, width, height) {
			if (width > 0) game.W = width;
			if (height > 0) game.H = height;
			const margin = 6;
			const gap = 8;
			const cellW = (game.W - margin * 2 - gap * 2) / 3;
			const cellH = (game.H - margin * 2 - gap * 2) / 3;
			const cells = [];
			for (let row = 0; row < 3; row += 1) {
				for (let col = 0; col < 3; col += 1) {
					cells.push({
						x: margin + col * (cellW + gap),
						y: margin + row * (cellH + gap),
						w: cellW,
						h: cellH,
					});
				}
			}
			game.cells = cells;
		}

		function resetReaction(game) {
			game.phase = 'ready';
			game.paused = false;
			game.score = 0;
			game.hits = 0;
			game.misses = 0;
			game.totalMs = 0;
			game.target = null;
			game.previous = null;
			game.nextAt = 0;
		}

		function startReaction(game) {
			resetReaction(game);
			game.phase = 'playing';
			emitSfx(game, 'start');
			spawnReactionTarget(game);
		}

		function spawnReactionTarget(game) {
			if (game.hits + game.misses >= game.rounds) {
				game.phase = 'over';
				game.paused = true;
				game.target = null;
				return;
			}
			let index = randomInt(9);
			if (index === game.previous) index = (index + 1 + randomInt(8)) % 9;
			game.previous = index;
			game.target = index;
			const now = Date.now();
			game.shownAt = now;
			game.deadline = now + Math.max(620, 1500 - game.hits * 65);
		}

		function cellAt(game, x, y) {
			for (let i = 0; i < game.cells.length; i += 1) {
				const cell = game.cells[i];
				if (x >= cell.x && x <= cell.x + cell.w && y >= cell.y && y <= cell.y + cell.h) return i;
			}
			return null;
		}

		function hitTarget(game, index) {
			if (game.target === null || game.target !== index) return;
			const elapsed = Date.now() - game.shownAt;
			game.hits += 1;
			game.totalMs += elapsed;
			game.score += 100 + Math.max(0, Math.round((game.deadline - Date.now()) / 10));
			game.target = null;
			emitSfx(game, 'hit');
			if (game.hits + game.misses >= game.rounds) {
				game.phase = 'over';
				game.paused = true;
				emitSfx(game, 'done');
				return;
			}
			game.nextAt = Date.now() + 240;
		}

		function missTarget(game) {
			if (game.target === null) return;
			game.misses += 1;
			game.target = null;
			emitSfx(game, 'miss');
			if (game.hits + game.misses >= game.rounds) {
				game.phase = 'over';
				game.paused = true;
				emitSfx(game, 'done');
				return;
			}
			game.nextAt = Date.now() + 420;
		}

		function hitCell(game, index) {
			if (index === game.target) hitTarget(game, index);
			else missTarget(game);
		}

		function stepReaction(game, dt) {
			if (game.phase !== 'playing' || game.paused) return;
			const now = Date.now();
			if (game.target !== null && now > game.deadline) {
				missTarget(game);
				return;
			}
			if (game.target === null && game.nextAt > 0 && now >= game.nextAt) {
				game.nextAt = 0;
				spawnReactionTarget(game);
			}
		}

		function drawReaction(ctx, game, palette) {
			ctx.clearRect(0, 0, game.W, game.H);
			for (let i = 0; i < game.cells.length; i += 1) {
				const cell = game.cells[i];
				const active = i === game.target;
				ctx.fillStyle = active ? palette.brand : palette.layer;
				ctx.globalAlpha = active ? 1 : 0.5;
				roundRect(ctx, cell.x, cell.y, cell.w, cell.h, 10);
				ctx.fill();
				ctx.globalAlpha = 1;
				ctx.strokeStyle = palette.border;
				ctx.globalAlpha = active ? 0 : 0.5;
				roundRect(ctx, cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1, 10);
				ctx.stroke();
				ctx.globalAlpha = 1;
				ctx.fillStyle = active ? palette.onBrand : palette.text;
				ctx.font = '500 10.5px -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.globalAlpha = active ? 0.95 : 0.45;
				ctx.fillText(String(i + 1), cell.x + cell.w / 2, cell.y + cell.h / 2);
				ctx.globalAlpha = 1;
			}
		}

		/* ------------------------------------------------------------------ */
		/* Drawing helpers / palette                                           */
		/* ------------------------------------------------------------------ */

		function readPalette(element) {
			const fallback = {
				brand: '#2f7fbf',
				onBrand: '#ffffff',
				success: '#2f9e6e',
				warn: '#c08a2a',
				text: '#8a8a8a',
				border: '#d4d4d4',
				layer: '#f2f2f2',
			};
			if (!element || typeof window === 'undefined' || !window.getComputedStyle) return fallback;
			const style = window.getComputedStyle(element);
			const read = (name, back) => {
				const value = style.getPropertyValue(name).trim();
				return value || back;
			};
			return {
				brand: read('--dsw-alias-brand-primary', fallback.brand),
				onBrand: read('--dsw-alias-label-primary-inverted', fallback.onBrand),
				success: read('--dsw-alias-state-success-primary', fallback.success),
				warn: read('--dsw-alias-state-warn-primary', fallback.warn),
				text: read('--dsw-alias-label-secondary', fallback.text),
				border: read('--dsw-alias-border-l2', fallback.border),
				layer: read('--dsw-alias-bg-layer-2', fallback.layer),
			};
		}

		function roundRect(ctx, x, y, w, h, r) {
			const radius = Math.min(r, w / 2, h / 2);
			ctx.beginPath();
			ctx.moveTo(x + radius, y);
			ctx.arcTo(x + w, y, x + w, y + h, radius);
			ctx.arcTo(x + w, y + h, x, y + h, radius);
			ctx.arcTo(x, y + h, x, y, radius);
			ctx.arcTo(x, y, x + w, y, radius);
			ctx.closePath();
		}

		/* ------------------------------------------------------------------ */
		/* Localization helper (falls back to English if the locale is absent) */
		/* ------------------------------------------------------------------ */

		function tr(t, key, vars) {
			let value;
			if (typeof t === 'function') {
				try {
					value = t(key, vars);
				} catch (error) {
					value = undefined;
				}
			}
			if (typeof value !== 'string' || value === key) value = EN[key];
			if (typeof value !== 'string') return key;
			if (vars) {
				value = value.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])));
			}
			return value;
		}

		/* ------------------------------------------------------------------ */
		/* Thinking-strip adapter                                              */
		/*                                                                     */
		/* The public slot API exposes the reasoning body only while the Think */
		/* row is expanded. The arcade should sit directly below the live     */
		/* "thinking / deep-diving" module in the chat flow, so this adapter  */
		/* owns its own DOM node next to that module: it renders the same     */
		/* engines with the plugin's own panel styles, follows the live       */
		/* module when the next step starts, and fades out when the module     */
		/* closes. It never edits the host's rendered text.                   */
		/* ------------------------------------------------------------------ */

		const TAB_KEYS = { breakout: 'tabBreakout', snake: 'tabSnake', reaction: 'tabReaction' };
		const METRIC_KEYS = { score: 'score', level: 'level', lives: 'lives', length: 'length', hits: 'hits', avg: 'avg', misses: 'misses' };

		/* Central adapter contract. DSH markup is not a public extension API, so keep
		 * every selector here and warn (once) instead of silently rendering nothing
		 * when a DSH upgrade changes it. */
		const ADAPTER = {
			flow: '[data-slot="conversation.chat.flow"], .V4vHZW_column, .V4vHZW_body, .xMeOpW_body',
			running: '[class*="running"]',
			activity: 'button[data-process-activity]',
			shimmer: '[data-shimmer]',
			busy: '[aria-busy="true"]',
			thinking: '[class*="shimmer"], [class*="thinking"]',
			turnProcess: '[data-chat-flow-kind="turn-process"]',
			thinkRow: '[data-variant="think"][data-state="running"]',
			session: '[data-session-id], [data-conversation-id], [data-session], [data-conversation]',
			liveText: /深度求索|Deep diving|思考中|Thinking/i,
		};
		let adapterMisses = 0;
		let adapterWarned = false;

		function adapterHealth(via) {
			adapterMisses = 0;
			if (typeof window !== 'undefined') {
				window.__thinkGameAdapter = { via: via, at: Date.now() };
			}
		}

		function warnAdapterOnce(detail) {
			if (adapterWarned) return;
			adapterWarned = true;
			if (typeof window !== 'undefined') {
				window.__thinkGameAdapter = { via: null, warning: detail, at: Date.now() };
			}
			try {
				console.warn('[dsh-think-game] live thinking module not found; DSH markup may have changed.', detail);
			} catch (error) { /* ignore */ }
		}

		function randomKind(lastKind) {
			const pool = KINDS.filter(function (kind) { return kind !== lastKind; });
			const source = pool.length > 0 ? pool : KINDS;
			return source[Math.floor(Math.random() * source.length)];
		}

		/* Continue-entry predicate: true when a run is worth resuming. */
		function hasProgress(current) {
			if (current === null || current === undefined) return false;
			if (current.phase === 'over') return false;
			if (current.kind === 'breakout') return current.score > 0 || current.level > 1 || current.lives < 3;
			if (current.kind === 'snake') return current.score > 0;
			return current.hits > 0;
		}

		function domEl(tag, className, text) {
			const node = document.createElement(tag);
			if (className) node.className = className;
			if (text !== undefined) node.textContent = text;
			return node;
		}

		function isScrollHost(node) {
			return node.matches(ADAPTER.flow);
		}

		/* Find the flow-level box whose nextSibling our panel should become. */
		function flowRoot(element) {
			let node = element;
			while (node !== null && node.parentElement !== null) {
				const parent = node.parentElement;
				if (isScrollHost(parent)) return { root: node, parent: parent };
				node = parent;
			}
			const parent = element.parentElement;
			return parent === null ? null : { root: element, parent: parent };
		}

		/* The live thinking module: the frame-level "深度求索中 · 用时 …" running
		 * status row first (that is what the reader sees while thinking), then a
		 * live process-group header, then a running Think row for other modes. */
		function findLiveModule() {
			/* 1) The bottom running-status line ("深度求索中，用时 36秒 ···"). */
			const runningCandidates = document.querySelectorAll(ADAPTER.running);
			for (let i = runningCandidates.length - 1; i >= 0; i -= 1) {
				const element = runningCandidates[i];
				if (!element.isConnected) continue;
				const parent = element.parentElement;
				if (parent === null || !parent.matches(ADAPTER.flow)) continue;
				if (!ADAPTER.liveText.test(element.textContent || '')) continue;
				adapterHealth('running-status');
				return { root: element, parent: parent };
			}
			/* 2) A live process-group header (its title shimmers while running). */
			const headers = document.querySelectorAll(ADAPTER.activity);
			for (let i = headers.length - 1; i >= 0; i -= 1) {
				const header = headers[i];
				if (!header.isConnected || header.querySelector(ADAPTER.shimmer) === null) continue;
				const flow = flowRoot(header);
				if (flow !== null) {
					adapterHealth('process-header');
					return flow;
				}
			}
			/* 3) A live turn-process box or a running, collapsed Think row. */
			const processes = document.querySelectorAll(ADAPTER.turnProcess);
			for (let i = processes.length - 1; i >= 0; i -= 1) {
				const box = processes[i];
				if (!box.isConnected) continue;
				const live = box.querySelector(ADAPTER.shimmer) !== null;
				if (!live && !ADAPTER.liveText.test(box.textContent || '')) continue;
				const flow = flowRoot(box);
				if (flow !== null) {
					adapterHealth('turn-process');
					return flow;
				}
			}
			const rows = document.querySelectorAll(ADAPTER.thinkRow);
			for (let i = rows.length - 1; i >= 0; i -= 1) {
				const row = rows[i];
				if (!row.isConnected || row.hasAttribute('data-expanded')) continue;
				const flow = flowRoot(row);
				if (flow !== null) {
					adapterHealth('think-row');
					return flow;
				}
			}
			/* 4) Last resort: any busy/shimmer/thinking marker that lives inside a
			 * chat flow. This keeps the arcade alive through minor markup changes;
			 * adapterHealth records that a fallback was used. */
			const loose = document.querySelectorAll(ADAPTER.busy + ', ' + ADAPTER.thinking);
			for (let i = loose.length - 1; i >= 0; i -= 1) {
				const element = loose[i];
				if (!element.isConnected) continue;
				const flow = flowRoot(element);
				if (flow !== null) {
					adapterHealth('fallback');
					return flow;
				}
			}
			/* Nothing matched. Warn once only when the page still shows running
			 * markers, which is the signal that a selector broke. */
			adapterMisses += 1;
			const marker = document.querySelector(ADAPTER.busy + ', ' + ADAPTER.shimmer + ', ' + ADAPTER.running);
			if (marker !== null && adapterMisses >= 8) {
				warnAdapterOnce('running marker present but unmatched: ' + marker.tagName.toLowerCase() + ' ' + String(marker.className || ''));
			}
			return null;
		}

		/* Session identity: a new conversation normally means a new flow container
		 * (or a new [data-session-id] ancestor). Used to reset game state instead of
		 * carrying the previous session's score into the next one. */
		function liveSessionKey(live) {
			const anchor = live.parent.closest(ADAPTER.session);
			if (anchor !== null) {
				return anchor.getAttribute('data-session-id') || anchor.getAttribute('data-conversation-id') || anchor.getAttribute('data-session') || anchor.getAttribute('data-conversation') || anchor;
			}
			return live.parent;
		}

		function buildStripPanel(t, initialKind, sfx) {
			const panel = domEl('div', 'dtg-panel dtg-strip');
			panel.setAttribute('data-game', initialKind);
			panel.setAttribute('role', 'group');
			panel.setAttribute('aria-label', tr(t, 'title'));
			panel.setAttribute('data-text-interaction-exclude', '');
			panel.setAttribute('data-tg-strip', '');
			const dot = domEl('span', 'dtg-dot');
			dot.setAttribute('data-live', 'false');
			const name = domEl('span', 'dtg-name', tr(t, 'title'));
			const metrics = domEl('span', 'dtg-metrics');
			const pause = domEl('button', 'dtg-icon-btn');
			pause.type = 'button';
			pause.innerHTML = ICONS.play;
			pause.setAttribute('aria-label', tr(t, 'start'));
			const restart = domEl('button', 'dtg-icon-btn');
			restart.type = 'button';
			restart.innerHTML = ICONS.restart;
			restart.setAttribute('aria-label', tr(t, 'restart'));
			const sound = sfx === undefined || sfx === null ? null : domEl('button', 'dtg-icon-btn');
			if (sound !== null) {
				sound.type = 'button';
				sound.innerHTML = sfx.isMuted() ? ICONS.soundOff : ICONS.sound;
				sound.setAttribute('aria-label', tr(t, sfx.isMuted() ? 'soundUnmute' : 'soundMute'));
				sound.setAttribute('aria-pressed', sfx.isMuted() ? 'true' : 'false');
			}
			const close = domEl('button', 'dtg-icon-btn');
			close.type = 'button';
			close.innerHTML = ICONS.close;
			close.setAttribute('aria-label', tr(t, 'hideGame'));
			close.setAttribute('aria-haspopup', 'menu');
			close.setAttribute('aria-expanded', 'false');
			close.title = tr(t, 'hideGame');
			const hideMenu = domEl('div', 'dtg-menu dtg-hide-menu');
			hideMenu.setAttribute('role', 'menu');
			hideMenu.id = 'dtg-hide-menu-' + Math.random().toString(36).slice(2, 9);
			hideMenu.hidden = true;
			close.setAttribute('aria-controls', hideMenu.id);
			const hideOptions = [['turn', 'hideTurn'], ['30', 'hide30'], ['today', 'hideToday']];
			for (const option of hideOptions) {
				const item = domEl('button', 'dtg-menu-item');
				item.type = 'button';
				item.setAttribute('role', 'menuitem');
				item.dataset.hide = option[0];
				item.textContent = tr(t, option[1]);
				hideMenu.append(item);
			}
			const closeWrap = domEl('span', 'dtg-close-wrap');
			closeWrap.append(close, hideMenu);
			const actions = domEl('span', 'dtg-actions');
			if (sound !== null) actions.append(sound, pause, restart, closeWrap);
			else actions.append(pause, restart, closeWrap);
			const head = domEl('div', 'dtg-head');
			head.append(dot, name, metrics, actions);

			const stage = domEl('div', 'dtg-stage');
			stage.tabIndex = 0;
			stage.setAttribute('role', 'application');
			stage.setAttribute('aria-label', tr(t, 'aria.breakout'));
			const canvas = domEl('canvas', 'dtg-canvas');
			canvas.setAttribute('aria-hidden', 'true');
			const pill = domEl('span', 'dtg-pill');
			const overlay = domEl('div', 'dtg-overlay');
			overlay.append(pill);
			stage.append(canvas, overlay);

			const challengeName = domEl('span', 'dtg-challenge-name', tr(t, TAB_KEYS[initialKind]));
			const switchBtn = domEl('button', 'dtg-switch-btn');
			switchBtn.type = 'button';
			switchBtn.setAttribute('aria-haspopup', 'menu');
			switchBtn.setAttribute('aria-expanded', 'false');
			switchBtn.setAttribute('aria-label', tr(t, 'switchGame'));
			const chevron = domEl('span', 'dtg-chevron');
			chevron.innerHTML = ICONS.chevron;
			switchBtn.append(challengeName, chevron);
			const menu = domEl('div', 'dtg-menu');
			menu.setAttribute('role', 'menu');
			menu.id = 'dtg-menu-' + Math.random().toString(36).slice(2, 9);
			menu.hidden = true;
			switchBtn.setAttribute('aria-controls', menu.id);
			const menuModes = [{ value: '', key: 'randomGame' }].concat(KINDS.map(function (item) {
				return { value: item, key: TAB_KEYS[item] };
			}));
			const menuItems = [];
			const bestEls = {};
			for (const mode of menuModes) {
				const option = domEl('button', 'dtg-menu-item');
				option.type = 'button';
				option.setAttribute('role', 'menuitemradio');
				option.setAttribute('aria-checked', 'false');
				option.dataset.kind = mode.value;
				const label = domEl('span', '', tr(t, mode.key));
				const check = domEl('span', 'dtg-check');
				check.innerHTML = ICONS.check;
				option.append(label);
				if (mode.value !== '') {
					const best = domEl('span', 'dtg-best');
					option.append(best);
					bestEls[mode.value] = best;
				}
				option.append(check);
				menu.append(option);
				menuItems.push(option);
			}
			const switchWrap = domEl('span', 'dtg-switch');
			switchWrap.append(switchBtn, menu);
			const challengeLabel = domEl('span', 'dtg-challenge-label', tr(t, 'challenge'));
			const challenge = domEl('span', 'dtg-challenge');
			challenge.append(challengeLabel, switchWrap);
			const foot = domEl('div', 'dtg-foot');
			const hint = domEl('div', 'dtg-hint');
			hint.id = 'dtg-hint-' + Math.random().toString(36).slice(2, 9);
			stage.setAttribute('aria-describedby', hint.id);
			foot.append(challenge, hint);
			const hiddenText = domEl('span', 'dtg-hidden-text');
			const restore = domEl('button', 'dtg-restore', tr(t, 'restore'));
			restore.type = 'button';
			const hiddenBar = domEl('div', 'dtg-hidden-bar');
			hiddenBar.append(hiddenText, restore);

			panel.append(hiddenBar, head, stage, foot);
			return {
				panel: panel,
				dot: dot,
				metrics: metrics,
				pause: pause,
				restart: restart,
				sound: sound,
				close: close,
				hideMenu: hideMenu,
				hiddenText: hiddenText,
				restore: restore,
				stage: stage,
				canvas: canvas,
				ctx2d: canvas.getContext('2d'),
				overlay: overlay,
				pill: pill,
				challengeName: challengeName,
				challengeLabel: challengeLabel,
				switchBtn: switchBtn,
				menu: menu,
				menuItems: menuItems,
				bestEls: bestEls,
				hint: hint,
				t: t,
			};
		}

		function createStripController(t, generation) {
			const sfx = createSfx();
			let ui = null;
			let host = null;
			let kind = 'breakout';
			let lastKind = null;
			let games = {};
			let raf = 0;
			let lastTs = 0;
			let palette = null;
			let paletteAt = 0;
			let closing = false;
			let closingTimer = 0;
			let disposed = false;
			let io = null;
			let flowKey = null;
			let suspended = false;
			let keepOpen = false;
			let detachedPanel = false;
			let suspendedTimer = 0;
			let lastRect = null;
			let turnHidden = false;
			let suppressedMissing = 0;
			let snoozeUntil = 0;
			let snoozeDay = '';
			let pinned = '';
			let best = { breakout: 0, snake: 0, reaction: 0 };
			try {
				snoozeUntil = Number(window.localStorage.getItem('dsh-think-game:snooze-until') || 0) || 0;
				snoozeDay = window.localStorage.getItem('dsh-think-game:snooze-day') || '';
				pinned = window.localStorage.getItem('dsh-think-game:pinned') || '';
				const rawBest = JSON.parse(window.localStorage.getItem('dsh-think-game:best') || '{}');
				best.breakout = Math.max(0, Number(rawBest.breakout) || 0);
				best.snake = Math.max(0, Number(rawBest.snake) || 0);
				best.reaction = Math.max(0, Number(rawBest.reaction) || 0);
			} catch (error) {
				snoozeUntil = 0;
				snoozeDay = '';
				pinned = '';
				best = { breakout: 0, snake: 0, reaction: 0 };
			}
			if (KINDS.indexOf(pinned) < 0) pinned = '';

			function setPinned(next) {
				pinned = KINDS.indexOf(next) < 0 ? '' : next;
				try { window.localStorage.setItem('dsh-think-game:pinned', pinned); } catch (error) { /* ignore */ }
			}

			function recordBest() {
				let changed = false;
				if (games.breakout !== undefined && games.breakout.score > best.breakout) {
					best.breakout = games.breakout.score;
					changed = true;
				}
				if (games.snake !== undefined && games.snake.snake.length > best.snake) {
					best.snake = games.snake.snake.length;
					changed = true;
				}
				const reaction = games.reaction;
				if (reaction !== undefined && reaction.phase === 'over' && reaction.hits > 0) {
					const avg = Math.max(1, Math.round(reaction.totalMs / reaction.hits));
					if (best.reaction === 0 || avg < best.reaction) {
						best.reaction = avg;
						changed = true;
					}
				}
				if (changed) {
					try { window.localStorage.setItem('dsh-think-game:best', JSON.stringify(best)); } catch (error) { /* ignore */ }
				}
			}

			function renderBest() {
				if (ui === null) return;
				const entries = {
					breakout: ['bestScore', best.breakout],
					snake: ['bestLength', best.snake],
					reaction: ['bestAvg', best.reaction],
				};
				for (const gameKind of Object.keys(entries)) {
					const el = ui.bestEls[gameKind];
					if (el === undefined || el === null) continue;
					const label = entries[gameKind][0];
					const value = entries[gameKind][1];
					el.textContent = value > 0 ? tr(ui.t, label, { n: value }) : '';
				}
			}

			function todayKey() {
				const now = new Date();
				return now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();
			}

			function snoozeActive() {
				if (snoozeDay !== '' && snoozeDay === todayKey()) return true;
				if (snoozeUntil > Date.now()) return true;
				return false;
			}

			function hiddenNow() {
				return turnHidden || snoozeActive();
			}

			function persistSnooze() {
				try {
					window.localStorage.setItem('dsh-think-game:snooze-until', String(snoozeUntil));
					window.localStorage.setItem('dsh-think-game:snooze-day', snoozeDay);
				} catch (error) { /* ignore */ }
			}

			function setHiddenReason(reason) {
				turnHidden = reason === 'turn';
				suppressedMissing = 0;
				if (reason === '30') {
					snoozeUntil = Date.now() + 30 * 60 * 1000;
					snoozeDay = '';
				} else if (reason === 'today') {
					snoozeUntil = 0;
					snoozeDay = todayKey();
				} else {
					snoozeUntil = 0;
					snoozeDay = '';
				}
				persistSnooze();
			}

			function startLoop() {
				if (raf === 0 && ui !== null && !disposed) {
					lastTs = 0;
					raf = requestAnimationFrame(frame);
				}
			}

			function stopLoop() {
				if (raf !== 0) {
					cancelAnimationFrame(raf);
					raf = 0;
				}
			}

			function ensureObserver() {
				if (ui === null || io !== null || typeof IntersectionObserver !== 'function') return;
				io = new IntersectionObserver(function (entries) {
					const entry = entries[0];
					if (entry === undefined) return;
					if (entry.isIntersecting) startLoop();
					else stopLoop();
				}, { threshold: 0 });
				io.observe(ui.panel);
			}

			function collapsePanel() {
				if (ui === null) return;
				ui.panel.setAttribute('data-snoozed', 'true');
				ui.hiddenText.textContent = tr(ui.t, turnHidden ? 'hiddenTurn' : snoozeDay !== '' ? 'hiddenToday' : 'hidden30');
				game().paused = true;
				updateUi();
				stopLoop();
				if (io !== null) {
					io.disconnect();
					io = null;
				}
			}

			function expandPanel() {
				if (ui === null) return;
				turnHidden = false;
				suppressedMissing = 0;
				snoozeUntil = 0;
				snoozeDay = '';
				persistSnooze();
				ui.panel.removeAttribute('data-snoozed');
				lastTs = 0;
				ensureObserver();
				startLoop();
				updateUi();
			}

			function hideFor(reason) {
				if (ui === null) return;
				if (keepOpen || suspended) {
					destroy();
					return;
				}
				setHiddenReason(reason);
				closeMenus();
				collapsePanel();
			}

			function suspendPanel() {
				if (ui === null) return;
				suspended = true;
				closing = false;
				closeMenus();
				game().paused = true;
				ui.panel.removeAttribute('data-snoozed');
				ui.panel.setAttribute('data-suspended', 'true');
				ui.restore.textContent = tr(ui.t, 'continueGame');
				ui.hiddenText.textContent = tr(ui.t, 'continueScore', { n: game().score });
				updateUi();
				stopLoop();
				if (io !== null) {
					io.disconnect();
					io = null;
				}
				if (ui.panel.parentElement === null) {
					/* The host may have replaced the whole thinking block already. Keep the
					 * continue entry visible at the last known position instead of losing it. */
					if (lastRect === null) {
						destroy();
						return;
					}
					document.body.append(ui.panel);
					ui.panel.style.position = 'fixed';
					ui.panel.style.left = lastRect.left + 'px';
					ui.panel.style.top = lastRect.top + 'px';
					ui.panel.style.zIndex = '2147483000';
					ui.panel.style.pointerEvents = 'auto';
					detachedPanel = true;
				}
				host = null;
				clearTimeout(suspendedTimer);
				suspendedTimer = setTimeout(function () {
					/* Don't leave the continue entry around forever. */
					if (suspended) destroy();
				}, 2 * 60 * 1000);
			}

			function restorePanel() {
				expandPanel();
				focusStage();
			}

			function stale() {
				return typeof window !== 'undefined' && window.__thinkGameStripGeneration !== generation;
			}

			function ensure(nextKind) {
				if (games[nextKind] === undefined) games[nextKind] = createGame(nextKind);
				return games[nextKind];
			}

			function game() {
				return ensure(kind);
			}

			function layout() {
				if (ui === null) return;
				const rect = ui.stage.getBoundingClientRect();
				const width = Math.max(180, Math.round(rect.width || 320));
				const dpr = Math.min(window.devicePixelRatio || 1, 3);
				const canvas = ui.canvas;
				if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(STAGE_H * dpr)) {
					canvas.width = Math.round(width * dpr);
					canvas.height = Math.round(STAGE_H * dpr);
					ui.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
				}
				layoutGame(game(), width, STAGE_H);
			}

			function updateUi() {
				if (ui === null) return;
				const current = game();
				const hud = hudOf(current);
				ui.panel.setAttribute('data-game', kind);
				ui.dot.setAttribute('data-live', !closing && hud.phase === 'playing' && !hud.paused ? 'true' : 'false');
				ui.metrics.textContent = '';
				for (const metric of hud.metrics) {
					const span = domEl('span', '', tr(ui.t, METRIC_KEYS[metric[0]] || metric[0], { [metric[0]]: metric[1], score: metric[1], level: metric[1], lives: metric[1], length: metric[1], hits: metric[1], ms: metric[1], misses: metric[1] }));
					ui.metrics.append(span);
				}
				const label = hud.phase === 'ready' ? 'start' : hud.paused ? 'resume' : 'pause';
				if (hud.phase === 'over') {
					/* The dedicated restart button already says 重开; hide the toggle so the
					 * header never shows two identical actions. */
					ui.pause.style.display = 'none';
				} else {
					ui.pause.style.display = '';
					ui.pause.innerHTML = hud.phase === 'playing' && !hud.paused ? ICONS.pause : ICONS.play;
					ui.pause.setAttribute('aria-label', tr(ui.t, label));
				}
				ui.restart.setAttribute('aria-label', tr(ui.t, 'restart'));
				let overlay = null;
				if (hud.phase === 'over') overlay = kind + '.over';
				else if (hud.phase === 'ready') overlay = kind + '.ready';
				else if (hud.paused) overlay = 'paused';
				if (overlay === null) ui.overlay.style.display = 'none';
				else {
					ui.overlay.style.display = '';
					ui.pill.textContent = tr(ui.t, overlay);
				}
				ui.challengeLabel.textContent = tr(ui.t, pinned === '' ? 'challenge' : 'challengePinned');
				ui.challengeName.textContent = tr(ui.t, TAB_KEYS[kind]);
				ui.switchBtn.setAttribute('aria-label', tr(ui.t, 'switchGame') + '：' + tr(ui.t, TAB_KEYS[kind]));
				if (ui.sound !== null) {
					const muted = sfx.isMuted();
					ui.sound.innerHTML = muted ? ICONS.soundOff : ICONS.sound;
					ui.sound.setAttribute('aria-label', tr(ui.t, muted ? 'soundUnmute' : 'soundMute'));
					ui.sound.setAttribute('aria-pressed', muted ? 'true' : 'false');
				}
				for (const option of ui.menuItems) option.setAttribute('aria-checked', option.dataset.kind === pinned ? 'true' : 'false');
				ui.hint.textContent = tr(ui.t, 'hint.' + kind);
				ui.stage.setAttribute('aria-label', tr(ui.t, 'aria.' + kind));
			}

			function frame(ts) {
				if (ui === null) return;
				if (stale()) { destroy(); return; }
				if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
					stopLoop();
					return;
				}
				const current = game();
				if (Array.isArray(current.sfx)) {
					while (current.sfx.length > 0) sfx.play(current.sfx.shift());
				}
				const playing = !closing && current.phase === 'playing' && !current.paused;
				const last = lastTs;
				lastTs = ts;
				if (playing) {
					const dt = last > 0 ? Math.min(0.033, (ts - last) / 1000) : 0;
					stepGame(current, dt);
				}
				paint(current, ts);
				if (!closing && current.phase === 'playing' && !current.paused) {
					raf = requestAnimationFrame(frame);
				} else {
					/* Idle states (ready / paused / over) only need one painted frame. */
					raf = 0;
				}
			}

			function paint(current, ts) {
				if (ui === null) return;
				if (palette === null || ts - paletteAt > 500) {
					palette = readPalette(ui.stage);
					paletteAt = ts;
				}
				layout();
				const ctx = ui.ctx2d;
				ctx.save();
				ctx.setTransform(1, 0, 0, 1, 0, 0);
				ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);
				ctx.restore();
				drawGame(ctx, current, palette);
				updateUi();
				try {
					const rect = ui.panel.getBoundingClientRect();
					if (rect.width > 1 && rect.height > 1) lastRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
				} catch (error) { /* ignore */ }
			}

			function kick() {
				if (ui === null || hiddenNow()) return;
				startLoop();
			}

			function closeMenus() {
				if (ui === null) return;
				ui.menu.hidden = true;
				ui.hideMenu.hidden = true;
				ui.switchBtn.setAttribute('aria-expanded', 'false');
				ui.close.setAttribute('aria-expanded', 'false');
			}

			function openMenu() {
				if (ui === null) return;
				closeMenus();
				recordBest();
				renderBest();
				ui.menu.hidden = false;
				ui.switchBtn.setAttribute('aria-expanded', 'true');
				const current = ui.menuItems.find(function (item) { return item.dataset.kind === kind; });
				if (current !== undefined) current.focus();
			}

			function openHideMenu() {
				if (ui === null) return;
				closeMenus();
				ui.hideMenu.hidden = false;
				ui.close.setAttribute('aria-expanded', 'true');
				const first = ui.hideMenu.querySelector('.dtg-menu-item');
				if (first !== null) first.focus();
			}

			function choose(nextKind) {
				if (ui === null) return;
				if (nextKind === pinned) { closeMenus(); return; }
				setPinned(nextKind);
				closeMenus();
				if (pinned === '') {
					kind = randomKind(lastKind);
				} else {
					kind = pinned;
				}
				lastKind = kind;
				ensure(kind);
				layout();
				updateUi();
				kick();
				focusStage();
			}

			function focusStage() {
				if (ui === null) return;
				try { ui.stage.focus({ preventScroll: true }); } catch (error) { ui.stage.focus(); }
			}

			function isEditable(node) {
				if (node === null || node === undefined || typeof node !== 'object') return false;
				const tag = String(node.tagName || '').toUpperCase();
				if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
				return node.isContentEditable === true || node.getAttribute && node.getAttribute('contenteditable') === 'true';
			}

			function pauseForFocus() {
				if (ui === null || closing) return;
				const current = game();
				if (current.phase === 'playing' && !current.paused) {
					current.paused = true;
					updateUi();
				}
			}

			function bindInput() {
				ui.panel.addEventListener('pointerdown', function (event) { event.stopPropagation(); sfx.unlock(); });
				ui.stage.addEventListener('keydown', function (event) {
					if (closing) return;
					sfx.unlock();
					const handled = keyDown(game(), event.key);
					if (handled) event.preventDefault();
					updateUi();
					kick();
				});
				ui.stage.addEventListener('keyup', function (event) {
					if (closing) return;
					keyUp(game(), event.key);
				});
				ui.stage.addEventListener('pointerdown', function (event) {
					event.stopPropagation();
					focusStage();
					sfx.unlock();
					if (closing) return;
					const rect = ui.stage.getBoundingClientRect();
					pointerDown(game(), event.clientX - rect.left, event.clientY - rect.top);
					updateUi();
					kick();
				});
				ui.stage.addEventListener('pointermove', function (event) {
					if (closing) return;
					const rect = ui.stage.getBoundingClientRect();
					pointerMove(game(), event.clientX - rect.left, event.clientY - rect.top);
				});
				ui.stage.addEventListener('blur', function () {
					if (closing) return;
					const current = game();
					if (current.phase === 'playing' && !current.paused) {
						current.paused = true;
						updateUi();
					}
				});
				ui.pause.addEventListener('click', function () {
					if (closing) return;
					togglePause(game());
					updateUi();
					kick();
					focusStage();
				});
				ui.restart.addEventListener('click', function () {
					if (closing) return;
					resetGame(game());
					updateUi();
					kick();
					focusStage();
				});
				if (ui.sound !== null) {
					ui.sound.addEventListener('click', function (event) {
						event.stopPropagation();
						if (closing) return;
						const nextMuted = !sfx.isMuted();
						sfx.setMuted(nextMuted);
						updateUi();
						if (!nextMuted) {
							sfx.unlock();
							sfx.play('start');
						}
					});
				}
				ui.close.addEventListener('click', function (event) {
					event.stopPropagation();
					if (closing) return;
					if (ui.hideMenu.hidden) openHideMenu();
					else closeMenus();
				});
				for (const item of ui.hideMenu.querySelectorAll('.dtg-menu-item')) {
					item.addEventListener('click', function (event) {
						event.stopPropagation();
						if (closing) return;
						hideFor(item.dataset.hide);
					});
				}
				ui.restore.addEventListener('click', function (event) {
					event.stopPropagation();
					if (closing) return;
					if (ui.panel.hasAttribute('data-suspended')) {
						suspended = false;
						keepOpen = true;
						clearTimeout(suspendedTimer);
						suspendedTimer = 0;
						ui.panel.removeAttribute('data-suspended');
						if (detachedPanel && lastRect !== null) ui.panel.style.width = lastRect.width + 'px';
						ui.restore.textContent = tr(ui.t, 'restore');
						if (game().phase === 'playing') game().paused = false;
						expandPanel();
						return;
					}
					restorePanel();
				});
				ui.switchBtn.addEventListener('click', function (event) {
					event.stopPropagation();
					if (ui.menu.hidden) openMenu();
					else closeMenus();
				});
				for (const option of ui.menuItems) {
					option.addEventListener('click', function (event) {
						event.stopPropagation();
						choose(option.dataset.kind);
					});
				}
				ui.menu.addEventListener('keydown', function (event) {
					const count = ui.menuItems.length;
					const index = ui.menuItems.indexOf(document.activeElement);
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						event.preventDefault();
						const delta = event.key === 'ArrowDown' ? 1 : -1;
						const next = (index + delta + count) % count;
						ui.menuItems[next].focus();
					} else if (event.key === 'Home' || event.key === 'End') {
						event.preventDefault();
						ui.menuItems[event.key === 'Home' ? 0 : count - 1].focus();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						closeMenus();
						ui.switchBtn.focus();
					}
				});
				ui.panel.addEventListener('keydown', function (event) {
					if (event.key === 'Escape') closeMenus();
				});
				ui.hideMenu.addEventListener('keydown', function (event) {
					const items = ui.hideMenu.querySelectorAll('.dtg-menu-item');
					const index = Array.prototype.indexOf.call(items, document.activeElement);
					if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
						event.preventDefault();
						const delta = event.key === 'ArrowDown' ? 1 : -1;
						items[(index + delta + items.length) % items.length].focus();
					} else if (event.key === 'Escape') {
						event.preventDefault();
						closeMenus();
						ui.close.focus();
					}
				});
				const onDocumentPointer = function (event) {
					if (ui === null) return;
					if (ui.menu.hidden && ui.hideMenu.hidden) return;
					if (ui.panel.contains(event.target)) return;
					closeMenus();
				};
				const onDocumentKey = function (event) {
					if (event.key === 'Escape') closeMenus();
				};
				const onVisibility = function () {
					if (document.visibilityState === 'hidden') {
						pauseForFocus();
						stopLoop();
					} else {
						startLoop();
					}
				};
				const onFocusIn = function (event) {
					if (isEditable(event.target)) pauseForFocus();
				};
				const onWindowBlur = function () {
					pauseForFocus();
				};
				document.addEventListener('pointerdown', onDocumentPointer, true);
				document.addEventListener('keydown', onDocumentKey);
				document.addEventListener('visibilitychange', onVisibility);
				document.addEventListener('focusin', onFocusIn);
				window.addEventListener('blur', onWindowBlur);
				ui.removeDocumentListeners = function () {
					document.removeEventListener('pointerdown', onDocumentPointer, true);
					document.removeEventListener('keydown', onDocumentKey);
					document.removeEventListener('visibilitychange', onVisibility);
					document.removeEventListener('focusin', onFocusIn);
					window.removeEventListener('blur', onWindowBlur);
				};
			}

			function enforceSingle() {
				/* Remove every arcade node that is not the current controller's panel:
				 * left-over panels from earlier hot reloads, and the old body-slot
				 * panels from the previous plugin generation. */
				for (const strip of document.querySelectorAll('.dtg-strip')) {
					if (strip !== (ui && ui.panel)) strip.remove();
				}
				for (const stale of document.querySelectorAll('.dtg-panel:not(.dtg-strip)')) stale.remove();
				if (ui === null) return;
				if ((suspended || keepOpen) && ui.panel.parentElement === document.body) return;
				if (ui.panel.parentElement === null || ui.panel.closest('[data-slot="conversation.chat.flow"]') === null) {
					ui.panel.remove();
				}
			}

			function resetForNewSession() {
				if (ui === null) return;
				closeMenus();
				recordBest();
				games = {};
				kind = pinned !== '' ? pinned : randomKind(lastKind);
				lastKind = kind;
				ui.menuItems.forEach(function (option) {
					option.setAttribute('aria-checked', option.dataset.kind === pinned ? 'true' : 'false');
				});
				layout();
				updateUi();
				kick();
			}

			function mount(live) {
				if (ui === null) {
					/* Random by default; a pinned game is kept across sessions until the
					 * user picks Random again from the challenge menu. */
					kind = pinned !== '' ? pinned : randomKind(lastKind);
					lastKind = kind;
					games = {};
					flowKey = liveSessionKey(live);
					ui = buildStripPanel(t, kind, sfx);
					bindInput();
				}
				lastRect = null;
				/* Take visual ownership: any older generation's strip is hidden by CSS. */
				ui.panel.setAttribute('data-tg-active', '');
				enforceSingle();
				host = live;
				closing = false;
				clearTimeout(closingTimer);
				ui.panel.setAttribute('data-closing', 'false');
				live.parent.insertBefore(ui.panel, live.root.nextSibling);
				lastTs = 0;
				palette = null;
				layout();
				updateUi();
				renderBest();
				if (hiddenNow()) {
					collapsePanel();
					return;
				}
				ensureObserver();
				startLoop();
			}

			function move(live) {
				if (ui === null) return mount(live);
				const nextKey = liveSessionKey(live);
				if (flowKey !== null && nextKey !== flowKey) resetForNewSession();
				flowKey = nextKey;
				host = live;
				closing = false;
				clearTimeout(closingTimer);
				ui.panel.setAttribute('data-closing', 'false');
				live.parent.insertBefore(ui.panel, live.root.nextSibling);
				layout();
				updateUi();
				if (hiddenNow()) {
					if (!ui.panel.hasAttribute('data-snoozed')) collapsePanel();
				} else if (ui.panel.hasAttribute('data-snoozed')) {
					expandPanel();
				} else {
					kick();
				}
			}

			function createFadeGhost() {
				if (ui === null) return null;
				if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
				let rect = ui.panel.getBoundingClientRect();
				if (rect.width < 2 || rect.height < 2) {
					if (lastRect === null) return null;
					rect = lastRect;
				}
				const ghost = ui.panel.cloneNode(true);
				ghost.removeAttribute('data-tg-active');
				ghost.removeAttribute('data-closing');
				ghost.removeAttribute('data-snoozed');
				ghost.classList.add('dtg-ghost');
				ghost.setAttribute('aria-hidden', 'true');
				ghost.style.cssText = 'position:fixed;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;margin:0;z-index:2147483000;pointer-events:none;animation:none;opacity:1;transform:none;display:block;box-sizing:border-box;';
				const overlay = ghost.querySelector('.dtg-overlay');
				if (overlay !== null) overlay.remove();
				const cloneCanvas = ghost.querySelector('canvas');
				if (cloneCanvas !== null && cloneCanvas.getContext) {
					try { cloneCanvas.getContext('2d').drawImage(ui.canvas, 0, 0); } catch (error) { /* keep blank */ }
				}
				document.body.append(ghost);
				const fade = ghost.animate
					? ghost.animate(
						[{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(.995)' }],
						{ duration: 240, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
					)
					: null;
				if (fade !== null) {
					fade.onfinish = function () { ghost.remove(); };
					setTimeout(function () { ghost.remove(); }, 360);
				} else {
					ghost.style.opacity = '0';
					setTimeout(function () { ghost.remove(); }, 320);
				}
				return ghost;
			}

			function beginClose() {
				if (ui === null || closing) return;
				if (hasProgress(game())) {
					suspendPanel();
					return;
				}
				closing = true;
				closeMenus();
				game().paused = true;
				updateUi();
				const ghost = createFadeGhost();
				if (ghost !== null) {
					/* Detach the real panel immediately; the floating copy keeps the last
					 * painted frame and fades out, even if the host removes the flow row. */
					destroy();
					return;
				}
				ui.panel.setAttribute('data-closing', 'true');
				closingTimer = setTimeout(function () { destroy(); }, 320);
			}

			function destroy() {
				disposed = true;
				clearTimeout(closingTimer);
				clearTimeout(suspendedTimer);
				suspendedTimer = 0;
				stopLoop();
				suppressedMissing = 0;
				if (io !== null) {
					io.disconnect();
					io = null;
				}
				if (ui !== null && typeof ui.removeDocumentListeners === 'function') ui.removeDocumentListeners();
				if (ui !== null && ui.panel.parentNode !== null) ui.panel.parentNode.removeChild(ui.panel);
				recordBest();
				ui = null;
				host = null;
				games = {};
				closing = false;
				disposed = false;
				suspended = false;
				keepOpen = false;
				detachedPanel = false;
				lastRect = null;
			}

			function sync() {
				if (disposed) return;
				if (stale()) { destroy(); return; }
				enforceSingle();
				if (ui !== null && ui.panel.hasAttribute('data-snoozed') && !hiddenNow()) expandPanel();
				const live = findLiveModule();
				if (suspended) {
					if (ui !== null && !ui.panel.isConnected) {
						destroy();
						return;
					}
					if (live === null) return;
					destroy();
					mount(live);
					return;
				}
				if (keepOpen) {
					if (ui === null) {
						keepOpen = false;
						return;
					}
					if (!ui.panel.isConnected) {
						destroy();
						return;
					}
					if (live !== null && !detachedPanel) {
						const nextKey = liveSessionKey(live);
						if (flowKey !== null && nextKey !== flowKey) resetForNewSession();
						flowKey = nextKey;
						host = live;
						live.parent.insertBefore(ui.panel, live.root.nextSibling);
					}
					return;
				}
				if (live === null) {
					if (turnHidden) {
						/* Ignore a one-tick gap between process steps; only a sustained
						 * absence of the live module marks the end of this turn. */
						suppressedMissing += 1;
						if (suppressedMissing >= 2) {
							turnHidden = false;
							suppressedMissing = 0;
							if (ui !== null) destroy();
						}
						return;
					}
					if (snoozeActive()) {
						if (ui !== null) destroy();
						return;
					}
					if (ui !== null) beginClose();
					return;
				}
				if (ui === null) {
					mount(live);
					return;
				}
				if (host === null || host.root !== live.root || host.parent !== live.parent) {
					move(live);
					return;
				}
				if (ui.panel.previousSibling !== host.root) {
					live.parent.insertBefore(ui.panel, live.root.nextSibling);
				}
			}

			function dispose() {
				destroy();
			}

			return { sync: sync, dispose: dispose };
		}

		function installThinkingStrip(ctx) {
			if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
			/* The debug page boots the engines with a lightweight shim, not the real
			 * conversation DOM; it opts out of the flow adapter. */
			if (window.__THINK_GAME_DEBUG__ === true) return undefined;
			if (typeof MutationObserver !== 'function') return undefined;
			/* A hot reload may leave a previous generation's controller alive; stop it
			 * through the window-held cleanup and hide any orphan strips. */
			/* A hot reload may leave previous generations alive; a monotonically
			 * increasing window token makes every older controller destroy itself. */
			window.__thinkGameStripGeneration = (window.__thinkGameStripGeneration || 0) + 1;
			const generation = window.__thinkGameStripGeneration;
			if (typeof window.__thinkGameStripCleanup === 'function') {
				try { window.__thinkGameStripCleanup(); } catch (error) { /* ignore */ }
			}
			const t = ctx.locale && typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : undefined;
			const controller = createStripController(t, generation);
			let scheduled = false;
			function schedule() {
				if (scheduled) return;
				scheduled = true;
				setTimeout(function () {
					scheduled = false;
					try { controller.sync(); } catch (error) { /* never break the conversation */ }
				}, 120);
			}
			const observer = typeof MutationObserver === 'function'
				? new MutationObserver(schedule)
				: null;
			if (observer !== null) {
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true,
					attributeFilter: ['data-state', 'data-expanded', 'aria-expanded', 'data-shimmer', 'hidden'],
				});
			}
			const interval = setInterval(schedule, 900);
			window.addEventListener('resize', schedule, { passive: true });
			const cleanup = () => {
				clearInterval(interval);
				window.removeEventListener('resize', schedule);
				if (observer !== null) observer.disconnect();
				controller.dispose();
				if (window.__thinkGameStripCleanup === cleanup) window.__thinkGameStripCleanup = undefined;
			};
			window.__thinkGameStripCleanup = cleanup;
			ctx.effect(() => cleanup);
			schedule();
			return undefined;
		}

		/* ------------------------------------------------------------------ */
		/* Plugin                                                              */
		/* ------------------------------------------------------------------ */
		function apply(ctx) {
			ctx.effect(() => {
				const tag = document.createElement('style');
				tag.dataset.plugin = 'dsh-think-game';
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}, 'think-game: styles');

			ctx.effect(() => ctx.locale.register(NS, { en: EN, zh: ZH }), 'think-game: locale');

			ctx.effect(() => installThinkingStrip(ctx), 'think-game: thinking-strip');
		}

		return { inject: ['locale'], apply: apply };
	},
});
