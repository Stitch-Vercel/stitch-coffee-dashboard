const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isEnvFlagEnabled(value: string | undefined): boolean {
  return TRUE_VALUES.has(String(value || '').trim().toLowerCase())
}

export function getDashboardConfig(env: Record<string, string | undefined> = process.env) {
  return {
    demoMode: isEnvFlagEnabled(env.STITCH_COFFEE_DEMO_MODE),
  }
}

export function serializeDashboardConfig(config = getDashboardConfig()): string {
  return `window.STITCH_COFFEE_DASHBOARD_CONFIG = ${JSON.stringify(config)};\n`
}
