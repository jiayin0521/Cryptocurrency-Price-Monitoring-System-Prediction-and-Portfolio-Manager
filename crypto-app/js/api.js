/* ==========================================================================
   api.js — CoinGecko API wrapper with CoinCap fallback for chart data
   --------------------------------------------------------------------------
   Primary source: CoinGecko free public API (api.coingecko.com/api/v3)
   Fallback source: CoinCap (api.coincap.io/v2) — used automatically when
   CoinGecko fails for market chart requests (e.g. during rate limiting).
   API docs: https://www.coingecko.com/api/documentation
   ========================================================================== */

const Api = (function () {
    'use strict';

    const CG_BASE    = 'https://api.coingecko.com/api/v3';
    const CG_API_KEY = 'CG-SXocKuRY1Dc8wxGTmWWi4JkZ';
    const CC_BASE    = 'https://api.coincap.io/v2';
    const CACHE_TTL  = 5 * 60 * 1000; // 5 minutes
    const TIMEOUT_MS = 10000;
    const MAX_RETRIES = 2;
    const cache = new Map();

    // ── Core fetch with cache + timeout + retry ───────────────────────────────

    /**
     * Fetch a JSON URL with in-memory caching, a 10-second timeout, and up
     * to MAX_RETRIES automatic retries on transient network errors.
     * @param {string} url  Fully-qualified URL to fetch.
     * @returns {Promise<any>} Parsed JSON response.
     * @throws {Error} 'rate_limit' | 'not_found' | AbortError | network error
     */
    async function fetchJSON(url) {
        const cached = cache.get(url);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }

        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (attempt > 0) await new Promise(res => setTimeout(res, 1000 * attempt));

            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), TIMEOUT_MS);
            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(tid);
                if (!res.ok) {
                    if (res.status === 429) throw new Error('rate_limit');
                    if (res.status === 404) throw new Error('not_found');
                    throw new Error('http_' + res.status);
                }
                const data = await res.json();
                cache.set(url, { data, timestamp: Date.now() });
                return data;
            } catch (err) {
                clearTimeout(tid);
                if (err.message === 'rate_limit' || err.message === 'not_found') throw err;
                // Give the user a readable message for request timeouts
                if (err.name === 'AbortError') {
                    lastErr = new Error('Request timed out. Please check your connection.');
                } else {
                    lastErr = err;
                }
            }
        }
        throw lastErr;
    }

    /**
     * Build a CoinGecko API URL, filtering out blank params and appending the
     * demo API key.
     * @param {string} endpoint  Path starting with '/', e.g. '/coins/markets'.
     * @param {object} [params]  Query-string key/value pairs.
     * @returns {string} Full URL ready for fetchJSON.
     */
    function cgUrl(endpoint, params = {}) {
        const clean = Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        );
        clean.x_cg_demo_api_key = CG_API_KEY;
        const qs = new URLSearchParams(clean).toString();
        return CG_BASE + endpoint + (qs ? '?' + qs : '');
    }

    // ── CoinCap fallback (chart data only) ────────────────────────────────────

    /**
     * Map a day range to the appropriate CoinCap history interval string.
     * @param {number} days
     * @returns {'m30'|'h2'|'h6'|'d1'}
     */
    function ccInterval(days) {
        if (days <= 1)  return 'm30';
        if (days <= 7)  return 'h2';
        if (days <= 30) return 'h6';
        return 'd1';
    }

    /**
     * Fetch market-chart data from CoinCap and reshape it to match the
     * CoinGecko market_chart response format { prices, market_caps, total_volumes }.
     * @param {string} coinId  CoinCap asset ID (usually the same as CoinGecko ID).
     * @param {number} days    Number of days of history to retrieve.
     * @returns {Promise<{prices: Array, market_caps: Array, total_volumes: Array}>}
     */
    async function ccMarketChart(coinId, days) {
        const now   = Date.now();
        const start = now - days * 24 * 60 * 60 * 1000;
        const url   = CC_BASE + '/assets/' + encodeURIComponent(coinId)
                    + '/history?interval=' + ccInterval(days)
                    + '&start=' + start + '&end=' + now;
        const json  = await fetchJSON(url);
        const prices = (json.data || []).map(r => [r.time, parseFloat(r.priceUsd) || 0]);
        return { prices, market_caps: [], total_volumes: [] };
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Fetch the top N coins by market cap.
     * @param {number} [limit=50]     Number of coins to return (max 250).
     * @param {string} [currency='usd'] Target fiat currency.
     * @returns {Promise<Array>}
     */
    function getTopCoins(limit = 50, currency = 'usd') {
        return fetchJSON(cgUrl('/coins/markets', {
            vs_currency: currency,
            order: 'market_cap_desc',
            per_page: limit,
            page: 1,
            sparkline: false,
            price_change_percentage: '24h'
        }));
    }

    /**
     * Search for coins by name or symbol.
     * @param {string} query  User-entered search term.
     * @returns {Promise<Array>} Array of coin objects with id, name, symbol, thumb.
     */
    async function searchCoins(query) {
        const data = await fetchJSON(cgUrl('/search', { query }));
        return data.coins || [];
    }

    function getCoinDetail(coinId) {
        return fetchJSON(cgUrl('/coins/' + encodeURIComponent(coinId), {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false
        }));
    }

    /**
     * Fetch OHLC (open/high/low/close) candlestick data for a coin.
     * @param {string} coinId  CoinGecko coin ID.
     * @param {number} [days=30]  Lookback period in days.
     * @returns {Promise<Array<[timestamp, open, high, low, close]>>}
     */
    function getOHLC(coinId, days = 30) {
        return fetchJSON(cgUrl('/coins/' + encodeURIComponent(coinId) + '/ohlc', {
            vs_currency: 'usd',
            days
        }));
    }

    /**
     * Fetch price history for a coin. Tries CoinGecko first; if that fails,
     * transparently retries with CoinCap and notifies the user via a toast.
     * @param {string} coinId  CoinGecko coin ID.
     * @param {number} [days=30]  Lookback period in days.
     * @returns {Promise<{prices: Array, market_caps: Array, total_volumes: Array}>}
     */
    async function getMarketChart(coinId, days = 30) {
        const params = { vs_currency: 'usd', days };
        if (days > 90) params.interval = 'daily';
        try {
            return await fetchJSON(cgUrl('/coins/' + encodeURIComponent(coinId) + '/market_chart', params));
        } catch (cgErr) {
            try {
                const data = await ccMarketChart(coinId, days);
                // Let the user know they are seeing data from the backup source
                if (typeof Utils !== 'undefined') {
                    Utils.showToast('Using backup data source (CoinCap) — chart data may be limited.', 'warning', 4000);
                }
                return data;
            } catch {
                if (cgErr.message === 'not_found') throw new Error('Cryptocurrency not found.');
                throw new Error('Could not load chart data. Please try again in a moment.');
            }
        }
    }

    /**
     * Fetch current USD prices (and 24-hour change) for a list of coins.
     * @param {string[]} coinIds  Array of CoinGecko coin IDs.
     * @returns {Promise<Object>} Map of { coinId: { usd, usd_24h_change } }.
     */
    function getPrices(coinIds) {
        if (!coinIds || coinIds.length === 0) return Promise.resolve({});
        return fetchJSON(cgUrl('/simple/price', {
            ids: coinIds.join(','),
            vs_currencies: 'usd',
            include_24hr_change: 'true'
        }));
    }

    /**
     * Fetch global crypto market statistics (total market cap, BTC dominance, etc.).
     * @returns {Promise<Object>} CoinGecko global data object.
     */
    async function getGlobalData() {
        const result = await fetchJSON(cgUrl('/global'));
        return result.data;
    }

    return { getTopCoins, searchCoins, getCoinDetail, getOHLC, getMarketChart, getPrices, getGlobalData };
})();
