---
description: "平顺 Buddy 交付说明：安装/卸载/回滚操作、已知限制、发布路径与后续事项。"
kind: "reference"
---

# 平顺 Buddy 交付说明

## 1. 交付物

| 内容 | 位置 |
|---|---|
| 可发布 Bundle 包 | `packages/pingshun/buddy/`（`@deepseek-ai/dsh-pingshun-buddy@0.1.0`） |
| 六个 Agent Preset | 包内 `presets/{office,party,publicity,finance,tender,engineering}.patch.yml`（ID：`ps-office` 等） |
| Buddy Web UI | 包内 `src/client/`（mode-store、surface-manager、BuddyPanel、ToolsButton/ToolDrawer、ModeToggle） |
| Profile 装配脚本 | 包内 `scripts/install-profile.mjs` |
| 浏览器验收脚本 | 包内 `scripts/browser-acceptance.mjs`（14 项断言） |
| 需求基线（PDF 核对） | `docs/pingshun/requirements.md` |
| 技术架构（接口映射） | `docs/pingshun/architecture.md` |
| 验收记录 | `docs/pingshun/acceptance.md` |

## 2. 安装与回滚

**安装（三种等价入口）**

```sh
# A. 推荐隔离部署（脚本自动备份旧 profile，绝不触碰 web）
node packages/pingshun/buddy/scripts/install-profile.mjs
pnpm dsh --profile pingshun

# B. 现有 profile 手动安装（开发本地路径）
pnpm dsh plugin --profile pingshun add /abs/path/to/packages/pingshun/buddy

# C. npm 发布后
pnpm dsh plugin --profile web add @deepseek-ai/dsh-pingshun-buddy
```

**回滚**

```sh
pnpm dsh plugin --profile <name> remove @deepseek-ai/dsh-pingshun-buddy
```

已实测：remove 后 `cordis.patch.yml` 与 `--dump-config` 与安装前逐字节一致，运行期原生界面完全恢复。pingshun Profile 的整体回滚：`install-profile.mjs` 每次重建前把旧目录改名为 `pingshun.bak-<时间戳>`，改回原名即恢复。

**升级**：改包内代码 → `pnpm --filter @deepseek-ai/dsh-pingshun-buddy run build` → HMR 开启时自动重载，否则重启 profile 进程。发布形态走 `updateBundle`（registry 精确版本）。

## 3. 已知限制与后续事项

1. **模型回答未验证**（无 API key）。六 persona 的真实生成、引用标注、待核实清单行为需配置 `DEEPSEEK_API_KEY` 后按 acceptance.md 步骤 6 复验。
2. **工具基线为一致集合**，未按角色差异化收窄（如财务禁 write）。persona 已含使用纪律；差异收窄只需在对应 preset patch 中对行加 `disabled: true` 或删除行。
3. **`tool-web` 默认不挂**（资料不出单位）。需要联网检索的单位在 profile patch 中为对应 preset 追加该行。
4. **模型级工具枚举未做**：需要 DSH 侧开放 client remote 合成表（`packages/api/remotes/src/client/index.ts`）后补一个只读 `effectiveTools(sessionId)` TypertRemoteService（Host 侧 `ctx.agents.get(sessionId).ctx.tools.definitions()` 已具备）。当前抽屉展示组成行粒度的真实状态。
5. **多员工/涉密部署**：PDF 第 12–13 页的单位账号、按岗位授权、当天停权需独立实例 + 账号体系（身份集成、授权映射、审计保留策略），本期单机 Profile 部署不覆盖；Profile ≠ 权限系统。
6. **首次进入默认 Buddy 模式**对任何装有本包的 Profile 生效（含用户日常 web Profile）。若某单位希望默认原生模式，改 `mode-store.ts` 的默认值为 `'dsh'` 一处即可。
7. **仓库聚合 typecheck/build 未纳入本包**（有意零修改 DSH 构建清单）；包以自身 `pnpm run build` 验证。若上游希望纳入，需要在 `tsconfig.host.json`/`tsconfig.client.json` 增加一条 reference——这是唯一的上游可选改动。
8. **窄屏（1024/500/375）未逐点截图**：抽屉为 `min(336px, 92vw)` 右侧 overlay，Esc/遮罩关闭；建议后续在真机补一轮。

## 4. 发布路径（当做一个包发布）

1. 确定 npm scope：`@pingshun` 需在 npm 注册（或改名）。
2. `pnpm pack`（在包目录）→ 检查 tarball：`lib/index.js`、`lib/client.js`、`cordis.patch.yml`、`presets/*.patch.yml`、`locale/*.json`、`icon.svg`、`src`（sourcemap 回源）、`README.md`。
3. `pnpm publish --access public`。
4. 消费方：`dsh plugin --profile web add @deepseek-ai/dsh-pingshun-buddy`（插件管理器 saveExact + `engines.dsh` 兼容门 + 平台声明校验），或 Web「插件」页安装。

## 5. 与旧工程（../pingshun-buddy）的关系

本交付不依赖旧工程：旧 `pingshun` profile 引用的 `@pingshun-buddy/{office-agent,finance-agent,ui}` 已被 `install-profile.mjs` 备份并替换；新包名 `@deepseek-ai/dsh-pingshun-buddy`、新 Preset ID（`ps-*`）、新 UI 机制（遮蔽接管 + 常驻 footer 入口，无全屏 overlay/无 main 面板接管）均为重新实现。旧 profile 备份目录可随时删除。

## 6. 本轮新增（OCR + 模式驱动）的限制与决策

1. **OCR token 的本机明文持久化**：Settings 的 secret 字段在传输/展示层脱敏，但持久化到本机 profile 的 `cordis.patch.yml` 为明文（依赖文件权限）。涉密单位应限制该文件的读取权限，或改用 DSH 的 credential-ref 方式（环境变量引用）——后续可在 runtime Config 增加 `paddleTokenEnv`/`mineruTokenEnv` 字段支持。
2. **OCR 工具的环境变量桥接**：因 preset 作用域不能注入 Host 级服务，token 经 `process.env` 桥接（与 DSH 的 `DEEPSEEK_API_KEY` 一致）。进程环境属本机范围，注意诊断/日志不要打印环境。
3. **DeepSeek 模式下 Buddy 历史会话不可恢复**：模式切换会真实卸载 ps-* presets（满足"卸载"要求），代价是这些历史会话在 DeepSeek 模式不能打开；切回 Buddy 即恢复。已在 Buddy 侧文档说明；如需更友好可在 DeepSeek 模式的会话入口加提示。
4. **OCR 的真实云端识别未验证**（无有效 token）：协议由 mock 单测覆盖，配置链路（设置→持久化→env 桥接→工具读取）已端到端验证；接入真实 token 后按 acceptance.md 步骤复验。
5. **preset 从静态 patch 迁移为动态注册**：原 `presets/*.patch.yml` 已删除，定义在 `src/host/presets.ts`；这是模式切换"真实装卸"的必要前提。

## 7. Desktop（Electron）验证记录（2026-11-13 实测）

**结论：桌面端可用，已在 Linux 开发环境的 Electron Desktop 中实测通过。**

### 架构依据（源码核实）

- Desktop = Electron 壳套完整 Web 应用（同一套 client bundle/slots）；`dsh.client.platform: 'web'` 是统一声明，Desktop 经 `fetchBundle()` 分发同一 bundle 字节，无需改动。
- Desktop 组合 profile：外部插件 profile 为 `$DSH_HOME/profiles/desktop`（`DesktopProjectManager.createPluginProfile` 初始化为 base + web-app）；dev launcher 生成的 `project` 目录只是 disposable runtime 资源目录（`resources.dsh`），**不是**插件 profile——首轮验证时装错目录（boot manifest 无 pingshun 行）即此原因。
- Host 端（runtime 插件、preset 注册/卸载、OCR token 桥接、OCR 客户端）与前端无关，行为一致。

### 安装方式（桌面端）

- **Packaged/Desktop**：应用内「插件」页安装 `@deepseek-ai/dsh-pingshun-buddy`（CLI 按设计拒绝管理 desktop profile：`profile "desktop" is managed exclusively by the Electron application`，`apps/cli/src/args.ts:85`）。
- **Dev（Linux/macOS/Windows 开发机）**：`pnpm run start:desktop`（DSH_HOME=apps/desktop/.desktop-build/development/home）→ 在 profile（`development/home/profiles/desktop/package.json`）加 link 依赖与 bundles 条目 + `pnpm install` → 重启。

### 实测结果（Electron 渲染进程，CDP 驱动，6/6 通过）

| 检查 | 结果 |
|---|---|
| boot manifest 含 `@deepseek-ai/dsh-pingshun-buddy`（78 行） | ✅ |
| 六 Agent enabled（动态 preset + OCR 工具挂载） | ✅ |
| 「更多」菜单含「OCR 设置」且弹窗可开 | ✅ |
| 切 DeepSeek 后原生选择器无六个 Buddy agent | ✅ |
| DeepSeek 模式下常驻「切换到平顺 Buddy」入口 | ✅ |
| 切回 Buddy 后 Agent 恢复 | ✅ |

截图：`/tmp/ps-pdf/desktop-*.png`。验证用启动器（复刻 dev launcher 准备步骤 + Linux Electron）留存在 `/tmp/ps-pdf/desktop-launch.mts`（一次性工具，不入库——仓库 Desktop 开发目标仅 mac/win，`SUPPORTED_TARGETS` 不含 linux）。

### 未验证项（如实）

- macOS/Windows 打包版的窗口 chrome（顶栏/折叠/红绿灯）与 Buddy 左栏的叠加视觉，需在对应系统目测。
- 桌面端 OCR 真实云端识别（依赖有效 token，同 Web 端限制）。

## 8. 品牌全量替换（2026-11-13 实测）

**目标**：`buddyMode === 'buddy'` 时用户可见面无 DSH/DeepSeek 品牌（鲸鱼图标、"DSH 本地构建"、页面标题、favicon、hero slogan），全部呈现「平顺 Buddy」；切回 DeepSeek 模式后原生品牌完整恢复。

### 实现机制（全部在 packages/pingshun/buddy 内，零官方源文件修改）

| 元素 | 机制 | 可逆性 |
|---|---|---|
| 侧栏鲸鱼图标 | 官方 `sidebar.brand.mark` single slot，priority -10 shadow | disposer 注销 → 官方 FishLogo 自动恢复 |
| "DSH 本地构建"文案 | 官方 `sidebar.brand.name` single slot 同上 | 同上 |
| hero 图标（探索未至之境旁的鲸鱼） | 官方 `conversation.hero.brand.mark` single slot 同上 | 同上 |
| 页面标题 | `MutationObserver` 改写 `<title>`（官方 DocumentTitle 持续写入，直接赋值会被覆盖）；剥离 "DSH 本地构建/DSH Local Build" 后缀，保留会话标题主体 | exit 时断开并还原 |
| favicon | 替换 `link[rel=icon/apple-touch-icon]` href 为内联 SVG data URL | exit 时还原原始 href |
| hero slogan（"探索未至之境"/"Into the Unknown"） | 文本 MutationObserver（官方 locale 字典 (ns,locale) 单一占用者，无 slot 可贡献替换文案） | 记录改写节点，exit 时还原原文 |
| "预览版"/"Preview" badge | 同文本 observer（置空） | 同上 |

新增文件：`src/client/brand-assets.tsx`（BrandMark/BrandName/HeroBrandMark/favicon data URL）、`src/client/brand-manager.ts`（enter/exit 幂等、全部可 dispose）；接入 `index.ts` 的 mode-store 切换序列（与 surfaces 同点）。

### 验收结果

- Web（Chromium，双语按钮选择器）：**品牌 15/15 通过**（标题、3 个 favicon、侧栏品牌、slogan、badge、往返切换全部还原）；既有 14 项回归全过。
- Desktop（Electron dev，CDP 驱动）：**品牌 8/8 通过**（图标、侧栏文案、标题跟随、原生恢复、往返切换）。
- 单测 34/34 通过（新增 brand-manager 10 例：slot 注册、标题改写/自身稳定、favicon 替换还原、hero slogan 改写、exit 后停止改写、幂等）。

### 排查插曲（如实记录）

既有验收脚本的「工具能力」按钮失败一度疑似品牌改动引入；禁用 brand 后仍失败，最终定位为**官方行为**：blank session（未发消息）时 `ConversationHeader` 传 `hideChrome=true`，整个 header（含 utilities）不渲染。修正验收脚本为"发一条消息后再查工具按钮"，全部通过。脚本已更新（`scripts/browser-acceptance.mjs` 3b 段）。

### 未验证项 / 已知限制

- 首屏加载瞬间闪现官方 title/favicon（`apps/web/index.html` 静态阶段，bundle 执行前的 HTML，无官方钩子，无法消除）。
- 设置→关于区域的 "DSH 本地构建" 字样：settings 内 `t()` 直接输出，无 slot；保留（开放问题）。
- 桌面「关于」菜单、dock 图标：Electron 主进程资源（`apps/desktop/locale.ts` aboutProduct），client 插件不可及；保留。
- "标准模式" chip：官方 preset 显示名，保留入口（用户仍可选用官方 preset）。
- macOS/Windows 打包版窗口 chrome 视觉叠加未目测。

## 9. 设置专用 Launcher（2026-11-16 实测）

**需求**：侧栏底部"更多"菜单只保留"设置"，取消"意见反馈"和"登录"入口；两种模式统一生效。

### 机制

`settings.launcher` 是官方 single slot（root scope），原占用者 `AccountMenu`（ui-settings-account）把 设置/意见反馈/登录 三项硬编码在 items 数组中，无配置可关。采用 priority -10 shadow 注册自绘的纯设置菜单（与品牌替换同一官方扩展机制）。

不采用"禁用 Host 账号插件"：那会使 `whenAccess('account/watch')` 不成立、官方 launcher 不注册，"更多"按钮连同设置入口一起消失。

### 实现

- 新增 `src/client/settings-launcher.tsx`：`SettingsOnlyLauncher`（复用官方 Menu/IconEllipsisOutlineMedium/IconSettingsOutlineMedium，触发器外观与官方"更多"一致：wide 显示文字、rail 只显示三点图标）
- `src/client/surface-manager.ts`：`settings.launcher`（priority -10）加入 Buddy surfaces 的 enter/exit——**仅 Buddy 模式 shadow**；切回 DeepSeek 模式 disposer 注销，官方 AccountMenu（设置/意见反馈/登录）恢复
- 新增 locale key：`launcher.more`（更多）、`launcher.settings`（设置）
- 新增 4 例单测（wide/rail 两态、菜单仅一项、openSettings 调用、无登录/反馈项）

**模式行为**：Buddy = 仅"设置"；DeepSeek = 官方 AccountMenu（设置/意见反馈/登录）。往返切换实测通过（Buddy ["设置"] → DeepSeek ["设置","意见反馈","登录"] → Buddy ["设置"]）。

### 验收

- 单测 38/38 通过
- Web 实测：菜单 items = ["设置"]；设置面板打开正常、OCR section 在；无登录/意见反馈入口；session-log 行已消失（用户自行禁用）
- Desktop 实测（Electron CDP）：Buddy 模式菜单 items = ["设置 Ctrl,"]（含快捷键提示）；原生模式同样只剩"设置"（永久注册生效）
- 截图：`/tmp/ps-pdf/launcher-menu.png`、`/tmp/ps-pdf/desktop-buddy-launcher.png`

### 影响与限制（如实）

- 原 AccountMenu 被 shadow：意见反馈、登录/退出、quota 通知、登录过期 toast 一并消失（登录取消后无意义）
- Host 登录 API 仍在（仅 UI 层取消，无前端入口）
- 已登录用户的"退出登录"入口同样消失（当前未登录，无实际影响）
- 回滚：移除注册即恢复官方 AccountMenu（slot disposer）

## 10. 模型内置与只读化（2026-11-16 实测）

**需求**：Buddy 模式模型开箱即用、集中管理——`.env` 内置 BASE_URL+API_KEY，启动时按 OpenAI 规范 `GET {BASE_URL}/models` 拉取模型列表，用户无需也不能手动配置；设置面板"模型"section 只读展示当前连接信息，不允许添加/修改。

### 实现

| 层 | 机制 |
|---|---|
| provider 内置 | `cordis.patch.yml` 给 `llm-pi-ai` 声明 OpenAI 兼容 provider（`api: openai-completions` + `baseURL`（env）+ `apiKeyEnv: PINGSHUN_LLM_API_KEY` + 静态 fallback 模型） |
| 动态拉取 | `host/llm-models.ts`：env 读取 + `GET {baseURL}/models` → DSH model profiles；runtime 在 Buddy 激活时写入完整 provider profile + 默认模型 |
| 默认模型还原 | savedSelection 持久化到 runtime 自己的 config（`savedModelProvider/savedModel`），**只在当前值不是 pingshun 时保存**（避免保存自己写的值）；DeepSeek 模式还原，**幂等检查**（已是目标值则跳过，打破 HMR 嵌套循环） |
| composer 只读 | `conversation.input.model` shadow → 静态文本"平顺模型服务"，不可点击 |
| 设置 section 只读 | `settings.section id='models'` shadow（list slot，priority -10）→ 只读组件（显示 baseURL/默认模型/可用模型，无编辑/添加/删除按钮） |
| 导航去重 | list slot 导航用 raw ledger（含被 shadow 的官方 entry），出现两个"模型"——`model-nav-dedup.ts` observer 隐藏官方 navCell（order=10 在后），保留我的只读行（order=9） |

### 排坑记录（如实）

1. **`pnpm dsh` 必须在 repo root 执行**：在 buddy 包目录下执行报 `Command dsh not found`，导致多次"启动成功"假象（实际进程没起）。
2. **settings.update 的 HMR 事务不能嵌套**：`saveUserSelection` + `syncModels` 并发执行两个 settings.update 报 `HMR transactions cannot be nested`——串行化解决。
3. **还原写入触发 volatile-update 导致循环**：加幂等检查（已是目标值则跳过）打破"写入→volatile-update→再写入"循环。
4. **savedSelection 持久化污染**：最初 savedSelection 保存在内存，重启后读到已被改写的 pingshun 无法还原——改为持久化到 runtime config 且"当前值不是 pingshun 才保存"。
5. **list slot 的 shadow 不能隐藏导航**：导航用 raw ledger，需 DOM observer 去重（与品牌 slogan 同套路）。

### 验证

- 动态拉取：mock OpenAI 端点（/models 返回 2 个模型）→ provider 配置写入完整 profile，默认模型=拉取的第一个模型
- 模型路由：发消息 → mock 收到 `CHAT model=pingshun-glm-large`（路由到 pingshun provider）
- 只读 chip：composer 显示"平顺模型服务"，无交互式选择器
- 只读 section：显示 baseURL/默认模型/可用模型，无编辑/添加/删除按钮；导航只有一个"模型"
- DeepSeek 还原：切到 DeepSeek → agent-default-model 还原为 zai-coding-cn/glm-5.3-flash；官方 ModelsSection 恢复（编辑/添加按钮回来）
- 单测 46/46 通过（新增 llm-models 8 例）
- 官方源文件零修改

### 环境变量

`.env`（与 DSH 的 DEEPSEEK_API_KEY 同机制）：
- `PINGSHUN_LLM_BASE_URL`：OpenAI 兼容端点（如 `https://host/v1`）
- `PINGSHUN_LLM_API_KEY`：bearer key（拉取与推理共用）
- `PINGSHUN_LLM_DEFAULT_MODEL`：可选，默认模型 id（缺省取拉取列表第一个）

### 未验证项

- 生产环境真实 OpenAI 兼容端点的模型列表格式差异（目前按 `{data:[{id}]}` 解析）
- 设置面板"模型"section 在 DeepSeek 模式的导航恢复（navDedup.exit 恢复 display，逻辑保证，未单独截图）

## 11. 包内 .env 环境变量（2026-11-16 实测）

**需求**：环境变量放在 `packages/pingshun/buddy/.env`，启动时加载，无需命令行传参。

### 实现

- 新增 `src/host/env-file.ts`：`loadBundleEnv()` 读包根 `.env`（`lib/host/env-file.js` 上两级 = 包根），解析 KEY=VALUE（支持引号/注释），填入 process.env（**不覆盖系统 env**）
- `runtime.ts`：apply 开头先快照系统 env（纯系统原值），再 `loadBundleEnv()`；bridge 的 fallback 链：**Settings 值 > 系统 env > .env 文件**
- `.env.example` 模板 + `.gitignore`（`.env` 不提交）

### 优先级

```
Settings 界面配置（OCR token、模型选择） > 系统环境变量（命令行/部署 env） > 包内 .env 文件
```

### 部署方式

- 源码：`packages/pingshun/buddy/.env`
- 打包安装：把 `.env` 放到安装后的包目录（`node_modules/@deepseek-ai/dsh-pingshun-buddy/.env`）——npm publish 默认不含 .env，需部署流程单独放置
- 环境变量：`PINGSHUN_LLM_BASE_URL`、`PINGSHUN_LLM_API_KEY`、`PINGSHUN_LLM_DEFAULT_MODEL`（可选）、`PINGSHUN_PADDLE_OCR_TOKEN`、`PINGSHUN_MINERU_OCR_TOKEN`（OCR 也可在 Settings → OCR 配置）

### 验证

- 启动命令**不传任何 env**，仅从 `.env` 读取 → mock 收到 `GET /v1/models`（baseURL 来自 .env），provider 配置与默认模型正确
- 系统 env 优先级：命令行传 `PINGSHUN_LLM_API_KEY=sk-system-env-priority` → process.env 保留系统值（.env 不覆盖）
- 单测 46/46 通过；官方源文件零修改

## 12. 移除模式切换入口（2026-11-16 实测）

**需求**：去掉"切换到 DeepSeek"功能，Buddy 工作台作为固定首页，用户无法切回原生 DeepSeek UI。

### 实现

- 删除 `src/client/mode-toggle.tsx`（原 `sidebar.footer.action` 的双向切换按钮）
- `index.ts` 移除 `ModeToggleSlot` 注册（`sidebar.footer.action` 不再有任何切换入口）
- `buddyMode` 仍保留为 Host volatile 配置（管理员可通过配置文件切换，UI 无入口）

### 影响

- Buddy 模式：侧栏底部不再显示"切换到 DeepSeek"
- DeepSeek 模式：同样无"切换到平顺 Buddy"入口（但用户无法通过 UI 进入 DeepSeek 模式）
- 模式相关机制（preset 注册/卸载、品牌替换、模型选择还原）保留——仅 UI 切换入口移除，配置文件层面的 buddyMode 切换仍生效

### 验证

- 浏览器验收 12 项全过（含新增的"no DeepSeek toggle entry"检查）
- 单测 46/46 通过；官方源文件零修改
- 工具按钮检查曾失败一次，定位为模型 mock 未启动（对话无法完成，session 保持 blank，header 不渲染），与切换移除无关；起 mock 后全过

## 13. 桌面端跳过欢迎窗口（2026-11-16 实测）

**需求**：baseurl/apikey 已内置（.env），且不展示 DeepSeek 品牌信息，桌面端启动**直接进入 Buddy 主界面**，去掉欢迎窗口。

### 说明

欢迎窗口是 **Electron 主进程**逻辑（`apps/desktop/src/main.ts` 的 `openInitialWindow`：`needsWelcome({loggedIn, hasApiKey})` 时 `showWelcome()`），client 插件无法触及。经确认采用**修改主进程**方案（破坏"零官方源码修改"约束，仅此一处、约 30 行）。

### 改动（apps/desktop/src/main.ts，4 处）

1. `openInitialWindow`：去掉 `needsWelcome` 分支，直接 `await enterWorkspace()`（Pingshun Buddy deployment 注释）
2. account watch 的 signed-out 分支：不再打开欢迎窗口（部署无登录入口）
3. session-expired 分支：不再打开欢迎窗口（工作区保持打开）
4. quit-confirm 的 welcome-window 恢复分支：移除（欢迎窗口不存在）
5. 清理孤儿符号：`showWelcome` 闭包、`openWelcomeWindow` import、`needsWelcome` import、`clipboard`、`pendingWelcomeNotice`、`WelcomeNotice` type

### 验证

- `tsc --noEmit -p tsconfig.host.json` 通过；`apps/desktop` bundle 重建成功
- Desktop 实测（Linux Electron + CDP）：
  - 页面列表无 welcome renderer（`file://...welcome.html` 不在）
  - `欢迎使用 / 添加 API Key` 文案不出现
  - 直接进入工作区（`新会话` 可见），品牌为「平顺 Buddy」
- 回归：Web 侧无影响（本次仅改桌面主进程）

### 风险与回滚

- 升级 DSH 版本时此文件有合并冲突风险（`git checkout` 官方文件即回滚）
- 打包分发时需确保此修改进入构建（源码构建即包含）

## 14. Linux 桌面启动脚本（入库）

**背景**：官方 `pnpm run start:desktop` 的 `SUPPORTED_TARGETS` 不含 linux-x64（`desktop build paths: unsupported target linux-x64`），Linux 开发机无法用官方命令启动桌面端。

**方案**：`packages/pingshun/buddy/scripts/desktop-launch.mts`——复刻官方 launcher 准备步骤（target 强制 win-x64 仅过路径检查），直接启动 Linux Electron。脚本自动：
1. `prepareDevelopmentProject` 重建 runtime project
2. **重新注入 `@deepseek-ai/dsh-pingshun-buddy` link 依赖 + bundles 条目 + node_modules 符号链接**（project 重建会清掉，脚本每次自动补回）
3. 启动 Electron（DSH_HOME=development/home，外部插件 profile 携带 buddy bundle）

**启动命令**（repo root）：
```sh
pnpm exec tsx packages/pingshun/buddy/scripts/desktop-launch.mts
```

前置条件（一次性）：`apps/desktop/lib/main.js` 已构建、Electron 二进制已装、外部插件 profile 已安装 buddy。


## 15. 欢迎窗口问题复盘：构建链断裂（2026-11-16）

**现象**：修改 main.ts 并 `pnpm run bundle` 后，桌面端仍弹欢迎窗口。

**根因**：apps/desktop 构建是**两阶段**：
```
tsc -b：src/main.ts → lib/types/main.js（增量，依赖 tsbuildinfo）
tsdown：lib/types/main.js → lib/main.js（`pnpm run bundle` 只跑这步）
```
单独 `pnpm run bundle` 从**旧的 lib/types/main.js** 打包，修改丢失。且系统里有旧实例（14:39 用户自启，加载旧产物）叠加误导。

**修正**：完整构建 `pnpm run build`（= `tsc -b && pnpm run bundle`）。验证标准：`grep -c needsWelcome lib/main.js` 应为 **0**（注释会被 bundler strip，用官方符号计数验证才可靠）。

**附**：repo 级 `pnpm run build` 的 aggregate typecheck（tsconfig.host.json/client.json）会拒绝 pingshun 包（不在官方 references），**apps/desktop 目录下的 leaf 构建（`tsc -b`）可独立通过**，足以产出桌面产物。

**启动方式**（Linux）：`pnpm exec tsx packages/pingshun/buddy/scripts/desktop-launch.mts`（已入库，自动补回 buddy bundle）。

**当前状态**：桌面直进「平顺 Buddy」主界面（xwininfo 确认唯一窗口「平顺 Buddy」，CDP 确认无 welcome renderer）。

## 16. 桌面安装包打包（exe/dmg 内置 buddy + .env）

**目标**：改 `.env` → 打出 exe/dmg → 他人安装后开箱即用（六 Agent、内置模型服务、无欢迎页、无 DSH 品牌）。

### 官方文件改动（新增，共 7 处）
| 文件 | 改动 |
|---|---|
| `apps/cli/package.json` | dependencies + `@deepseek-ai/dsh-pingshun-buddy: workspace:*`（进桌面闭包）|
| `packages/util/official-bundles/src/bundles.ts` | web 模板 bundles + buddy（安装后自动加载）|
| `tsconfig.base.json` | 手写 paths 区加 buddy 三个 alias（bare/client/runtime）|
| `tsconfig.host.json` | references + `./packages/pingshun/buddy/tsconfig.host.json` |
| `tsconfig.client.json` | references + `./packages/pingshun/buddy/tsconfig.client.json` |
| `pnpm-lock.yaml` | 自动更新 |
| `apps/desktop/src/main.ts` | （此前）跳过欢迎窗口 |

**包重命名**：`@pingshun/buddy` → `@deepseek-ai/dsh-pingshun-buddy`（官方 dsh release family 要求 @deepseek-ai/ scope + 全家族同版本 `0.2.2-rc.3`）。版本已对齐 family；**buddy 随 DSH 版本号走，不再独立版本**。

### 验证过的链路（2026-11-16，Linux）
1. `pnpm run build`（local profile）**10/10 gates 全过**（buddy 注册进 host/client aggregates 后，聚合 typecheck 通过）
2. `pack-local-packages`：384 tarball（含 buddy，**`.env` 在 tarball 内**）
3. `prepare-package-set`（dsh+vendor+landlock 闭包）：**344 包，含 buddy**
4. 46/46 单测通过

### GitHub Actions 打包（`.github/workflows/pingshun-package.yml`）
Actions → **Package Pingshun Buddy · unsigned test installers** → Run workflow：
- windows-latest：`package:win:x64:unsigned` → artifact `pingshun-buddy-windows-x64`（exe）
- macos-latest：`package:mac:arm64:unsigned` → artifact `pingshun-buddy-macos-arm64`（dmg）

**前置条件**：代码（含 `.env` 修改）先 commit + push。`.env` 当前被 .gitignore 排除——**推送到仓库即进入 git 历史**，测试阶段接受（内部仓库）；否则需改为打包时注入。

### 未验证项
- exe/dmg 真机安装验收（CI 首次运行待观察）
- 官方 desktop CI 其他 gates（smoke-packaged-runtime 等）在托管 runner 上的兼容性
- mac Intel（mac-x64）未配 job，需要时加 `macos-13` runner
