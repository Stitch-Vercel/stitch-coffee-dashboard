import type { FastifyInstance } from 'fastify'
import { getStats } from '../services/stats.js'
import { config } from '../config.js'

export async function apiRoute(app: FastifyInstance) {
  app.get('/api/stats', async (_request, reply) => {
    try {
      const stats = await getStats(config.merchantId)
      return stats
    } catch (error) {
      app.log.error(error, 'Failed to fetch stats')
      return reply.status(500).send({ error: 'Failed to fetch dashboard stats' })
    }
  })
}
