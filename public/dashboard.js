// ============================================
// Stitch Coffee Dashboard — Vanilla JS
// ============================================

(function () {
  'use strict';

  const REFRESH_INTERVAL = 5_000; // 5 seconds
  const SAST_OFFSET = 2; // UTC+2
  const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06–21
  const BUSINESS_START_HOUR = 6;
  const BUSINESS_END_HOUR = 21;
  const COFFEE_PRICE_CENTS = 200;
  const ALL_TIME_MILESTONES_CENTS = [500_000, 1_000_000];
  const MILESTONE_STEP_CENTS = 500_000; // after the early ladder, a milestone every R5k
  const LEADERBOARD_ROWS = 6;
  const TICKER_FALLBACK_SPEED_PX_PER_SEC = 60;
  const THEME_STORAGE_KEY = 'stitch-coffee-dashboard-theme';
  const THEMES = ['light', 'dark'];
  const CONFETTI_COLORS = {
    light: ['#6E2CFF', '#FF5B00', '#00E979', '#100E13', '#F3ECFF'],
    dark: ['#6E2CFF', '#FF5B00', '#00E979', '#FFFFFF', '#C4A8FF'],
  };
  // Thousands are grouped with a no-break space per the Stitch design;
  // decimals always use a point.
  const THOUSANDS_SEPARATOR = ' ';
  const DASHBOARD_CONFIG = window.STITCH_COFFEE_DASHBOARD_CONFIG || {};
  const DEMO_MODE = DASHBOARD_CONFIG.demoMode === true;
  // DEMO ONLY: replace unmatched cards with deterministic names from the staff card list.
  const DEMO_MYSTERY_PATRON_NAMES = [
    'Bianca-jade Sutton',
    'Cady Ward',
    'Caleb Naidoo',
    'Christian Still',
    'Christine Snyders',
    'Christoph Kuhn',
    'Damian Wilson',
    'Elena Aiello',
    'Henk Van Jaarsveld',
    'James Bellairs',
    'Jeremy Wagemans',
    'Jessica Walters',
    'Jordan Sher',
    'Josh Gordon',
    'Kaylin Naidoo',
    'Lebo Morojele',
    'Matteo Kalogirou',
    'Musonda Chalwe',
    'Nika Coskey',
    'Philip Cronje',
    'Rebecca Wewege',
    'Robbie Van Eck',
    'Robert Ketteringham',
    'Robert Lee',
  ];
  // DEMO ONLY: keep the all-time milestone poised R2 below R10k so every sale completes it.
  const DEMO_MILESTONE_TARGET_CENTS = 1_000_000;
  const DEMO_MILESTONE_OFFSET_CENTS = COFFEE_PRICE_CENTS;
  const DEMO_MILESTONE_RESET_DELAY_MS = 4_400;

  let lastKnownData = null;
  let lastSeenTransactionKey = null;
  let lastRenderedTransactionKey = null;
  let saleMomentTimer = null;
  let demoMilestoneResetTimer = null;
  let demoMilestoneReachedUntil = 0;
  let refreshTimer = null;
  let prevAllTimeRevenueCents = null;

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const els = {
    clock: $('clock'),
    heroRevenue: $('hero-revenue'),
    heroTransactions: $('hero-transactions'),
    statSuccessRate: $('stat-success-rate'),
    statAvgTransaction: $('stat-avg-transaction'),
    statBestHour: $('stat-best-hour'),
    statBestHourCopy: $('stat-best-hour-copy'),
    statAllTimeRevenue: $('stat-all-time-revenue'),
    statAllTimeTransactions: $('stat-all-time-transactions'),
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
    tickerTrack: $('ticker-track'),
    saleMoment: $('sale-moment'),
    saleMomentAmount: $('sale-moment-amount'),
    saleMomentMeta: $('sale-moment-meta'),
    loadingOverlay: $('loading-overlay'),
    headerVersion: $('header-version'),
    themeToggle: $('theme-toggle'),
  };

  // ---- Formatting ----
  // "1234567.5" -> "1 234 567.50": grouped integer part, point decimals
  function formatAmount(rands, decimals = 2) {
    const fixed = Math.abs(Number(rands) || 0).toFixed(decimals);
    const [integerPart, fractionPart] = fixed.split('.');
    const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
    return decimals > 0 ? `${grouped}.${fractionPart}` : grouped;
  }

  function formatCount(value) {
    return formatAmount(Math.round(Number(value) || 0), 0);
  }

  function formatZAR(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    return `R ${formatAmount(value / 100, 2)}`;
  }

  function formatTime(hour) {
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function formatCompactZAR(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    const rands = Math.abs(value) / 100;

    if (rands >= 1000) {
      return `R ${formatAmount(rands, 0)}`;
    }

    return formatZAR(value);
  }

  // API sends "08:00 - 09:00"; the design shows "08:00–09:00"
  function formatBestHour(label) {
    if (!label) return '--:00';
    return String(label).replace(/\s*-\s*/, '–');
  }

  function getBestHourCopy(label) {
    const hour = parseInt(String(label || ''), 10);
    if (!Number.isFinite(hour)) return 'approved sales peak';
    if (hour < 12) return 'the morning queue';
    if (hour < 17) return 'the afternoon rush';
    return 'the evening wind-down';
  }

  function getCoffeeCount(cents) {
    const value = Number.isFinite(Number(cents)) ? Number(cents) : 0;
    return Math.max(0, Math.round(value / COFFEE_PRICE_CENTS));
  }

  function getRealAllTimeRevenueCents(data) {
    const allTime = data?.all_time || {};
    const value = allTime.total_revenue_cents ?? allTime.revenue_cents ?? 0;

    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function getDemoAllTimeRevenueCents() {
    if (Date.now() < demoMilestoneReachedUntil) {
      return DEMO_MILESTONE_TARGET_CENTS;
    }

    return DEMO_MILESTONE_TARGET_CENTS - DEMO_MILESTONE_OFFSET_CENTS;
  }

  function triggerDemoMilestoneLoop() {
    demoMilestoneReachedUntil = Date.now() + DEMO_MILESTONE_RESET_DELAY_MS;
    window.clearTimeout(demoMilestoneResetTimer);
    demoMilestoneResetTimer = window.setTimeout(() => {
      demoMilestoneReachedUntil = 0;

      if (lastKnownData) {
        updateDashboard(lastKnownData);
      }
    }, DEMO_MILESTONE_RESET_DELAY_MS);
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

  function getDemoNameForKey(key, offset = 0) {
    let hash = 0;

    for (let i = 0; i < key.length; i++) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }

    return DEMO_MYSTERY_PATRON_NAMES[(hash + offset) % DEMO_MYSTERY_PATRON_NAMES.length];
  }

  function getDemoMysteryPatronName(tx) {
    return getDemoNameForKey(getTransactionKey(tx) || `${Date.now()}`);
  }

  function getBuyerDisplayName(tx) {
    const buyerName = tx?.buyer_display_name;

    if (buyerName && buyerName !== 'Mystery patron' && buyerName !== 'Unknown buyer') {
      return buyerName;
    }

    if (DEMO_MODE) {
      return getDemoMysteryPatronName(tx);
    }

    return 'Mystery patron';
  }

  function isNamedBuyer(tx) {
    return Boolean(tx?.buyer_display_name && tx.buyer_display_name !== 'Mystery patron');
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

  // ---- Hero Revenue odometer ----
  const ODO_DIGIT_COLUMN = Array.from({ length: 10 }, (_, d) => `<span>${d}</span>`).join('');

  function updateHeroOdometer(targetCents) {
    const element = els.heroRevenue;
    const safeTargetValue = Number.isFinite(Number(targetCents)) ? Number(targetCents) : 0;
    const previousValue = element.dataset.currentValue;
    element.dataset.currentValue = String(safeTargetValue);

    const formatted = formatZAR(safeTargetValue);
    // Non-digit layout (currency symbol, separators) — rebuild only when it changes
    const skeleton = formatted.replace(/\d/g, '#');

    if (element.dataset.odoSkeleton !== skeleton) {
      element.dataset.odoSkeleton = skeleton;
      element.innerHTML = `<span class="odometer">${[...formatted]
        .map((ch) =>
          /\d/.test(ch)
            ? `<span class="odo-digit"><span class="odo-col">${ODO_DIGIT_COLUMN}</span></span>`
            : `<span class="odo-static">${ch === ' ' ? '&nbsp;' : ch}</span>`
        )
        .join('')}</span>`;
    }

    const digits = formatted.match(/\d/g) || [];
    const columns = element.querySelectorAll('.odo-col');
    // Defer so freshly built columns transition from 0 instead of snapping
    window.requestAnimationFrame(() => {
      columns.forEach((col, i) => {
        col.style.transform = `translateY(-${digits[i]}em)`;
      });
    });

    if (previousValue !== undefined && previousValue !== String(safeTargetValue)) {
      element.style.animation = 'none';
      element.offsetHeight; // force reflow to restart the pop
      element.style.animation = 'popA 0.6s ease';
    }
  }

  // ---- Milestone Celebration ----
  function celebrateMilestone() {
    if (typeof confetti !== 'function') return;

    const colors = CONFETTI_COLORS[getTheme()] || CONFETTI_COLORS.light;

    confetti({ particleCount: 160, spread: 100, startVelocity: 45, scalar: 1.1, origin: { y: 0.55 }, colors });

    const end = Date.now() + 2200;
    (function sideBursts() {
      confetti({ particleCount: 5, angle: 60, spread: 60, startVelocity: 55, origin: { x: 0, y: 0.9 }, colors });
      confetti({ particleCount: 5, angle: 120, spread: 60, startVelocity: 55, origin: { x: 1, y: 0.9 }, colors });
      if (Date.now() < end) requestAnimationFrame(sideBursts);
    })();
  }

  function maybeCelebrateMilestone(allTimeRevenueCents, milestoneOverrideCents) {
    if (prevAllTimeRevenueCents !== null && allTimeRevenueCents > prevAllTimeRevenueCents) {
      const target = milestoneOverrideCents ?? getAllTimeMilestone(prevAllTimeRevenueCents);
      if (allTimeRevenueCents >= target) celebrateMilestone();
    }
    prevAllTimeRevenueCents = allTimeRevenueCents;
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
        const countClass = isCurrent ? 'count-current' : count > 0 ? 'count-active' : '';
        const labelClass = isCurrent ? 'current-hour-label' : '';
        return `
          <div class="hour-row">
            <span class="hour-label ${labelClass}">${formatTime(hour)}</span>
            <div class="hour-bar-track">
              <div class="hour-bar${isCurrent ? ' current-hour' : ''}" data-hour="${hour}" style="width: ${pct}%"></div>
            </div>
            <span class="hour-count ${countClass}" data-hour-count="${hour}">${count}</span>
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
          countEl.className = `hour-count ${isCurrent ? 'count-current' : count > 0 ? 'count-active' : ''}`;
        }

        // Update label color
        const row = bar?.closest('.hour-row');
        const label = row?.querySelector('.hour-label');
        if (label) {
          label.classList.toggle('current-hour-label', isCurrent);
        }
      });
    }
  }

  // ---- Recent Transactions ----
  function renderRecentTransactions(transactions) {
    if (!transactions || !transactions.length) {
      els.transactionsFeed.innerHTML = '<div class="card-empty">No transactions yet</div>';
      return;
    }

    const items = transactions.slice(0, 10);
    const newestKey = getTransactionKey(items[0]);
    // The feed is rebuilt every poll (to refresh relative times), so only
    // animate the top row when the newest transaction actually changed.
    const hasNewTransaction =
      lastRenderedTransactionKey !== null && newestKey !== lastRenderedTransactionKey;
    lastRenderedTransactionKey = newestKey;

    els.transactionsFeed.innerHTML = items
      .map((tx, index) => {
        const status = String(tx.status || '').toLowerCase();
        const statusClass = status === 'success' ? 'success' : status === 'pending' ? 'pending' : 'failed';
        const statusLabel = status === 'success' ? 'Approved' : status === 'pending' ? 'Pending' : 'Declined';
        const place = getTransactionPlace(tx);
        const buyerName = getBuyerDisplayName(tx);

        return `
        <div class="tx-item${index === 0 && hasNewTransaction ? ' tx-new' : ''}">
          <span class="tx-icon"><span class="material-icons" aria-hidden="true">local_cafe</span></span>
          <div class="tx-details">
            <div class="tx-id">${escapeHtml(buyerName)}</div>
            <div class="tx-time">${relativeTime(tx.time)} · ${escapeHtml(place)}</div>
          </div>
          <span class="tx-tag ${statusClass}">${statusLabel}</span>
          <div class="tx-amount">${formatZAR(tx.amount_cents)}</div>
        </div>`;
      })
      .join('');
  }

  function renderLeaderboard(leaderboard) {
    // The API returns the board pre-ranked by revenue; render it as-is.
    const visibleLeaderboard = (leaderboard || []).slice(0, LEADERBOARD_ROWS);

    if (!visibleLeaderboard.length) {
      els.leaderboardFeed.innerHTML = '<div class="card-empty">No coffee buyers yet</div>';
      return;
    }

    const leaderboardWithTransactions = visibleLeaderboard.map((entry) => ({
      ...entry,
      transaction_count: Number.isFinite(Number(entry.transactions))
        ? Number(entry.transactions)
        : 0,
      revenue: Number.isFinite(Number(entry.revenue_cents)) ? Number(entry.revenue_cents) : 0,
    }));
    const maxRevenue = Math.max(
      ...leaderboardWithTransactions.map((entry) => entry.revenue),
      1
    );

    els.leaderboardFeed.innerHTML = leaderboardWithTransactions
      .map((entry, index) => {
        const progress = Math.max(6, (entry.revenue / maxRevenue) * 100);
        const cups = getCoffeeCount(entry.revenue);
        const purchaseCopy = `${formatCount(cups)} ${cups === 1 ? 'cup' : 'cups'}`;
        const leaderboardName = DEMO_MODE
          ? getDemoNameForKey(
              [
                entry.rank || index + 1,
                entry.transaction_count,
                entry.revenue,
                entry.last_purchase_at || '',
                entry.display_name || '',
              ].join(':'),
              index * 7
            )
          : entry.display_name || 'Coffee buyer';
        const cardLabel = DEMO_MODE || entry.is_known ? 'Staff card' : 'Unclaimed';

        return `
        <div class="leaderboard-item${index === 0 ? ' is-leader' : ''}">
          <div class="leaderboard-rank">${entry.rank || index + 1}</div>
          <div class="leaderboard-main">
            <div class="leaderboard-topline">
              <span class="leaderboard-name">${escapeHtml(leaderboardName)}</span>
              <span class="leaderboard-value">${formatCompactZAR(entry.revenue_cents || 0)}</span>
            </div>
            <div class="leaderboard-progress">
              <div class="leaderboard-progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="leaderboard-subline">
              <span>${purchaseCopy}</span>
              <span>${cardLabel}</span>
            </div>
          </div>
        </div>`;
      })
      .join('');

    trimOverflowingRows(els.leaderboardFeed, '.leaderboard-item');
  }

  // Hide trailing rows that would be clipped by the card so the feed never
  // shows a half-cut entry on smaller-than-expected panels.
  function trimOverflowingRows(feed, rowSelector) {
    const rows = Array.from(feed.querySelectorAll(rowSelector));
    rows.forEach((row) => row.classList.remove('is-overflow'));
    const limit = feed.getBoundingClientRect().bottom + 1;
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i].getBoundingClientRect().bottom <= limit) break;
      rows[i].classList.add('is-overflow');
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getAllTimeMilestone(totalRevenueCents) {
    const nextMilestone = ALL_TIME_MILESTONES_CENTS.find((value) => value > totalRevenueCents);

    if (nextMilestone) return nextMilestone;

    return Math.ceil((totalRevenueCents + 1) / MILESTONE_STEP_CENTS) * MILESTONE_STEP_CENTS;
  }

  function updateAllTimeMilestone(allTimeRevenueCents, milestoneOverrideCents) {
    const nextMilestone = milestoneOverrideCents ?? getAllTimeMilestone(allTimeRevenueCents);
    const progress = Math.min(allTimeRevenueCents / nextMilestone, 1);
    const percent = Math.floor(progress * 100);

    els.goalPercent.textContent = `${percent}%`;
    els.goalCopy.innerHTML = `${formatCompactZAR(allTimeRevenueCents)} <span class="milestone-target">/ ${formatCompactZAR(nextMilestone)}</span>`;
    els.goalTrackFill.style.width = `${percent}%`;
    els.goalTrackFill.classList.toggle('goal-complete', percent >= 100);
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
    els.paceCopy.innerHTML = `<span class="pace-rate">${formatZAR(hourlyRunRate)}</span> per hour`;
  }

  function updateMilestone(allTimeRevenueCents, milestoneOverrideCents) {
    const nextMilestone = milestoneOverrideCents ?? getAllTimeMilestone(allTimeRevenueCents);
    const remaining = Math.max(0, nextMilestone - allTimeRevenueCents);
    els.milestoneValue.textContent = formatCompactZAR(nextMilestone);
    els.milestoneCopy.textContent = formatCompactZAR(remaining);
  }

  function showSaleMoment(tx) {
    els.saleMomentAmount.textContent = formatZAR(tx.amount_cents);
    els.saleMomentMeta.textContent = `${getBuyerDisplayName(tx)} paid on Express`;
    els.saleMoment.classList.remove('show');
    void els.saleMoment.offsetWidth; // force reflow so animations restart on back-to-back sales
    els.saleMoment.classList.add('show');

    window.clearTimeout(saleMomentTimer);
    saleMomentTimer = window.setTimeout(() => {
      els.saleMoment.classList.remove('show');
    }, 4200);
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

    if (DEMO_MODE) {
      triggerDemoMilestoneLoop();
    }

    showSaleMoment(newestTx);
  }

  // ---- Update Dashboard ----
  function updateDashboard(data) {
    const today = data.today || {};
    const realAllTimeRevenueCents = getRealAllTimeRevenueCents(data);
    const allTimeRevenueCents = DEMO_MODE ? getDemoAllTimeRevenueCents() : realAllTimeRevenueCents;
    const milestoneOverrideCents = DEMO_MODE ? DEMO_MILESTONE_TARGET_CENTS : undefined;
    const streak = data.streak || {};
    const hourlyActivity = Object.fromEntries(
      (data.hourly_breakdown || []).map((row) => [row.hour, row.count])
    );

    // Hero
    updateHeroOdometer(today.revenue_cents);
    const transactionCount = today.transactions || 0;
    els.heroTransactions.innerHTML = `<strong>${formatCount(transactionCount)}</strong> ${transactionCount === 1 ? 'transaction' : 'transactions'}`;

    // Stats
    const rate = Number(today.success_rate ?? 0);
    els.statSuccessRate.textContent = `${rate.toFixed(1)}%`;

    animateNumber(els.statAvgTransaction, today.avg_transaction_cents, formatZAR);

    els.statBestHour.textContent = formatBestHour(streak.best_hour);
    els.statBestHourCopy.textContent = getBestHourCopy(streak.best_hour);

    animateNumber(els.statAllTimeRevenue, allTimeRevenueCents, formatZAR);
    animateNumber(els.statAllTimeTransactions, getCoffeeCount(allTimeRevenueCents), formatCount);

    updateAllTimeMilestone(allTimeRevenueCents, milestoneOverrideCents);
    updatePace(today.revenue_cents ?? 0);
    updateMilestone(allTimeRevenueCents, milestoneOverrideCents);
    maybeCelebrateMilestone(allTimeRevenueCents, milestoneOverrideCents);

    // Hourly chart
    renderHourlyChart(hourlyActivity);

    // Recent transactions
    renderRecentTransactions(data.recent_transactions);

    // Leaderboard
    renderLeaderboard(data.leaderboard);
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

  // ---- Deploy Version ----
  // version.json is generated at build time; absent in local dev, so stay blank on failure.
  async function fetchVersion() {
    try {
      const resp = await fetch('/version.json');
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.version) {
        els.headerVersion.textContent = data.version;
        els.headerVersion.title = data.sha ? `Deployed ${data.deployed_at} (${data.sha})` : `Deployed ${data.deployed_at}`;
      }
    } catch {
      // Leave the version hidden
    }
  }

  // ---- Loading Overlay ----
  function hideLoading() {
    if (els.loadingOverlay && !els.loadingOverlay.classList.contains('hidden')) {
      els.loadingOverlay.classList.add('hidden');
    }
  }

  // ---- Ticker ----
  // Clone the message until it spans the strip plus one extra copy, then
  // scroll exactly one copy's width per cycle. Because the loop resets at a
  // seam that is pixel-identical to the start, the text wraps around without
  // ever leaving blank space, however short the message is.
  function initTicker() {
    const track = els.tickerTrack;
    const base = track?.querySelector('.ticker-content');
    if (!track || !base) return;

    const speed =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ticker-speed')) ||
      TICKER_FALLBACK_SPEED_PX_PER_SEC;

    function layout() {
      track.querySelectorAll('.ticker-content[aria-hidden]').forEach((clone) => clone.remove());

      const copyWidth = base.getBoundingClientRect().width;
      const viewportWidth = track.parentElement.getBoundingClientRect().width;
      if (!copyWidth || !viewportWidth) return;

      // Enough copies that a full copy is still queued when the shift completes
      const copies = Math.ceil(viewportWidth / copyWidth) + 1;
      for (let i = 1; i < copies; i++) {
        const clone = base.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      }

      track.style.setProperty('--ticker-shift', `-${copyWidth}px`);
      track.style.setProperty('--ticker-duration', `${copyWidth / speed}s`);
    }

    layout();
    // Web fonts change the copy width once they land
    if (document.fonts?.ready) {
      document.fonts.ready.then(layout);
    }
    window.addEventListener('resize', layout);
  }

  // ---- Theme ----
  // The palette is resolved before first paint by the inline boot script in
  // index.html. This only handles switching it afterwards.
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    const next = THEMES.includes(theme) ? theme : 'light';
    document.documentElement.setAttribute('data-theme', next);

    if (els.themeToggle) {
      const other = next === 'dark' ? 'light' : 'dark';
      els.themeToggle.setAttribute('title', `Switch to ${other} theme`);
      els.themeToggle.setAttribute('aria-label', `Switch to ${other} theme`);
    }

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch (err) {
        /* storage blocked — the theme still applies for this session */
      }
    }
  }

  function initTheme() {
    applyTheme(getTheme(), false);
    els.themeToggle?.addEventListener('click', () => {
      applyTheme(getTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  // ---- Local Dev Tools ----
  // Only rendered when the page is served from localhost, never in production.
  function initDevTools() {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) return;

    const container = document.createElement('div');
    container.className = 'dev-tools';

    const saleBtn = document.createElement('button');
    saleBtn.className = 'dev-sale-trigger';
    saleBtn.textContent = 'Trigger sale';
    saleBtn.title = 'Local dev only: preview the New Coffee Sale animation';
    saleBtn.addEventListener('click', () => {
      showSaleMoment({
        amount_cents: 200,
        buyer_display_name: 'Test Patron',
      });
    });

    const celebrateBtn = document.createElement('button');
    celebrateBtn.className = 'dev-sale-trigger';
    celebrateBtn.textContent = 'Trigger celebration';
    celebrateBtn.title = 'Local dev only: preview the milestone celebration';
    celebrateBtn.addEventListener('click', celebrateMilestone);

    container.append(saleBtn, celebrateBtn);
    document.body.appendChild(container);
  }

  // ---- Init ----
  function init() {
    // Logo click / ?theme= switch between the light and dark palettes
    initTheme();

    // Gap-free marquee
    initTicker();

    // Local-only dev tools
    initDevTools();

    // Deploy version stamp (one-time)
    fetchVersion();

    // Start clock — ticks every second
    updateClock();
    setInterval(updateClock, 1000);

    // Initial fetch
    fetchStats();

    // Auto-refresh every 7s
    refreshTimer = setInterval(fetchStats, REFRESH_INTERVAL);
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
