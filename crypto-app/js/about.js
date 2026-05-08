/* ==========================================================================
   about.js — About / Help page logic
   --------------------------------------------------------------------------
   Handles the FAQ accordion: clicking a question expands its answer.
   Other open answers stay open (multi-expand) so users can compare answers.
   ========================================================================== */

(function () {
    'use strict';

    function init() {
        Utils.highlightActiveNav();

        // Wire up each FAQ item
        document.querySelectorAll('.faq-question').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const item = btn.parentElement;
                item.classList.toggle('open');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
