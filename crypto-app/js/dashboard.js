/* ==========================================================================
   dashboard.js — Dashboard page logic
   --------------------------------------------------------------------------
   Loads the top cryptocurrencies, displays them in a sortable table,
   handles live search, and refreshes prices periodically.
   ========================================================================== */

(function () {
    'use strict';

    // DOM references — cached on init
    let elements = {};

    // Data cache
    let allCoins = [];
    let refreshIntervalId = null;

    /**
     * Initialize the dashboard: cache DOM references, wire up events, and
     * trigger the first data load plus the 60-second auto-refresh interval.
     */
    function init() {
        Utils.highlightActiveNav();

        elements = {
            searchInput:  document.getElementById('search-input'),
            tableBody:    document.getElementById('coin-table-body'),
            globalStats:  document.getElementById('global-stats')
        };

        // Wire up search with debounce so we don't filter on every keystroke
        elements.searchInput.addEventListener('input', Utils.debounce(handleSearch, 200));

        loadDashboard();

        // Auto-refresh every 60 seconds
        refreshIntervalId = setInterval(loadDashboard, 60000);
    }

    /**
     * Load top coins and global market data from the API.
     * Shows a loading spinner on first load; uses a toast on subsequent refreshes.
     */
    async function loadDashboard() {
        try {
            // Show loading only on first load.
            // Use a querySelector instead of the cached tableBody reference because
            // the tableBody may have been removed from the DOM by a previous loading
            // state, making its parentElement null and causing a crash on retry.
            if (allCoins.length === 0) {
                const wrapper = document.querySelector('.coin-table-wrapper');
                if (wrapper) Utils.showLoading(wrapper, 'Loading market data...');
            }

            // Fetch in parallel for speed
            const [coins, globalData] = await Promise.all([
                Api.getTopCoins(50),
                Api.getGlobalData()
            ]);

            allCoins = coins;
            renderGlobalStats(globalData);
            renderTable(allCoins);
        } catch (err) {
            // Re-render the table wrapper if it was wiped by the loading state
            const wrapper = document.querySelector('.coin-table-wrapper') ||
                            document.querySelector('main');
            if (allCoins.length === 0) {
                Utils.showError(wrapper, err.message);
            } else {
                Utils.showToast('Failed to refresh data: ' + err.message, 'error');
            }
        }
    }

    /**
     * Render the global market summary cards.
     */
    function renderGlobalStats(data) {
        if (!data || !elements.globalStats) return;

        const totalCap   = data.total_market_cap.usd;
        const totalVol   = data.total_volume.usd;
        const btcDom     = data.market_cap_percentage.btc;
        const change24h  = data.market_cap_change_percentage_24h_usd;

        elements.globalStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Total market cap</div>
                <div class="stat-value">${Utils.formatLargeNumber(totalCap)}</div>
                <div class="stat-change ${Utils.priceChangeClass(change24h)}">
                    ${Utils.formatPercent(change24h)} (24h)
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">24h volume</div>
                <div class="stat-value">${Utils.formatLargeNumber(totalVol)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">BTC dominance</div>
                <div class="stat-value">${btcDom.toFixed(1)}%</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active coins</div>
                <div class="stat-value">${Utils.formatNumber(data.active_cryptocurrencies, 0)}</div>
            </div>
        `;
    }

    /**
     * Render the coin table.
     * @param {Array} coins
     */
    function renderTable(coins) {
        // Make sure the wrapper still exists (loading state may have replaced it)
        if (!document.getElementById('coin-table-body')) {
            restoreTableStructure();
        }
        elements.tableBody = document.getElementById('coin-table-body');

        if (coins.length === 0) {
            elements.tableBody.innerHTML =
                '<tr><td colspan="6" class="empty-state">No cryptocurrencies match your search.</td></tr>';
            return;
        }

        elements.tableBody.innerHTML = coins.map(function (coin, index) {
            const change = coin.price_change_percentage_24h || 0;
            const changeClass = Utils.priceChangeClass(change);

            return `
                <tr data-coin-id="${coin.id}">
                    <td>${index + 1}</td>
                    <td>
                        <div class="coin-name-cell">
                            <img src="${coin.image}" alt="${coin.name}" class="coin-icon"
                                 onerror="this.style.visibility='hidden'">
                            <div>
                                <span class="coin-name">${coin.name}</span>
                                <span class="coin-symbol">${coin.symbol}</span>
                            </div>
                        </div>
                    </td>
                    <td class="numeric">${Utils.formatCurrency(coin.current_price)}</td>
                    <td class="numeric">
                        <span class="price-change ${changeClass}">
                            ${Utils.formatPercent(change)}
                        </span>
                    </td>
                    <td class="numeric hide-mobile">${Utils.formatLargeNumber(coin.market_cap)}</td>
                    <td class="numeric hide-mobile">${Utils.formatLargeNumber(coin.total_volume)}</td>
                </tr>
            `;
        }).join('');

        // Wire up row clicks to open the coin detail page
        elements.tableBody.querySelectorAll('tr[data-coin-id]').forEach(function (row) {
            row.addEventListener('click', function () {
                const coinId = row.getAttribute('data-coin-id');
                window.location.href = 'pages/coin.html?id=' + encodeURIComponent(coinId);
            });
        });
    }

    /**
     * Restore the full table HTML if it was replaced by an error/loading state.
     * Called by renderTable() before writing rows when #coin-table-body is missing.
     */
    function restoreTableStructure() {
        const wrapper = document.querySelector('main .coin-table-wrapper') ||
                        document.querySelector('main');
        wrapper.innerHTML = `
            <table class="coin-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th class="numeric">Price</th>
                        <th class="numeric">24h %</th>
                        <th class="numeric hide-mobile">Market cap</th>
                        <th class="numeric hide-mobile">Volume (24h)</th>
                    </tr>
                </thead>
                <tbody id="coin-table-body"></tbody>
            </table>
        `;
        wrapper.className = 'coin-table-wrapper';
    }

    /**
     * Handle search input — filters the existing coin list.
     * For a more powerful "search any coin", we'd hit the /search endpoint,
     * but client-side filtering of the top 50 is fast and avoids API calls.
     */
    function handleSearch() {
        const query = elements.searchInput.value.trim().toLowerCase();
        if (!query) {
            renderTable(allCoins);
            return;
        }
        const filtered = allCoins.filter(function (coin) {
            return coin.name.toLowerCase().includes(query) ||
                   coin.symbol.toLowerCase().includes(query);
        });
        renderTable(filtered);
    }

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Clean up the refresh interval if user leaves the page
    window.addEventListener('beforeunload', function () {
        if (refreshIntervalId) clearInterval(refreshIntervalId);
    });
})();
