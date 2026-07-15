# Coffee Dashboard

A lightweight internal dashboard showing live terminal payment stats for a coffee shop.

## Architecture

- **Fastify** server serving a static dashboard + JSON stats API
- **Vercel serverless functions** for hosted API routes
- **Express internal API** as the only live stats data source

## Local Development

```bash
# Install dependencies
pnpm install

# Set up environment (.env is gitignored)
cp .env.example .env
# then fill in EXPRESS_INTERNAL_API_TOKEN in .env

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
- Coffee buyer leaderboard
- Hourly breakdown for today
- Consecutive success streak and best hour

All monetary values are in **cents (ZAR)**. Times are calculated in **SAST (UTC+2)**.

Known coffee buyers are resolved by the Express internal API. Vercel receives display names only, not raw card identifiers.

## Deployment

Deploy with Vercel.

Required Vercel environment variables:

- `EXPRESS_INTERNAL_API_URL`
- `EXPRESS_INTERNAL_API_TOKEN`

Production `EXPRESS_INTERNAL_API_URL`:

```text
https://express.stitch.money/api/internal/stitch-coffee-dashboard/stats
```
