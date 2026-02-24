/**
 * 时间信息 Section
 */

export function buildTimeSection(params: {
  userTimezone?: string;
  userTime?: string;
}): string[] {
  if (!params.userTimezone || !params.userTime) {
    return [];
  }

  return [
    '## 当前时间',
    '',
    `时区: ${params.userTimezone}`,
    `当前时间: ${params.userTime}`,
    '',
  ];
}
