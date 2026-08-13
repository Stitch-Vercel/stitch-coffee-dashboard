import type { IncomingMessage, ServerResponse } from 'node:http'
import { serializeDashboardConfig } from '../src/dashboard-config.js'

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  response.statusCode = 200
  response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(serializeDashboardConfig())
}
