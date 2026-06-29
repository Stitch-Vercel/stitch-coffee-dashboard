// ============================================
// Stitch Coffee Dashboard — Vanilla JS
// ============================================

(function () {
  'use strict';

  const REFRESH_INTERVAL = 30_000; // 30 seconds
  const SAST_OFFSET = 2; // UTC+2
  const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06–21
  const BUSINESS_START_HOUR = 6;
  const BUSINESS_END_HOUR = 21;
  const ALL_TIME_MILESTONES_CENTS = [5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000];

  let lastKnownData = null;
  let lastSeenTransactionKey = null;
  let saleMomentTimer = null;
  let refreshTimer = null;

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const els = {
    clock: $('clock'),
    heroRevenue: $('hero-revenue'),
    heroTransactions: $('hero-transactions'),
    statTransactions: $('stat-transactions'),
    statSuccessRate: $('stat-success-rate'),
    statAvgTransaction: $('stat-avg-transaction'),
    statBestHour: $('stat-best-hour'),
    statAllTimeRevenue: $('stat-all-time-revenue'),
    statAllTimeTransactions: $('stat-all-time-transactions'),
    goalRing: $('goal-ring'),
    goalPercent: $('goal-percent'),
    goalCopy: $('goal-copy'),
    goalTrackFill: $('goal-track-fill'),
    paceProjection: $('pace-projection'),
    paceCopy: $('pace-copy'),
    milestoneValue: $('milestone-value'),
    milestoneCopy: $('milestone-copy'),
    hourlyChart: $('hourly-chart'),
    transactionsFeed: $('transactions-feed'),
    leaderboardFeed: $('leaderboard-feed'),
    funCups: $('fun-cups'),
    funStreak: $('fun-streak'),
    funWeekly: $('fun-weekly'),
    saleMoment: $('sale-moment'),
    saleMomentAmount: $('sale-moment-amount'),
    saleMomentMeta: $('sale-moment-meta'),
    loadingOverlay: $('loading-overlay'),
  };

  // ---- Formatting ----
  function formatZAR(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    const rands = Math.abs(value) / 100;
    const formatted = rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R ${formatted}`;
  }

  function formatTime(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function formatCompactZAR(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    const rands = Math.abs(value) / 100;

    if (rands >= 1000) {
      return `R ${rands.toLocaleString('en-ZA', { maximumFractionDigits: 0 })}`;
    }

    return formatZAR(value);
  }

  function relativeTime(isoString) {
    const now = new Date();
    const then = new Date(isoString);
    const diffSec = Math.floor((now - then) / 1000);

    if (diffSec < 10) return 'just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }

  function toSastDate(date = new Date()) {
    return new Date(date.getTime() + SAST_OFFSET * 3600_000);
  }

  function getSastHour(date = new Date()) {
    return toSastDate(date).getUTCHours();
  }

  function getSastMinutesIntoDay(date = new Date()) {
    const sast = toSastDate(date);
    return sast.getUTCHours() * 60 + sast.getUTCMinutes();
  }

  function normalizeSource(source) {
    return String(source || 'Terminal payment').replaceAll('_', ' ');
  }

  function getTransactionPlace(tx) {
    return tx?.store_name || tx?.terminal_label || normalizeSource(tx?.source);
  }

  function getBuyerDisplayName(tx) {
    return tx?.buyer_display_name || 'Mystery patron';
  }

  function getTransactionKey(tx) {
    if (!tx) return null;
    return `${tx.time || ''}:${tx.amount_cents || 0}:${tx.status || ''}`;
  }

  // ---- Clock ----
  function updateClock() {
    const sast = toSastDate();
    const h = String(sast.getUTCHours()).padStart(2, '0');
    const m = String(sast.getUTCMinutes()).padStart(2, '0');
    const s = String(sast.getUTCSeconds()).padStart(2, '0');
    els.clock.textContent = `${h}:${m}:${s}`;
  }

  // ---- Animated Number ----
  function animateNumber(element, targetValue, formatter, duration = 800) {
    const safeTargetValue = Number.isFinite(Number(targetValue)) ? Number(targetValue) : 0;
    const startValue = parseFloat(element.dataset.currentValue || '0');
    element.dataset.currentValue = String(safeTargetValue);

    if (startValue === safeTargetValue) {
      element.textContent = formatter(safeTargetValue);
      return;
    }

    const startTime = performance.now();

    function easeOut(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function tick(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOut(progress);
      const currentVal = startValue + (safeTargetValue - startValue) * easedProgress;

      element.textContent = formatter(currentVal);

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  // ---- Hourly Chart ----
  function renderHourlyChart(hourlyData) {
    hourlyData = hourlyData || {};

    const maxVal = Math.max(...HOURS.map((h) => hourlyData[h] || 0), 1);
    const currentSASTHour = getSastHour();
    const bestHour = HOURS.reduce((best, hour) => {
      return (hourlyData[hour] || 0) > (hourlyData[best] || 0) ? hour : best;
    }, HOURS[0]);

    // Build or update chart rows
    if (!els.hourlyChart.children.length) {
      els.hourlyChart.innerHTML = HOURS.map((hour) => {
        const count = hourlyData[hour] || 0;
        const pct = (count / maxVal) * 100;
        const isCurrent = hour === currentSASTHour;
        const isBest = hour === bestHour && count > 0;
        return `
          <div class="hour-row">
            <span class="hour-label">${formatTime(hour)}</span>
            <div class="hour-bar-track">
              <div class="hour-bar${isCurrent ? ' current-hour' : ''}${isBest ? ' best-hour' : ''}" data-hour="${hour}" style="width: ${pct}%"></div>
            </div>
            <span class="hour-count" data-hour-count="${hour}">${count}</span>
          </div>`;
      }).join('');
    } else {
      HOURS.forEach((hour) => {
        const count = hourlyData[hour] || 0;
        const pct = (count / maxVal) * 100;
        const isCurrent = hour === currentSASTHour;
        const isBest = hour === bestHour && count > 0;

        const bar = els.hourlyChart.querySelector(`[data-hour="${hour}"]`);
        const countEl = els.hourlyChart.querySelector(`[data-hour-count="${hour}"]`);

        if (bar) {
          bar.style.width = `${pct}%`;
          bar.classList.toggle('current-hour', isCurrent);
          bar.classList.toggle('best-hour', isBest);
        }
        if (countEl) {
          countEl.textContent = count;
        }
      });
    }
  }

  // ---- Recent Transactions ----
  function renderRecentTransactions(transactions) {
    if (!transactions || !transactions.length) {
      els.transactionsFeed.innerHTML =
        '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No transactions yet</div>';
      return;
    }

    const items = transactions.slice(0, 10);
    els.transactionsFeed.innerHTML = items
      .map((tx) => {
        const status = String(tx.status || '').toLowerCase();
        const statusClass = status === 'failure' ? 'failed' : status;
        const place = getTransactionPlace(tx);
        const buyerName = getBuyerDisplayName(tx);

        return `
        <div class="tx-item ${statusClass}">
          <span class="tx-status-dot ${statusClass}"></span>
          <div class="tx-details">
            <div class="tx-id">${escapeHtml(buyerName)}</div>
            <div class="tx-time">${relativeTime(tx.time)} · ${escapeHtml(place)}</div>
          </div>
          <div class="tx-amount">${formatZAR(tx.amount_cents)}</div>
        </div>`;
      })
      .join('');
  }

  function renderLeaderboard(leaderboard) {
    if (!leaderboard || !leaderboard.length) {
      els.leaderboardFeed.innerHTML =
        '<div style="color: var(--text-secondary); text-align: center; padding: 2rem;">No coffee buyers yet</div>';
      return;
    }

    const maxTransactions = Math.max(...leaderboard.map((entry) => entry.transactions || 0), 1);

    els.leaderboardFeed.innerHTML = leaderboard
      .slice(0, 8)
      .map((entry) => {
        const progress = Math.max(8, ((entry.transactions || 0) / maxTransactions) * 100);
        const badgeClass = entry.is_known ? 'known' : 'unknown';
        const purchaseCopy = `${(entry.transactions || 0).toLocaleString()} cups`;

        return `
        <div class="leaderboard-item ${badgeClass}">
          <div class="leaderboard-rank">${entry.rank || '-'}</div>
          <div class="leaderboard-main">
            <div class="leaderboard-topline">
              <span class="leaderboard-name">${escapeHtml(entry.display_name || 'Coffee buyer')}</span>
              <span class="leaderboard-value">${formatCompactZAR(entry.revenue_cents || 0)}</span>
            </div>
            <div class="leaderboard-progress">
              <div class="leaderboard-progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="leaderboard-subline">
              <span>${purchaseCopy}</span>
              <span>${entry.is_known ? 'staff card' : 'unclaimed'}</span>
            </div>
          </div>
        </div>`;
      })
      .join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Success Rate Coloring ----
  function getSuccessRateClass(rate) {
    if (rate >= 95) return 'rate-green';
    if (rate >= 80) return 'rate-yellow';
    return 'rate-red';
  }

  function getAllTimeMilestone(totalRevenueCents) {
    const nextMilestone = ALL_TIME_MILESTONES_CENTS.find((value) => value > totalRevenueCents);

    if (nextMilestone) return nextMilestone;

    const nextMillion = Math.ceil((totalRevenueCents + 1) / 100_000_000) * 100_000_000;
    return Math.max(nextMillion, 100_000_000);
  }

  function updateAllTimeMilestone(allTimeRevenueCents) {
    const nextMilestone = getAllTimeMilestone(allTimeRevenueCents);
    const progress = Math.min(allTimeRevenueCents / nextMilestone, 1);
    const percent = Math.round(progress * 100);

    els.goalRing.style.setProperty('--goal-progress', `${percent}%`);
    els.goalPercent.textContent = `${percent}%`;
    els.goalCopy.textContent = `${formatCompactZAR(allTimeRevenueCents)} / ${formatCompactZAR(nextMilestone)}`;
    els.goalTrackFill.style.width = `${percent}%`;
    els.goalRing.classList.toggle('goal-complete', percent >= 100);
  }

  function updatePace(todayRevenueCents) {
    const startMinute = BUSINESS_START_HOUR * 60;
    const endMinute = BUSINESS_END_HOUR * 60;
    const totalMinutes = endMinute - startMinute;
    const nowMinutes = getSastMinutesIntoDay();
    const elapsedMinutes = Math.max(Math.min(nowMinutes - startMinute, totalMinutes), 0);

    if (elapsedMinutes <= 0 || todayRevenueCents <= 0) {
      els.paceProjection.textContent = formatZAR(todayRevenueCents);
      els.paceCopy.textContent = 'Market opens at 06:00';
      return;
    }

    if (elapsedMinutes >= totalMinutes) {
      els.paceProjection.textContent = formatZAR(todayRevenueCents);
      els.paceCopy.textContent = 'Final pace for today';
      return;
    }

    const projectedClose = Math.round(todayRevenueCents / elapsedMinutes * totalMinutes);
    const hourlyRunRate = Math.round(todayRevenueCents / elapsedMinutes * 60);

    els.paceProjection.textContent = formatZAR(projectedClose);
    els.paceCopy.textContent = `${formatCompactZAR(hourlyRunRate)} per hour run-rate`;
  }

  function updateMilestone(allTimeRevenueCents) {
    const nextMilestone = getAllTimeMilestone(allTimeRevenueCents);
    const remaining = nextMilestone - allTimeRevenueCents;
    els.milestoneValue.textContent = formatCompactZAR(nextMilestone);
    els.milestoneCopy.textContent = `${formatCompactZAR(remaining)} lifetime sales to go`;
  }

  function maybeShowSaleMoment(data) {
    const newestTx = data.recent_transactions?.[0];
    const newestKey = getTransactionKey(newestTx);

    if (!newestKey) return;

    if (!lastSeenTransactionKey) {
      lastSeenTransactionKey = newestKey;
      return;
    }

    if (newestKey === lastSeenTransactionKey) return;

    lastSeenTransactionKey = newestKey;

    if (newestTx.status !== 'SUCCESS') return;

    els.saleMomentAmount.textContent = formatZAR(newestTx.amount_cents);
    els.saleMomentMeta.textContent = `${getBuyerDisplayName(newestTx)} paid on Express`;
    els.saleMoment.classList.remove('show');
    window.requestAnimationFrame(() => {
      els.saleMoment.classList.add('show');
    });

    window.clearTimeout(saleMomentTimer);
    saleMomentTimer = window.setTimeout(() => {
      els.saleMoment.classList.remove('show');
    }, 4200);
  }

  // ---- Update Dashboard ----
  function updateDashboard(data) {
    const today = data.today || {};
    const week = data.week || {};
    const allTime = data.all_time || {};
    const streak = data.streak || {};
    const hourlyActivity = Object.fromEntries(
      (data.hourly_breakdown || []).map((row) => [row.hour, row.count])
    );

    // Hero
    animateNumber(els.heroRevenue, today.revenue_cents, formatZAR, 1200);
    els.heroTransactions.textContent = `${(today.transactions || 0).toLocaleString()} transactions`;

    // Stats
    animateNumber(els.statTransactions, today.transactions, (v) => Math.round(v).toLocaleString());

    const rate = today.success_rate ?? 0;
    els.statSuccessRate.textContent = `${rate.toFixed(1)}%`;
    els.statSuccessRate.className = `stat-value ${getSuccessRateClass(rate)}`;

    animateNumber(els.statAvgTransaction, today.avg_transaction_cents, formatZAR);

    els.statBestHour.textContent = streak.best_hour || '--:00';

    animateNumber(els.statAllTimeRevenue, allTime.total_revenue_cents, formatZAR);
    animateNumber(els.statAllTimeTransactions, allTime.total_transactions, (v) => Math.round(v).toLocaleString());

    updateAllTimeMilestone(allTime.total_revenue_cents ?? 0);
    updatePace(today.revenue_cents ?? 0);
    updateMilestone(allTime.total_revenue_cents ?? 0);

    // Hourly chart
    renderHourlyChart(hourlyActivity);

    // Recent transactions
    renderRecentTransactions(data.recent_transactions);

    // Leaderboard
    renderLeaderboard(data.leaderboard);

    // Fun stats
    animateNumber(els.funCups, today.successfulTransactions ?? 0, (v) => Math.round(v).toLocaleString());
    animateNumber(els.funStreak, streak.consecutive_successes ?? 0, (v) => Math.round(v).toLocaleString());
    animateNumber(els.funWeekly, week.revenue_cents ?? 0, formatZAR);
  }

  // ---- Fetch Stats ----
  async function fetchStats() {
    try {
      const resp = await fetch('/api/stats');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      maybeShowSaleMoment(data);
      updateDashboard(data);
      lastKnownData = data;
      hideLoading();
    } catch (err) {
      console.error('[Dashboard] Failed to fetch stats:', err);
      // Show last known data if available
      if (lastKnownData) {
        updateDashboard(lastKnownData);
      }
      hideLoading();
    }
  }

  // ---- Loading Overlay ----
  function hideLoading() {
    if (els.loadingOverlay && !els.loadingOverlay.classList.contains('hidden')) {
      els.loadingOverlay.classList.add('hidden');
    }
  }

  // ---- Init ----
  function init() {
    // Start clock — ticks every second
    updateClock();
    setInterval(updateClock, 1000);

    // Initial fetch
    fetchStats();

    // Auto-refresh every 30s
    refreshTimer = setInterval(fetchStats, REFRESH_INTERVAL);
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
