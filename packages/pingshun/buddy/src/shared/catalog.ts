/**
 * Buddy catalog presentation metadata.
 *
 * Keys, names, introductions, welcome copy, and sample prompts for the six
 * first-level business agents. This is presentation content only: availability
 * always comes from the Host agent-preset roster (`agentPresets.list()`), and
 * the UI renders a catalog entry only while the Host lists its preset ID as
 * healthy, so an uninstalled or broken preset never shows as selectable.
 *
 * Scenario sources: 《平顺buddy-决策汇报.pdf》 pages 6–11 (see
 * docs/pingshun/requirements.md).
 *
 * @module
 */

/** One business agent's stable presentation entry. */
export interface BuddyCatalogEntry {
  /** Stable Agent Preset ID as declared by the bundle's preset patches. */
  readonly presetId: string
  /** Chinese display name. */
  readonly name: string
  /** One-line introduction shown under the name. */
  readonly intro: string
  /** Business line grouping label. */
  readonly group: string
  /** Accent color for the avatar block. */
  readonly color: string
  /** Welcome sentence shown when a session with this agent starts empty. */
  readonly welcome: string
  /** Sample prompts offered in the empty state. */
  readonly samples: readonly string[]
}

/** The six first-level agents, in roster display order. */
export const BUDDY_CATALOG: readonly BuddyCatalogEntry[] = [
  {
    presetId: 'ps-office',
    name: '办公 Buddy',
    intro: '讲话稿、汇报材料、公文起草与格式校对、会议纪要',
    group: '办公室',
    color: '#1f6feb',
    welcome: '你好，我是办公 Buddy。把会议主题、要点和往年材料发给我，我来搭结构、写初稿、标出处；定稿永远由你审定。',
    samples: [
      '根据这份会议主题和往年讲话稿，起草一篇讲话稿初稿，并列出待核实清单。',
      '帮我把这份汇报材料整理成结构完整的总结初稿。',
      '按公文规范检查这份通知草稿的格式与要素。',
    ],
  },
  {
    presetId: 'ps-party',
    name: '党建 Buddy',
    intro: '学习材料、主题党日方案、组织生活记录、党务台账自查',
    group: '党建',
    color: '#c0392b',
    welcome: '你好，我是党建 Buddy。学习材料、活动方案、会议记录整理都可以交给我；依据只认党章党规和上级正式文件，每份材料都有出处。',
    samples: [
      '按本月学习主题，整理学习材料要点并列出原文出处。',
      '起草一次主题党日活动方案初稿，要素齐全。',
      '根据这份会议要点，整理组织生活会记录初稿。',
    ],
  },
  {
    presetId: 'ps-publicity',
    name: '宣传 Buddy',
    intro: '新闻稿、公众号推文、汇报片脚本，口径与敏感表述自检',
    group: '宣传',
    color: '#e67e22',
    welcome: '你好，我是宣传 Buddy。把项目照片和基本情况给我，我来写新闻稿、推文多版本初稿和汇报片脚本；发布前由宣传部门审定。',
    samples: [
      '根据这组素材写一篇新闻稿，提供三个备选标题。',
      '把这条项目动态改成公众号推文，附配图建议。',
      '对这份稿件做人名职务与数据口径自检，输出核对清单。',
    ],
  },
  {
    presetId: 'ps-finance',
    name: '财务 Buddy',
    intro: '报销合规核对、合同付款台账、预算执行分析、制度问答',
    group: '财务',
    color: '#27ae60',
    welcome: '你好，我是财务 Buddy。报销单据和制度标准发给我，我逐项核对、标出不符点并附制度依据；不记账、不付款、判断在财务手里。',
    samples: [
      '按差旅费制度逐项核对这批报销单，标出不符处并附依据。',
      '把这几份合同和付款记录归集成付款台账，提示缺项。',
      '根据预算和实际执行数据，起草偏差分析初稿。',
    ],
  },
  {
    presetId: 'ps-tender',
    name: '市场 Buddy',
    intro: '招标文件解析、资格与废标项提取、投标文件编制与自检',
    group: '市场招投标',
    color: '#8e44ad',
    welcome: '你好，我是市场 Buddy。把招标文件发给我，我提取资格条件、评分办法和废标项，形成对照表；投标文件初稿和逐项自检我来做，投不投由你们决定。',
    samples: [
      '解析这份招标文件，提取资格条件、评分办法和废标项，一页列清。',
      '按这个模板起草技术标初稿框架，并列出证照清单。',
      '对照招标要求逐条检查这份投标文件，标出缺项与矛盾。',
    ],
  },
  {
    presetId: 'ps-engineering',
    name: '工程 Buddy',
    intro: '报验预审、施工方案、计量复核疑点、监理记录、设计校审',
    group: '工程现场',
    color: '#16a085',
    welcome: '你好，我是工程 Buddy。报验资料、施工方案、计量表发给我，我对照规范逐项核查，输出带出处的《预审意见单》；结论由工程师与监理复核。',
    samples: [
      '预审这批报验资料，输出缺项、疑点和规范出处的《预审意见单》。',
      '对照工程量清单核对这份计量表，列出疑点说明。',
      '根据监理日志素材整理旁站记录初稿。',
    ],
  },
] as const
