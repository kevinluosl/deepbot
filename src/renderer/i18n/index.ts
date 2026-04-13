/**
 * 国际化（i18n）系统
 * 
 * 支持中文和英文切换
 */

export type Language = 'zh' | 'en';

const STORAGE_KEY = 'deepbot-language';

export function getLanguage(): Language {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'en' ? 'en' : 'zh';
}

export function setLanguage(lang: Language): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

type Dict = Record<string, string>;

const zh: Dict = {
  // SkillManager
  'skill.title': 'Skill 管理器',
  'skill.search_placeholder': '搜索 Skill...',
  'skill.search': '搜索',
  'skill.search_hint': '💡 Skill 是可扩展的功能模块，可以帮助 DeepBot 完成 PDF 处理、视频下载、图片编辑等专业任务。输入关键词搜索，选择合适的 Skill 点击"安装"即可使用。',
  'skill.tab_installed': '已安装',
  'skill.tab_available': '可用',
  'skill.loading': '加载中...',
  'skill.no_installed': '暂无已安装的 Skill',
  'skill.no_installed_hint': '使用搜索功能查找并安装 Skill',
  'skill.no_results': '搜索 Skill',
  'skill.no_results_hint': '输入关键词搜索可用的 Skill',
  'skill.install': '安装',
  'skill.uninstall': '卸载',
  'skill.installing': '正在安装... {progress}%',
  'skill.confirm_uninstall': '确定要卸载 {name} 吗？',
  'skill.detail': '详情',
  'skill.env_vars': '环境变量',
  'skill.env_hint': '每行一个变量，格式：',
  'skill.env_placeholder': '示例：\n# API Key 配置\nTAVILY_API_KEY=tvly-your-key-here\nANOTHER_KEY=your-value',
  'skill.saving': '保存中...',
  'skill.save': '保存',
  'skill.cancel': '取消',
  'skill.close': '关闭',
  'skill.description': '描述',
  'skill.info': '信息',
  'skill.version': '版本',
  'skill.author': '作者',
  'skill.repository': '仓库',
  'skill.view_repo': '查看仓库',
  'skill.install_path': '安装路径',
  'skill.dependencies': '依赖',
  'skill.tools': '工具:',
  'skill.dep_packages': '依赖包:',
  'skill.tags': '标签',
  'skill.readme': '使用说明 (SKILL.md)',
  'skill.files': '文件',
  'skill.scripts': '脚本',
  'skill.references': '参考文件',
  'skill.assets': '资源文件',
  'skill.more_files': '... 还有 {count} 个文件',
  'skill.search_failed': '搜索失败',
  'skill.possible_reasons': '💡 可能的原因：',
  'skill.reason_network': '网络连接问题',
  'skill.reason_github': '无法访问 GitHub（可能需要代理）',
  'skill.reason_firewall': '防火墙阻止了连接',
  'skill.retry': '重试',

  // ScheduledTaskManager / ScheduledTaskConfig
  'task.title': '定时任务',
  'task.no_tasks': '暂无定时任务',
  'task.no_tasks_hint': '在对话中告诉 DeepBot 创建定时任务',
  'task.loading': '加载中...',
  'task.name': '任务名称',
  'task.description': '任务描述',
  'task.schedule': '调度',
  'task.status': '状态',
  'task.enabled': '已启用',
  'task.disabled': '已禁用',
  'task.last_run': '上次执行',
  'task.next_run': '下次执行',
  'task.run_count': '执行次数',
  'task.never': '从未执行',
  'task.enable': '启用',
  'task.disable': '禁用',
  'task.delete': '删除',
  'task.confirm_delete': '确定要删除任务 "{name}" 吗？',
  'task.edit': '编辑',
  'task.save': '保存',
  'task.cancel': '取消',
  'task.close': '关闭',
  'task.interval': '每隔 {value}',
  'task.cron': 'Cron: {expr}',
  'task.once': '一次性',
  'task.max_runs': '最多 {count} 次',
  'task.seconds': '秒',
  'task.minutes': '分钟',
  'task.hours': '小时',
  'task.times': '次',

  // 通用
  'common.close': '关闭',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.loading': '加载中...',
  'common.error': '错误',
  'common.success': '成功',

  // 系统设置
  'settings.title': '系统设置',
  'settings.quickstart': '快速入门',
  'settings.model': '模型配置',
  'settings.environment': '环境配置',
  'settings.tools': '工具配置',
  'settings.workspace': '工作目录',
  'settings.connectors': '外部通讯',
  'settings.version': '系统版本',
};

const en: Dict = {
  // SkillManager
  'skill.title': 'Skill Manager',
  'skill.search_placeholder': 'Search skills...',
  'skill.search': 'Search',
  'skill.search_hint': '💡 Skills are extensible modules that help DeepBot handle PDF processing, video downloads, image editing and more. Search by keyword and click "Install" to use.',
  'skill.tab_installed': 'Installed',
  'skill.tab_available': 'Available',
  'skill.loading': 'Loading...',
  'skill.no_installed': 'No skills installed',
  'skill.no_installed_hint': 'Search and install skills to get started',
  'skill.no_results': 'Search Skills',
  'skill.no_results_hint': 'Enter keywords to find available skills',
  'skill.install': 'Install',
  'skill.uninstall': 'Uninstall',
  'skill.installing': 'Installing... {progress}%',
  'skill.confirm_uninstall': 'Uninstall {name}?',
  'skill.detail': 'Details',
  'skill.env_vars': 'Environment Variables',
  'skill.env_hint': 'One variable per line, format: ',
  'skill.env_placeholder': 'Example:\n# API Key config\nTAVILY_API_KEY=tvly-your-key-here\nANOTHER_KEY=your-value',
  'skill.saving': 'Saving...',
  'skill.save': 'Save',
  'skill.cancel': 'Cancel',
  'skill.close': 'Close',
  'skill.description': 'Description',
  'skill.info': 'Info',
  'skill.version': 'Version',
  'skill.author': 'Author',
  'skill.repository': 'Repository',
  'skill.view_repo': 'View Repo',
  'skill.install_path': 'Install Path',
  'skill.dependencies': 'Dependencies',
  'skill.tools': 'Tools:',
  'skill.dep_packages': 'Packages:',
  'skill.tags': 'Tags',
  'skill.readme': 'README (SKILL.md)',
  'skill.files': 'Files',
  'skill.scripts': 'Scripts',
  'skill.references': 'References',
  'skill.assets': 'Assets',
  'skill.more_files': '... {count} more files',
  'skill.search_failed': 'Search Failed',
  'skill.possible_reasons': '💡 Possible reasons:',
  'skill.reason_network': 'Network connection issue',
  'skill.reason_github': 'Cannot access GitHub (proxy may be needed)',
  'skill.reason_firewall': 'Firewall blocking connection',
  'skill.retry': 'Retry',

  // ScheduledTaskManager / ScheduledTaskConfig
  'task.title': 'Scheduled Tasks',
  'task.no_tasks': 'No scheduled tasks',
  'task.no_tasks_hint': 'Ask DeepBot to create a scheduled task',
  'task.loading': 'Loading...',
  'task.name': 'Name',
  'task.description': 'Description',
  'task.schedule': 'Schedule',
  'task.status': 'Status',
  'task.enabled': 'Enabled',
  'task.disabled': 'Disabled',
  'task.last_run': 'Last Run',
  'task.next_run': 'Next Run',
  'task.run_count': 'Run Count',
  'task.never': 'Never',
  'task.enable': 'Enable',
  'task.disable': 'Disable',
  'task.delete': 'Delete',
  'task.confirm_delete': 'Delete task "{name}"?',
  'task.edit': 'Edit',
  'task.save': 'Save',
  'task.cancel': 'Cancel',
  'task.close': 'Close',
  'task.interval': 'Every {value}',
  'task.cron': 'Cron: {expr}',
  'task.once': 'Once',
  'task.max_runs': 'Max {count} runs',
  'task.seconds': 's',
  'task.minutes': 'min',
  'task.hours': 'h',
  'task.times': 'times',

  // 通用
  'common.close': 'Close',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',

  // 系统设置
  'settings.title': 'Settings',
  'settings.quickstart': 'Quick Start',
  'settings.model': 'Model',
  'settings.environment': 'Environment',
  'settings.tools': 'Tools',
  'settings.workspace': 'Workspace',
  'settings.connectors': 'Connectors',
  'settings.version': 'Version',
};

const dictionaries: Record<Language, Dict> = { zh, en };

/**
 * 获取翻译文本
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = getLanguage();
  let text = dictionaries[lang][key] || dictionaries['zh'][key] || key;
  
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  
  return text;
}
