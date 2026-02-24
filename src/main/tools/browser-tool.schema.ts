/**
 * Browser Tool Schema
 * 
 * 定义 Browser Tool 的参数 Schema
 * 
 * 
 * 简化版本（MVP）：
 * - 只支持基础操作
 * - 不支持多 Profile
 * - 不支持远程节点
 */

import { Type } from '@sinclair/typebox';

/**
 * 浏览器操作类型
 */
const BROWSER_TOOL_ACTIONS = [
  'status',    // 获取浏览器状态
  'start',     // 启动浏览器
  'stop',      // 停止浏览器
  'tabs',      // 获取标签页列表
  'open',      // 打开新标签页
  'close',     // 关闭标签页
  'snapshot',  // 获取页面快照
  'screenshot',// 截图
  'navigate',  // 导航到 URL
  'console',   // 获取控制台消息
  'pdf',       // 导出 PDF
  'act',       // 执行交互操作
] as const;

/**
 * 交互操作类型
 */
const BROWSER_ACT_KINDS = [
  'click',   // 点击
  'type',    // 输入文本
  'press',   // 按键
  'hover',   // 悬停
  'scroll',  // 滚动
  'select',  // 选择下拉框
  'fill',    // 填充表单
] as const;

/**
 * 图片类型
 */
const BROWSER_IMAGE_TYPES = ['png', 'jpeg'] as const;

/**
 * 字符串枚举辅助函数
 */
function stringEnum<T extends readonly string[]>(values: T) {
  return Type.Union(values.map((v) => Type.Literal(v)));
}

/**
 * 可选字符串枚举辅助函数
 */
function optionalStringEnum<T extends readonly string[]>(values: T) {
  return Type.Optional(stringEnum(values));
}

/**
 * 交互操作 Schema
 */
const BrowserActSchema = Type.Object({
  kind: stringEnum(BROWSER_ACT_KINDS),
  // 通用字段
  selector: Type.Optional(Type.String({
    description: '⚠️⚠️⚠️ 极其重要：绝对不要猜测 ref！不要使用 @e1, @e2 这样的编号！必须使用 snapshot 返回的 refs 列表中的 ref（如 @e36, @e73）。ref 编号是随机的，每个页面都不同！'
  })),
  // click
  doubleClick: Type.Optional(Type.Boolean()),
  // type, fill
  text: Type.Optional(Type.String()),
  value: Type.Optional(Type.String()),
  // press
  key: Type.Optional(Type.String()),
  // scroll
  x: Type.Optional(Type.Number()),
  y: Type.Optional(Type.Number()),
  // 超时
  timeout: Type.Optional(Type.Number()),
});

/**
 * Browser Tool Schema
 * 
 * 注意：OpenAI 函数工具 Schema 必须是顶层 object 类型
 */
export const BrowserToolSchema = Type.Object({
  // 操作类型
  action: stringEnum(BROWSER_TOOL_ACTIONS),
  
  // 标签页相关
  targetId: Type.Optional(Type.String()),
  targetUrl: Type.Optional(Type.String()),
  
  // 快照相关
  maxChars: Type.Optional(Type.Number()),
  
  // 截图相关
  fullPage: Type.Optional(Type.Boolean()),
  type: optionalStringEnum(BROWSER_IMAGE_TYPES),
  
  // 控制台相关
  limit: Type.Optional(Type.Number()),
  
  // 交互操作
  request: Type.Optional(BrowserActSchema),
  
  // 超时
  timeoutMs: Type.Optional(Type.Number()),
});

/**
 * Browser Tool 参数类型
 */
export type BrowserToolParams = {
  action: typeof BROWSER_TOOL_ACTIONS[number];
  targetId?: string;
  targetUrl?: string;
  maxChars?: number;
  fullPage?: boolean;
  type?: typeof BROWSER_IMAGE_TYPES[number];
  limit?: number;
  request?: {
    kind: typeof BROWSER_ACT_KINDS[number];
    selector?: string;
    doubleClick?: boolean;
    text?: string;
    value?: string;
    key?: string;
    x?: number;
    y?: number;
    timeout?: number;
  };
  timeoutMs?: number;
};
