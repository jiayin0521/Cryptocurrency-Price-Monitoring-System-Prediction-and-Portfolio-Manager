/* ==========================================================================
   utils.js — Shared utility functions
   Used across all pages for formatting, validation, and DOM helpers.

   Wrapped in an IIFE (Immediately Invoked Function Expression) to avoid
   polluting the global scope. Public API exposed via window.Utils.
   ========================================================================== */

const Utils = (function () {
    'use strict';

    /**
     * Format a number as USD currency with appropriate decimal places.
     * Small prices (< $1) get more decimals so we can see meaningful digits.
     * @param {number} value
     * @returns {string} e.g. "$67,842.30" or "$0.000284"
     */
    function formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) return '—';

        let decimals = 2;
        if (value < 1)        decimals = 6;
        if (value < 0.01)     decimals = 8;
        if (value < 0.0001)   decimals = 10;
        if (value < 0.000001) decimals = 12;

        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    }

    /**
     * Format a number with comma separators.
     * @param {number} value
     * @param {number} decimals
     * @returns {string}
     */
    function formatNumber(value, decimals = 2) {
        if (value === null || value === undefined || isNaN(value)) return '—';
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    }

    /**
     * Format a percentage with sign.
     * @param {number} value e.g. 2.41 means +2.41%
     * @returns {string} e.g. "+2.41%"
     */
    function formatPercent(value) {
        if (value === null || value === undefined || isNaN(value)) return '—';
        const sign = value >= 0 ? '+' : '';
        return sign + value.toFixed(2) + '%';
    }

    /**
     * Format very large numbers (market cap, volume) using suffixes.
     * @param {number} value
     * @returns {string} e.g. "$1.34T", "$45.2B"
     */
    function formatLargeNumber(value) {
        if (value === null || value === undefined || isNaN(value)) return '—';
        if (value >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T';
        if (value >= 1e9)  return '$' + (value / 1e9).toFixed(2)  + 'B';
        if (value >= 1e6)  return '$' + (value / 1e6).toFixed(2)  + 'M';
        if (value >= 1e3)  return '$' + (value / 1e3).toFixed(2)  + 'K';
        return formatCurrency(value);
    }

    /**
     * Get a CSS class name based on whether a value is positive or negative.
     * @param {number} value
     * @returns {string} 'positive' or 'negative'
     */
    function priceChangeClass(value) {
        return value >= 0 ? 'positive' : 'negative';
    }

    /**
     * Format a UNIX timestamp (seconds) as a readable date.
     * @param {number} timestamp
     * @returns {string}
     */
    function formatDate(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    }

    /**
     * Validate non-empty string.
     * @param {string} value
     * @returns {boolean}
     */
    function isNonEmpty(value) {
        return typeof value === 'string' && value.trim().length > 0;
    }

    /**
     * Validate positive finite number.
     * @param {*} value
     * @returns {boolean}
     */
    function isPositiveNumber(value) {
        const n = Number(value);
        return Number.isFinite(n) && n > 0;
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'success'|'error'|'warning'} type
     * @param {number} duration milliseconds
     */
    function showToast(message, type = 'success', duration = 3000) {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            container.setAttribute('aria-live', 'assertive');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.25s ease';
            setTimeout(function () { toast.remove(); }, 250);
        }, duration);
    }

    /**
     * Debounce a function — delays execution until after `wait` ms of inactivity.
     * Used for search inputs to avoid flooding the API on every keystroke.
     * @param {Function} fn
     * @param {number} wait
     * @returns {Function}
     */
    function debounce(fn, wait) {
        let timeoutId;
        return function debounced(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function () { fn.apply(null, args); }, wait);
        };
    }

    /**
     * Highlight the active navigation link based on current page.
     */
    function highlightActiveNav() {
        const path = window.location.pathname.split('/').pop() || 'index.html';
        document.querySelectorAll('.nav-link').forEach(function (link) {
            const href = link.getAttribute('href');
            if (href === path) link.classList.add('active');
            else link.classList.remove('active');
        });
    }

    /**
     * Get a query parameter from the URL.
     * @param {string} name
     * @returns {string|null}
     */
    function getQueryParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    /**
     * Show an error message inside a container.
     * @param {HTMLElement} container
     * @param {string} message
     */
    function showError(container, message) {
        container.innerHTML = '<div class="error-state" role="alert">' +
            '<div class="error-icon">⚠</div>' +
            '<div>' + message + '</div></div>';
    }

    /**
     * Show a loading state inside a container.
     * @param {HTMLElement} container
     * @param {string} message
     */
    function showLoading(container, message = 'Loading...') {
        container.innerHTML = '<div class="loading-state" role="status" aria-label="' + message + '">' +
            '<div class="loading-spinner"></div>' +
            '<div>' + message + '</div></div>';
    }

    // Public API
    return {
        formatCurrency,
        formatNumber,
        formatPercent,
        formatLargeNumber,
        priceChangeClass,
        formatDate,
        isNonEmpty,
        isPositiveNumber,
        showToast,
        debounce,
        highlightActiveNav,
        getQueryParam,
        showError,
        showLoading
    };
})();
