/**
 * Skill 管理器组件
 */

import React, { useState, useEffect } from 'react';
import { X, Search, Package, Download, Trash2, Info, Settings } from 'lucide-react';
import '../styles/settings.css';
import { api } from '../api';
import { t, getLanguage } from '../i18n';

interface Skill {
  name: string;        // slug
  displayName?: string;
  description: string;
  version: string;
  author?: string;
  repository?: string;
  stars?: number;
  downloads?: number;
  enabled?: boolean;
  installedAt?: Date;
  usageCount?: number;
  tags?: string[];
}

// Skill 详细信息（从 info 接口返回）
interface SkillInfo extends Skill {
  installPath?: string;
  readme?: string;
  requires?: {
    tools?: string[];
    dependencies?: string[];
  };
  files?: {
    scripts?: string[];
    references?: string[];
    assets?: string[];
  };
}

interface SkillManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SkillManager: React.FC<SkillManagerProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'installed' | 'available'>('installed');
  const [searchQuery, setSearchQuery] = useState('');
  const [installedSkills, setInstalledSkills] = useState<Skill[]>([]);
  const [availableSkills, setAvailableSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // 环境变量编辑状态
  const [envEditSkill, setEnvEditSkill] = useState<string | null>(null);
  const [envContent, setEnvContent] = useState('');
  const [envSaving, setEnvSaving] = useState(false);
  
  // 安装进度状态
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [installProgress, setInstallProgress] = useState(0);

  // 加载已安装的 Skill
  useEffect(() => {
    if (isOpen && activeTab === 'installed') {
      loadInstalledSkills();
    }
  }, [isOpen, activeTab]);

  const loadInstalledSkills = async () => {
    setIsLoading(true);
    try {
      const result = await api.skillManager({
        action: 'list',
      });
      
      if (result.success) {
        // 新格式：{ success: true, skills: [...], count: 0, message: "..." }
        const skills = result.skills || [];
        setInstalledSkills(skills);
      } else {
        console.error('[SkillManager] 加载失败:', result.error);
      }
    } catch (error) {
      console.error('[SkillManager] 加载已安装 Skill 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 搜索 Skill
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsLoading(true);
    setActiveTab('available');
    setSearchError(null); // 清除之前的错误
    
    try {
      const result = await api.skillManager({
        action: 'find',
        query: searchQuery,
      });
      
      if (result.success) {
        // 过滤掉已安装的 Skills
        const installedNames = new Set(installedSkills.map(s => s.name));
        const filteredSkills = (result.skills || []).filter(
          (skill: Skill) => !installedNames.has(skill.name)
        );
        setAvailableSkills(filteredSkills);
      } else {
        // 显示错误信息
        setSearchError(result.error || (getLanguage() === 'zh' ? '搜索失败' : 'Search failed'));
        setAvailableSkills([]);
      }
    } catch (error) {
      console.error('搜索 Skill 失败:', error);
      const errorMessage = error instanceof Error ? error.message : (getLanguage() === 'zh' ? '搜索失败' : 'Search failed');
      setSearchError(errorMessage);
      setAvailableSkills([]);
    } finally {
      setIsLoading(false);
    }
  };

  // 安装 Skill
  const handleInstall = async (skillName: string) => {
    setInstallingSkill(skillName);
    setInstallProgress(0);
    
    // 模拟进度条
    const progressInterval = setInterval(() => {
      setInstallProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);
    
    try {
      const result = await api.skillManager({
        action: 'install',
        name: skillName,
      });
      
      clearInterval(progressInterval);
      setInstallProgress(100);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (result.success) {
        setAvailableSkills(prev => prev.filter(s => s.name !== skillName));
        await loadInstalledSkills();
        setActiveTab('installed');
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error('安装 Skill 失败:', error);
    } finally {
      setInstallingSkill(null);
      setInstallProgress(0);
    }
  };

  // 卸载 Skill
  const handleUninstall = async (skillName: string) => {
    if (!confirm(t('skill.confirm_uninstall', { name: skillName }))) return;
    
    setIsLoading(true);
    try {
      const result = await api.skillManager({
        action: 'uninstall',
        name: skillName,
      });
      
      if (result.success) {
        await loadInstalledSkills();
      }
    } catch (error) {
      console.error('卸载 Skill 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 打开环境变量编辑
  const handleOpenEnvEdit = async (skillName: string) => {
    try {
      const result = await api.skillManager({ action: 'get-env', name: skillName });
      setEnvContent(result.env || '');
      setEnvEditSkill(skillName);
    } catch (error) {
      setEnvContent('');
      setEnvEditSkill(skillName);
    }
  };

  // 保存环境变量
  const handleSaveEnv = async () => {
    if (!envEditSkill) return;
    setEnvSaving(true);
    try {
      await api.skillManager({ action: 'set-env', name: envEditSkill, env: envContent });
      setEnvEditSkill(null);
    } catch (error) {
      console.error('保存环境变量失败:', error);
    } finally {
      setEnvSaving(false);
    }
  };

  // 查看详情
  const handleViewDetails = async (skillName: string, isInstalled: boolean) => {
    
    // 如果是未安装的 Skill，直接从搜索结果中获取信息
    if (!isInstalled) {
      const skill = availableSkills.find(s => s.name === skillName);
      if (skill) {
        setSelectedSkill(skill);
      } else {
        console.error('[SkillManager] 未找到 Skill:', skillName);
      }
      return;
    }
    
    // 如果是已安装的 Skill，从数据库获取详细信息
    setIsLoading(true);
    try {
      const result = await api.skillManager({
        action: 'info',
        name: skillName,
      });
      
      // info action 返回格式: { success: true, skill: {...} } 或 { success: true, name, readme, ... }
      const skillData = result.skill || (result.success && result.name ? result : null);
      if (skillData) {
        setSelectedSkill(skillData);
      } else {
        console.error('[SkillManager] 获取详情失败，返回数据格式不正确:', result);
        // 如果获取失败，尝试从已安装列表中获取基本信息
        const skill = installedSkills.find(s => s.name === skillName);
        if (skill) {
          setSelectedSkill(skill);
        }
      }
    } catch (error) {
      console.error('获取 Skill 详情失败:', error);
      // 如果获取失败，尝试从已安装列表中获取基本信息
      const skill = installedSkills.find(s => s.name === skillName);
      if (skill) {
        setSelectedSkill(skill);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-container">
        {/* 标题栏 */}
        <div className="settings-header">
          <h2 className="settings-title">{t('skill.title')}</h2>
          <button
            onClick={onClose}
            className="settings-close-button"
          >
            <X size={20} />
          </button>
        </div>

        {/* 搜索栏 */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--settings-border)' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search 
                style={{ 
                  position: 'absolute', 
                  left: '12px', 
                  top: '50%', 
                  transform: 'translateY(-50%)',
                  color: 'var(--settings-text-dim)'
                }} 
                size={16} 
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={t('skill.search_placeholder')}
                className="settings-input"
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
              className="settings-button"
            >
              {t('skill.search')}
            </button>
          </div>
          <p style={{ 
            fontSize: '12px', 
            color: 'var(--settings-text-dim)', 
            marginTop: '8px',
            lineHeight: '1.5'
          }}>
            {t('skill.search_hint')}
          </p>
        </div>

        {/* 标签页 */}
        <div style={{ display: 'flex', gap: '16px', padding: '12px 24px', borderBottom: '1px solid var(--settings-border)' }}>
          <button
            onClick={() => setActiveTab('installed')}
            className="settings-button"
            style={{
              background: activeTab === 'installed' ? 'var(--settings-accent)' : 'transparent',
              color: activeTab === 'installed' ? 'var(--settings-bg)' : 'var(--settings-text-dim)',
              borderColor: activeTab === 'installed' ? 'var(--settings-accent)' : 'var(--settings-border)',
            }}
          >
            {t('skill.tab_installed')} ({installedSkills.length})
          </button>
          <button
            onClick={() => setActiveTab('available')}
            className="settings-button"
            style={{
              background: activeTab === 'available' ? 'var(--settings-accent)' : 'transparent',
              color: activeTab === 'available' ? 'var(--settings-bg)' : 'var(--settings-text-dim)',
              borderColor: activeTab === 'available' ? 'var(--settings-accent)' : 'var(--settings-border)',
            }}
          >
            {t('skill.tab_available')} ({availableSkills.length})
          </button>
        </div>

        {/* Skill 列表 */}
        <div className="settings-panel">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-text-secondary">{t('skill.loading')}</div>
            </div>
          ) : activeTab === 'installed' ? (
            installedSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Package size={48} className="text-text-tertiary mb-4" />
                <p className="text-text-secondary">{t('skill.no_installed')}</p>
                <p className="text-sm text-text-tertiary mt-2">{t('skill.no_installed_hint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedSkills.map((skill, index) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    index={index + 1}
                    isInstalled={true}
                    onInstall={() => {}}
                    onUninstall={handleUninstall}
                    onViewDetails={(name) => handleViewDetails(name, true)}
                    onEnvEdit={handleOpenEnvEdit}
                    installingSkill={installingSkill}
                    installProgress={installProgress}
                  />
                ))}
              </div>
            )
          ) : (
            searchError ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <div className="text-red-500 mb-4">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <p className="text-text-primary font-semibold mb-2">{t('skill.search_failed')}</p>
                <p className="text-sm text-text-secondary mb-4 max-w-md whitespace-pre-wrap">{searchError}</p>
                {searchError.includes('GitHub') && (
                  <div className="text-xs text-text-tertiary bg-bg-secondary p-3 rounded-lg max-w-md">
                    <p className="font-semibold mb-2">{t('skill.possible_reasons')}</p>
                    <ul className="text-left space-y-1">
                      <li>• {t('skill.reason_network')}</li>
                      <li>• {t('skill.reason_github')}</li>
                      <li>• {t('skill.reason_firewall')}</li>
                    </ul>
                  </div>
                )}
                <button
                  onClick={handleSearch}
                  className="mt-4 px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 transition-colors"
                >
                  {t('skill.retry')}
                </button>
              </div>
            ) : availableSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Search size={48} className="text-text-tertiary mb-4" />
                <p className="text-text-secondary">{t('skill.no_results')}</p>
                <p className="text-sm text-text-tertiary mt-2">{t('skill.no_results_hint')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableSkills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    isInstalled={false}
                    onInstall={handleInstall}
                    onUninstall={() => {}}
                    onViewDetails={(name) => handleViewDetails(name, false)}
                    installingSkill={installingSkill}
                    installProgress={installProgress}
                  />
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Skill 详情对话框 */}
      {selectedSkill && (
        <SkillDetailDialog
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}

      {/* 环境变量编辑对话框 */}
      {envEditSkill && (
        <div className="settings-overlay">
          <div className="bg-bg-primary rounded-lg shadow-xl w-[560px] flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-medium">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-brand-500" />
                <h2 className="text-base font-semibold text-text-primary">{envEditSkill} — {t('skill.env_vars')}</h2>
              </div>
              <button onClick={() => setEnvEditSkill(null)} className="text-text-secondary hover:text-text-primary">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <p className="text-xs text-text-tertiary mb-3">
                {t('skill.env_hint')}<code className="bg-bg-secondary px-1 rounded">KEY=VALUE</code>，支持 <code className="bg-bg-secondary px-1 rounded"># 注释</code>
              </p>
              <textarea
                value={envContent}
                onChange={(e) => setEnvContent(e.target.value)}
                placeholder={t('skill.env_placeholder')}
                className="w-full font-mono text-sm bg-bg-secondary border border-border-medium rounded-lg p-3 text-text-primary placeholder:text-text-tertiary resize-none focus:outline-none focus:border-brand-500"
                style={{ minHeight: '240px' }}
                spellCheck={false}
              />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border-medium">
              <button
                onClick={() => setEnvEditSkill(null)}
                className="flex-1 px-4 py-2 bg-bg-secondary text-text-primary rounded-md hover:bg-bg-tertiary transition-colors text-sm"
              >
                {t('skill.cancel')}
              </button>
              <button
                onClick={handleSaveEnv}
                disabled={envSaving}
                className="flex-1 px-4 py-2 bg-brand-500 text-white rounded-md hover:bg-brand-600 disabled:opacity-50 transition-colors text-sm"
              >
                {envSaving ? t('skill.saving') : t('skill.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Skill 卡片组件
interface SkillCardProps {
  skill: Skill;
  index?: number;
  isInstalled: boolean;
  onInstall: (name: string) => void;
  onUninstall: (name: string) => void;
  onViewDetails: (name: string, isInstalled: boolean) => void;
  onEnvEdit?: (name: string) => void;
  installingSkill?: string | null;
  installProgress?: number;
}

const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  index,
  isInstalled,
  onInstall,
  onUninstall,
  onViewDetails,
  onEnvEdit,
  installingSkill,
  installProgress = 0,
}) => {
  const isInstalling = installingSkill === skill.name;
  // 优先展示 displayName，没有则用 name
  const title = skill.displayName || skill.name;
  
  return (
    <div className="bg-bg-secondary border border-border-medium rounded-lg p-4 hover:border-border-dark transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-0.5 mb-2">
            {index !== undefined && (
              <span className="text-xs text-text-tertiary w-3 shrink-0">{index}.</span>
            )}
            <Package size={16} className="text-brand-500 mr-1" />
            <h3 className="text-base font-semibold text-text-primary">{title}</h3>
            {/* 搜索结果显示 slug */}
            {!isInstalled && skill.displayName && (
              <span className="text-xs text-text-tertiary ml-1">({skill.name})</span>
            )}
          </div>
          <p className="text-sm text-text-secondary mb-2">{skill.description}</p>
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span>v{skill.version}</span>
            {skill.author && <span>• {skill.author}</span>}
            {skill.stars !== undefined && skill.stars > 0 && <span>• ⭐ {skill.stars}</span>}
            {skill.downloads !== undefined && skill.downloads > 0 && (
              <span>• ⬇️ {skill.downloads >= 1000 ? `${(skill.downloads / 1000).toFixed(1)}k` : skill.downloads}</span>
            )}
          </div>
          {skill.tags && skill.tags.length > 0 && (
            <div className="flex gap-2 mt-2">
              {skill.tags.map((tag) => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-bg-tertiary text-text-tertiary rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onViewDetails(skill.name, isInstalled)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
        >
          <Info size={14} />
          <span>{t('skill.detail')}</span>
        </button>
        
        {isInstalled && onEnvEdit && (
          <button
            onClick={() => onEnvEdit(skill.name)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
          >
            <Settings size={14} />
            <span>{t('skill.env_vars')}</span>
          </button>
        )}
        
        {isInstalled ? (
          <button
            onClick={() => onUninstall(skill.name)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 size={14} />
            <span>{t('skill.uninstall')}</span>
          </button>
        ) : isInstalling ? (
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Download size={14} className="animate-bounce" />
              <span>{t('skill.installing', { progress: Math.round(installProgress) })}</span>
            </div>
            <div className="w-full bg-border-medium rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-brand-500 h-full transition-all duration-300 ease-out"
                style={{ width: `${installProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => onInstall(skill.name)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-500 text-white hover:bg-brand-600 rounded transition-colors"
          >
            <Download size={14} />
            <span>{t('skill.install')}</span>
          </button>
        )}
      </div>
    </div>
  );
};

// Skill 详情对话框组件
interface SkillDetailDialogProps {
  skill: SkillInfo;
  onClose: () => void;
}

const SkillDetailDialog: React.FC<SkillDetailDialogProps> = ({ skill, onClose }) => {
  return (
    <div className="settings-overlay">
      <div className="bg-bg-primary rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-medium">
          <div className="flex items-center gap-2">
            <Package size={20} className="text-brand-500" />
            <h2 className="text-lg font-semibold text-text-primary">{skill.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* 描述 */}
            {skill.description && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.description')}</h3>
                <p className="text-sm text-text-secondary">{skill.description}</p>
              </div>
            )}

            {/* 基本信息 */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.info')}</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">{t('skill.version')}</span>
                  <span className="text-text-primary">v{skill.version}</span>
                </div>
                {skill.author && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">{t('skill.author')}</span>
                    <span className="text-text-primary">{skill.author}</span>
                  </div>
                )}
                {skill.repository && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">{t('skill.repository')}</span>
                    <a
                      href={skill.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:underline"
                    >
                      {t('skill.view_repo')}
                    </a>
                  </div>
                )}
                {skill.installPath && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">{t('skill.install_path')}</span>
                    <span className="text-text-primary text-xs font-mono">{skill.installPath}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 依赖信息 */}
            {skill.requires && (skill.requires.tools?.length || skill.requires.dependencies?.length) ? (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.dependencies')}</h3>
                <div className="space-y-2">
                  {skill.requires.tools && skill.requires.tools.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">{t('skill.tools')}</p>
                      <div className="flex flex-wrap gap-1">
                        {skill.requires.tools.map((tool) => (
                          <span key={tool} className="text-xs px-2 py-0.5 bg-bg-tertiary text-text-secondary rounded">
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {skill.requires.dependencies && skill.requires.dependencies.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">{t('skill.dep_packages')}</p>
                      <div className="flex flex-wrap gap-1">
                        {skill.requires.dependencies.map((dep) => (
                          <span key={dep} className="text-xs px-2 py-0.5 bg-bg-tertiary text-text-secondary rounded">
                            {dep}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* 标签 */}
            {skill.tags && skill.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.tags')}</h3>
                <div className="flex flex-wrap gap-2">
                  {skill.tags.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-1 bg-bg-tertiary text-text-tertiary rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* SKILL.md 内容 */}
            {skill.readme && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.readme')}</h3>
                <div className="bg-bg-secondary border border-border-medium rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono">
                    {skill.readme}
                  </pre>
                </div>
              </div>
            )}

            {/* 文件列表 */}
            {skill.files && (skill.files.scripts?.length || skill.files.references?.length || skill.files.assets?.length) ? (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('skill.files')}</h3>
                <div className="space-y-2">
                  {skill.files.scripts && skill.files.scripts.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">{t('skill.scripts')} ({skill.files.scripts.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.scripts.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.scripts.length > 5 && (
                          <div className="text-text-tertiary">{t('skill.more_files', { count: skill.files.scripts.length - 5 })}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {skill.files.references && skill.files.references.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">{t('skill.references')} ({skill.files.references.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.references.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.references.length > 5 && (
                          <div className="text-text-tertiary">{t('skill.more_files', { count: skill.files.references.length - 5 })}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {skill.files.assets && skill.files.assets.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">{t('skill.assets')} ({skill.files.assets.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.assets.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.assets.length > 5 && (
                          <div className="text-text-tertiary">{t('skill.more_files', { count: skill.files.assets.length - 5 })}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-border-medium">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-bg-secondary text-text-primary rounded-md hover:bg-bg-tertiary transition-colors"
          >
            {t('skill.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
