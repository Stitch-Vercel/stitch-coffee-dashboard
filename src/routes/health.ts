import type { FastifyInstance } from 'fastify'

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async (_request, _reply) => {
    return { status: 'ok' }
  })
}
