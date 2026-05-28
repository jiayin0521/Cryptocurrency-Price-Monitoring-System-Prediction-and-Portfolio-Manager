/* ==========================================================================
   portfolio-render.js — Portfolio page rendering functions
   --------------------------------------------------------------------------
   Responsible for all DOM output on the Portfolio page:
   - Summary stat cards
   - Holdings table
   - Allocation donut chart (SVG, drawn from scratch)
   - Empty state

   Depends on Utils (formatting helpers). Exposed via window.PortfolioRenderer.
   Called by portfolio.js, which owns state and event handling.
   ========================================================================== */

const PortfolioRenderer = (function () {
    'use strict';

    // Color palette for allocation donut slices. Cycles when there are more
    // holdings than colors. Chosen to work on both light and dark themes.
    const SLICE_COLORS = [
        '#1E5A8A', '#3B85C4', '#2E6B3F', '#B87B1F',
        '#7E5BB3', '#B23A3A', '#5A7088', '#6FAF7E'
    ];

    /**
     * Escape user-supplied text for safe insertion into HTML.
     * Prevents XSS if coin names or notes contain markup characters.
     * @param {string|null|undefined} str
     * @returns {string}
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

    /**
     * Render the four summary stat cards at the top of the Portfolio page.
     * @param {Array<object>} enriched  Holdings array augmented with currentValue, profit, etc.
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
                <div class="stat-change">${enriched.length === 1 ? 'asset' : 'assets'}</div>
            </div>
        `;
    }

    /**
     * Render the holdings table and wire up per-row edit/delete buttons.
     * @param {Array<object>} enriched  Augmented holdings array.
     * @param {Function} onEdit    Callback(id) — called when edit button clicked.
     * @param {Function} onDelete  Callback(id) — called when delete button clicked.
     * @param {Function} onAdd     Callback() — called when the inline add button clicked.
     */
    function renderHoldingsTable(enriched, onEdit, onDelete, onAdd) {
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
                            <th scope="col">Asset</th>
                            <th scope="col" class="numeric hide-mobile">Amount</th>
                            <th scope="col" class="numeric hide-mobile">Buy price</th>
                            <th scope="col" class="numeric">Current price</th>
                            <th scope="col" class="numeric hide-mobile">Value</th>
                            <th scope="col" class="numeric">P/L</th>
                            <th scope="col" class="actions">Actions</th>
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
                            <img src="${h.coinImage}" alt="${escapeHtml(h.coinName)}" class="coin-icon"
                                 onerror="this.style.visibility='hidden'">
                            <div>
                                <span class="coin-name">${escapeHtml(h.coinName)}</span>
                                <span class="coin-symbol">${escapeHtml(h.coinSymbol)}</span>
                            </div>
                        </div>
                    </td>
                    <td class="numeric hide-mobile">${Utils.formatNumber(h.amount, 8).replace(/\.?0+$/, '')}</td>
                    <td class="numeric hide-mobile">${Utils.formatCurrency(h.buyPrice)}</td>
                    <td class="numeric">${h.currentPrice !== null ? Utils.formatCurrency(h.currentPrice) : '—'}</td>
                    <td class="numeric hide-mobile">${h.currentValue !== null ? Utils.formatCurrency(h.currentValue) : '—'}</td>
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

        // Wire per-row action buttons via event delegation
        tbody.querySelectorAll('button[data-action]').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'edit')   onEdit(id);
                if (action === 'delete') onDelete(id);
            });
        });

        const inlineAdd = document.getElementById('add-holding-btn-inline');
        if (inlineAdd) inlineAdd.addEventListener('click', onAdd);
    }

    /**
     * Render the allocation donut chart as inline SVG with a legend.
     * Each slice is a <circle> with stroke-dasharray — no canvas or library needed.
     * @param {Array<object>} enriched  Augmented holdings array.
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

        // Sort largest slice first and assign palette colors
        const slices = enriched
            .filter(h => h.currentValue !== null && h.currentValue > 0)
            .map(function (h) {
                return {
                    label:    h.coinSymbol.toUpperCase(),
                    value:    h.currentValue,
                    fraction: h.currentValue / totalValue
                };
            })
            .sort((a, b) => b.value - a.value);

        slices.forEach((s, i) => { s.color = SLICE_COLORS[i % SLICE_COLORS.length]; });

        // Build SVG donut using stroke-dasharray on stacked <circle> elements
        const radius = 80;
        const circumference = 2 * Math.PI * radius;
        let offset = 0;

        const sliceSvg = slices.map(function (s) {
            const dash   = s.fraction * circumference;
            const gap    = circumference - dash;
            const circle = `<circle cx="100" cy="100" r="${radius}"
                fill="none" stroke="${s.color}" stroke-width="28"
                stroke-dasharray="${dash} ${gap}"
                stroke-dashoffset="${-offset}"
                transform="rotate(-90 100 100)"/>`;
            offset += dash;
            return circle;
        }).join('');

        const legendItems = slices.map(function (s) {
            const pct = s.fraction * 100;
            return `
                <li>
                    <span class="legend-label">
                        <span class="legend-swatch" style="background:${s.color}"></span>
                        ${escapeHtml(s.label)}
                    </span>
                    <span class="legend-percent">${pct < 0.01 ? '<0.01%' : pct.toFixed(2) + '%'}</span>
                </li>
            `;
        }).join('');

        container.innerHTML = `
            <div class="allocation-card">
                <h3 class="card-title">Allocation</h3>
                <svg class="allocation-svg" viewBox="0 0 200 200"
                     role="img" aria-label="Portfolio allocation donut chart">
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
     * Render the empty-state screen shown when the portfolio has no holdings.
     * @param {Function} onAdd  Callback invoked when the CTA button is clicked.
     */
    function renderEmptyState(onAdd) {
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
        document.getElementById('empty-add-btn').addEventListener('click', onAdd);
    }

    // Public API
    return {
        escapeHtml,
        renderSummary,
        renderHoldingsTable,
        renderAllocation,
        renderEmptyState
    };
})();
