/**
 * Memory Tool Schema
 * 
 * 定义 Memory Tool 的参数 Schema
 */

import { Type } from '@sinclair/typebox';

/**
 * 记忆操作类型
 */
const MEMORY_TOOL_ACTIONS = ['read', 'update'] as const;

/**
 * 字符串枚举辅助函数
 */
function stringEnum<T extends readonly string[]>(values: T) {
  return Type.Union(values.map((v) => Type.Literal(v)));
}

/**
 * Memory Tool Schema
 */
export const MemoryToolSchema = Type.Object({
  action: stringEnum(MEMORY_TOOL_ACTIONS),
  userMessage: Type.Optional(Type.String({
    description: '用户消息（用于 update 操作）',
  })),
  context: Type.Optional(Type.String({
    description: '执行上下文（用于 update 操作，可选）',
  })),
});

/**
 * Memory Tool 参数类型
 */
export type MemoryToolParams = {
  action: typeof MEMORY_TOOL_ACTIONS[number];
  userMessage?: string;
  context?: string;
};
