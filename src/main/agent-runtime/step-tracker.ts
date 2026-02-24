/**
 * 步骤跟踪器
 * 
 * 职责：
 * - 跟踪任务执行步骤
 * - 管理重试逻辑
 * - 检测步骤完成状态
 */

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'success' | 'error';
  retryCount: number;
  maxRetries: number;
  error?: string;
  startTime?: number;
  endTime?: number;
}

export interface TaskPlan {
  id: string;
  description: string;
  steps: TaskStep[];
  currentStepIndex: number;
  status: 'planning' | 'executing' | 'completed' | 'failed';
}

/**
 * 步骤跟踪器类
 */
export class StepTracker {
  private currentPlan: TaskPlan | null = null;
  private onPlanUpdate?: (plan: TaskPlan) => void;

  /**
   * 设置计划更新回调
   */
  setOnPlanUpdate(callback: (plan: TaskPlan) => void): void {
    this.onPlanUpdate = callback;
  }

  /**
   * 创建新的任务计划
   */
  createPlan(description: string, steps: string[]): TaskPlan {
    this.currentPlan = {
      id: `plan-${Date.now()}`,
      description,
      steps: steps.map((desc, index) => ({
        id: `step-${index + 1}`,
        description: desc,
        status: 'pending',
        retryCount: 0,
        maxRetries: 5,
      })),
      currentStepIndex: 0,
      status: 'planning',
    };

    this.notifyUpdate();
    return this.currentPlan;
  }

  /**
   * 开始执行计划
   */
  startExecution(): void {
    if (!this.currentPlan) {
      throw new Error('没有活动的任务计划');
    }

    this.currentPlan.status = 'executing';
    this.notifyUpdate();
  }

  /**
   * 获取当前步骤
   */
  getCurrentStep(): TaskStep | null {
    if (!this.currentPlan) {
      return null;
    }

    const { currentStepIndex, steps } = this.currentPlan;
    return steps[currentStepIndex] || null;
  }

  /**
   * 标记当前步骤为运行中
   */
  markStepRunning(): void {
    const step = this.getCurrentStep();
    if (step) {
      step.status = 'running';
      step.startTime = Date.now();
      this.notifyUpdate();
    }
  }

  /**
   * 标记当前步骤为成功
   */
  markStepSuccess(): void {
    const step = this.getCurrentStep();
    if (step) {
      step.status = 'success';
      step.endTime = Date.now();
      this.notifyUpdate();
    }
  }

  /**
   * 标记当前步骤为失败
   */
  markStepError(error: string): boolean {
    const step = this.getCurrentStep();
    if (!step) {
      return false;
    }

    step.status = 'error';
    step.error = error;
    step.endTime = Date.now();
    step.retryCount++;

    // 检查是否还能重试
    const canRetry = step.retryCount < step.maxRetries;

    if (!canRetry) {
      // 已达到最大重试次数，任务失败
      if (this.currentPlan) {
        this.currentPlan.status = 'failed';
      }
    } else {
      // 可以重试，重置状态
      step.status = 'pending';
      step.error = undefined;
    }

    this.notifyUpdate();
    return canRetry;
  }

  /**
   * 移动到下一步
   */
  moveToNextStep(): boolean {
    if (!this.currentPlan) {
      return false;
    }

    this.currentPlan.currentStepIndex++;

    // 检查是否所有步骤都完成
    if (this.currentPlan.currentStepIndex >= this.currentPlan.steps.length) {
      this.currentPlan.status = 'completed';
      this.notifyUpdate();
      return false;
    }

    this.notifyUpdate();
    return true;
  }

  /**
   * 获取当前计划
   */
  getCurrentPlan(): TaskPlan | null {
    return this.currentPlan;
  }

  /**
   * 清空当前计划
   */
  clearPlan(): void {
    this.currentPlan = null;
    this.notifyUpdate();
  }

  /**
   * 检查是否有活动的计划
   */
  hasActivePlan(): boolean {
    return this.currentPlan !== null && this.currentPlan.status !== 'completed' && this.currentPlan.status !== 'failed';
  }

  /**
   * 通知计划更新
   */
  private notifyUpdate(): void {
    if (this.currentPlan && this.onPlanUpdate) {
      this.onPlanUpdate(this.currentPlan);
    }
  }
}
