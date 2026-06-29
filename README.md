# Coffee Dashboard

A lightweight internal dashboard showing live terminal payment stats for a coffee shop.

## Architecture

- **Fastify** server serving a static dashboard + JSON stats API
- **Vercel serverless functions** for hosted API routes
- **Prisma** connecting to PostgreSQL

## Local Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma:generate

# Set up environment
export DATABASE_URL="postgresql://..."
export MERCHANT_ID="..."

# Run dev server
pnpm dev
```

## API

### `GET /health`
Health check endpoint for Cloud Run.

### `GET /api/stats`
Returns dashboard statistics including:
- Today/week/month/all-time transaction counts and revenue
- Recent transactions list
- Hourly breakdown for today
- Consecutive success streak and best hour

All monetary values are in **cents (ZAR)**. Times are calculated in **SAST (UTC+2)**.

## Deployment

Deploy with Vercel.

Required Vercel environment variables:

- `DATABASE_URL`
- `MERCHANT_ID`
