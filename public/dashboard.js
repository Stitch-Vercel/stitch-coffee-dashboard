// ============================================
// Stitch Coffee Dashboard — Vanilla JS
// ============================================

(function () {
  'use strict';

  const REFRESH_INTERVAL = 30_000; // 30 seconds
  const SAST_OFFSET = 2; // UTC+2
  const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06–21

  let lastKnownData = null;
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
    hourlyChart: $('hourly-chart'),
    transactionsFeed: $('transactions-feed'),
    funCups: $('fun-cups'),
    funStreak: $('fun-streak'),
    funWeekly: $('fun-weekly'),
    loadingOverlay: $('loading-overlay'),
  };

  // ---- Formatting ----
  function formatZAR(cents) {
    const rands = Math.abs(cents) / 100;
    const formatted = rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R ${formatted}`;
  }

  function formatTime(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
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

  // ---- Clock ----
  function updateClock() {
    const now = new Date();
    const sast = new Date(now.getTime() + SAST_OFFSET * 3600_000);
    const h = String(sast.getUTCHours()).padStart(2, '0');
    const m = String(sast.getUTCMinutes()).padStart(2, '0');
    const s = String(sast.getUTCSeconds()).padStart(2, '0');
    els.clock.textContent = `${h}:${m}:${s}`;
  }

  // ---- Animated Number ----
  function animateNumber(element, targetValue, formatter, duration = 800) {
    const startValue = parseFloat(element.dataset.currentValue || '0');
    element.dataset.currentValue = targetValue;

    if (startValue === targetValue) {
      element.textContent = formatter(targetValue);
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
      const currentVal = startValue + (targetValue - startValue) * easedProgress;

      element.textContent = formatter(currentVal);

      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }

  // ---- Hourly Chart ----
  function renderHourlyChart(hourlyData) {
    if (!hourlyData || !Object.keys(hourlyData).length) return;

    const maxVal = Math.max(...HOURS.map((h) => hourlyData[h] || 0), 1);
    const now = new Date();
    const currentSASTHour = (now.getUTCHours() + SAST_OFFSET) % 24;

    // Build or update chart rows
    if (!els.hourlyChart.children.length) {
      els.hourlyChart.innerHTML = HOURS.map((hour) => {
        const count = hourlyData[hour] || 0;
        const pct = (count / maxVal) * 100;
        const isCurrent = hour === currentSASTHour;
        return `
          <div class="hour-row">
            <span class="hour-label">${formatTime(hour)}</span>
            <div class="hour-bar-track">
              <div class="hour-bar${isCurrent ? ' current-hour' : ''}" data-hour="${hour}" style="width: ${pct}%"></div>
            </div>
            <span class="hour-count" data-hour-count="${hour}">${count}</span>
          </div>`;
      }).join('');
    } else {
      HOURS.forEach((hour) => {
        const count = hourlyData[hour] || 0;
        const pct = (count / maxVal) * 100;
        const isCurrent = hour === currentSASTHour;

        const bar = els.hourlyChart.querySelector(`[data-hour="${hour}"]`);
        const countEl = els.hourlyChart.querySelector(`[data-hour-count="${hour}"]`);

        if (bar) {
          bar.style.width = `${pct}%`;
          bar.classList.toggle('current-hour', isCurrent);
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
      .map(
        (tx) => `
        <div class="tx-item">
          <span class="tx-status-dot ${tx.status}"></span>
          <div class="tx-details">
            <div class="tx-id">${escapeHtml(tx.reference || tx.id)}</div>
            <div class="tx-time">${relativeTime(tx.createdAt)}</div>
          </div>
          <div class="tx-amount">${formatZAR(tx.amountCents)}</div>
        </div>`
      )
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

  // ---- Update Dashboard ----
  function updateDashboard(data) {
    // Hero
    animateNumber(els.heroRevenue, data.totalRevenueCents, formatZAR, 1200);
    els.heroTransactions.textContent = `${data.totalTransactions.toLocaleString()} transactions`;

    // Stats
    animateNumber(els.statTransactions, data.totalTransactions, (v) => Math.round(v).toLocaleString());

    const rate = data.successRate ?? 0;
    els.statSuccessRate.textContent = `${rate.toFixed(1)}%`;
    els.statSuccessRate.className = `stat-value ${getSuccessRateClass(rate)}`;

    animateNumber(els.statAvgTransaction, data.avgTransactionCents, formatZAR);

    els.statBestHour.textContent = data.bestHour != null ? formatTime(data.bestHour) : '--:00';

    // Hourly chart
    renderHourlyChart(data.hourlyActivity);

    // Recent transactions
    renderRecentTransactions(data.recentTransactions);

    // Fun stats
    animateNumber(els.funCups, data.cupsServed ?? 0, (v) => Math.round(v).toLocaleString());
    animateNumber(els.funStreak, data.successStreak ?? 0, (v) => Math.round(v).toLocaleString());
    animateNumber(els.funWeekly, data.weeklyRevenueCents ?? 0, formatZAR);
  }

  // ---- Fetch Stats ----
  async function fetchStats() {
    try {
      const resp = await fetch('/api/stats');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      lastKnownData = data;
      updateDashboard(data);
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
