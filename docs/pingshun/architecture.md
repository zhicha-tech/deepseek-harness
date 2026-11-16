---
description: "平顺 Buddy 在 DSH 上的真实架构：Slot/API/构建/安装的全部实现位置与核实来源。"
kind: "reference"
---

# 平顺 Buddy 技术架构（真实接口映射）

> 所有接口均在当前检出的 DSH 源码（0.2.2-rc.2）中核实；本文件记录"用了什么、在哪核实的"。

## 1. Bundle 结构（发布单元）

- `package.json` `dsh.bundle.patch`：有序 patch 文件数组（`cordis.patch.yml` + 六个 `presets/*.patch.yml`）。核实：`packages/bundle/web-app/package.json` 同字段；`packages/util/official-bundles/src/bundles.ts` 的 Profile 模板。
- `dsh.client { platform: 'web', immediately: true, inject: [...] }` + `./client` 导出：modules node half 扫描 Loader entries 组装 `window.__DSH_BOOT__` 并服务 `/plugins/<pkg>/client.js`。核实：`packages/client/modules/src/index.ts`（"declares dsh.client but exports no ./client bundle" 报错路径）、`packages/preset/agent-preset/skills/dsh-doc/references/ui-plugin.md`。
- 显示元数据：`icon.svg` + `locale/*.json` 的 `meta.title/description/detail`。核实：`packages/experimental/badge-skill-bundle`、`packages/util/package-manifest/src/types.ts`（`PluginLocalizedMeta`、`DshBundleManifest` 无 title 字段）。
- 依赖声明：registry 精确版本（`@deepseek-ai/cordis: 4.1.0` peer；dsh 包 `0.2.2-rc.2` devDeps），兼容门由 `engines.dsh` 承担。核实：`packages/boot/app-boot/src/plugin-compatibility.ts`（`engines.dsh` 优先、`semver.satisfies(includePrerelease)`）、plugin-manager README（本地路径记 `link:`/`file:`）。

## 2. 六个 Agent Preset（声明式 Cordis 行）

- 行形态：`- insert: [{ id: preset-ps-*, name: '@deepseek-ai/dsh-agent-preset', config: { id, name, description, order, plugins } }]`；重复 `config.id` 加载即失败（因此用 `ps-` 前缀防撞）。核实：`packages/preset/agent-preset/README.md`、`packages/bundle/web-app/presets/standard.patch.yml`。
- 人设：`@deepseek-ai/dsh-persona` 的 `prefix`（shadow 部署级 persona；全局挂载会冲突，只能挂 preset 内）。核实：`packages/preset/persona/README.md`。
- 工具行配置必填项：`tool-fs-search.sampleOverCapGlobResults` 与 `tool-todo.allowParallelInProgress` 为 `z.boolean().required()`（schemastery 语义：显式 `.required()` 才必填），必须显式给值；`time-context`/`tool-ask-user` 等字段有默认或可空。核实：各插件 `src/index.ts` 的 `Config: z`；本次交付中 tool-todo 缺配置导致的 preset 激活失败已在六文件修复。
- Roster 只读 API：`ctx.remote.agentPresets.list()`（`AgentPresetRoster`，含 `broken` 健康状态）；Session 创建 `session-controller` create 携带 `agentPreset`，恢复按日志、`agent-preset/not-found|invalid` 显式报错。核实：`packages/preset/agent-preset-registry/src/types.ts`、`packages/api/session-controller/src/agent.ts`、`packages/client/ui-workspace/src/client/navigation.ts`（`startSession(workspaceId?, { agentPreset })`）。
- 会话-Preset 投影：`projectionValues.agentPreset`（`SessionProjectionMap.agentPreset: string | null`，agent-preset-registry 声明合并）。Buddy 左栏按它分组会话。

## 3. Buddy Web UI（客户端插件）

- 构建：`tsdown.config.ts` 复用仓库 `packages/client/tsdown.client.ts` 的 `clientBundle()` — CJS + `window.__ModuleLoader__.load({id, factory(require){}})` 包装；模块表基线外部（react、react-dom、react/jsx-runtime、dsh-client-store、dsh-client-ui-primitives），其余内联；CSS Modules 构建期内联注入。核实：`tsdown.client.ts` 的 banner/footer 与 `deps.neverBundle/alwaysBundle`、`packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES`。
- 客户端服务注入：插件级 `export const inject`；**远端命名空间需显式声明子路径键**（`remote.agentPresets`、`remote.pluginInventory`），否则运行时报 `cannot get property "remote.X" without inject`。核实：ui-plugin-manager 的 `inject = [... 'remote.pluginManager', 'remote.pluginInventory' ...]`；本次联调实测。
- Slot 注册形态：`ctx.slots.inject(slot, () => ctx.slots.register(options, Component))`；注入成员展开到 props 顶层、`hooks: { x }` 成员转 `useXxx` hook；props 类型 = `PropsRuntime<K> & PropsLocale<NS> & InjectFace<OwnInjected>`。核实：`packages/client/ui-jobs/src/client/index.ts`、`JobListAction.tsx`、`ui-workspace/src/client/session-actions/ArchiveSession.tsx`。
- 模式切换（可逆接管）：
  - `single` slot 语义：同 priority 重复注册抛错；不同 priority 相互遮蔽且**低者渲染**。Buddy 以 `priority: -10` 遮蔽 `sidebar.workspaces`，dispose 即还原。核实：`packages/client/ui-slots/src/index.ts` register switch、`packages/client/ui-renderer/src/client/registry.ts` root 注释（"lower priority … makes it the winner"）。
  - 常驻入口：`sidebar.footer.action`（list slot，owner `{ wide }`，由 ui-sidebar 渲染于 Settings 上方）单条目随 mode-store 翻转文案，两模式都不丢。核实：`packages/client/ui-sidebar/src/client/SidebarRoot.tsx:464`、contract/slots.ts。
  - 会话 Header：`conversation.session.header.utilities`（list, scope: session）承载「工具能力」按钮；空白会话显示 Hero、无 Header 条（原生行为），按钮出现在非空白会话。核实：`packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:210`、`contract/slots.ts`。
  - 会话切换：session-scoped entry 随会话 remount，抽屉自动关闭并丢弃 in-flight 读（AbortController）。
- 模式状态：`mode-store.ts` 模块级 store + `useSyncExternalStore` + `sessionStorage`（键 `pingshun.buddy.mode`）；首次进入默认 buddy（安装即 opt-in）。
- 工具抽屉数据：`ctx.remote.pluginInventory.list()`（web bundle 已挂的只读投影）→ `agentPresets[]` 按 preset id 取组成行（`enabled: boolean | 'conditional'`、`fiberPhase`、显示 meta），客户端按模块名分组。核实：`packages/host/plugin-inventory/src/types.ts`（`AgentPresetPluginRow`）、`ui-plugin-manager/src/client/manager-store.ts:1119`。
  - **模型级工具枚举的缺口（如实）**：Host 侧存在 `ctx.agents.get(sessionId).ctx.tools.definitions(agentScope)`（`packages/core/agent`、`packages/core/tools`），但暴露给浏览器需要新 TypertRemoteService 且修改 DSH 拥有的 `packages/api/remotes/src/client/index.ts` 静态合成表 —— 违反零修改约束，本期未做；抽屉展示组成行粒度的真实状态，不伪造模型工具清单。
- Locale：`LocaleNamespaceMap` 声明合并在 `@deepseek-ai/dsh-client-ui-slots`（不是 locale 包）；`ctx.locale.register(NS, { zh, en })` + register options `locale: NS` 提供 `t`。核实：`ui-sidebar/src/client/index.ts:35`。

## 4. 安装 / Profile

- `dsh plugin --profile <name> add <dir|spec>`：profile 目录内 pnpm add + 追加 `dsh.profile.bundles`；`remove` 反向还原；`--dump-config` 打印合成树。核实：`packages/boot/plugin-manager/README.zh.md`、`docs/cli-help.md`。
- pingshun Profile = `[dsh-base, dsh-web-app, @deepseek-ai/dsh-pingshun-buddy]`，与官方 `web` 模板（`PROFILE_TEMPLATES`）同基座；`scripts/install-profile.mjs` 重建前把旧 profile 改名备份（不删除、不触碰 web）。

## 5. 新包的仓库收录方式（零修改证据）

- workspace：`pnpm-workspace.yaml` glob `packages/*/*` 自动收录 `packages/pingshun/buddy`（未改该文件）。
- vitest：根 `vitest.config.ts` include `packages/*/*/tests/**/*.spec.{ts,tsx}` 自动发现（未改）。
- tsconfig：包内 `tsconfig.json` extends `tsconfig.base.client.json`；类型经 base 的 `paths`（→ 源码）与缺失项的 registry d.ts（`@deepseek-ai/dsh-client-ui-sidebar/client` 无 paths 条目）双通道解析。
- 仓库聚合 typecheck/build（`tsconfig.host/client.json` references）未纳入新包——包以自身脚本构建验证，属有意为之（不修改 DSH 构建清单）。

## 6. OCR 工具与模式驱动架构（v0.1 新增）

> 本轮新增：双 OCR 工具、API key 设置配置、模式切换时真实注册/卸载 Agent。以下为核实后的实现要点。

### 6.1 动态 Preset 注册（替代静态 patch 行）

- `ctx.agentPresets.register(definition)` 返回 `unregister()` disposer；`PresetDefinition.plugins` 即 patch 行对象数组（`Omit<EntryOptions,'id'|'disabled'> & { id?, disabled? }`，支持 `group/isolate/config` 嵌套）。核实：`packages/preset/agent-preset-registry/src/index.ts:97`、`definition.ts`。
- 六个 preset 定义在 `src/host/presets.ts`（JS 数据，替代原 `presets/*.patch.yml`）；由 runtime 插件按 `buddyMode` 注册/注销。正在运行的 Agent 保留旧 revision，不中断；卸载后该 preset 的历史会话在恢复时按当前定义解析，缺失则 `agent-preset/not-found`（故 DeepSeek 模式下 Buddy 历史会话不可恢复，切回即可）。
- 模块解析：动态注册时 `baseUrl` 取注册方（runtime 插件）的 context，包内子路径（`@deepseek-ai/dsh-pingshun-buddy/ocr-tools`）经包 `exports` 解析。

### 6.2 OCR 工具为何用环境变量桥接（而非 Host 服务注入）

- 初版让 preset 内工具 `inject ['tools','pingshunOcr']` 消费 Host 级 OCR 服务，实测报 `pingshun-ocr-tools: never started`——**preset scope 不能 inject Host 级服务**（scope 隔离）。
- 改为：runtime 插件把 volatile secret token 桥接到进程环境变量（`PINGSHUN_PADDLE_OCR_TOKEN` / `PINGSHUN_MINERU_OCR_TOKEN` 等），OCR 工具读 `process.env` 直接调云端客户端。与 DSH 自身 `DEEPSEEK_API_KEY` env 模式一致；进程全局，preset 内可读。

### 6.3 API key 的 Settings 配置

- runtime 插件 Config 声明 `paddleToken`/`mineruToken` 为 `z.string().role('secret').volatile()`，`buddyMode` 为 `z.union(['buddy','dsh']).default('buddy').volatile()`。核实样板：`packages/web/web-search-deepseek/src/index.ts:72`（`apiKey: z.string().role('secret').volatile()`）。
- 读取：`config.field.get()`（运行期最新值）；监听：`ctx.on('loader/volatile-update', ...)`。核实：`vendor/loader/README.md`（`_commitVolatile` 提交并发出 `loader/volatile-update`）、`packages/client/product-analytics/src/index.ts:53`。
- 客户端读写：`ctx.remote.settings.describe()`（Result 包装；`namespaces[].secrets: [{ path, set }]` 表示 secret 是否已配置，**不回传真实值**）、`ctx.remote.settings.update(ns, patch, expectedRevision?)`（合并写入 user section，持久化到 profile 的 `cordis.patch.yml`）。核实：`packages/api/settings-controller/src/index.ts:97`（describe/update/replace/mutate）、`packages/client/ui-agent-preset/src/client/settings-store.ts`（update 用法）。
- **secret 的"脱敏"是传输/展示层**；本机持久化到 profile patch 为明文（文件权限保护）。UI 文案据此表述为"本机保存、读取脱敏"。

### 6.4 Host 端构建的多入口与外部化（关键坑）

- 包新增 Host 子路径导出 `./runtime`、`./ocr-tools`，`tsdown.config.ts` 用 `clientBundle(dir, [index, host/runtime, host/ocr-tools])` 多入口；产物保留 `lib/host/` 目录并产生顶层共享 chunk。
- **`@deepseek-ai/dsh-tools`（含 `defineTool`）必须列为 peerDependency**：若在 devDependencies 会被内联并拖入带 `@Remote` 装饰器的 dsh-llm 代码，Node 报 `Invalid or unexpected token`。列为 peer 后由 DSH 宿主提供、Host 端外部化（`productionExternals` 含 peer）。
- **必须保留一个"包名"Loader 行**（`pingshun-ui`，name: `@deepseek-ai/dsh-pingshun-buddy`）：modules 的 `dsh.client` 扫描按包名识别 Loader 行；若只剩子路径行（`@deepseek-ai/dsh-pingshun-buddy/runtime`），client 插件不会进入 boot manifest、不加载。
- 客户端读远端命名空间需在插件级 `inject` 显式声明子路径：`remote.agentPresets`、`remote.pluginInventory`、`remote.settings`，否则 `cannot get property "remote.X" without inject`。

### 6.5 模式切换的客户端链路

- `mode-store.bindSettings({ write, initial })`：切换时 `remote.settings.update('pingshun-runtime', { buddyMode })` 驱动 Host 注册/卸载；启动时 `describe()` 读持久化 `buddyMode` 作为初始值。
- 切回 Buddy 时 Host 异步重新注册，客户端 surface-manager 的 `enter()` 立即读 roster + 1.5s 后二次刷新，避免读到卸载后的空 roster。
