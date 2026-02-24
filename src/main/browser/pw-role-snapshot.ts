/**
 * Role Snapshot 工具
 * 
 * 职责：
 * - 从 Playwright AI snapshot 中提取 refs
 * - 将 refs 映射到 role 和 name
 * 
 * 
 * 简化版本（MVP）：
 * - 只实现基础的 ref 提取
 * - 不实现复杂的过滤和压缩功能
 */

/**
 * Role Ref 定义
 */
export interface RoleRef {
  role: string;
  name?: string;
  nth?: number;
}

/**
 * Role Ref Map
 */
export type RoleRefMap = Record<string, RoleRef>;

/**
 * 从 AI snapshot 中解析 ref
 * 
 * AI snapshot 格式示例：
 * - textbox "搜索框" [ref=e1]
 * - button "搜索" [ref=e2]
 * 
 * @param suffix - 行的后缀部分
 * @returns ref 字符串，如果没有则返回 null
 */
function parseAiSnapshotRef(suffix: string): string | null {
  const match = suffix.match(/\[ref=(e\d+)\]/i);
  return match ? match[1] : null;
}

/**
 * 从 AI snapshot 构建 role snapshot 和 refs
 * 
 * @param aiSnapshot - Playwright AI snapshot 字符串
 * @returns snapshot 和 refs
 */
export function buildRoleSnapshotFromAiSnapshot(
  aiSnapshot: string
): { snapshot: string; refs: RoleRefMap } {
  const lines = String(aiSnapshot ?? '').split('\n');
  const refs: RoleRefMap = {};

  for (const line of lines) {
    // 匹配格式：- role "name" [ref=e1]
    const match = line.match(/^(\s*-\s*)(\w+)(?:\s+"([^"]*)")?(.*)$/);
    if (!match) continue;

    const [, , roleRaw, name, suffix] = match;
    if (roleRaw.startsWith('/')) continue;

    const role = roleRaw.toLowerCase();
    const ref = parseAiSnapshotRef(suffix);
    
    if (ref) {
      refs[ref] = { role, ...(name ? { name } : {}) };
    }
  }

  return {
    snapshot: aiSnapshot,
    refs,
  };
}
