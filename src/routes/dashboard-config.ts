import type { FastifyInstance } from 'fastify'
import { serializeDashboardConfig } from '../dashboard-config.js'

export async function dashboardConfigRoute(app: FastifyInstance) {
  app.get('/dashboard-config.js', async (_request, reply) => {
    return reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .send(serializeDashboardConfig())
  })
}
