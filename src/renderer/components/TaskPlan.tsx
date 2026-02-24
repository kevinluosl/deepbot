/**
 * 任务计划展示组件
 */

import React from 'react';
import type { TaskPlan, TaskStep } from '../../types/task-plan';

interface TaskPlanProps {
  plan: TaskPlan | null;
}

export const TaskPlanComponent: React.FC<TaskPlanProps> = ({ plan }) => {
  if (!plan) {
    return null;
  }

  // 格式化时长
  const formatDuration = (startTime?: number, endTime?: number) => {
    if (!startTime) return '';
    const duration = (endTime || Date.now()) - startTime;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  // 获取状态图标
  const getStatusIcon = (status: TaskStep['status']) => {
    switch (status) {
      case 'pending':
        return '⏸️';
      case 'running':
        return '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '❓';
    }
  };

  // 获取计划状态标签
  const getPlanStatusLabel = (status: TaskPlan['status']) => {
    switch (status) {
      case 'planning':
        return '规划中';
      case 'executing':
        return '执行中';
      case 'completed':
        return '已完成';
      case 'failed':
        return '失败';
      default:
        return '未知';
    }
  };

  return (
    <div className="task-plan">
      <div className="task-plan-header">
        <span className="task-plan-title">📋 任务计划</span>
        <span className={`task-plan-status task-plan-status-${plan.status}`}>
          {getPlanStatusLabel(plan.status)}
        </span>
      </div>

      <div className="task-plan-description">{plan.description}</div>

      <div className="task-plan-steps">
        {plan.steps.map((step, index) => (
          <div
            key={step.id}
            className={`task-step task-step-${step.status} ${
              index === plan.currentStepIndex ? 'task-step-current' : ''
            }`}
          >
            <div className="task-step-header">
              <span className="task-step-number">{index + 1}.</span>
              <span className="task-step-icon">{getStatusIcon(step.status)}</span>
              <span className="task-step-description">{step.description}</span>
              {step.startTime && (
                <span className="task-step-duration">
                  ({formatDuration(step.startTime, step.endTime)})
                </span>
              )}
            </div>

            {/* 显示重试信息 */}
            {step.retryCount > 0 && (
              <div className="task-step-retry">
                重试 {step.retryCount}/{step.maxRetries}
              </div>
            )}

            {/* 显示错误信息 */}
            {step.error && step.status === 'error' && (
              <div className="task-step-error">
                ❌ {step.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
