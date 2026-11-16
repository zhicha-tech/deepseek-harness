/**
 * `pingshun.buddy` namespace dictionaries: the mode-switch entry, the Buddy
 * sidebar (agent catalog and session grouping), the tool drawer, and the
 * header button. Simplified Chinese is the key-set source of truth; other
 * languages fall back through the locale lookup chain.
 */

export type PingshunLocaleKey =
  | 'mode.toBuddy'
  | 'mode.toNative'
  | 'mode.toBuddy.short'
  | 'mode.toNative.short'
  | 'panel.title'
  | 'panel.agents'
  | 'panel.sessions'
  | 'panel.agentUnavailable'
  | 'panel.newSession'
  | 'panel.empty'
  | 'drawer.title'
  | 'drawer.empty'
  | 'drawer.group.files'
  | 'drawer.group.documents'
  | 'drawer.group.retrieval'
  | 'drawer.group.tasks'
  | 'drawer.group.other'
  | 'drawer.state.active'
  | 'drawer.state.conditional'
  | 'drawer.state.inactive'
  | 'drawer.state.failed'
  | 'settings.title'
  | 'settings.hint'
  | 'settings.tokenPlaceholder'
  | 'settings.configured'
  | 'settings.notConfigured'
  | 'settings.save'
  | 'settings.close'
  | 'settings.saved'
  | 'settings.open'
  | 'launcher.more'
  | 'launcher.settings'
  | 'model.managed'
  | 'model.managedHint'
  | 'model.sectionHint'
  | 'model.builtin'
  | 'model.defaultModel'
  | 'model.availableModels'

export const zh: Record<PingshunLocaleKey, string> = {
  'mode.toBuddy': '切换到平顺 Buddy',
  'mode.toNative': '切换到 DeepSeek',
  'mode.toBuddy.short': '平顺 Buddy',
  'mode.toNative.short': 'DeepSeek',
  'panel.title': '平顺 Buddy',
  'panel.agents': '业务 Agent',
  'panel.sessions': '会话',
  'panel.agentUnavailable': '该 Agent 当前不可用',
  'panel.newSession': '新会话',
  'panel.empty': '暂无会话，点击上方 Agent 开始',
  'drawer.title': '工具能力',
  'drawer.empty': '当前会话没有可展示的工具组成',
  'drawer.group.files': '文件',
  'drawer.group.documents': '文档',
  'drawer.group.retrieval': '检索',
  'drawer.group.tasks': '任务',
  'drawer.group.other': '其他',
  'drawer.state.active': '可用',
  'drawer.state.conditional': '按条件启用',
  'drawer.state.inactive': '未启用',
  'drawer.state.failed': '启动失败',
  'settings.title': 'OCR 设置',
  'settings.hint': 'OCR 服务的 API key 仅保存在本机此 Profile 的配置里；读取时脱敏，不会出现在对话或日志中。配置后，六个业务 Agent 即可使用 paddle_ocr 与 mineru_ocr 工具。',
  'settings.tokenPlaceholder': '输入新的 API key（保存后生效）',
  'settings.configured': '已配置',
  'settings.notConfigured': '未配置',
  'settings.save': '保存',
  'settings.close': '关闭',
  'settings.saved': '已保存，下一次 OCR 调用即可使用。',
  'settings.open': 'OCR 设置',
  'launcher.more': '更多',
  'launcher.settings': '设置',
  'model.managed': '平顺模型服务',
  'model.managedHint': '模型由后台统一管理，无需手动配置',
  'model.sectionHint': '模型服务由后台统一接入与管理，以下为当前连接信息（只读，无需手动配置）。',
  'model.builtin': '内置',
  'model.defaultModel': '默认模型',
  'model.availableModels': '可用模型',
}

export const en: Record<PingshunLocaleKey, string> = {
  'mode.toBuddy': 'Switch to Pingshun Buddy',
  'mode.toNative': 'Switch to DeepSeek',
  'mode.toBuddy.short': 'Pingshun Buddy',
  'mode.toNative.short': 'DeepSeek',
  'panel.title': 'Pingshun Buddy',
  'panel.agents': 'Agents',
  'panel.sessions': 'Sessions',
  'panel.agentUnavailable': 'This agent is currently unavailable',
  'panel.newSession': 'New session',
  'panel.empty': 'No sessions yet — pick an agent above to start',
  'drawer.title': 'Tool capabilities',
  'drawer.empty': 'No tool composition to show for this session',
  'drawer.group.files': 'Files',
  'drawer.group.documents': 'Documents',
  'drawer.group.retrieval': 'Retrieval',
  'drawer.group.tasks': 'Tasks',
  'drawer.group.other': 'Other',
  'drawer.state.active': 'Available',
  'drawer.state.conditional': 'Conditional',
  'drawer.state.inactive': 'Disabled',
  'drawer.state.failed': 'Failed',
  'settings.title': 'OCR settings',
  'settings.hint': 'OCR API keys are stored only in this profile on this machine; reads are redacted and keys never appear in chats or logs. Once saved, the six business agents can use paddle_ocr and mineru_ocr.',
  'settings.tokenPlaceholder': 'Enter a new API key (applies on save)',
  'settings.configured': 'Configured',
  'settings.notConfigured': 'Not configured',
  'settings.save': 'Save',
  'settings.close': 'Close',
  'settings.saved': 'Saved; the next OCR call will use it.',
  'settings.open': 'OCR settings',
  'launcher.more': 'More',
  'launcher.settings': 'Settings',
  'model.managed': 'Pingshun models',
  'model.managedHint': 'Models are managed centrally; no manual configuration needed',
  'model.sectionHint': 'The model service is connected and managed centrally. Read-only connection info below.',
  'model.builtin': 'Built-in',
  'model.defaultModel': 'Default model',
  'model.availableModels': 'Available models',
}
