/* ==========================================================================
   portfolio.js — Portfolio page state management and event handling
   --------------------------------------------------------------------------
   This module owns the page's data lifecycle:
   - Reads holdings from localStorage via Storage
   - Fetches live prices via Api
   - Computes per-holding profit/loss figures
   - Delegates all DOM rendering to PortfolioRenderer (portfolio-render.js)
   - Manages the add/edit modal and all CRUD operations

   Load order: theme.js → utils.js → api.js → storage.js →
               portfolio-render.js → portfolio.js
   ========================================================================== */

(function () {
    'use strict';

    // Page state
    let holdings = [];           // list of holdings from storage
    let priceMap = {};           // { coinId: { usd, usd_24h_change } }
    let coinSearchResults = [];  // suggestions shown inside the add-holding form

    function init() {
        Utils.highlightActiveNav();
        wireStaticElements();
        loadPortfolio();
    }

    /**
     * Wire up the page-level controls that are always present in the HTML.
     */
    function wireStaticElements() {
        document.getElementById('add-holding-btn').addEventListener('click', openAddModal);
        document.getElementById('reset-portfolio-btn').addEventListener('click', confirmReset);
    }

    /**
     * Reload holdings from storage, fetch current prices, and re-render.
     * Shows a loading spinner while the price fetch is in flight.
     */
    async function loadPortfolio() {
        holdings = Storage.getAll();

        if (holdings.length === 0) {
            PortfolioRenderer.renderEmptyState(openAddModal);
            return;
        }

        const statsEl = document.getElementById('summary-stats');
        if (statsEl && statsEl.innerHTML === '') {
            Utils.showLoading(statsEl, 'Loading prices...');
        }

        try {
            const ids = Storage.getUniqueCoinIds();
            priceMap = await Api.getPrices(ids);
            renderAll();
        } catch (err) {
            Utils.showToast('Failed to load prices: ' + err.message, 'error');
            // Still render so the user can see their holdings even without live prices
            priceMap = {};
            renderAll();
        }
    }

    /**
     * Compute enriched holding objects (with currentValue, cost, profit, profitPct)
     * and delegate rendering to PortfolioRenderer.
     */
    function renderAll() {
        const enriched = holdings.map(function (h) {
            const current      = priceMap[h.coinId] ? priceMap[h.coinId].usd : null;
            const currentValue = current !== null ? current * h.amount : null;
            const cost         = h.amount * h.buyPrice;
            const profit       = currentValue !== null ? currentValue - cost : null;
            const profitPct    = (currentValue !== null && cost > 0) ? (profit / cost) * 100 : null;
            return Object.assign({}, h, { currentPrice: current, currentValue, cost, profit, profitPct });
        });

        PortfolioRenderer.renderSummary(enriched);
        PortfolioRenderer.renderHoldingsTable(enriched, openEditModal, confirmDelete, openAddModal);
        PortfolioRenderer.renderAllocation(enriched);
    }


    // ====================================================================
    // ADD / EDIT MODAL
    // ====================================================================

    /** Open the modal in "add new holding" mode. */
    function openAddModal() {
        showModal({ title: 'Add holding', holding: null });
    }

    /**
     * Open the modal in "edit existing holding" mode.
     * @param {string} id  Storage ID of the holding to edit.
     */
    function openEditModal(id) {
        const holding = Storage.findById(id);
        if (!holding) return;
        showModal({ title: 'Edit holding', holding });
    }

    /**
     * Build and display the add/edit modal overlay.
     * @param {{title: string, holding: object|null}} options
     */
    function showModal(options) {
        const isEdit = !!options.holding;
        const h = options.holding || {};

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
                <h2 id="modal-title" class="modal-title">${options.title}</h2>

                <div class="form-group">
                    <label class="form-label" for="form-coin">Cryptocurrency</label>
                    <div class="coin-selector-wrapper">
                        <input type="text" id="form-coin" class="form-input"
                               placeholder="Search by name or symbol..."
                               value="${isEdit ? PortfolioRenderer.escapeHtml(h.coinName) : ''}"
                               autocomplete="off"
                               ${isEdit ? 'disabled' : ''}>
                        <div id="coin-suggestions" class="coin-suggestions"
                             role="listbox" aria-label="Coin search results"></div>
                    </div>
                    <div class="form-error" id="err-coin" role="alert"></div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="form-amount">Amount held</label>
                        <input type="number" id="form-amount" class="form-input"
                               placeholder="0.00" step="any" min="0"
                               value="${isEdit ? h.amount : ''}">
                        <div class="form-error" id="err-amount" role="alert"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="form-price">Buy price (USD)</label>
                        <input type="text" id="form-price" class="form-input"
                               placeholder="e.g. 0.00000002354" inputmode="decimal"
                               value="${isEdit ? h.buyPrice : ''}">
                        <div class="form-error" id="err-price" role="alert"></div>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label" for="form-date">Buy date</label>
                    <input type="date" id="form-date" class="form-input"
                           value="${isEdit ? h.buyDate : new Date().toISOString().slice(0, 10)}">
                </div>

                <div class="form-group">
                    <label class="form-label" for="form-notes">Notes (optional)</label>
                    <input type="text" id="form-notes" class="form-input"
                           placeholder="e.g. Long-term hold"
                           value="${isEdit ? PortfolioRenderer.escapeHtml(h.notes) : ''}">
                </div>

                <div class="form-actions">
                    <button class="btn btn-secondary" id="form-cancel">Cancel</button>
                    <button class="btn btn-primary"   id="form-save">
                        ${isEdit ? 'Save changes' : 'Add holding'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Track the coin selected from the dropdown (only relevant when adding)
        let selectedCoin = isEdit ? {
            id: h.coinId, name: h.coinName, symbol: h.coinSymbol, large: h.coinImage
        } : null;

        function close() { overlay.remove(); }
        overlay.querySelector('#form-cancel').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });

        // Live coin search — only active in add mode
        if (!isEdit) {
            const searchInput    = overlay.querySelector('#form-coin');
            const suggestionsBox = overlay.querySelector('#coin-suggestions');

            const doSearch = Utils.debounce(async function () {
                const q = searchInput.value.trim();
                if (q.length < 2) {
                    suggestionsBox.classList.remove('open');
                    return;
                }
                try {
                    const results = await Api.searchCoins(q);
                    coinSearchResults = results.slice(0, 8);
                    renderSuggestions();
                } catch (err) {
                    Utils.showToast('Search failed: ' + err.message, 'error');
                }
            }, 300);

            function renderSuggestions() {
                if (coinSearchResults.length === 0) {
                    suggestionsBox.classList.remove('open');
                    return;
                }
                suggestionsBox.innerHTML = coinSearchResults.map(function (c) {
                    return `
                        <div class="suggestion-item" data-id="${c.id}" role="option">
                            <img src="${c.thumb || c.large || ''}" class="suggestion-icon"
                                 onerror="this.style.visibility='hidden'">
                            <div>
                                <div style="font-weight:500;">${PortfolioRenderer.escapeHtml(c.name)}</div>
                                <div style="font-size:12px; color:var(--text-secondary); text-transform:uppercase;">
                                    ${PortfolioRenderer.escapeHtml(c.symbol)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                suggestionsBox.classList.add('open');

                suggestionsBox.querySelectorAll('.suggestion-item').forEach(function (el) {
                    el.addEventListener('click', function () {
                        const id   = el.getAttribute('data-id');
                        const coin = coinSearchResults.find(c => c.id === id);
                        if (!coin) return;
                        selectedCoin        = coin;
                        searchInput.value   = coin.name;
                        suggestionsBox.classList.remove('open');
                    });
                });
            }

            searchInput.addEventListener('input', doSearch);
            searchInput.addEventListener('focus', function () {
                if (coinSearchResults.length) suggestionsBox.classList.add('open');
            });
        }

        overlay.querySelector('#form-save').addEventListener('click', function () {
            if (validateAndSave(overlay, selectedCoin, options.holding)) close();
        });
    }

    /**
     * Validate the modal form and persist the new or updated holding.
     * @param {HTMLElement} overlay       The modal overlay element.
     * @param {object|null} selectedCoin  Coin chosen from search suggestions (add mode).
     * @param {object|null} existingHolding  Existing holding object (edit mode) or null.
     * @returns {boolean} true if validation passed and the record was saved.
     */
    function validateAndSave(overlay, selectedCoin, existingHolding) {
        const isEdit = !!existingHolding;

        overlay.querySelectorAll('.form-error').forEach(el => (el.textContent = ''));

        const amountStr = overlay.querySelector('#form-amount').value;
        const priceStr  = overlay.querySelector('#form-price').value;
        const date      = overlay.querySelector('#form-date').value;
        const notes     = overlay.querySelector('#form-notes').value;

        let valid = true;

        if (!isEdit && (!selectedCoin || !selectedCoin.id)) {
            overlay.querySelector('#err-coin').textContent = 'Please select a cryptocurrency from the suggestions.';
            valid = false;
        }
        if (!Utils.isPositiveNumber(amountStr)) {
            overlay.querySelector('#err-amount').textContent = 'Enter a positive number.';
            valid = false;
        }
        if (!Utils.isPositiveNumber(priceStr)) {
            overlay.querySelector('#err-price').textContent = 'Enter a positive price.';
            valid = false;
        }
        if (!valid) return false;

        if (isEdit) {
            Storage.update(existingHolding.id, { amount: amountStr, buyPrice: priceStr, buyDate: date, notes });
            Utils.showToast('Holding updated', 'success');
        } else {
            Storage.create({
                coinId:     selectedCoin.id,
                coinName:   selectedCoin.name,
                coinSymbol: selectedCoin.symbol,
                coinImage:  selectedCoin.large || selectedCoin.thumb || '',
                amount:     amountStr,
                buyPrice:   priceStr,
                buyDate:    date,
                notes
            });
            Utils.showToast('Holding added', 'success');
        }

        loadPortfolio();
        return true;
    }

    /**
     * Ask the user to confirm deletion of a single holding, then remove it.
     * @param {string} id  Storage ID of the holding.
     */
    function confirmDelete(id) {
        const h = Storage.findById(id);
        if (!h) return;
        if (!confirm('Delete your ' + h.coinName + ' holding? This cannot be undone.')) return;
        Storage.remove(id);
        Utils.showToast('Holding deleted', 'success');
        loadPortfolio();
    }

    /**
     * Ask the user to confirm a full portfolio reset, then clear all holdings.
     */
    function confirmReset() {
        if (Storage.getAll().length === 0) {
            Utils.showToast('Portfolio is already empty', 'warning');
            return;
        }
        if (!confirm('Delete ALL holdings? This cannot be undone.')) return;
        Storage.clear();
        Utils.showToast('Portfolio cleared', 'success');
        loadPortfolio();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
