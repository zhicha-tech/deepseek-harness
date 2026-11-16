---
description: "平顺 Buddy 验收记录：实际执行的命令与结果，含通过项与未验证项。"
kind: "reference"
---

# 平顺 Buddy 验收记录（2026-11-12 实测）

## 命令与结果汇总

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 包类型检查 | `pnpm --filter @deepseek-ai/dsh-pingshun-buddy run typecheck`（tsc -b） | ✅ 通过 |
| 2 | 包构建 | `pnpm --filter @deepseek-ai/dsh-pingshun-buddy run bundle`（tsdown） | ✅ `lib/index.js`（ESM 宿主半）+ `lib/client.js`（CJS 21.6 kB，`__ModuleLoader__.load` 包装；外部依赖仅模块表基线：react、react-dom、react/jsx-runtime、dsh-client-store、dsh-client-ui-primitives） |
| 3 | 单元/组件测试 | `npx vitest run --project thread-safe packages/pingshun` | ✅ 15/15（mode-store 持久化与订阅、surface-manager 遮蔽/逆序卸载/幂等/失败回滚、BuddyPanel 目录校真/禁用态/建会话/会话分组、ToolsButton 抽屉分组状态/Esc/遮罩关闭/非 Buddy 不渲染） |
| 4 | 未安装边界 | `pnpm dsh --profile web --dump-config` | ✅ 基线 1305 行、0 处 pingshun 引用（留存 `/tmp/ps-pdf/web-baseline.dump.yml`） |
| 5 | pingshun Profile 合成 | `pnpm dsh --profile pingshun --dump-config` | ✅ 6 × `preset-ps-*` + `pingshun-ui` + `@deepseek-ai/dsh-pingshun-buddy` 层；与 web 基线的 diff 恰为本包 7 行；无 skippedBundles |
| 6 | 浏览器验收（pingshun） | `node scripts/browser-acceptance.mjs <url> /tmp/ps-pdf` | ✅ 14/14：Buddy 默认模式、六 Agent 可见、按 Preset 建会话、Header 工具按钮、抽屉开/关（Esc）、10 次可逆切换无重复入口、原生模式 Agent 行消失、返回 Buddy 恢复（截图 01–06） |
| 7 | web add | `pnpm dsh plugin --profile web add <abs-path>` | ✅ 依赖写入 `link:` 形态、`dsh.profile.bundles` 追加、dump-config 出现 7 行；浏览器确认六 Agent 中文 UI + 底部"切换到 DeepSeek"（截图 web-with-buddy.png） |
| 8 | web remove 还原 | `pnpm dsh plugin --profile web remove @deepseek-ai/dsh-pingshun-buddy` | ✅ `cordis.patch.yml` 与 `--dump-config` 均与安装前**逐字节一致**（package.json 仅空 `dependencies:{}` 键被移除，语义等价）；运行期原生侧栏恢复、0 Buddy 入口（截图 web-restored-native.png） |
| 9 | 探针修正 | —— | 修复 `tool-todo.allowParallelInProgress` 必填缺失（六 preset 激活失败根因）；修复客户端远端命名空间需 `remote.agentPresets`/`remote.pluginInventory` 显式 inject |

## 通过的验收矩阵（对应任务书 §9）

- **Profile 边界**：未安装的两个 profile（web 基线、web remove 后）运行期与合成树均无平顺行（机器 diff 证据）。
- **六角色**：六个 `ps-*` preset 真实注册（dump-config + Host roster 经 `agentPresets.list` 在 UI 校真）；broken/未安装的 preset 在 UI 中禁用并显示原因（单测覆盖）。
- **双向切换**：无需刷新往返 10 次，footer 入口常驻、无重复 slot/入口（浏览器断言）；入口在两模式都可见。
- **单 Agent 聊天**：中栏为原生 Conversation/Composer（截图 02/03），本包未触碰消息协议；空白会话 Hero、历史会话 Header 均为原生行为。
- **Session 绑定**：点击 Agent 经 `uiWorkspace.startSession(undefined, { agentPreset })` 创建绑定会话（浏览器验证会话视图出现绑定 Agent）；会话-Preset 由服务端日志记录，UI 按 `agentPreset` 投影分组展示。
- **工具抽屉**：默认关；数据 = `pluginInventory.list()` 服务端真快照；按 文件/文档/检索/任务 分组；状态含 可用/按条件启用/未启用/启动失败；切会话 remount 自动关闭并丢弃旧读（单测覆盖）。
- **响应式**：抽屉宽度 `min(336px, 92vw)`；1440px 桌面实测通过；1024/500/375 未逐一截图（CSS 仅有视口相对宽度与固定右抽屉，无宽屏专属布局），记录为"部分验证"。
- **连续切换残留**：10 次切换断言 + surface-manager 幂等/逆序卸载单测；DOM 层 Observer/监听无残留由组件级 cleanup 保证。

## 未验证 / 超出本期（如实声明）

1. **模型真实回答**：环境无 `DEEPSEEK_API_KEY`，未验证六 persona 的真实生成质量与引用行为（首个欢迎消息内容来自旧 profile 遗留会话，与本包无关）。配置 key 后重复步骤 6 即可覆盖。
2. **多用户 / ACL**：Profile 不是权限系统；多员工按单位隔离部署未在本期范围（PDF 第 12–13 页的账号管理要求需部署决策）。
3. **文档读写真实链路**：`tool-office`/`tool-fs` 已挂载并出现在组成中，但端到端生成 Word 未验证（依赖模型调用）。
4. **npm 发布**：`engines.dsh`、`files`、peer 版本已按发布形态声明；`pnpm pack` 产物与注册表安装未实测（无发布凭据）。
5. **窄屏逐点截图**：见响应式说明。

## 本轮新增：OCR 工具 + token 配置 + 模式驱动装卸（2026-11-13 实测）

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 10 | 包类型检查/构建 | `pnpm --filter @deepseek-ai/dsh-pingshun-buddy run build` | ✅ 多入口产物（lib/index.js、lib/host/runtime.js、lib/host/ocr-tools.js、lib/client.js） |
| 11 | 单元/组件/OCR 协议测试 | `npx vitest run --project thread-safe packages/pingshun` | ✅ 20/20（新增 5 个 OCR 客户端 mock 测试：PaddleOCR 提交→轮询→JSONL 折叠、失败结构化、缺源校验；MinerU URL 任务与本地签名上传→zip→full.md） |
| 12 | 六 Agent 动态注册 + OCR 工具挂载 | `node scripts/ocr-acceptance.mjs <url>` | ✅ 六 Agent enabled（roster 无 broken，ocr-tools 已挂载） |
| 13 | OCR 设置面板 | 同上 | ✅ 面板打开、PaddleOCR/MinerU token 状态显示、保存测试 token 后状态翻转"已配置"（截图 ocr-settings*.png） |
| 14 | token 持久化与桥接 | 读 `~/.dsh/profiles/pingshun/cordis.patch.yml` | ✅ `pingshun-runtime.config.paddleToken` 与 `buddyMode` 写入 profile patch；runtime 桥接到 `PINGSHUN_*` env（测试 token 已清理） |
| 15 | 模式切换的 Host 装卸 | 同上（切 DeepSeek → 切回 Buddy） | ✅ DeepSeek 模式 Buddy 面板消失（presets 卸载）；切回后六 Agent 重新注册且 enabled（截图 ocr-deepseek-mode.png、ocr-buddy-back.png） |
| 16 | OCR 工具隔离 | 静态事实 + 注册位置 | ✅ `paddle_ocr`/`mineru_ocr` 只在六个 `ps-*` preset 内注册；官方 standard preset 不含；DeepSeek 模式 ps-* 卸载 |

### 本轮联调修正的真实问题（记录）

1. `tool-todo.allowParallelInProgress` 必填缺失 → 六 preset 激活失败（已修，见上一轮）。
2. preset 内工具 inject Host 级 `pingshunOcr` 服务失败（`never started`，scope 隔离）→ 改为 `process.env` 桥接。
3. `@deepseek-ai/dsh-tools` 被内联拖入 `@Remote` 装饰器代码（`Invalid or unexpected token`）→ 提为 peerDependency 外部化。
4. cordis.patch.yml 只剩子路径行导致 client 不进 boot manifest → 保留包名行 `pingshun-ui` + runtime 行。
5. 切回 Buddy 时 roster 读到卸载后的空状态 → surface-manager enter 加 1.5s 二次刷新。

### 本轮未验证项

- **真实云端 OCR 识别**：需有效 PaddleOCR/MinerU token + 真实文件；当前以 mock 覆盖协议，UI 配置链路已验证。
- **DeepSeek 模式下 Buddy 历史会话恢复**：按设计会因 preset 卸载而不可恢复（`agent-preset/not-found`），切回 Buddy 即可；UI 入口提示文案在文档说明，未单独做拦截 UI。

## 本轮修复：选择器窗口期 + OCR 设置入口位置（2026-11-13 实测）

### 问题诊断（先行调研，未急着改）

用户反馈：DeepSeek 模式下中间对话框的模式选择器仍能选到六个 Buddy agent。三个对照实验定位：

- 切到 DeepSeek 后立即看选择器：六个都在（复现）。
- 持久化 DeepSeek 状态（buddyMode=dsh）下看：六个都不在。
- 切到 DeepSeek 后等 5s 再看：六个都不在。

根因：`runtime.ts` 的卸载是**串行** `for (await dispose())`，六个 preset 逐个从 roster 移除需数秒，窗口期内选择器仍读到含六个的 roster。卸载机制本身正常，问题在时序。

### 修复与验证

| 修复 | 内容 | 验证 |
|---|---|---|
| 并行卸载/注册 | `syncMode` 改为先同步触发全部 `unregister()`（其 `definitions.delete` 同步执行，roster 立即不含六个），再 `Promise.all` 等清理；注册同样并行 | 切到 DeepSeek 后**立即**打开选择器，六个全部消失（窗口期消除），截图 fix-chip-immediate.png |
| OCR 设置移到"更多" | 入口从 Buddy 左栏中部移到左下角"更多"菜单（`sidebar.panellist.actions`）；弹窗状态用模块级 store + 常驻 Buddy 面板渲染（More 菜单项随菜单卸载，不能持有弹窗状态） | More 菜单含"OCR 设置"，点击打开弹窗成功（截图 fix-more-menu.png）；ocr-acceptance 7 项全过 |

回归：`vitest` 20/20；`browser-acceptance` 14 项 + `ocr-acceptance` 7 项全过。

## 本轮修复：DeepSeek 模式选择器仍显示六个 Agent（2026-11-13 实测）

### 诊断（先调研，含实证）

用户报：DeepSeek 模式下中间对话框的模式选择器仍显示六个 Buddy agent。分层定位：

1. **Host 卸载机制正常**：写文件诊断日志证实，切到 DeepSeek 时 `volatile-update buddyMode=dsh` → `syncMode` → `unregistered all`（roster 卸载成功）。
2. **选择器缓存**：原生选择器（ui-agent-preset 的 seat-store）只在 chip mount/load 时读 roster；切换后不自动重读。其 `refresh()` 监听 `settings/document-updated`（仅 agent-preset-registry 命名空间）与 `connection/reset`（客户端"重新拉数据"通知）。
3. **并发竞态**：页面刚打开（初始异步注册未完成）就切 DeepSeek 时，卸载与注册交错会留下六个。

### 修复（runtime.ts + 客户端）

| 修复 | 内容 | 验证 |
|---|---|---|
| 并行卸载/注册 | `syncMode` 并行触发全部 `unregister()`（`definitions.delete` 同步执行，roster 立即清空） | 切换后 roster 立即正确 |
| latest-wins 序列化 | `targetMode` 跟踪最新 buddyMode + 序列化循环（`running`/`again`），快速切换/初始竞态都收敛到最新模式 | 单测 `runtime-mode.host.spec.ts` 4 项（含"初始注册未完成就切换仍收敛为空"、快速往返收敛） |
| 选择器刷新 | 模式切换后 `ctx.emit('connection/reset')`（延迟 400ms 待 Host 卸载），触发原生选择器重新读 roster | 竞态场景（页面刚打开立即切 DeepSeek）选择器六个立即消失（0/6） |

回归：`vitest` 24/24（含新增 4 个 runtime-mode 测试）；`browser-acceptance` 14 项 + `ocr-acceptance` 7 项全过。

诊断期间发现：构建产物里 `console.log` 被 rolldown 视为 pure 移除，诊断须用 `ctx.logger` 或写文件；已清理全部临时诊断代码。
