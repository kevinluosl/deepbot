/**
 * 运行时信息 Section
 */

import type { RuntimeInfo } from '../../../types/prompt';
import { buildRuntimeLine } from '../runtime-params';

export function buildRuntimeSection(runtimeInfo?: RuntimeInfo): string[] {
  if (!runtimeInfo) {
    return [];
  }

  return [
    '## 运行时信息',
    '',
    buildRuntimeLine(runtimeInfo),
    '',
  ];
}
