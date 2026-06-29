function requireEnv(name: string): string {
  const value = process.env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  merchantId: requireEnv('MERCHANT_ID'),
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL || '30000', 10),
} as const
