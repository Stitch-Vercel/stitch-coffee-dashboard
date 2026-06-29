function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL || '30000', 10),
  expressInternalApiUrl: requireEnv('EXPRESS_INTERNAL_API_URL'),
  expressInternalApiToken: requireEnv('EXPRESS_INTERNAL_API_TOKEN'),
} as const
