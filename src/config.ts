export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  merchantId: process.env.MERCHANT_ID || '519a484c-d7e2-42d8-b193-3315f7246d01',
  refreshInterval: parseInt(process.env.REFRESH_INTERVAL || '30000', 10),
} as const
