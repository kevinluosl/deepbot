/**
 * JSON 工具函数
 * 
 * 提供安全的 JSON 操作辅助函数，减少重复的 try-catch 代码
 */

import { getErrorMessage } from './error-handler';

/**
 * 安全解析 JSON 字符串
 * 
 * @param jsonString JSON 字符串
 * @param defaultValue 解析失败时的默认值
 * @returns 解析结果或默认值
 * 
 * @example
 * const data = safeJsonParse<MyType>('{"key": "value"}', {});
 */
export function safeJsonParse<T = any>(
  jsonString: string,
  defaultValue: T
): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('[JSON Utils] JSON 解析失败:', getErrorMessage(error));
    return defaultValue;
  }
}

/**
 * 安全序列化对象为 JSON 字符串
 * 
 * @param value 要序列化的值
 * @param pretty 是否格式化输出（默认 false）
 * @param defaultValue 序列化失败时的默认值
 * @returns JSON 字符串或默认值
 * 
 * @example
 * const json = safeJsonStringify({ key: 'value' }, true);
 */
export function safeJsonStringify(
  value: any,
  pretty: boolean = false,
  defaultValue: string = '{}'
): string {
  try {
    return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  } catch (error) {
    console.warn('[JSON Utils] JSON 序列化失败:', getErrorMessage(error));
    return defaultValue;
  }
}

/**
 * 从 JSON 字符串中提取特定字段
 * 
 * @param jsonString JSON 字符串
 * @param field 字段名
 * @param defaultValue 默认值
 * @returns 字段值或默认值
 * 
 * @example
 * const name = extractJsonField('{"name": "John"}', 'name', 'Unknown');
 */
export function extractJsonField<T = any>(
  jsonString: string,
  field: string,
  defaultValue: T
): T {
  try {
    const obj = JSON.parse(jsonString);
    return obj[field] !== undefined ? obj[field] : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * 深度克隆对象（通过 JSON 序列化/反序列化）
 * 
 * 注意：此方法不能处理函数、Symbol、undefined 等特殊值
 * 
 * @param obj 要克隆的对象
 * @returns 克隆后的对象
 * 
 * @example
 * const cloned = deepClone(original);
 */
export function deepClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.warn('[JSON Utils] 深度克隆失败:', getErrorMessage(error));
    return obj;
  }
}

/**
 * 合并 JSON 对象（浅合并）
 * 
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 * 
 * @example
 * const merged = mergeJson({ a: 1 }, { b: 2 }); // { a: 1, b: 2 }
 */
export function mergeJson<T extends Record<string, any>>(
  target: T,
  source: Partial<T>
): T {
  return { ...target, ...source };
}

/**
 * 验证字符串是否是有效的 JSON
 * 
 * @param jsonString 要验证的字符串
 * @returns 是否是有效的 JSON
 * 
 * @example
 * if (isValidJson('{"key": "value"}')) { ... }
 */
export function isValidJson(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}
