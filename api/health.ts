import type { IncomingMessage, ServerResponse } from 'node:http'

export default function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.setHeader('Allow', 'GET')
    response.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  response.statusCode = 200
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify({ status: 'ok' }))
}
