# 思考小游戏 (dsh-think-game) · DSH Client 插件

> 开源仓库：<https://github.com/NorthGateChat/dsh-think-game> · MIT License

在会话流里，紧挨着正在运行的那一行 **「深度求索中，用时 36秒 ···」思考模块下方**，自动出现一个轻量游戏面板。
不需要展开思考内容；思考/工作过程结束时面板冻结并淡出，收起后不留痕迹。

**English**: a dependency-free DSH client plugin that puts a compact, theme-aware arcade directly below the live reasoning module. Seven small games (Breakout, Snake, Reflex, 2048, Memory, Stack, Flappy) share one minimal DSH-style panel. It appears while the model works, auto-pauses and fades when the answer starts, supports random rotation or a pinned game, remembers best scores, and keeps keyboard input isolated from the composer. An optional “Continue” entry lets you finish a run after the answer starts. MIT licensed.

| 游戏 | 操作 | 计分 |
|---|---|---|
| 砖块（Breakout） | 鼠标移动挡板 / `←` `→`，点击或 `Space` 发球 | 得分、关卡、剩余机会（每局随机砖块布局） |
| 贪吃蛇（Snake） | `↑↓←→` / `WASD`，或鼠标移向蛇头方向转向；`Space`/点击开始 | 得分、蛇长 |
| 反应力（Reflex） | 点击目标格，或按 `1`–`9` 对应九宫格 | 命中、平均反应 ms、失误 |
| 2048 | `↑↓←→` / `WASD` 滑动方块 | 得分、最大方块 |
| 记忆翻牌（Memory） | 点击翻牌，配对所有 6 对 | 配对数、步数 |
| 堆塔（Stack） | `Space` / 点击放下方块 | 高度 |
| 飞行（Flappy） | `Space` / 点击向上飞、躲开柱子 | 得分 |

左下角「本轮挑战：<游戏> ⌄」打开菜单可选「随机」+ 七款游戏：选具体游戏即**固定为常玩**（跨会话保持），
选「随机」恢复每轮随机；「开始/暂停/继续」「重开」通用。键盘只在游戏区域获得焦点时生效，输入框打字不会被抢键。

## 安装

```powershell
# 从 GitHub 安装（仓库发布后）
dsh plugin --profile desktop add github:NorthGateChat/dsh-think-game

# 或本地开发安装
dsh plugin --profile desktop add link:/path/to/think-game
```

装完重启 DSH。卸载：`dsh plugin --profile desktop remove dsh-think-game` 后重启。

## 项目结构

```text
think-game/
├─ client.js           # 浏览器半：面板/适配器/七款游戏/音效
├─ index.js            # Host 半（空插件入口）
├─ package.json        # dsh.bundle + dsh.client 声明
├─ cordis.patch.yml    # profile bundle 补丁
├─ icon.svg            # 插件图标
├─ locale/             # zh / en 文案
├─ debug/build.mjs     # 生成自包含调试页
└─ test/               # 引擎契约 + 适配器 DOM fixture + 调试页冒烟
```

插件包**没有运行时依赖**，也不需要构建步骤；调试页由 `debug/build.mjs` 按需生成。

## 为什么是 DOM 适配器（而不是 reasoning body 插槽）

DSH 0.2.2-rc.1 的公共插槽 `conversation.chat.reasoning.body` 只在 Think 行**展开时**挂载，且官方 ui-chat README 明确
”Extensions do not replace the reasoning preview or its disclosure policy“。用户要求的“折叠状态下的思考模块下方”没有
任何可用的 additive 插槽，因此插件采用一个受控的 **flow 适配器**：

- `MutationObserver` + 定时扫描 chat flow，找到 live 的思考模块（优先「深度求索中/Deep diving」running 状态行，
  其次 shimmer 中的过程分组头，最后退化为 running 的 Think 行）；
- 在该模块的 DOM 节点后面插入插件自己的一个面板节点（不修改宿主文字、不改展开/折叠状态、不替换插槽）；
- 下一步开始时面板移动到新的 live 模块下方，同一局游戏继续；live 模块消失时暂停，并按情况处理收尾：
  - **本局已有进度**：不直接淡出，而是在原位置收成「继续上局 · 得分 N」小条；点「继续」展开刚才那局接着玩，
    不影响阅读本轮答案；下一轮思考开始时自动收起旧条目并开新局，点 × 则直接放弃。
  - **没有进度**：把最后一帧复制成固定定位 ghost，在 240ms 内轻微上移淡出，避免 React 同帧替换思考行时“闪退”。
  - 如果 React 已经把原位置整块移除，继续入口会退化为固定在最后位置的悬浮小条，保证入口不丢。
- **右上角 × 打开隐藏选项**：`本轮隐藏` / `30 分钟内不显示` / `今天不再显示`。30 分钟和今天会写入
  `dsh-think-game:snooze-until` / `snooze-day`，并在到期后自动恢复；本轮隐藏会在该轮持续无 live 模块约 1 秒后自动恢复。
- 隐藏后不会彻底消失：原位置保留一个**行内极简恢复条**「小游戏已隐藏（原因）· 恢复」，点击立即回到游戏；
  因此既不会一直打扰，也不存在“关掉后找不到入口”的问题。需要长期关闭仍建议直接在插件管理里禁用本插件。

### 继续 / 隐藏的状态边界

- 「继续上局」条目最多保留 **2 分钟**，超时后自动结算成绩并移除，不会永久挂在历史上；
- 下一轮思考开始时会先结算旧条目，再按“随机 / 固定”开新局；
- 点「继续」后这局不再依赖思考行，直到点 × 或下一轮思考开始；
- 页面刷新不会恢复未完成的「继续上局」条目（游戏状态不持久化），但最佳成绩会保留；
- 切换会话时，如果旧面板随宿主 DOM 一起被移除，适配器会清理状态；重新出现时从新会话重新开始。
- **默认每次新的思考/工作会话随机挑选七款游戏之一**（避免连续重复）；在挑战菜单里选择具体游戏会把它**固定**下来，
  之后每次会话都玩这一款（偏好存 `dsh-think-game:pinned`），选「随机」即可恢复随机。
- 挑战菜单里每款游戏右侧显示历史最佳：砖块最高分、蛇最长、反应最快平均 ms、2048 最高分、记忆最少步数、堆塔高度、飞行得分（存 `dsh-think-game:best`，无记录时留空）。
- 同一时间只允许一个面板：加载与每次同步都会清理旧版本遗留的 panel/strip 节点，并移除不在 chat flow 内的悬浮面板（generation 令牌 + `data-tg-*` 标记）。

注意事项：这是 DOM 层适配，依赖 DSH 当前的 chat flow 标记（`data-process-activity` / `data-shimmer` /
`class*="running"`）。DSH 升级若改了这些标记，只需更新 `findLiveModule()` 里的选择器；插件不会改动 DSH 安装文件。
因为不再替换 reasoning body 插槽，**COT 翻译插件的「查看译文」不再被遮蔽**。

## 生命周期

- 思考模块 live（running 状态行/过程模块/Think 行）→ 面板出现（当前游戏 ready）；
- 同一轮的下一个步骤 → 面板跟随新的 live 模块，游戏状态保留；
- live 模块关闭（模型开始回答、或本轮结束）→ 立即暂停 + `data-closing` 淡出 280ms + 移除；
- 历史消息中不会再出现面板（无残留）；
- 按 `sessionId` 索引的 React 状态已移除；面板状态属于当前 live 模块会话，刷新/切换会话时由适配器重建。

## 交互与键盘隔离

- 键盘监听只挂在面板 stage（`tabIndex=0` 的 `onKeyDown`）上：只有游戏区获焦时键盘才控制游戏；输入框打字不被抢键。
- 鼠标：砖块滑动挡板/点击发球；贪吃蛇鼠标转向；反应力点击目标；记忆翻牌点击卡片；堆塔/飞行点击操作。
- 游戏区失焦自动暂停；`prefers-reduced-motion` 下关闭脉冲和淡出过渡。

## 形态 / 依赖 / 主题

- 单文件 `client.js`，无构建步骤、无第三方运行时依赖；不再需要 React。
- 仅使用 `--dsw-alias-*` token 与 `--dsh-content-font-*` 字号变量；canvas 颜色每 500ms 从 token 读取，深浅色自动跟随。
- 面板宽度 max 520px；不改变聊天区域文字排版与展开/折叠行为。

### 视觉设计（Apple 风格方向）

保持信息密度和代码量不变，只做“材质 + 排版 + 控件 + 动效”的收敛：

- **材质**：面板/舞台改为 DSH 的扁平表面（`bg-layer-1` / `bg-base`），0.5px 发丝边，圆角直接用 DSH token
  （面板 `--dsw-radius-lg`、舞台 `--dsw-radius-md`、菜单 `--dsw-radius-sm`），不再叠加白色渐变和内阴影；
- **排版**：11px 常规字重标题 + 字距；指标用 `·` 分隔、tabular-nums、三级文字色；挑战名和标题都不加粗。
- **配色**：全部收敛为 DSH 的黑白灰中性色（`brand-primary` / `label-*` / `border-l1` / `bg-layer-*`），
  所有游戏都只用一个中性色 + 透明度层次：砖块按行用 16%/38%/66% 的灰阶、蛇身用同一中性色的深浅、食物改空心圆环、
  反应力格用 layer/border 与反白数字；不再使用绿/黄等语义色。
- **控件**：操作改为一组 26px 圆形图标按钮（内联 SVG，无依赖），有 hover / active / focus-visible 三态；
  左下角是「本轮挑战：<当前游戏> ⌄」——**游戏名本身就是切换按钮**，点开向上弹出带勾选的紧凑菜单：
  「随机」+ 七款游戏；选择某款即固定为常玩，选择「随机」恢复每轮随机。点外部或 `Esc` 关闭菜单。
  操作提示文字与挑战名**同一行靠右**（不另起一行、不占整行）。
- **上拉菜单**：视觉与交互对齐 DSH 自己的浮层菜单（`--dsw-specific-menu` 背景、0.5px 发丝边、12px 字号、
  26px 行高、柔和投影、出现动画、键盘 ↑/↓/Home/End 切换、Enter 选择、Esc 关闭并回到触发按钮）。
  Client 插件拿不到 DSH 私有的菜单组件，因此这里用相同 token/行为**复刻**而不是直接复用组件。
- **动效**：出现时 5px 上移 + 0.995 缩放的柔和入场（`cubic-bezier(.22,1,.36,1)`），结束 240ms 淡出；
  `prefers-reduced-motion` 下全部关闭。
- **画布**：全部使用中性色 + 透明度分层，不再有彩色元素；砖块按行 16%/38%/66% 灰阶、小圆角，
  贪吃蛇网格更淡、蛇身同色深浅、食物为空心圆环；反应力格子用 layer/border 与反白数字，激活目标为单一中性实心色。
- 所有颜色仍来自主题 token，浅色/深色自动一致；最新视觉以调试页为准。

### 音效

- 纯 WebAudio 合成，不引入任何音频文件或依赖；音量很低，只在用户第一次交互后才会创建音频上下文（符合浏览器自动播放策略）。
- 音效覆盖：发球/继续、挡板、砖块、掉命、过关、吃食、蛇死亡、命中、失误、结算；静音按钮在面板右上角，状态写入
  `dsh-think-game:sound-muted`，重开/切换会话后保持。
- 调试页同样带音效开关，便于试听。

### 适配器硬化 / 会话隔离

- 所有 DSH DOM 选择器集中到 `ADAPTER` 常量；匹配成功会写入 `window.__thinkGameAdapter = { via, at }`。
- 增加了 busy/shimmer/thinking 的兜底匹配；若页面明显有运行中标记但一直匹配不到，只会 `console.warn` 一次，
  并在 `window.__thinkGameAdapter.warning` 里留下原因，避免“静默不出现”。
- 新增会话隔离：当 live 思考模块所在的 flow 容器（或 `data-session-id` 祖先）发生变化时，重置游戏并重新随机，
  不再把上一会话的分数带进新会话。

### 性能 / 可访问性

- 输入框获得焦点、窗口失焦、页面隐藏时自动暂停当前局（只暂停，不自动恢复），避免打字/切窗口时掉命。
- 只有 `playing` 状态持续 `requestAnimationFrame`；`ready / 暂停 / 结束` 只绘制一帧后停帧，
  叠加“面板不可见/窗口隐藏时不绘制”，长思考期间不空转。
- 面板滚出视口或窗口不可见时暂停绘制，重新可见后继续。
- 游戏区通过 `aria-describedby` 关联操作提示；切换器有 `aria-haspopup/aria-expanded/aria-controls`，
  菜单项 `menuitemradio` + `aria-checked`；暂停/重开按钮有本地化 `aria-label`；键盘 ↑/↓/Home/End/Enter/Esc 可用。

## 调试页

`think-game/debug/index.html`：构建时把**当前 `client.js` 的引擎代码与面板样式内联**（不是另写演示），
并附带从已安装 DSH app.asar 提取的浅色/深色主题 token。页面里可以：

- 直接玩三款游戏、切换标签订阅，看到真实 HUD/提示/overlay；
- 切换浅色/深色；
- 勾选/取消「模拟思考中（running）」预览出现 → 暂停 → 淡出/收起；
- 在输入框里打字，验证游戏不抢键；
- 左侧状态面板与事件日志展示 phase/paused/指标与输入事件。

生成方式：`node debug/build.mjs`（修改 `client.js` 后重跑）。自测：`node test/test-debug-page.mjs`
（解析页面内联脚本、模拟 boot、跑三款游戏与 drawGame 冒烟）。

## 开发与测试

```bash
npm test          # 自动构建调试页，然后跑引擎契约 + 适配器 DOM fixture + 调试页冒烟
npm run check     # 语法检查 + 上面的测试
node debug/build.mjs
```

`test/test-adapter.mjs` 用最小 DOM fixture 覆盖 `findLiveModule` 的各条匹配路径、选择器失效时的
一次性告警、session key 和 `hasProgress`；它不需要浏览器，但也不替代真实 DSH 窗口的最后一次人工复核。

## 限制

- 位置实现为 DOM 适配器（见上），依赖 DSH chat flow 的现有标记；DSH 升级后可能需要更新选择器，
  失效时只会 console 警告一次并写入 `window.__thinkGameAdapter`。
- 插件通过 DOM 插入面板，而不是官方 additive 插槽；极端情况下宿主重渲染可能移除节点，适配器会尝试重挂。
- 音效使用 WebAudio 合成，首次需要用户交互解锁；默认开启，可静音并记忆。
- 游戏操作目前只保证桌面 Web GUI；触摸/移动端未专门适配。

## License

[MIT](LICENSE) © 2026 ALANXIAORUI
