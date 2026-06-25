import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { healthRoute } from './routes/health.js'
import { apiRoute } from './routes/api.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
})

// Serve static files from public/
await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
})

// Register routes
await app.register(healthRoute)
await app.register(apiRoute)

// Start server
try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`Stitch Coffee Dashboard running on port ${config.port}`)
} catch (err) {
  app.log.fatal(err, 'Failed to start server')
  process.exit(1)
}
