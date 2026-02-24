/**
 * 执行步骤展示组件
 */

import React, { useState } from 'react';
import type { ExecutionStep } from '../../types/message';

interface ExecutionStepsProps {
  steps: ExecutionStep[];
}

export const ExecutionSteps: React.FC<ExecutionStepsProps> = ({ steps }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!steps || steps.length === 0) {
    return null;
  }

  // 格式化时长
  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // 获取工具友好名称
  const getToolLabel = (toolName: string) => {
    const labels: Record<string, string> = {
      bash: '执行命令',
      read: '读取文件',
      write: '写入文件',
      edit: '编辑文件',
      browser: '浏览器操作',
      skill_manager: 'Skill 管理',
      spawn_subagent: '创建子任务',
      list_subagents: '查询子任务',
    };
    return labels[toolName] || toolName;
  };

  return (
    <div className="execution-steps">
      <button
        className="execution-steps-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        type="button"
      >
        <span className="flex items-center gap-2">
          <span>🔧</span>
          <span>执行过程 ({steps.length} 步)</span>
        </span>
        <span className="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
      </button>

      {isExpanded && (
        <div className="execution-steps-content">
          {steps.map((step, index) => (
            <div key={step.id} className={`execution-step execution-step-${step.status}`}>
              <div className="step-header">
                <span className="step-number">{index + 1}.</span>
                <span className="step-icon">
                  {step.status === 'running' && '⏳'}
                  {step.status === 'success' && '✓'}
                  {step.status === 'error' && '✗'}
                </span>
                <span className="step-tool">{getToolLabel(step.toolName)}</span>
                {step.duration && (
                  <span className="step-duration">({formatDuration(step.duration)})</span>
                )}
              </div>

              {/* 显示命令或参数 */}
              {step.params && Object.keys(step.params).length > 0 && (
                <div className="step-params">
                  {step.toolName === 'bash' && step.params.command ? (
                    // bash 命令：直接显示命令
                    <div className="text-xs text-gray-700 mt-1 font-mono bg-gray-50 px-2 py-1 rounded">
                      {step.params.command}
                    </div>
                  ) : (
                    // 其他工具：显示参数详情
                    <details>
                      <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                        查看参数
                      </summary>
                      <pre className="text-xs mt-1 bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(step.params, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* 显示结果（可选） */}
              {step.result && step.result !== '(no output)' && (
                <div className="step-result">
                  {step.status === 'error' ? (
                    <div className="step-error">
                      ❌ {step.error || step.result}
                    </div>
                  ) : (
                    <details>
                      <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-800">
                        查看输出
                      </summary>
                      <div className="step-success text-xs mt-1 bg-gray-50 p-2 rounded">
                        {step.result.length > 500
                          ? `${step.result.substring(0, 500)}...`
                          : step.result}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
