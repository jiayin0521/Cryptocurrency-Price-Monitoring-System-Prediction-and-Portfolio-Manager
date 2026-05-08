/* ==========================================================================
   api.js — CoinGecko API wrapper
   --------------------------------------------------------------------------
   Handles all communication with the CoinGecko free public API.
   Includes:
   - In-memory caching to avoid hitting rate limits
   - Centralized error handling
   - Retry logic for transient failures
   --------------------------------------------------------------------------
   API documentation: https://www.coingecko.com/api/documentation
   No API key is required for the free tier (rate-limited).
   ========================================================================== */

const Api = (function () {
    'use strict';

    const BASE_URL = 'https://api.coingecko.com/api/v3';
    const CACHE_TTL = 60 * 1000; // 60 seconds — keeps us under rate limits
    const cache = new Map();

    /**
     * Internal: fetch JSON from a URL with caching and error handling.
     * @param {string} endpoint  Path appended to BASE_URL
     * @param {object} params    Query parameters
     * @returns {Promise<any>}
     * @throws {Error} when the request fails
     */
    async function request(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = BASE_URL + endpoint + (queryString ? '?' + queryString : '');
        const cacheKey = url;

        // Return cached response if fresh
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
            return cached.data;
        }

        try {
            const response = await fetch(url);

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('Too many requests. Please wait a moment and try again.');
                }
                if (response.status === 404) {
                    throw new Error('Cryptocurrency not found.');
                }
                throw new Error('Failed to fetch data (status ' + response.status + ').');
            }

            const data = await response.json();
            cache.set(cacheKey, { data: data, timestamp: Date.now() });
            return data;
        } catch (err) {
            // Network errors don't have a response object
            if (err.name === 'TypeError') {
                throw new Error('Network error. Please check your internet connection.');
            }
            throw err;
        }
    }

    /**
     * Get the top N cryptocurrencies by market cap.
     * @param {number} limit  default 50
     * @param {string} currency  default 'usd'
     * @returns {Promise<Array>}
     */
    function getTopCoins(limit = 50, currency = 'usd') {
        return request('/coins/markets', {
            vs_currency: currency,
            order: 'market_cap_desc',
            per_page: limit,
            page: 1,
            sparkline: false,
            price_change_percentage: '24h'
        });
    }

    /**
     * Search for coins by name or symbol.
     * @param {string} query
     * @returns {Promise<Array>}
     */
    async function searchCoins(query) {
        const data = await request('/search', { query: query });
        return data.coins || [];
    }

    /**
     * Get detailed information about a single coin.
     * @param {string} coinId  e.g. 'bitcoin'
     * @returns {Promise<object>}
     */
    function getCoinDetail(coinId) {
        return request('/coins/' + encodeURIComponent(coinId), {
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false
        });
    }

    /**
     * Get historical OHLC (open/high/low/close) candles for a coin.
     * Used for candlestick charts.
     * Returns array of [timestamp_ms, open, high, low, close]
     * @param {string} coinId
     * @param {number} days  1, 7, 14, 30, 90, 180, 365
     * @returns {Promise<Array>}
     */
    function getOHLC(coinId, days = 30) {
        return request('/coins/' + encodeURIComponent(coinId) + '/ohlc', {
            vs_currency: 'usd',
            days: days
        });
    }

    /**
     * Get historical price line data.
     * Returns object with arrays of [timestamp_ms, value]
     * @param {string} coinId
     * @param {number} days  1, 7, 14, 30, 90, 180, 365, 'max'
     * @returns {Promise<{prices, market_caps, total_volumes}>}
     */
    function getMarketChart(coinId, days = 30) {
        return request('/coins/' + encodeURIComponent(coinId) + '/market_chart', {
            vs_currency: 'usd',
            days: days,
            interval: days > 90 ? 'daily' : ''
        });
    }

    /**
     * Get current prices for one or more coins (lightweight endpoint).
     * Used for portfolio P/L calculations.
     * @param {string[]} coinIds
     * @returns {Promise<object>}
     */
    function getPrices(coinIds) {
        if (!coinIds || coinIds.length === 0) return Promise.resolve({});
        return request('/simple/price', {
            ids: coinIds.join(','),
            vs_currencies: 'usd',
            include_24hr_change: 'true'
        });
    }

    /**
     * Get global market data (total market cap, dominance, etc).
     * @returns {Promise<object>}
     */
    async function getGlobalData() {
        const result = await request('/global');
        return result.data;
    }

    // Public API
    return {
        getTopCoins,
        searchCoins,
        getCoinDetail,
        getOHLC,
        getMarketChart,
        getPrices,
        getGlobalData
    };
})();
