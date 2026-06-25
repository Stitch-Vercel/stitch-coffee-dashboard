import { prisma } from '../db.js'
import { Prisma } from '@prisma/client'

interface DashboardStats {
  today: {
    transactions: number
    successfulTransactions: number
    revenue_cents: number
    avg_transaction_cents: number
    success_rate: number
  }
  week: {
    transactions: number
    revenue_cents: number
  }
  month: {
    transactions: number
    revenue_cents: number
  }
  all_time: {
    total_transactions: number
    total_revenue_cents: number
  }
  recent_transactions: Array<{
    amount_cents: number
    status: string
    source: string
    time: string
  }>
  hourly_breakdown: Array<{
    hour: number
    count: number
    revenue_cents: number
  }>
  streak: {
    consecutive_successes: number
    best_hour: string
  }
}

// SAST is UTC+2
const SAST_OFFSET_HOURS = 2

function getTodayStartUTC(): Date {
  const now = new Date()
  // Get current time in SAST
  const sastNow = new Date(now.getTime() + SAST_OFFSET_HOURS * 60 * 60 * 1000)
  // Get start of day in SAST
  const sastMidnight = new Date(sastNow)
  sastMidnight.setUTCHours(0, 0, 0, 0)
  // Convert back to UTC
  return new Date(sastMidnight.getTime() - SAST_OFFSET_HOURS * 60 * 60 * 1000)
}

function getWeekStartUTC(): Date {
  const todayStart = getTodayStartUTC()
  return new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000)
}

function getMonthStartUTC(): Date {
  const todayStart = getTodayStartUTC()
  return new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)
}

export async function getStats(merchantId: string): Promise<DashboardStats> {
  const todayStart = getTodayStartUTC()
  const weekStart = getWeekStartUTC()
  const monthStart = getMonthStartUTC()

  const [
    todayStats,
    todayAllStats,
    weekStats,
    monthStats,
    allTimeStats,
    recentTransactions,
    hourlyBreakdown,
    streakData,
    bestHourData,
  ] = await Promise.all([
    // Today's successful stats
    prisma.$queryRaw<
      Array<{ count: bigint; total: bigint | null; avg: number | null }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS count,
        COALESCE(SUM(ts.amount), 0)::bigint AS total,
        AVG(ts.amount)::float AS avg
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts.status = 'SUCCESS'
        AND ts."createdAt" >= ${todayStart}
    `),

    // Today's all transactions (for success rate)
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts."createdAt" >= ${todayStart}
    `),

    // Week stats (successful only)
    prisma.$queryRaw<Array<{ count: bigint; total: bigint | null }>>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS count,
        COALESCE(SUM(ts.amount), 0)::bigint AS total
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts.status = 'SUCCESS'
        AND ts."createdAt" >= ${weekStart}
    `),

    // Month stats (successful only)
    prisma.$queryRaw<Array<{ count: bigint; total: bigint | null }>>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS count,
        COALESCE(SUM(ts.amount), 0)::bigint AS total
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts.status = 'SUCCESS'
        AND ts."createdAt" >= ${monthStart}
    `),

    // All-time stats (successful only)
    prisma.$queryRaw<Array<{ count: bigint; total: bigint | null }>>(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS count,
        COALESCE(SUM(ts.amount), 0)::bigint AS total
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts.status = 'SUCCESS'
    `),

    // Recent 10 transactions
    prisma.$queryRaw<
      Array<{
        amount: number
        status: string
        source: string
        createdAt: Date
      }>
    >(Prisma.sql`
      SELECT ts.amount, ts.status, ts.source, ts."createdAt"
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
      ORDER BY ts."createdAt" DESC
      LIMIT 10
    `),

    // Hourly breakdown for today (SAST hours)
    prisma.$queryRaw<
      Array<{ hour: number; count: bigint; revenue: bigint | null }>
    >(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM ts."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Johannesburg')::int AS hour,
        COUNT(*)::bigint AS count,
        COALESCE(SUM(CASE WHEN ts.status = 'SUCCESS' THEN ts.amount ELSE 0 END), 0)::bigint AS revenue
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts."createdAt" >= ${todayStart}
      GROUP BY hour
      ORDER BY hour
    `),

    // Consecutive successes streak (most recent backwards)
    prisma.$queryRaw<Array<{ consecutive_successes: bigint }>>(Prisma.sql`
      WITH ordered_sessions AS (
        SELECT ts.status,
               ROW_NUMBER() OVER (ORDER BY ts."createdAt" DESC) AS rn
        FROM "TerminalSession" ts
        JOIN "Terminal" t ON ts."terminalId" = t.id
        WHERE t."merchantId" = ${merchantId}::uuid
      ),
      first_non_success AS (
        SELECT MIN(rn) AS break_at
        FROM ordered_sessions
        WHERE status != 'SUCCESS'
      )
      SELECT COALESCE(
        (SELECT break_at - 1 FROM first_non_success WHERE break_at IS NOT NULL),
        (SELECT COUNT(*) FROM ordered_sessions)
      )::bigint AS consecutive_successes
    `),

    // Best hour today
    prisma.$queryRaw<Array<{ hour: number; count: bigint }>>(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM ts."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Johannesburg')::int AS hour,
        COUNT(*)::bigint AS count
      FROM "TerminalSession" ts
      JOIN "Terminal" t ON ts."terminalId" = t.id
      WHERE t."merchantId" = ${merchantId}::uuid
        AND ts.status = 'SUCCESS'
        AND ts."createdAt" >= ${todayStart}
      GROUP BY hour
      ORDER BY count DESC
      LIMIT 1
    `),
  ])

  const todayRow = todayStats[0]
  const todayAllRow = todayAllStats[0]
  const weekRow = weekStats[0]
  const monthRow = monthStats[0]
  const allTimeRow = allTimeStats[0]
  const streakRow = streakData[0]
  const bestHourRow = bestHourData[0]

  const todaySuccessCount = Number(todayRow?.count ?? 0)
  const todayTotalCount = Number(todayAllRow?.count ?? 0)

  const bestHour = bestHourRow ? bestHourRow.hour : 0
  const bestHourLabel = `${String(bestHour).padStart(2, '0')}:00 - ${String(bestHour + 1).padStart(2, '0')}:00`

  return {
    today: {
      transactions: todayTotalCount,
      successfulTransactions: todaySuccessCount,
      revenue_cents: Number(todayRow?.total ?? 0),
      avg_transaction_cents: Math.round(todayRow?.avg ?? 0),
      success_rate:
        todayTotalCount > 0
          ? Math.round((todaySuccessCount / todayTotalCount) * 10000) / 100
          : 0,
    },
    week: {
      transactions: Number(weekRow?.count ?? 0),
      revenue_cents: Number(weekRow?.total ?? 0),
    },
    month: {
      transactions: Number(monthRow?.count ?? 0),
      revenue_cents: Number(monthRow?.total ?? 0),
    },
    all_time: {
      total_transactions: Number(allTimeRow?.count ?? 0),
      total_revenue_cents: Number(allTimeRow?.total ?? 0),
    },
    recent_transactions: recentTransactions.map((tx) => ({
      amount_cents: tx.amount,
      status: tx.status,
      source: tx.source,
      time: tx.createdAt.toISOString(),
    })),
    hourly_breakdown: hourlyBreakdown.map((h) => ({
      hour: h.hour,
      count: Number(h.count),
      revenue_cents: Number(h.revenue ?? 0),
    })),
    streak: {
      consecutive_successes: Number(streakRow?.consecutive_successes ?? 0),
      best_hour: bestHourLabel,
    },
  }
}
