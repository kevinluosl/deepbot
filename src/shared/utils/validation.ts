/**
 * 统一的参数验证工具
 */

/**
 * 验证必需的字符串参数
 */
export function requireString(value: any, name: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error(`${name} is required and must be a string`);
  }
  return value;
}

/**
 * 验证可选的字符串参数
 */
export function optionalString(value: any, defaultValue: string = ''): string {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }
  return value;
}

/**
 * 验证必需的数字参数
 */
export function requireNumber(value: any, name: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`${name} is required and must be a number`);
  }
  return value;
}

/**
 * 验证可选的数字参数
 */
export function optionalNumber(value: any, defaultValue: number = 0): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('Value must be a number');
  }
  return value;
}

/**
 * 验证必需的布尔参数
 */
export function requireBoolean(value: any, name: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${name} is required and must be a boolean`);
  }
  return value;
}

/**
 * 验证可选的布尔参数
 */
export function optionalBoolean(value: any, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'boolean') {
    throw new Error('Value must be a boolean');
  }
  return value;
}
