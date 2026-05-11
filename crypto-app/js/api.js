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
                lastErr = err;
            }
        }
        throw lastErr;
    }

    function cgUrl(endpoint, params = {}) {
        const clean = Object.fromEntries(
            Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        );
        clean.x_cg_demo_api_key = CG_API_KEY;
        const qs = new URLSearchParams(clean).toString();
        return CG_BASE + endpoint + (qs ? '?' + qs : '');
    }

    // ── CoinCap fallback (chart data only) ────────────────────────────────────

    function ccInterval(days) {
        if (days <= 1)  return 'm30';
        if (days <= 7)  return 'h2';
        if (days <= 30) return 'h6';
        return 'd1';
    }

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

    function getOHLC(coinId, days = 30) {
        return fetchJSON(cgUrl('/coins/' + encodeURIComponent(coinId) + '/ohlc', {
            vs_currency: 'usd',
            days
        }));
    }

    // Market chart: CoinGecko first, silent CoinCap fallback on failure
    async function getMarketChart(coinId, days = 30) {
        const params = { vs_currency: 'usd', days };
        if (days > 90) params.interval = 'daily';
        try {
            return await fetchJSON(cgUrl('/coins/' + encodeURIComponent(coinId) + '/market_chart', params));
        } catch (cgErr) {
            try {
                return await ccMarketChart(coinId, days);
            } catch {
                if (cgErr.message === 'not_found') throw new Error('Cryptocurrency not found.');
                throw new Error('Could not load chart data. Please try again in a moment.');
            }
        }
    }

    function getPrices(coinIds) {
        if (!coinIds || coinIds.length === 0) return Promise.resolve({});
        return fetchJSON(cgUrl('/simple/price', {
            ids: coinIds.join(','),
            vs_currencies: 'usd',
            include_24hr_change: 'true'
        }));
    }

    async function getGlobalData() {
        const result = await fetchJSON(cgUrl('/global'));
        return result.data;
    }

    return { getTopCoins, searchCoins, getCoinDetail, getOHLC, getMarketChart, getPrices, getGlobalData };
})();
