import type { IncomingMessage, ServerResponse } from 'node:http'
import { getExpressStats } from '../src/services/express-stats.js'

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const stats = await getExpressStats()
    response.statusCode = 200
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify(stats))
  } catch (error) {
    console.error('Failed to fetch dashboard stats', error)
    response.statusCode = 500
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ error: 'Failed to fetch dashboard stats' }))
  }
}
