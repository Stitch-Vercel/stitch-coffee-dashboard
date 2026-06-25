# Stitch Coffee Dashboard

A lightweight dashboard for Miguel's Coffee Bar showing real-time terminal payment stats from the Express/Stitch platform.

## Architecture

- **Fastify** server serving a static dashboard + JSON stats API
- **Prisma** connecting to the WigWag read replica (PostgreSQL)
- Deployed on **Cloud Run** in `africa-south1`

## Local Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma:generate

# Set up environment
export DATABASE_URL="postgresql://..."
export MERCHANT_ID="519a484c-d7e2-42d8-b193-3315f7246d01"

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

Pushes to `main` trigger automatic deployment to Cloud Run via GitHub Actions.

Image: `eu.gcr.io/wigwag-415814/stitch-coffee-dashboard`
Service: `stitch-coffee-dashboard` in `africa-south1`

Terraform for the Cloud Run service lives in `../WigWag-Infrastructure/terraform/stitch-coffee-dashboard`.
