/* ==========================================================================
   theme.js — Light / dark theme manager
   --------------------------------------------------------------------------
   Handles switching between light and dark themes.
   - Saves preference to localStorage so it persists across visits
   - Applies the saved theme as soon as the page loads
   - Wires up the toggle button in the header
   - Falls back to light mode by default

   Design decision: light mode is the default because it matches the
   professional fintech aesthetic of Excel, SAP, and Google Drive.
   Dark mode is offered as an opt-in for users in low-light environments.
   ========================================================================== */

const Theme = (function () {
    'use strict';

    const STORAGE_KEY = 'crypcoin-theme';
    const LIGHT = 'light';
    const DARK  = 'dark';

    /**
     * Read the saved theme from localStorage.
     * Returns 'light' if nothing saved.
     * @returns {string}
     */
    function getSavedTheme() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved === DARK ? DARK : LIGHT;
        } catch (err) {
            // localStorage may be blocked in some browsers
            return LIGHT;
        }
    }

    /**
     * Save theme preference to localStorage.
     * @param {string} theme
     */
    function saveTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (err) {
            // Silent fail — theme will reset on page reload
        }
    }

    /**
     * Apply a theme to the document by setting data-theme on <html>.
     * The CSS variables in styles.css respond to this attribute.
     * @param {string} theme  'light' or 'dark'
     */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    /**
     * Get the currently active theme from the document.
     * @returns {string}
     */
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme') || LIGHT;
    }

    /**
     * Toggle between light and dark.
     */
    function toggle() {
        const next = getCurrentTheme() === DARK ? LIGHT : DARK;
        applyTheme(next);
        saveTheme(next);
    }

    /**
     * Apply the saved theme immediately, before the rest of the page loads.
     * Prevents a "flash of light theme" when dark is preferred.
     * Called inline by each HTML page in the <head>.
     */
    function applySavedThemeEarly() {
        applyTheme(getSavedTheme());
    }

    /**
     * Wire up the toggle button after the DOM loads.
     */
    function init() {
        const button = document.getElementById('theme-toggle');
        if (button) {
            button.addEventListener('click', toggle);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        toggle,
        getCurrentTheme,
        applySavedThemeEarly
    };
})();
