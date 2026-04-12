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

// 翻译字典类型
type Dict = Record<string, string>;

const zh: Dict = {
  // SkillManager
  'skill.title': 'Skill 管理器',
  'skill.search_placeholder': '搜索 Skill（输入名称或关键词）',
  'skill.search': '搜索',
  'skill.tab_installed': '已安装',
  'skill.tab_available': '可用',
  'skill.loading': '加载中...',
  'skill.no_installed': '暂无已安装的 Skill',
  'skill.no_installed_hint': '搜索并安装 Skill 来扩展 DeepBot 的能力',
  'skill.no_results': '未找到匹配的 Skill',
  'skill.no_results_hint': '尝试其他关键词搜索',
  'skill.install': '安装',
  'skill.uninstall': '卸载',
  'skill.installing': '安装中...',
  'skill.uninstalling': '卸载中...',
  'skill.installed_at': '安装时间',
  'skill.version': '版本',
  'skill.enabled': '已启用',
  'skill.disabled': '已禁用',
  'skill.confirm_uninstall': '确定要卸载 {name} 吗？',
  'skill.detail': '详情',
  'skill.close': '关闭',
  'skill.back': '返回',
  'skill.description': '描述',
  'skill.repository': '来源',
  'skill.usage_count': '使用次数',
  'skill.config': '配置',

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

  // 通用
  'common.close': '关闭',
  'common.save': '保存',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.loading': '加载中...',
  'common.error': '错误',
  'common.success': '成功',
};

const en: Dict = {
  // SkillManager
  'skill.title': 'Skill Manager',
  'skill.search_placeholder': 'Search skills (name or keyword)',
  'skill.search': 'Search',
  'skill.tab_installed': 'Installed',
  'skill.tab_available': 'Available',
  'skill.loading': 'Loading...',
  'skill.no_installed': 'No skills installed',
  'skill.no_installed_hint': 'Search and install skills to extend DeepBot',
  'skill.no_results': 'No matching skills found',
  'skill.no_results_hint': 'Try different keywords',
  'skill.install': 'Install',
  'skill.uninstall': 'Uninstall',
  'skill.installing': 'Installing...',
  'skill.uninstalling': 'Uninstalling...',
  'skill.installed_at': 'Installed',
  'skill.version': 'Version',
  'skill.enabled': 'Enabled',
  'skill.disabled': 'Disabled',
  'skill.confirm_uninstall': 'Uninstall {name}?',
  'skill.detail': 'Details',
  'skill.close': 'Close',
  'skill.back': 'Back',
  'skill.description': 'Description',
  'skill.repository': 'Source',
  'skill.usage_count': 'Usage',
  'skill.config': 'Config',

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

  // 通用
  'common.close': 'Close',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',
  'common.error': 'Error',
  'common.success': 'Success',
};

const dictionaries: Record<Language, Dict> = { zh, en };

/**
 * 获取翻译文本
 * @param key 翻译键
 * @param params 插值参数
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
