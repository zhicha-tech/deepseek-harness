# 平顺 Buddy 开放问题

## 品牌替换范围

| # | 问题 | 现状 | 备选方案 | 状态 |
|---|---|---|---|---|
| B1 | 设置→关于区域的 "DSH 本地构建" 字样 | settings 内 `t()` 直接输出，无官方 slot | (a) 保留；(b) 向官方提 brand slot 需求；(c) DOM 替换（不符合官方工程规范） | **建议保留**，向官方提需求 |
| B2 | 桌面「关于」菜单、dock 图标 | Electron 主进程（`apps/desktop/locale.ts`），client 插件不可及 | (a) 保留；(b) 需桌面端打包时改 Electron 主进程配置（超出 client 插件能力） | **需桌面打包方案**时处理 |
| B3 | "标准模式" chip 在 Buddy 模式下的处理 | 官方 preset 显示名，无 slot；保留入口（用户仍可选用官方 preset） | (a) 保留；(b) 产品决策是否隐藏 | **产品决策待确认** |
| B4 | 首屏加载闪现官方 title/favicon | `index.html` 静态阶段，bundle 执行前 | (a) 接受（bundle 执行后立即替换）；(b) 需官方 HTML 模板 slot | **接受**（无官方钩子） |
