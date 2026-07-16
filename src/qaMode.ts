export function resolveQaMode(
  isDevelopment: boolean,
  explicitFlag: string | undefined,
): boolean {
  return isDevelopment || explicitFlag === '1'
}

export const QA_MODE =
  import.meta.env.DEV || import.meta.env.VITE_QA === '1'
