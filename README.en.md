# Think arcade (dsh-think-game) · DSH client plugin

> Open source: <https://github.com/NorthGateChat/dsh-think-game> · MIT License

A lightweight arcade panel that appears in the conversation flow, directly below the live
**“Deep diving · 36s ···”** reasoning module. No need to expand the Think row; when the
thinking/working process ends the panel pauses, fades out and leaves no residue in history.

**中文**: [README.md](README.md)

## Install

```powershell
# from GitHub
dsh plugin --profile desktop add github:NorthGateChat/dsh-think-game

# or local development
dsh plugin --profile desktop add link:/path/to/think-game
```

Restart DSH after installing. Uninstall with
`dsh plugin --profile desktop remove dsh-think-game` and restart.

## Games

| Game | Controls | HUD |
|---|---|---|
| Breakout | Mouse / `←` `→`; click or `Space` to serve | score, level, lives (random brick patterns) |
| Snake | Arrows / WASD or move the mouse toward the next direction; `Space` / click to start | score, length |
| Reflex | Click the active target, or press `1`–`9` | hits, average ms, misses |
| 2048 | Arrows / WASD to slide tiles | score, highest tile |
| Memory | Click cards, match all 6 pairs | pairs, moves |
| Stack | `Space` / click to drop the block | height |
| Flappy | `Space` / click to fly through pipes | score |

The bottom-left chip `Challenge: <game> ⌄` opens a menu with **Random** and the seven games.
Choosing a specific game pins it across sessions; choosing **Random** restores per-turn random
selection. Start/pause/resume and restart are shared. Keyboard input only controls the game
while the game area is focused; typing in the composer is never intercepted.

## Lifecycle

- Appears when a live reasoning/process module is present and follows it across steps.
- Ends with a ghost fade (last painted frame, 240 ms) when the answer starts.
- If the run has meaningful progress, it collapses into an inline
  `Continue · N pts` entry instead; click Continue to keep playing after the answer starts.
  The entry expires after 2 minutes or when the next reasoning turn begins.
- The × menu can hide the game **for this turn / 30 minutes / today**, leaving a compact inline
  `hidden · Restore` row. 30-minute/today snoozes persist in localStorage.
- Input focus, window blur or page visibility changes pause the current run.

## Sound

Synthesized with WebAudio (no audio files, no dependencies), quiet by default, unlocked by the
first user interaction. Covers serve/paddle/brick/life/level, snake eat/death, reflex hit/miss,
2048 merge, memory flip/match, stack drop and Flappy flap/score. The speaker button in the panel
header mutes it; the choice is stored in `dsh-think-game:sound-muted`.

## Performance / accessibility

- `requestAnimationFrame` only runs while a game is actively playing; idle states paint one frame.
- Rendering also stops when the panel is offscreen or the window is hidden.
- Observable game state is exposed as labels/metrics; the game area is focusable and has
  `aria-describedby` hints, menus use `aria-haspopup`/`aria-checked`, and icon buttons have
  localized `aria-label`s. `prefers-reduced-motion` is respected.

## Visual language

The panel uses only DSH neutral tokens (`brand`, `label-*`, `border-l1`, `bg-layer-*`), DSH radius
tokens and `--dsw-specific-menu` for the popover. All games are monochrome: bricks use one neutral
color at 16%/38%/66% opacity, the snake uses the same color in different weights, food is a hollow
ring, and the reflex target is a neutral filled cell with an inverted numeral.

## Debug page

`node debug/build.mjs` generates a self-contained `debug/index.html` with the real `client.js`
engines, panel styles and DSH light/dark theme tokens. It lets you play all seven games, switch
themes, simulate the running → paused → fade lifecycle, test keyboard isolation and inspect state.

## Development

```bash
npm test        # builds the debug page, then runs engine + adapter DOM fixture + debug-page smoke tests
npm run check   # syntax check + npm test
```

The test suite covers all seven game engines, the flow-adapter detection paths (running-status row,
process header, turn-process, running Think row, busy/shimmer fallback), one-time selector warnings,
session keys and the continue-entry predicate.

## Limitations

- The position is implemented as a flow DOM adapter: it depends on DSH chat-flow markers. A DSH
  upgrade may require selector updates; failures are logged once to `window.__thinkGameAdapter`.
- The plugin inserts its panel as a sibling in React-managed flow; if the host re-renders it away,
  the adapter re-attaches it.
- The game currently targets the desktop Web GUI; touch/mobile is not specifically adapted.

## License

[MIT](LICENSE) © 2026 ALANXIAORUI
