/* ==========================================================================
   storage.js — Portfolio storage layer
   --------------------------------------------------------------------------
   Manages portfolio holdings in browser localStorage.

   A "holding" represents a single purchase of a cryptocurrency:
   {
       id:         "abc123",          // Unique identifier (auto-generated)
       coinId:     "bitcoin",         // CoinGecko coin ID
       coinName:   "Bitcoin",         // Display name
       coinSymbol: "btc",             // Display symbol
       coinImage:  "https://...",     // Icon URL
       amount:     0.25,              // How many coins held
       buyPrice:   60000,             // Price paid per coin (USD)
       buyDate:    "2024-01-15",      // ISO date string
       notes:      "Long-term hold"   // Optional user notes
   }

   This module exposes pure CRUD methods. P&L calculations live elsewhere
   (in portfolio.js) — this file only handles persistence.
   ========================================================================== */

const Storage = (function () {
    'use strict';

    const KEY = 'crypcoin-portfolio';

    /**
     * Generate a unique ID for a new holding.
     * Combines current time with a random suffix.
     * @returns {string}
     */
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * Read all holdings from localStorage.
     * Returns an empty array if storage is empty or unavailable.
     * @returns {Array}
     */
    function getAll() {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            console.error('Failed to read portfolio from storage:', err);
            return [];
        }
    }

    /**
     * Write all holdings to localStorage.
     * @param {Array} holdings
     */
    function saveAll(holdings) {
        try {
            localStorage.setItem(KEY, JSON.stringify(holdings));
            return true;
        } catch (err) {
            console.error('Failed to save portfolio:', err);
            return false;
        }
    }

    /**
     * Create a new holding.
     * @param {object} data  must contain coinId, coinName, coinSymbol,
     *                       coinImage, amount, buyPrice, buyDate
     * @returns {object} the created holding (with generated id)
     */
    function create(data) {
        const holdings = getAll();
        const holding = {
            id:         generateId(),
            coinId:     data.coinId,
            coinName:   data.coinName,
            coinSymbol: data.coinSymbol,
            coinImage:  data.coinImage || '',
            amount:     Number(data.amount),
            buyPrice:   Number(data.buyPrice),
            buyDate:    data.buyDate,
            notes:      data.notes || ''
        };
        holdings.push(holding);
        saveAll(holdings);
        return holding;
    }

    /**
     * Update an existing holding by id.
     * @param {string} id
     * @param {object} updates  fields to merge into the existing holding
     * @returns {object|null} the updated holding, or null if not found
     */
    function update(id, updates) {
        const holdings = getAll();
        const idx = holdings.findIndex(h => h.id === id);
        if (idx === -1) return null;

        // Merge updates while preserving id
        holdings[idx] = Object.assign({}, holdings[idx], updates, { id: id });
        // Coerce numeric fields
        if (updates.amount !== undefined)   holdings[idx].amount   = Number(updates.amount);
        if (updates.buyPrice !== undefined) holdings[idx].buyPrice = Number(updates.buyPrice);

        saveAll(holdings);
        return holdings[idx];
    }

    /**
     * Delete a holding by id.
     * @param {string} id
     * @returns {boolean} true if a holding was removed
     */
    function remove(id) {
        const holdings = getAll();
        const filtered = holdings.filter(h => h.id !== id);
        if (filtered.length === holdings.length) return false;
        saveAll(filtered);
        return true;
    }

    /**
     * Find a holding by id.
     * @param {string} id
     * @returns {object|null}
     */
    function findById(id) {
        return getAll().find(h => h.id === id) || null;
    }

    /**
     * Clear all holdings (used by "reset portfolio" feature).
     */
    function clear() {
        try {
            localStorage.removeItem(KEY);
            return true;
        } catch (err) {
            return false;
        }
    }

    /**
     * Get a list of unique coin IDs across all holdings.
     * Useful for batch-fetching current prices.
     * @returns {string[]}
     */
    function getUniqueCoinIds() {
        const ids = getAll().map(h => h.coinId);
        return Array.from(new Set(ids));
    }

    return {
        getAll,
        create,
        update,
        remove,
        findById,
        clear,
        getUniqueCoinIds
    };
})();
