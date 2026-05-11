/* ==========================================================================
   portfolio.js — Portfolio page logic
   --------------------------------------------------------------------------
   This module handles the entire Portfolio page:
   - Lists all holdings from localStorage (via Storage module)
   - Fetches current prices and calculates P/L
   - Renders the holdings table, summary cards, and allocation donut chart
   - Handles add / edit / delete via a modal form
   - Live coin search inside the add-holding form
   ========================================================================== */

(function () {
    'use strict';

    // Color palette used to differentiate slices in the allocation donut.
    // Cycles through these in order — works on both light and dark themes.
    const SLICE_COLORS = [
        '#1E5A8A', '#3B85C4', '#2E6B3F', '#B87B1F',
        '#7E5BB3', '#B23A3A', '#5A7088', '#6FAF7E'
    ];

    // Page state
    let holdings = [];      // list of holdings from storage
    let priceMap = {};      // { coinId: { usd, usd_24h_change } }
    let coinSearchResults = []; // for the add-holding form

    function init() {
        Utils.highlightActiveNav();
        wireStaticElements();
        loadPortfolio();
    }

    /**
     * Wire up the controls that always exist on the page.
     */
    function wireStaticElements() {
        document.getElementById('add-holding-btn').addEventListener('click', openAddModal);
        document.getElementById('reset-portfolio-btn').addEventListener('click', confirmReset);
    }

    /**
     * Reload holdings from storage, fetch current prices, and re-render.
     */
    async function loadPortfolio() {
        holdings = Storage.getAll();

        // No holdings? Show empty state and stop.
        if (holdings.length === 0) {
            renderEmptyState();
            return;
        }

        // Show loading spinner while prices are being fetched
        const statsEl = document.getElementById('summary-stats');
        if (statsEl && statsEl.innerHTML === '') {
            Utils.showLoading(statsEl, 'Loading prices...');
        }

        // Fetch current prices for every coin in the portfolio
        try {
            const ids = Storage.getUniqueCoinIds();
            priceMap = await Api.getPrices(ids);
            renderAll();
        } catch (err) {
            Utils.showToast('Failed to load prices: ' + err.message, 'error');
            // Render anyway with whatever data we have
            priceMap = {};
            renderAll();
        }
    }

    /**
     * Render everything: summary cards, holdings table, allocation donut.
     */
    function renderAll() {
        // Compute aggregate values for every holding
        const enriched = holdings.map(function (h) {
            const current = priceMap[h.coinId] ? priceMap[h.coinId].usd : null;
            const currentValue = current !== null ? current * h.amount : null;
            const cost = h.amount * h.buyPrice;
            const profit = currentValue !== null ? currentValue - cost : null;
            const profitPct = (currentValue !== null && cost > 0) ? (profit / cost) * 100 : null;
            return Object.assign({}, h, {
                currentPrice: current,
                currentValue: currentValue,
                cost: cost,
                profit: profit,
                profitPct: profitPct
            });
        });

        renderSummary(enriched);
        renderHoldingsTable(enriched);
        renderAllocation(enriched);
    }

    /**
     * Render the four summary cards at the top of the page.
     */
    function renderSummary(enriched) {
        const totalValue = enriched.reduce(function (s, h) {
            return s + (h.currentValue || 0);
        }, 0);
        const totalCost = enriched.reduce(function (s, h) { return s + h.cost; }, 0);
        const totalProfit = totalValue - totalCost;
        const totalProfitPct = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

        const profitClass = Utils.priceChangeClass(totalProfit);

        document.getElementById('summary-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Portfolio value</div>
                <div class="stat-value">${Utils.formatCurrency(totalValue)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total cost</div>
                <div class="stat-value">${Utils.formatCurrency(totalCost)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Profit / loss</div>
                <div class="stat-value"
                     style="color: ${totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">
                    ${Utils.formatCurrency(totalProfit)}
                </div>
                <div class="stat-change ${profitClass}">
                    ${Utils.formatPercent(totalProfitPct)}
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Holdings</div>
                <div class="stat-value">${enriched.length}</div>
                <div class="stat-change">${holdings.length === 1 ? 'asset' : 'assets'}</div>
            </div>
        `;
    }

    /**
     * Render the table of individual holdings.
     */
    function renderHoldingsTable(enriched) {
        const wrapper = document.getElementById('holdings-section');
        wrapper.innerHTML = `
            <div class="card-header" style="padding: var(--space-4) var(--space-6); border-radius: var(--radius-lg) var(--radius-lg) 0 0;">
                <h2 class="card-title">Your holdings</h2>
                <button id="add-holding-btn-inline" class="btn btn-primary btn-sm">+ Add holding</button>
            </div>
            <div class="holdings-table-wrapper">
                <table class="holdings-table">
                    <thead>
                        <tr>
                            <th>Asset</th>
                            <th class="numeric">Amount</th>
                            <th class="numeric hide-mobile">Buy price</th>
                            <th class="numeric">Current price</th>
                            <th class="numeric">Value</th>
                            <th class="numeric">P/L</th>
                            <th class="actions">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="holdings-tbody"></tbody>
                </table>
            </div>
        `;

        const tbody = document.getElementById('holdings-tbody');
        tbody.innerHTML = enriched.map(function (h) {
            const profitClass = h.profit !== null ? Utils.priceChangeClass(h.profit) : '';
            return `
                <tr>
                    <td>
                        <div class="coin-name-cell">
                            <img src="${h.coinImage}" alt="${h.coinName}" class="coin-icon"
                                 onerror="this.style.visibility='hidden'">
                            <div>
                                <span class="coin-name">${escapeHtml(h.coinName)}</span>
                                <span class="coin-symbol">${escapeHtml(h.coinSymbol)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="numeric">${Utils.formatNumber(h.amount, 8).replace(/\.?0+$/, '')}</td>
                    <td class="numeric hide-mobile">${Utils.formatCurrency(h.buyPrice)}</td>
                    <td class="numeric">${h.currentPrice !== null ? Utils.formatCurrency(h.currentPrice) : '—'}</td>
                    <td class="numeric">${h.currentValue !== null ? Utils.formatCurrency(h.currentValue) : '—'}</td>
                    <td class="numeric">
                        ${h.profit !== null
                            ? '<span class="price-change ' + profitClass + '">' +
                              Utils.formatPercent(h.profitPct) +
                              '</span>'
                            : '—'}
                    </td>
                    <td class="actions">
                        <div class="row-actions">
                            <button class="icon-btn" data-action="edit" data-id="${h.id}" title="Edit">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                            </button>
                            <button class="icon-btn danger" data-action="delete" data-id="${h.id}" title="Delete">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"/>
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                    <path d="M10 11v6M14 11v6"/>
                                    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Wire up row action buttons
        tbody.querySelectorAll('button[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'edit')   openEditModal(id);
                if (action === 'delete') confirmDelete(id);
            });
        });

        // Wire the inline add button (the one that lives inside the table card)
        const inlineAdd = document.getElementById('add-holding-btn-inline');
        if (inlineAdd) inlineAdd.addEventListener('click', openAddModal);
    }

    /**
     * Render the allocation donut chart using SVG (drawn from scratch).
     * @param {Array} enriched
     */
    function renderAllocation(enriched) {
        const container = document.getElementById('allocation-section');
        const totalValue = enriched.reduce(function (s, h) {
            return s + (h.currentValue || 0);
        }, 0);

        if (totalValue <= 0) {
            container.innerHTML = `
                <div class="allocation-card">
                    <h3 class="card-title">Allocation</h3>
                    <p class="empty-state" style="padding: var(--space-6) 0;">
                        Add holdings to see allocation.
                    </p>
                </div>
            `;
            return;
        }

        // Compute slice fractions and sort largest first
        const slices = enriched
            .filter(h => h.currentValue !== null && h.currentValue > 0)
            .map(function (h, i) {
                return {
                    label: h.coinSymbol.toUpperCase(),
                    value: h.currentValue,
                    fraction: h.currentValue / totalValue
                };
            })
            .sort((a, b) => b.value - a.value);

        // Assign colors (cycle through palette)
        slices.forEach((s, i) => { s.color = SLICE_COLORS[i % SLICE_COLORS.length]; });

        // Build the SVG donut. We use stroke-dasharray on a <circle> — each
        // slice is a separate circle with the right dash pattern and offset.
        const radius = 80;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;

        const sliceSvg = slices.map(function (s) {
            const dash = s.fraction * circumference;
            const gap  = circumference - dash;
            const circle = `<circle cx="100" cy="100" r="${radius}"
                fill="none" stroke="${s.color}" stroke-width="28"
                stroke-dasharray="${dash} ${gap}"
                stroke-dashoffset="${-offset}"
                transform="rotate(-90 100 100)"/>`;
            offset += dash;
            return circle;
        }).join('');

        const legendItems = slices.map(function (s) {
            return `
                <li>
                    <span class="legend-label">
                        <span class="legend-swatch" style="background:${s.color}"></span>
                        ${escapeHtml(s.label)}
                    </span>
                    <span class="legend-percent">${s.fraction * 100 < 0.01 ? '<0.01%' : (s.fraction * 100).toFixed(2) + '%'}</span>
                </li>
            `;
        }).join('');

        container.innerHTML = `
            <div class="allocation-card">
                <h3 class="card-title">Allocation</h3>
                <svg class="allocation-svg" viewBox="0 0 200 200">
                    ${sliceSvg}
                    <text x="100" y="96" text-anchor="middle"
                          font-size="11" fill="var(--text-secondary)">Total</text>
                    <text x="100" y="114" text-anchor="middle"
                          font-size="14" font-weight="600" fill="var(--text-primary)">
                        ${Utils.formatLargeNumber(totalValue)}
                    </text>
                </svg>
                <ul class="allocation-legend">${legendItems}</ul>
            </div>
        `;
    }

    /**
     * Render the empty-state message when no holdings exist yet.
     */
    function renderEmptyState() {
        document.getElementById('summary-stats').innerHTML = '';
        document.getElementById('allocation-section').innerHTML = '';
        document.getElementById('holdings-section').innerHTML = `
            <div class="card empty-state" style="padding: var(--space-12) var(--space-6);">
                <h2 style="font-size: 18px; color: var(--text-primary); margin-bottom: var(--space-2);">
                    Your portfolio is empty
                </h2>
                <p style="margin-bottom: var(--space-6);">
                    Add your first holding to start tracking your cryptocurrency investments.
                </p>
                <button id="empty-add-btn" class="btn btn-primary">+ Add your first holding</button>
            </div>
        `;
        document.getElementById('empty-add-btn').addEventListener('click', openAddModal);
    }


    // ====================================================================
    // ADD / EDIT MODAL
    // ====================================================================

    /**
     * Open the modal in "add new holding" mode.
     */
    function openAddModal() {
        showModal({
            title: 'Add holding',
            holding: null
        });
    }

    /**
     * Open the modal in "edit existing holding" mode.
     * @param {string} id
     */
    function openEditModal(id) {
        const holding = Storage.findById(id);
        if (!holding) return;
        showModal({
            title: 'Edit holding',
            holding: holding
        });
    }

    /**
     * Render the add/edit modal.
     * @param {object} options { title, holding }
     */
    function showModal(options) {
        const isEdit = !!options.holding;
        const h = options.holding || {};

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-labelledby="modal-title">
                <h2 id="modal-title" class="modal-title">${options.title}</h2>

                <div class="form-group">
                    <label class="form-label" for="form-coin">Cryptocurrency</label>
                    <div class="coin-selector-wrapper">
                        <input type="text" id="form-coin" class="form-input"
                               placeholder="Search by name or symbol..."
                               value="${isEdit ? escapeHtml(h.coinName) : ''}"
                               autocomplete="off"
                               ${isEdit ? 'disabled' : ''}>
                        <div id="coin-suggestions" class="coin-suggestions"></div>
                    </div>
                    <div class="form-error" id="err-coin"></div>
                </div>

                <div class="form-grid">
                    <div class="form-group">
                        <label class="form-label" for="form-amount">Amount held</label>
                        <input type="number" id="form-amount" class="form-input"
                               placeholder="0.00" step="any" min="0"
                               value="${isEdit ? h.amount : ''}">
                        <div class="form-error" id="err-amount"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="form-price">Buy price (USD)</label>
                        <input type="text" id="form-price" class="form-input"
                               placeholder="e.g. 0.00000002354" inputmode="decimal"
                               value="${isEdit ? h.buyPrice : ''}">
                        <div class="form-error" id="err-price"></div>
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
                           value="${isEdit ? escapeHtml(h.notes) : ''}">
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

        // Internal state for the selected coin (only matters in add mode)
        let selectedCoin = isEdit ? {
            id: h.coinId, name: h.coinName, symbol: h.coinSymbol, large: h.coinImage
        } : null;

        // Close behaviors
        function close() { overlay.remove(); }
        overlay.querySelector('#form-cancel').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });

        // Coin search (only when adding new)
        if (!isEdit) {
            const searchInput = overlay.querySelector('#form-coin');
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
                        <div class="suggestion-item" data-id="${c.id}">
                            <img src="${c.thumb || c.large || ''}" class="suggestion-icon"
                                 onerror="this.style.visibility='hidden'">
                            <div>
                                <div style="font-weight:500;">${escapeHtml(c.name)}</div>
                                <div style="font-size:12px; color:var(--text-secondary); text-transform:uppercase;">
                                    ${escapeHtml(c.symbol)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                suggestionsBox.classList.add('open');

                suggestionsBox.querySelectorAll('.suggestion-item').forEach(function (el) {
                    el.addEventListener('click', function () {
                        const id = el.getAttribute('data-id');
                        const coin = coinSearchResults.find(c => c.id === id);
                        if (!coin) return;
                        selectedCoin = coin;
                        searchInput.value = coin.name;
                        suggestionsBox.classList.remove('open');
                    });
                });
            }

            searchInput.addEventListener('input', doSearch);
            searchInput.addEventListener('focus', function () {
                if (coinSearchResults.length) suggestionsBox.classList.add('open');
            });
        }

        // Save button
        overlay.querySelector('#form-save').addEventListener('click', function () {
            if (validateAndSave(overlay, selectedCoin, options.holding)) close();
        });
    }

    /**
     * Validate the form and save (create or update).
     * Returns true on success.
     */
    function validateAndSave(overlay, selectedCoin, existingHolding) {
        const isEdit = !!existingHolding;

        // Clear previous errors
        overlay.querySelectorAll('.form-error').forEach(el => el.textContent = '');

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
            Storage.update(existingHolding.id, {
                amount:   amountStr,
                buyPrice: priceStr,
                buyDate:  date,
                notes:    notes
            });
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
                notes:      notes
            });
            Utils.showToast('Holding added', 'success');
        }

        loadPortfolio();
        return true;
    }

    /**
     * Confirm and delete a holding.
     * @param {string} id
     */
    function confirmDelete(id) {
        const h = Storage.findById(id);
        if (!h) return;
        const ok = confirm('Delete your ' + h.coinName + ' holding? This cannot be undone.');
        if (!ok) return;
        Storage.remove(id);
        Utils.showToast('Holding deleted', 'success');
        loadPortfolio();
    }

    /**
     * Confirm and reset the entire portfolio.
     */
    function confirmReset() {
        if (Storage.getAll().length === 0) {
            Utils.showToast('Portfolio is already empty', 'warning');
            return;
        }
        const ok = confirm('Delete ALL holdings? This cannot be undone.');
        if (!ok) return;
        Storage.clear();
        Utils.showToast('Portfolio cleared', 'success');
        loadPortfolio();
    }

    /**
     * Escape user-supplied text for safe insertion into HTML.
     * Prevents XSS if a user puts HTML in the notes field.
     */
    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
