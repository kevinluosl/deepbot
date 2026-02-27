/**
 * Skill 管理器组件
 */

import React, { useState, useEffect } from 'react';
import { X, Search, Package, Download, Trash2, RefreshCw, Info } from 'lucide-react';
import '../styles/settings.css';

interface Skill {
  name: string;
  description: string;
  version: string;
  author?: string;
  repository?: string;
  stars?: number;
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
    console.log('[SkillManager] 开始加载已安装 Skill...');
    setIsLoading(true);
    try {
      const result = await (window.deepbot as any).skillManager({
        action: 'list',
      });
      
      console.log('[SkillManager] 收到结果:', result);
      
      if (result.success) {
        // 新格式：{ success: true, skills: [...], count: 0, message: "..." }
        const skills = result.skills || [];
        console.log('[SkillManager] 加载成功，Skill 数量:', skills.length);
        console.log('[SkillManager] 消息:', result.message);
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
    
    try {
      const result = await (window.deepbot as any).skillManager({
        action: 'search',
        query: searchQuery,
      });
      
      if (result.success) {
        // 过滤掉已安装的 Skills
        const installedNames = new Set(installedSkills.map(s => s.name));
        const filteredSkills = (result.skills || []).filter(
          (skill: Skill) => !installedNames.has(skill.name)
        );
        setAvailableSkills(filteredSkills);
      }
    } catch (error) {
      console.error('搜索 Skill 失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 安装 Skill
  const handleInstall = async (skillName: string, repository: string) => {
    setInstallingSkill(skillName);
    setInstallProgress(0);
    
    // 模拟进度条
    const progressInterval = setInterval(() => {
      setInstallProgress(prev => {
        if (prev >= 90) return prev; // 最多到 90%，等待真实完成
        return prev + Math.random() * 15; // 随机增加 0-15%
      });
    }, 300);
    
    try {
      const result = await (window.deepbot as any).skillManager({
        action: 'install',
        name: skillName,
        repository: repository,
      });
      
      clearInterval(progressInterval);
      setInstallProgress(100); // 完成时设为 100%
      
      // 等待一下让用户看到 100%
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (result.success) {
        // 从可用列表中移除已安装的 Skill
        setAvailableSkills(prev => prev.filter(s => s.name !== skillName));
        
        // 重新加载已安装列表
        await loadInstalledSkills();
        
        // 切换到已安装标签页
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
    if (!confirm(`确定要卸载 ${skillName} 吗？`)) return;
    
    setIsLoading(true);
    try {
      const result = await (window.deepbot as any).skillManager({
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

  // 查看详情
  const handleViewDetails = async (skillName: string, isInstalled: boolean) => {
    console.log('[SkillManager] 查看详情:', skillName, '已安装:', isInstalled);
    
    // 如果是未安装的 Skill，直接从搜索结果中获取信息
    if (!isInstalled) {
      const skill = availableSkills.find(s => s.name === skillName);
      if (skill) {
        console.log('[SkillManager] 使用搜索结果:', skill);
        setSelectedSkill(skill);
      } else {
        console.error('[SkillManager] 未找到 Skill:', skillName);
      }
      return;
    }
    
    // 如果是已安装的 Skill，从数据库获取详细信息
    setIsLoading(true);
    try {
      const result = await (window.deepbot as any).skillManager({
        action: 'info',
        name: skillName,
      });
      
      console.log('[SkillManager] 详情结果:', result);
      
      // info action 返回格式: { success: true, skill: {...} }
      if (result.success && result.skill) {
        console.log('[SkillManager] 设置 selectedSkill:', result.skill);
        setSelectedSkill(result.skill);
      } else {
        console.error('[SkillManager] 获取详情失败，返回数据格式不正确:', result);
        // 如果获取失败，尝试从已安装列表中获取基本信息
        const skill = installedSkills.find(s => s.name === skillName);
        if (skill) {
          console.log('[SkillManager] 使用已安装列表中的基本信息');
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
          <h2 className="settings-title">Skill 管理器</h2>
          <button
            onClick={onClose}
            className="settings-close-button"
          >
            <X size={20} />
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-6 py-4 border-b border-border-medium">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-tertiary" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索 Skill..."
                className="w-full pl-10 pr-3 py-2 text-sm bg-bg-tertiary border border-border-dark rounded-md text-text-primary placeholder-text-tertiary focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
              className="px-4 py-2 bg-brand-500 text-white text-sm rounded-md hover:bg-brand-600 disabled:bg-border-medium disabled:cursor-not-allowed transition-colors"
            >
              搜索
            </button>
          </div>
          <p className="text-xs text-text-tertiary mt-2">
            💡 提示：搜索功能需要能正常访问 GitHub
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex gap-4 px-6 py-3 border-b border-border-medium">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              activeTab === 'installed'
                ? 'bg-brand-500 text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
            }`}
          >
            已安装 ({installedSkills.length})
          </button>
          <button
            onClick={() => setActiveTab('available')}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              activeTab === 'available'
                ? 'bg-brand-500 text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
            }`}
          >
            可用 ({availableSkills.length})
          </button>
        </div>

        {/* Skill 列表 */}
        <div className="settings-panel">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-text-secondary">加载中...</div>
            </div>
          ) : activeTab === 'installed' ? (
            installedSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Package size={48} className="text-text-tertiary mb-4" />
                <p className="text-text-secondary">暂无已安装的 Skill</p>
                <p className="text-sm text-text-tertiary mt-2">使用搜索功能查找并安装 Skill</p>
              </div>
            ) : (
              <div className="space-y-3">
                {installedSkills.map((skill) => (
                  <SkillCard
                    key={skill.name}
                    skill={skill}
                    isInstalled={true}
                    onInstall={() => {}}
                    onUninstall={handleUninstall}
                    onViewDetails={(name) => handleViewDetails(name, true)}
                    installingSkill={installingSkill}
                    installProgress={installProgress}
                  />
                ))}
              </div>
            )
          ) : (
            availableSkills.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Search size={48} className="text-text-tertiary mb-4" />
                <p className="text-text-secondary">搜索 Skill</p>
                <p className="text-sm text-text-tertiary mt-2">输入关键词搜索可用的 Skill</p>
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
    </div>
  );
};

// Skill 卡片组件
interface SkillCardProps {
  skill: Skill;
  isInstalled: boolean;
  onInstall: (name: string, repository: string) => void;
  onUninstall: (name: string) => void;
  onViewDetails: (name: string, isInstalled: boolean) => void;
  installingSkill?: string | null;
  installProgress?: number;
}

const SkillCard: React.FC<SkillCardProps> = ({
  skill,
  isInstalled,
  onInstall,
  onUninstall,
  onViewDetails,
  installingSkill,
  installProgress = 0,
}) => {
  const isInstalling = installingSkill === skill.name;
  
  return (
    <div className="bg-bg-secondary border border-border-medium rounded-lg p-4 hover:border-border-dark transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-brand-500" />
            <h3 className="text-base font-semibold text-text-primary">{skill.name}</h3>
          </div>
          <p className="text-sm text-text-secondary mb-2">{skill.description}</p>
          <div className="flex items-center gap-3 text-xs text-text-tertiary">
            <span>v{skill.version}</span>
            {skill.author && <span>• {skill.author}</span>}
            {skill.stars !== undefined && <span>• ⭐ {skill.stars}</span>}
            {skill.usageCount !== undefined && <span>• 使用 {skill.usageCount} 次</span>}
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
          <span>详情</span>
        </button>
        
        {isInstalled ? (
          <button
            onClick={() => onUninstall(skill.name)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          >
            <Trash2 size={14} />
            <span>卸载</span>
          </button>
        ) : isInstalling ? (
          <div className="flex flex-col gap-1 flex-1">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <Download size={14} className="animate-bounce" />
              <span>正在安装... {Math.round(installProgress)}%</span>
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
            onClick={() => onInstall(skill.name, skill.repository || '')}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-500 text-white hover:bg-brand-600 rounded transition-colors"
          >
            <Download size={14} />
            <span>安装</span>
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
                <h3 className="text-sm font-semibold text-text-primary mb-2">描述</h3>
                <p className="text-sm text-text-secondary">{skill.description}</p>
              </div>
            )}

            {/* 基本信息 */}
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-2">信息</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">版本</span>
                  <span className="text-text-primary">v{skill.version}</span>
                </div>
                {skill.author && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">作者</span>
                    <span className="text-text-primary">{skill.author}</span>
                  </div>
                )}
                {skill.repository && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">仓库</span>
                    <a
                      href={skill.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-500 hover:underline"
                    >
                      查看仓库
                    </a>
                  </div>
                )}
                {skill.installPath && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">安装路径</span>
                    <span className="text-text-primary text-xs font-mono">{skill.installPath}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 依赖信息 */}
            {skill.requires && (skill.requires.tools?.length || skill.requires.dependencies?.length) ? (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">依赖</h3>
                <div className="space-y-2">
                  {skill.requires.tools && skill.requires.tools.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">工具:</p>
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
                      <p className="text-xs text-text-tertiary mb-1">依赖包:</p>
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
                <h3 className="text-sm font-semibold text-text-primary mb-2">标签</h3>
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
                <h3 className="text-sm font-semibold text-text-primary mb-2">使用说明 (SKILL.md)</h3>
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
                <h3 className="text-sm font-semibold text-text-primary mb-2">文件</h3>
                <div className="space-y-2">
                  {skill.files.scripts && skill.files.scripts.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">脚本 ({skill.files.scripts.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.scripts.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.scripts.length > 5 && (
                          <div className="text-text-tertiary">... 还有 {skill.files.scripts.length - 5} 个文件</div>
                        )}
                      </div>
                    </div>
                  )}
                  {skill.files.references && skill.files.references.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">参考文件 ({skill.files.references.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.references.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.references.length > 5 && (
                          <div className="text-text-tertiary">... 还有 {skill.files.references.length - 5} 个文件</div>
                        )}
                      </div>
                    </div>
                  )}
                  {skill.files.assets && skill.files.assets.length > 0 && (
                    <div>
                      <p className="text-xs text-text-tertiary mb-1">资源文件 ({skill.files.assets.length}):</p>
                      <div className="text-xs text-text-secondary space-y-0.5">
                        {skill.files.assets.slice(0, 5).map((file) => (
                          <div key={file} className="font-mono">• {file}</div>
                        ))}
                        {skill.files.assets.length > 5 && (
                          <div className="text-text-tertiary">... 还有 {skill.files.assets.length - 5} 个文件</div>
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
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
