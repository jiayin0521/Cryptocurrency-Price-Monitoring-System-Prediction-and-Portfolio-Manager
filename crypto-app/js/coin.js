/* ==========================================================================
   coin.js — Coin detail page logic
   --------------------------------------------------------------------------
   Loads detailed information for a single cryptocurrency including:
   - Header info (name, current price, market data)
   - Interactive chart (line / candlestick) with zoom & pan
   - Time range selector
   - Technical indicators (MA20, MA50, RSI, MACD)
   - Drawing tools (line, horizontal level, annotation)
   - Volume bars
   ========================================================================== */

(function () {
    'use strict';

    // Global state for this page
    let chartController = null;
    let coinId = null;
    let lineData = [];      // Array<{time, value}>
    let candleData = [];    // Array<{time, open, high, low, close}>
    let volumeData = [];    // Array<{time, value, color}>
    let currentRange = 30;  // days
    let activeIndicators = { ma20: false, ma50: false };
    let refreshTimer = null;

    /**
     * Entry point: read the coin ID from the URL, set up the theme observer,
     * and trigger the initial data load.
     */
    function init() {
        Utils.highlightActiveNav();

        // Get coin id from URL
        coinId = Utils.getQueryParam('id');
        if (!coinId) {
            Utils.showError(document.getElementById('coin-content'),
                'No cryptocurrency selected. <a href="../index.html">Back to dashboard</a>.');
            return;
        }

        // When the user toggles theme, the chart's colors are baked in at
        // creation time. Watch for the data-theme attribute change and rebuild
        // the chart so it adopts the new theme.
        const themeObserver = new MutationObserver(function () {
            if (chartController) initChart();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        loadCoin();
    }

    /**
     * Load coin information and historical data.
     */
async function loadCoin() {
    const content = document.getElementById('coin-content');
    Utils.showLoading(content, 'Loading coin data...');

    try {
        // Fetch detail and chart data in parallel
        const [detail, chartHistory] = await Promise.all([
            Api.getCoinDetail(coinId).catch(function (err) {
                if (err.message === 'not_found') {
                    throw new Error('Cryptocurrency "' + coinId + '" not found.');
                }
                throw new Error('Could not load coin details. Please try again.');
            }),
            Api.getMarketChart(coinId, currentRange)
        ]);

        renderCoinPage(detail);
        buildChartData(chartHistory);
        initChart();
        renderIndicators();
        prefetchRanges();
    } catch (err) {
        Utils.showError(content, err.message);
    }
}

    /**
     * Silently pre-fetch all remaining time ranges into the API cache.
     * Requests are staggered 2 seconds apart to avoid CoinGecko rate limits.
     * Errors are swallowed — this is a best-effort optimisation only.
     */
    function prefetchRanges() {
        const allRanges = [1, 7, 30, 90, 365];
        allRanges.filter(r => r !== currentRange).forEach(function (days, i) {
            setTimeout(function () {
                Api.getMarketChart(coinId, days).catch(function () {});
            }, (i + 1) * 2000);
        });
    }

    /**
     * Render the static page structure for a loaded coin.
     */
    function renderCoinPage(detail) {
        const content = document.getElementById('coin-content');
        const md = detail.market_data;
        const change = md.price_change_percentage_24h || 0;
        const changeClass = Utils.priceChangeClass(change);

        content.innerHTML = `
            <!-- Coin header -->
            <div class="coin-detail-header">
                <img src="${detail.image.large}" alt="${detail.name}" class="coin-detail-icon"
                     onerror="this.style.visibility='hidden'">
                <div>
                    <div class="coin-detail-name">${detail.name}
                        <span class="coin-symbol">${detail.symbol}</span>
                    </div>
                    <div class="coin-detail-price">
                        ${Utils.formatCurrency(md.current_price.usd)}
                        <span class="price-change ${changeClass}" style="font-size: 14px; margin-left: 8px; vertical-align: middle;">
                            ${Utils.formatPercent(change)}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Market data summary -->
            <div class="stat-grid">
                <div class="stat-card">
                    <div class="stat-label">Market cap</div>
                    <div class="stat-value">${Utils.formatLargeNumber(md.market_cap.usd)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">24h volume</div>
                    <div class="stat-value">${Utils.formatLargeNumber(md.total_volume.usd)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">All-time high</div>
                    <div class="stat-value">${md.ath.usd ? Utils.formatCurrency(md.ath.usd) : 'N/A'}</div>
                    <div class="stat-change ${Utils.priceChangeClass(md.ath_change_percentage.usd)}">
                        ${md.ath_change_percentage.usd ? Utils.formatPercent(md.ath_change_percentage.usd) : ''}
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Circulating supply</div>
                    <div class="stat-value">${Utils.formatNumber(md.circulating_supply, 0)}</div>
                </div>
            </div>

            <!-- Chart card -->
            <div class="card" style="padding: 0; overflow: hidden;">
                <!-- Toolbar -->
                <div class="chart-toolbar">
                    <!-- Time range -->
                    <div class="toolbar-group" id="range-group">
                        <button class="toolbar-btn" data-range="1">24H</button>
                        <button class="toolbar-btn" data-range="7">7D</button>
                        <button class="toolbar-btn active" data-range="30">30D</button>
                        <button class="toolbar-btn" data-range="90">90D</button>
                        <button class="toolbar-btn" data-range="365">1Y</button>
                    </div>

                    <!-- Chart type -->
                    <div class="toolbar-group" id="type-group">
                        <button class="toolbar-btn active" data-type="line">Line</button>
                        <button class="toolbar-btn" data-type="candlestick">Candles</button>
                    </div>

                    <!-- Indicators -->
                    <div class="toolbar-group" id="indicator-group">
                        <button class="toolbar-btn" data-indicator="ma20">MA 20</button>
                        <button class="toolbar-btn" data-indicator="ma50">MA 50</button>
                    </div>

                    <!-- Drawing tools -->
                    <div class="toolbar-group" id="draw-group">
                        <button class="toolbar-btn" data-draw="line" title="Trend line">／</button>
                        <button class="toolbar-btn" data-draw="horizontal" title="Horizontal level">━</button>
                        <button class="toolbar-btn" data-draw="annotation" title="Annotation">📌</button>
                        <button class="toolbar-btn" id="clear-draw" title="Clear drawings">✕</button>
                    </div>
                </div>

                <!-- Chart + drawing overlay -->
                <div class="chart-area" id="chart-area">
                    <div id="chart-canvas" style="position:absolute; inset:0;"></div>
                    <canvas id="drawing-canvas" class="drawing-canvas"></canvas>
                </div>
            </div>

            <!-- Indicator readouts -->
            <div class="indicator-grid" id="indicator-readouts">
                <!-- Populated by renderIndicators() -->
            </div>
        `;

        wireToolbar();
    }

    /**
     * Convert API data to formats expected by Lightweight Charts.
     */
    function buildChartData(chartHistory) {
        const prices  = chartHistory.prices  || [];
        const volumes = chartHistory.total_volumes || [];

        // Line data: { time (UNIX seconds), value }
        lineData = prices.map(function (p) {
            return { time: Math.floor(p[0] / 1000), value: p[1] };
        });

        // Volume data with color based on price direction
        volumeData = volumes.map(function (v, i) {
            const prevPrice = i > 0 ? prices[i - 1][1] : prices[i][1];
            const curPrice  = prices[i][1];
            return {
                time:  Math.floor(v[0] / 1000),
                value: v[1],
                color: curPrice >= prevPrice ? '#DCEBDC' : '#F7E0E0'
            };
        });

        // Build synthetic candles by grouping line data into buckets.
        // The free CoinGecko OHLC endpoint exists but has limited intervals;
        // building candles client-side gives us a candle for every range.
        candleData = buildCandlesFromLine(lineData);
    }

    /**
     * Group line data points into OHLC candles.
     * Buckets points into ~80 evenly-sized groups for visual clarity.
     */
    function buildCandlesFromLine(line) {
        if (line.length < 2) return [];
        const targetCandles = Math.min(80, line.length);
        const bucketSize = Math.max(1, Math.floor(line.length / targetCandles));
        const candles = [];

        for (let i = 0; i < line.length; i += bucketSize) {
            const bucket = line.slice(i, i + bucketSize);
            if (bucket.length === 0) continue;

            let high = bucket[0].value, low = bucket[0].value;
            for (const p of bucket) {
                if (p.value > high) high = p.value;
                if (p.value < low)  low  = p.value;
            }

            candles.push({
                time:  bucket[bucket.length - 1].time,
                open:  bucket[0].value,
                high:  high,
                low:   low,
                close: bucket[bucket.length - 1].value
            });
        }
        return candles;
    }

    /**
     * Initialize the chart engine.
     */
    function initChart() {
        const container = document.getElementById('chart-canvas');
        const drawingCanvas = document.getElementById('drawing-canvas');

        const savedDrawings = chartController ? chartController.getDrawings() : [];
        if (chartController) chartController.destroy();
        chartController = ChartEngine.createChart(container);
        chartController.setChartType('line', lineData);
        chartController.setVolume(volumeData);
        chartController.attachDrawingCanvas(drawingCanvas);
        if (savedDrawings.length) chartController.restoreDrawings(savedDrawings);

        // Re-apply active indicators
        if (activeIndicators.ma20) {
            chartController.setMovingAverage('ma20',
                Indicators.simpleMovingAverage(lineData, 20), '#F97316');
        }
        if (activeIndicators.ma50) {
            chartController.setMovingAverage('ma50',
                Indicators.simpleMovingAverage(lineData, 50), '#A855F7');
        }
    }

    /**
     * Wire up all the toolbar buttons.
     */
    function wireToolbar() {
        // Time range
        document.querySelectorAll('#range-group .toolbar-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const days = parseInt(btn.getAttribute('data-range'), 10);
                if (days === currentRange) return;
                currentRange = days;
                document.querySelectorAll('#range-group .toolbar-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                // Debounce: cancel the previous pending refresh so rapid clicks
                // only fire one API call (the last selected range).
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(refreshChart, 300);
            });
        });

        // Chart type
        document.querySelectorAll('#type-group .toolbar-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const type = btn.getAttribute('data-type');
                if (type === chartController.getCurrentType()) return;
                document.querySelectorAll('#type-group .toolbar-btn')
                    .forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const data = type === 'candlestick' ? candleData : lineData;
                chartController.setChartType(type, data);
            });
        });

        // Indicators
        document.querySelectorAll('#indicator-group .toolbar-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const ind = btn.getAttribute('data-indicator');
                btn.classList.toggle('active');
                activeIndicators[ind] = btn.classList.contains('active');

                if (ind === 'ma20') {
                    chartController.setMovingAverage('ma20',
                        activeIndicators.ma20
                            ? Indicators.simpleMovingAverage(lineData, 20)
                            : null,
                        '#F97316');
                } else if (ind === 'ma50') {
                    chartController.setMovingAverage('ma50',
                        activeIndicators.ma50
                            ? Indicators.simpleMovingAverage(lineData, 50)
                            : null,
                        '#A855F7');
                }
            });
        });

        // Drawing tools
        document.querySelectorAll('#draw-group .toolbar-btn[data-draw]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const mode = btn.getAttribute('data-draw');
                const isActive = btn.classList.contains('active');

                document.querySelectorAll('#draw-group .toolbar-btn')
                    .forEach(b => b.classList.remove('active'));

                if (isActive) {
                    chartController.setDrawingMode(null);
                } else {
                    btn.classList.add('active');
                    chartController.setDrawingMode(mode);
                    Utils.showToast('Drawing mode: ' + mode, 'success', 1500);
                }
            });
        });

        // Deactivate the annotation button when annotation mode auto-exits after placing
        document.getElementById('chart-area').addEventListener('drawing:done', function () {
            document.querySelectorAll('#draw-group .toolbar-btn')
                .forEach(b => b.classList.remove('active'));
        });

        // Clear drawings
        document.getElementById('clear-draw').addEventListener('click', function () {
            chartController.clearDrawings();
            chartController.setDrawingMode(null);
            document.querySelectorAll('#draw-group .toolbar-btn')
                .forEach(b => b.classList.remove('active'));
            Utils.showToast('Drawings cleared', 'success', 1500);
        });
    }

    /**
     * Refresh chart data after time-range change.
     */
    async function refreshChart() {
        try {
            const chartHistory = await Api.getMarketChart(coinId, currentRange);
            buildChartData(chartHistory);

            // Re-render in current type
            const type = chartController.getCurrentType();
            const data = type === 'candlestick' ? candleData : lineData;
            chartController.setChartType(type, data);
            chartController.setVolume(volumeData);

            // Re-apply MAs
            if (activeIndicators.ma20) {
                chartController.setMovingAverage('ma20',
                    Indicators.simpleMovingAverage(lineData, 20), '#F97316');
            }
            if (activeIndicators.ma50) {
                chartController.setMovingAverage('ma50',
                    Indicators.simpleMovingAverage(lineData, 50), '#A855F7');
            }

            renderIndicators();
        } catch (err) {
            Utils.showToast('Failed to load: ' + err.message, 'error');
        }
    }

    /**
     * Render the bottom indicator readout cards (RSI, MACD).
     */
    function renderIndicators() {
        const container = document.getElementById('indicator-readouts');
        if (!container) return;

        // Calculate latest values
        const rsiSeries  = Indicators.relativeStrengthIndex(lineData, 14);
        const macdResult = Indicators.macd(lineData, 12, 26, 9);
        const ma20Series = Indicators.simpleMovingAverage(lineData, 20);
        const ma50Series = Indicators.simpleMovingAverage(lineData, 50);

        const rsiVal      = rsiSeries.length    ? rsiSeries[rsiSeries.length - 1].value    : null;
        const macdVal     = macdResult.macd.length   ? macdResult.macd[macdResult.macd.length - 1].value     : null;
        const signalVal   = macdResult.signal.length ? macdResult.signal[macdResult.signal.length - 1].value : null;
        const ma20Val     = ma20Series.length   ? ma20Series[ma20Series.length - 1].value : null;
        const ma50Val     = ma50Series.length   ? ma50Series[ma50Series.length - 1].value : null;

        container.innerHTML = `
            <div class="indicator-card">
                <div class="indicator-label">RSI (14)</div>
                <div class="indicator-value">${rsiVal !== null ? rsiVal.toFixed(2) : '—'}</div>
                <div class="indicator-hint">${rsiVal !== null ? Indicators.interpretRSI(rsiVal) : 'Not enough data'}</div>
            </div>
            <div class="indicator-card">
                <div class="indicator-label">MACD (12, 26, 9)</div>
                <div class="indicator-value">${macdVal !== null ? macdVal.toFixed(2) : '—'}</div>
                <div class="indicator-hint">
                    ${(macdVal !== null && signalVal !== null) ? Indicators.interpretMACD(macdVal, signalVal) : 'Not enough data'}
                </div>
            </div>
            <div class="indicator-card">
                <div class="indicator-label">MA 20</div>
                <div class="indicator-value">${ma20Val !== null ? Utils.formatCurrency(ma20Val) : '—'}</div>
                <div class="indicator-hint">20-period simple moving average</div>
            </div>
            <div class="indicator-card">
                <div class="indicator-label">MA 50</div>
                <div class="indicator-value">${ma50Val !== null ? Utils.formatCurrency(ma50Val) : '—'}</div>
                <div class="indicator-hint">50-period simple moving average</div>
            </div>
        `;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
