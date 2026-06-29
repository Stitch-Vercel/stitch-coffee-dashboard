import { config } from '../config.js'

export async function getExpressStats(): Promise<unknown> {
  const expressResponse = await fetch(config.expressInternalApiUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.expressInternalApiToken}`,
    },
  })

  if (!expressResponse.ok) {
    const responseBody = await expressResponse.text()
    throw new Error(
      `Express stats request failed with ${expressResponse.status}: ${responseBody.slice(0, 500)}`,
    )
  }

  return expressResponse.json()
}
