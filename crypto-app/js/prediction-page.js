/* ==========================================================================
   prediction-page.js — Prediction page controller
   --------------------------------------------------------------------------
   - Lets the user pick a coin, history range, forecast horizon, and SMA window
   - Runs both linear regression and moving average forecasts
   - Renders historical data + both forecast lines on a single chart
   - Displays accuracy metrics (MAE, RMSE, MAPE) side-by-side
   - Recommends which model fits the chosen period better
   ========================================================================== */

(function () {
    'use strict';

    // Page state
    let chartController = null;
    let topCoins        = [];     // for the dropdown
    let historicalData  = [];     // current loaded series
    let linResult       = null;   // last linear regression result
    let smaResult       = null;   // last SMA result
    let coinMeta        = null;   // currently selected coin info

    // Default settings
    const DEFAULTS = {
        coinId:        'bitcoin',
        historyDays:   90,
        forecastSteps: 14,
        smaWindow:     7
    };

    /**
     * Entry point: build the page shell, populate the coin dropdown,
     * and set up the theme observer to rebuild the chart on theme change.
     */
    function init() {
        Utils.highlightActiveNav();
        renderPageShell();
        loadCoinList();

        // Watch for theme changes — rebuild chart with new colors
        const themeObserver = new MutationObserver(function () {
            if (chartController && historicalData.length) drawChart();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    /**
     * Build the static page structure.
     */
    function renderPageShell() {
        const container = document.getElementById('prediction-content');
        container.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">Price Prediction</h1>
                <p class="page-subtitle">
                    Forecast future prices using two statistical models.
                    Compare their accuracy on historical data side-by-side.
                </p>
            </div>

            <!-- Controls -->
            <div class="card">
                <div class="prediction-controls">
                    <div class="form-group">
                        <label class="form-label" for="pred-coin">Cryptocurrency</label>
                        <select id="pred-coin" class="form-select">
                            <option value="">Loading...</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="pred-history">History range</label>
                        <select id="pred-history" class="form-select">
                            <option value="30">30 days</option>
                            <option value="90" selected>90 days</option>
                            <option value="180">180 days</option>
                            <option value="365">1 year</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="pred-steps">Forecast horizon</label>
                        <select id="pred-steps" class="form-select">
                            <option value="7">7 periods</option>
                            <option value="14" selected>14 periods</option>
                            <option value="30">30 periods</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="pred-window">Moving average window</label>
                        <select id="pred-window" class="form-select">
                            <option value="3">3 periods</option>
                            <option value="7" selected>7 periods</option>
                            <option value="14">14 periods</option>
                            <option value="30">30 periods</option>
                        </select>
                    </div>
                </div>
                <button id="run-prediction" class="btn btn-primary">Run prediction</button>
            </div>

            <!-- Forecast chart -->
            <div class="card" style="margin-top: var(--space-6); padding: 0; overflow: hidden;">
                <div class="card-header" style="padding: var(--space-4) var(--space-6);">
                    <h2 class="card-title" id="forecast-chart-title">Forecast chart</h2>
                    <div id="chart-legend" style="display:flex; gap: var(--space-4); font-size: 13px;"></div>
                </div>
                <div class="chart-area" id="chart-area">
                    <div id="forecast-chart" style="position:absolute; inset:0;"></div>
                </div>
            </div>

            <!-- Model comparison -->
            <div id="model-comparison" class="model-comparison"></div>

            <!-- Recommendation -->
            <div id="model-recommendation" style="margin-top: var(--space-6);"></div>
        `;

        wireControls();
    }

    /**
     * Populate the coin dropdown with the top 50 coins.
     */
    async function loadCoinList() {
        try {
            topCoins = await Api.getTopCoins(50);
            const select = document.getElementById('pred-coin');
            select.innerHTML = topCoins.map(function (c) {
                const selected = c.id === DEFAULTS.coinId ? ' selected' : '';
                return '<option value="' + c.id + '"' + selected + '>' +
                       c.name + ' (' + c.symbol.toUpperCase() + ')</option>';
            }).join('');

            // Auto-run with defaults so the user sees something on first load
            runPrediction();
        } catch (err) {
            Utils.showToast('Failed to load coin list: ' + err.message, 'error');
        }
    }

    /**
     * Wire up the run button.
     */
    function wireControls() {
        document.getElementById('run-prediction').addEventListener('click', runPrediction);
    }

    /**
     * Run both prediction models with current control values.
     */
    async function runPrediction() {
        const coinId        = document.getElementById('pred-coin').value;
        const historyDays   = parseInt(document.getElementById('pred-history').value, 10);
        const forecastSteps = parseInt(document.getElementById('pred-steps').value, 10);
        const smaWindow     = parseInt(document.getElementById('pred-window').value, 10);

        if (!coinId) {
            Utils.showToast('Please select a cryptocurrency.', 'warning');
            return;
        }

        coinMeta = topCoins.find(c => c.id === coinId) || { id: coinId, name: coinId, symbol: '' };
        Utils.showToast('Running prediction...', 'success', 1200);

        try {
            // Fetch historical prices
            const chart = await Api.getMarketChart(coinId, historyDays);
            historicalData = (chart.prices || []).map(function (p) {
                return { time: Math.floor(p[0] / 1000), value: p[1] };
            });

            if (historicalData.length < smaWindow + 5) {
                Utils.showToast('Not enough historical data for the chosen settings.', 'error');
                return;
            }

            // Run both models
            linResult = Prediction.linearRegressionForecast(historicalData, forecastSteps);
            smaResult = Prediction.movingAverageForecast(historicalData, forecastSteps, smaWindow);

            // Evaluate each model on its in-sample fit
            const linMetrics = Prediction.evaluateAccuracy(historicalData, linResult.fittedLine);
            const smaMetrics = Prediction.evaluateAccuracy(historicalData, smaResult.fittedLine);

            drawChart();
            renderComparison(linMetrics, smaMetrics);
            renderRecommendation(linMetrics, smaMetrics);
        } catch (err) {
            Utils.showToast('Prediction failed: ' + err.message, 'error');
        }
    }

    /**
     * Draw the chart with historical data + both forecast overlays.
     */
    function drawChart() {
        const container = document.getElementById('forecast-chart');

        // Update title
        document.getElementById('forecast-chart-title').textContent =
            coinMeta.name + ' (' + coinMeta.symbol.toUpperCase() + ') — Forecast';

        // Build the chart fresh
        if (chartController) chartController.destroy();
        chartController = ChartEngine.createChart(container);
        chartController.setChartType('line', historicalData);

        // Read theme colors
        const linColor = readVar('--accent-light') || '#3B85C4';
        const smaColor = readVar('--warning')      || '#B87B1F';

        // Build the linear regression overlay = fittedLine + forecast
        const linSeries = linResult.fittedLine.concat(linResult.forecast);
        chartController.addOverlay('lin', linSeries, linColor);

        // SMA overlay = fitted SMA line + forecast tail
        const smaSeries = smaResult.fittedLine.concat(smaResult.forecast);
        chartController.addOverlay('sma', smaSeries, smaColor);

        // Render the legend
        document.getElementById('chart-legend').innerHTML = `
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span style="width:14px; height:2px; background:var(--accent); display:inline-block;"></span>
                Historical
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span style="width:14px; height:2px; background:${linColor}; display:inline-block;"></span>
                Linear regression
            </span>
            <span style="display:inline-flex; align-items:center; gap:6px;">
                <span style="width:14px; height:2px; background:${smaColor}; display:inline-block;"></span>
                Moving average (${smaResult.window})
            </span>
        `;
    }

    /**
     * Helper: read a CSS custom property from :root.
     */
    function readVar(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
    }

    /**
     * Render side-by-side metric cards for both models.
     */
    function renderComparison(linMetrics, smaMetrics) {
        const lastPrice = historicalData[historicalData.length - 1].value;
        const linNext   = linResult.forecast[0]   ? linResult.forecast[0].value   : null;
        const smaNext   = smaResult.forecast[0]   ? smaResult.forecast[0].value   : null;
        const linLast   = linResult.forecast[linResult.forecast.length - 1];
        const smaLast   = smaResult.forecast[smaResult.forecast.length - 1];

        const linTrend = Prediction.interpretLinearTrend(linResult.model, lastPrice);

        document.getElementById('model-comparison').innerHTML = `
            <div class="card">
                <div class="card-header" style="margin-bottom: var(--space-3);">
                    <h3 class="card-title">Linear regression</h3>
                </div>
                <div class="indicator-grid" style="grid-template-columns: 1fr 1fr; margin-top: 0;">
                    <div class="indicator-card">
                        <div class="indicator-label">Next period</div>
                        <div class="indicator-value">${linNext !== null ? Utils.formatCurrency(linNext) : '—'}</div>
                        <div class="indicator-hint">vs current ${Utils.formatCurrency(lastPrice)}</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">End of horizon</div>
                        <div class="indicator-value">${linLast ? Utils.formatCurrency(linLast.value) : '—'}</div>
                        <div class="indicator-hint">${linResult.forecast.length} periods ahead</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">MAE</div>
                        <div class="indicator-value">${linMetrics.mae !== null ? Utils.formatCurrency(linMetrics.mae) : '—'}</div>
                        <div class="indicator-hint">Mean absolute error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">RMSE</div>
                        <div class="indicator-value">${linMetrics.rmse !== null ? Utils.formatCurrency(linMetrics.rmse) : '—'}</div>
                        <div class="indicator-hint">Root mean squared error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">MAPE</div>
                        <div class="indicator-value">${linMetrics.mape !== null ? linMetrics.mape.toFixed(2) + '%' : '—'}</div>
                        <div class="indicator-hint">Mean absolute % error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">Trend</div>
                        <div class="indicator-value" style="font-size: 14px;">${linTrend}</div>
                        <div class="indicator-hint">Slope direction</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header" style="margin-bottom: var(--space-3);">
                    <h3 class="card-title">Moving average (${smaResult.window} periods)</h3>
                </div>
                <div class="indicator-grid" style="grid-template-columns: 1fr 1fr; margin-top: 0;">
                    <div class="indicator-card">
                        <div class="indicator-label">Next period</div>
                        <div class="indicator-value">${smaNext !== null ? Utils.formatCurrency(smaNext) : '—'}</div>
                        <div class="indicator-hint">vs current ${Utils.formatCurrency(lastPrice)}</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">End of horizon</div>
                        <div class="indicator-value">${smaLast ? Utils.formatCurrency(smaLast.value) : '—'}</div>
                        <div class="indicator-hint">${smaResult.forecast.length} periods ahead</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">MAE</div>
                        <div class="indicator-value">${smaMetrics.mae !== null ? Utils.formatCurrency(smaMetrics.mae) : '—'}</div>
                        <div class="indicator-hint">Mean absolute error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">RMSE</div>
                        <div class="indicator-value">${smaMetrics.rmse !== null ? Utils.formatCurrency(smaMetrics.rmse) : '—'}</div>
                        <div class="indicator-hint">Root mean squared error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">MAPE</div>
                        <div class="indicator-value">${smaMetrics.mape !== null ? smaMetrics.mape.toFixed(2) + '%' : '—'}</div>
                        <div class="indicator-hint">Mean absolute % error</div>
                    </div>
                    <div class="indicator-card">
                        <div class="indicator-label">Window</div>
                        <div class="indicator-value">${smaResult.window}</div>
                        <div class="indicator-hint">Look-back periods</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render the model recommendation banner.
     */
    function renderRecommendation(linMetrics, smaMetrics) {
        const verdict = Prediction.compareModels(linMetrics, smaMetrics);
        document.getElementById('model-recommendation').innerHTML = `
            <div class="card" style="background: var(--accent-bg); border-color: var(--accent-light);">
                <div style="display:flex; align-items:flex-start; gap: var(--space-3);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                         stroke="var(--accent)" stroke-width="2"
                         stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="16" x2="12" y2="12"/>
                        <line x1="12" y1="8"  x2="12.01" y2="8"/>
                    </svg>
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                            Model recommendation
                        </div>
                        <div style="color: var(--text-secondary); font-size: 14px; line-height: 1.6;">
                            ${verdict}
                            <br><br>
                            <strong>Disclaimer:</strong> These are simple statistical forecasts based on past
                            prices alone. Cryptocurrency prices are influenced by many factors not captured
                            here. Do not use as financial advice.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
