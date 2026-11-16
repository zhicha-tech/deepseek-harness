# @deepseek-ai/dsh-pingshun-buddy — 平顺 Buddy Bundle

> 六个企业办公数字同事 Agent Preset（办公、党建、宣传、财务、市场招投标、工程现场）+ DS-Bot 风格 Buddy Web UI + 两个 OCR 工具（PaddleOCR / MinerU），作为一个可安装、可卸载、可发布的 DeepSeek Harness（DSH）Profile Bundle。
>
> 业务依据：《平顺buddy-决策汇报.pdf》第 5–13 页（详见 `docs/pingshun/requirements.md`）。

## 安装

对任意基于 `dsh-base + dsh-web-app` 的 Profile（含官方 `web` Profile）：

```sh
# 本地目录安装（开发形态）
dsh plugin --profile pingshun add /abs/path/to/this/package
dsh plugin --profile web add /abs/path/to/this/package

# npm 发布后（发布形态）
dsh plugin --profile web add @deepseek-ai/dsh-pingshun-buddy
```

也可以用 Web 侧边栏「插件」页安装同一 spec。安装需要包已构建（`lib/client.js` 存在）：

```sh
pnpm install && pnpm --filter @deepseek-ai/dsh-pingshun-buddy run build
```

## 卸载

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-pingshun-buddy
```

卸载即完整还原：bundles 列表摘除、运行时贡献卸载、原生界面恢复（已验证 `--dump-config` 与卸载前逐字节一致）。

## 推荐部署形态：pingshun Profile

与日常使用的 `web` Profile 相互隔离：

```sh
node scripts/install-profile.mjs        # 备份并重建 ~/.dsh/profiles/pingshun（不触碰 web）
pnpm dsh --profile pingshun
```

## 交付内容

| 组成 | 说明 |
|---|---|
| 六个 Agent Preset | `ps-office / ps-party / ps-publicity / ps-finance / ps-tender / ps-engineering`，各含中文业务 persona（任务/流程/引用与待核实纪律/边界）与确定性工具基线。**由 Host runtime 插件按 `buddyMode` 动态注册/注销**（非静态 patch 行） |
| Buddy Web UI | 客户端插件：Buddy 模式左栏（Agent 目录 + 会话分组 + OCR 设置入口）、会话 Header「工具能力」按钮与右侧抽屉、侧栏底部常驻「切换到平顺 Buddy / 切换到 DeepSeek」双向入口 |
| OCR 工具 | `paddle_ocr`（PaddleOCR-VL，扫描件/图片/PDF 识别为 Markdown）与 `mineru_ocr`（MinerU 精准解析，表格/公式/多栏版式），**只在六个业务 preset 内注册**，DeepSeek 原生 preset 不含 |
| Host 半 | `src/host/runtime.ts`：`pingshun-runtime` 插件（OCR token 桥接 + buddyMode 驱动 preset 装卸）；`src/host/ocr-*.ts`：OCR 客户端与工具 |

## OCR 工具与 API key 配置

两个 OCR 工具消费云端服务，API key 在 Buddy 内单独配置：

1. Buddy 左栏底部「**OCR 设置**」打开配置面板。
2. 分别填写 **PaddleOCR token** 与 **MinerU token**，保存即生效（无需重启）。
3. 保存后，六个业务 Agent 即可用 `paddle_ocr` / `mineru_ocr` 识别扫描件、图片、PDF、Office 文档为 Markdown。

- token 字段是 Settings 的 **secret volatile** 配置：读取/展示时脱敏（只显示"已配置/未配置"），**本机明文持久化**到该 Profile 的 `cordis.patch.yml`（文件权限保护）；token 不进入对话内容或日志。
- 配置写入 → Host `loader/volatile-update` → runtime 把 token 桥接到进程环境变量（`PINGSHUN_PADDLE_OCR_TOKEN` / `PINGSHUN_MINERU_OCR_TOKEN`），OCR 工具读取。这是与 DSH 自身 `DEEPSEEK_API_KEY` 相同的通道；preset 作用域无法注入 Host 级服务，故用环境变量桥接。
- 未配置 token 时，工具返回明确的中文错误提示去设置。

## 模式机制（真实的注册/卸载）

- `buddyMode` 是持久化的 Profile 级设置（settings 命名空间 `pingshun-runtime`），是 UI 模式的唯一真源。
- **Buddy 模式**：Host 注册六个业务 preset（含 OCR 工具行）；客户端低优先级遮蔽 `sidebar.workspaces` 接管左栏。
- **DeepSeek 模式**：Host **卸载**六个 preset（roster 中移除，不能再新建 Buddy 会话）；客户端还原原生工作区。正在运行的 Agent 保留其已挂载 revision，不中断。
- 切换无需刷新、不卸载 Bundle；侧栏底部常驻双向入口，两模式都不丢。
- 注意：DeepSeek 模式下 Buddy 历史会话因 preset 已卸载而不能恢复，切回 Buddy 后即可恢复（入口提示）。

## 工具基线（六个 Preset 一致）

`tool-fs`（读写，禁 applyPatch）、`tool-fs-search`、`tool-skill`、`tool-office`、`tool-todo`、`tool-ask-user`、`time-context`、compaction 组，外加 `paddle_ocr`、`mineru_ocr`。**不挂** bash/pwsh/`tool-web`（落实 PDF"资料不出单位"边界；如需联网检索，在 profile patch 中对对应 preset 的 plugins 追加 `tool-web` 行即可）。

## 构建 / 测试 / 验收

```sh
pnpm --filter @deepseek-ai/dsh-pingshun-buddy run typecheck   # tsc -b
pnpm --filter @deepseek-ai/dsh-pingshun-buddy run bundle      # tsdown：宿主半 + lib/client.js
npx vitest run --project thread-safe packages/pingshun   # 20 个单元/组件/OCR 协议测试

# 启动后跑两套浏览器验收
node scripts/install-profile.mjs && pnpm dsh --profile pingshun --no-open --port 3214
node scripts/browser-acceptance.mjs "<tokenized-url>" /tmp/shots   # 14 项 Buddy 基础验收
node scripts/ocr-acceptance.mjs "<tokenized-url>" /tmp/shots       # 7 项 OCR/模式切换验收
```

## 已知边界

- Profile 是运行配置，不是权限系统：单机单用户部署天然隔离；多员工/涉密场景需按单位独立实例与账号体系（见 `docs/pingshun/delivery.md`）。
- 本环境未配置有效模型/OCR 凭据时，真实云端识别与模型生成未验证；协议、配置链路、注册/卸载均为可复现的机器验证（dump-config diff、浏览器交互、mock 单测）。
