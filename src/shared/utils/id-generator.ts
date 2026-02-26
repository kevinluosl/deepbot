/**
 * ID 生成工具
 * 
 * 提供统一的 ID 生成方法，避免重复的 Date.now() + 随机数代码
 */

/**
 * 生成唯一 ID（基于时间戳 + 随机数）
 * 
 * @param prefix ID 前缀
 * @returns 唯一 ID
 * 
 * @example
 * const id = generateId('msg'); // msg-1234567890-abc123
 */
export function generateId(prefix: string = 'id'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * 生成短 ID（仅随机数）
 * 
 * @param length ID 长度
 * @returns 短 ID
 * 
 * @example
 * const id = generateShortId(8); // abc12345
 */
export function generateShortId(length: number = 8): string {
  return Math.random()
    .toString(36)
    .substring(2, 2 + length)
    .padEnd(length, '0');
}

/**
 * 生成基于时间戳的 ID
 * 
 * @param prefix ID 前缀
 * @returns 时间戳 ID
 * 
 * @example
 * const id = generateTimestampId('task'); // task-1234567890
 */
export function generateTimestampId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}`;
}

/**
 * 生成 UUID v4（简化版）
 * 
 * @returns UUID 字符串
 * 
 * @example
 * const uuid = generateUUID(); // 550e8400-e29b-41d4-a716-446655440000
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 生成执行 ID（用于工具调用）
 * 
 * @param toolName 工具名称
 * @returns 执行 ID
 * 
 * @example
 * const id = generateExecutionId('browser'); // browser-1234567890
 */
export function generateExecutionId(toolName: string): string {
  return generateTimestampId(toolName);
}

/**
 * 生成消息 ID
 * 
 * @returns 消息 ID
 * 
 * @example
 * const id = generateMessageId(); // msg-1234567890-abc123
 */
export function generateMessageId(): string {
  return generateId('msg');
}

/**
 * 生成用户消息 ID
 * 
 * @returns 用户消息 ID
 * 
 * @example
 * const id = generateUserMessageId(); // user-msg-1234567890-abc123
 */
export function generateUserMessageId(): string {
  return generateId('user-msg');
}

/**
 * 生成步骤 ID
 * 
 * @returns 步骤 ID
 * 
 * @example
 * const id = generateStepId(); // step-1234567890-abc123
 */
export function generateStepId(): string {
  return generateId('step');
}

/**
 * 生成 Tab ID
 * 
 * @param counter 计数器（可选）
 * @returns Tab ID
 * 
 * @example
 * const id = generateTabId(5); // tab-1234567890-5
 */
export function generateTabId(counter?: number): string {
  const timestamp = Date.now();
  return counter !== undefined
    ? `tab-${timestamp}-${counter}`
    : `tab-${timestamp}`;
}

/**
 * 生成任务 ID
 * 
 * @returns 任务 ID
 * 
 * @example
 * const id = generateTaskId(); // task-1234567890-abc123
 */
export function generateTaskId(): string {
  return generateId('task');
}

/**
 * 生成计划 ID
 * 
 * @returns 计划 ID
 * 
 * @example
 * const id = generatePlanId(); // plan-1234567890
 */
export function generatePlanId(): string {
  return generateTimestampId('plan');
}
