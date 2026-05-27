/* ==========================================================================
   chart.js — Chart engine
   --------------------------------------------------------------------------
   Wraps TradingView Lightweight Charts with:
   - Line and candlestick chart types
   - Volume bars in a sub-pane
   - Indicator overlays (MA, EMA, RSI, MACD)
   - A separate <canvas> overlay for drawing tools (lines, horizontal levels)
   - Annotations
   - Built-in zoom/pan from Lightweight Charts
   --------------------------------------------------------------------------
   Lightweight Charts is loaded via CDN in the HTML.
   Reference: https://tradingview.github.io/lightweight-charts/
   ========================================================================== */

const ChartEngine = (function () {
    'use strict';

    /**
     * Read a CSS custom property from :root.
     * Used so the chart picks up the current theme's colors automatically.
     * @param {string} name e.g. '--bg-card'
     * @returns {string}
     */
    function readVar(name) {
        return getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
    }

    /**
     * Create a new chart inside the given container.
     * @param {HTMLElement} container
     * @returns {object} chart controller with helper methods
     */
    function createChart(container) {
        // --- Theme matching our current CSS variables ---
        const chartOptions = {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { color: readVar('--bg-card') || '#FFFFFF' },
                textColor:    readVar('--text-secondary') || '#5A7088',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            },
            grid: {
                vertLines: { color: readVar('--border-light') || '#F2F7FB' },
                horzLines: { color: readVar('--border-light') || '#F2F7FB' }
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
                vertLine: { color: readVar('--border-strong') || '#A8BACB', width: 1, style: 2 },
                horzLine: { color: readVar('--border-strong') || '#A8BACB', width: 1, style: 2 }
            },
            rightPriceScale: {
                borderColor: readVar('--border-light') || '#E5EDF3'
            },
            timeScale: {
                borderColor: readVar('--border-light') || '#E5EDF3',
                timeVisible: true,
                secondsVisible: false
            },
            handleScroll: true,
            handleScale: true
        };

        const chart = LightweightCharts.createChart(container, chartOptions);

        // Series references — added on demand
        const series = {
            line: null,
            candlestick: null,
            ma20: null,
            ma50: null,
            volume: null
        };

        // Generic overlays added by name (used by prediction page)
        const overlays = {};

        // Currently active type ('line' or 'candlestick')
        let currentType = 'line';

        // --- Drawing tools state ---
        let drawingCanvas = null;
        let drawingCtx = null;
        let drawingMode = null; // 'line' | 'horizontal' | 'annotation' | null
        let drawings = [];      // stored shapes
        let isDrawing = false;
        let startPoint = null;

        /**
         * Switch between line and candlestick views.
         * @param {'line'|'candlestick'} type
         * @param {Array} data
         */
        function setChartType(type, data) {
            // Remove existing main series
            if (series.line)        { chart.removeSeries(series.line);        series.line = null; }
            if (series.candlestick) { chart.removeSeries(series.candlestick); series.candlestick = null; }

            if (type === 'candlestick') {
                const upColor   = readVar('--success') || '#2E6B3F';
                const downColor = readVar('--danger')  || '#B23A3A';
                series.candlestick = chart.addCandlestickSeries({
                    upColor:         upColor,
                    downColor:       downColor,
                    borderUpColor:   upColor,
                    borderDownColor: downColor,
                    wickUpColor:     upColor,
                    wickDownColor:   downColor
                });
                series.candlestick.setData(data);
            } else {
                series.line = chart.addLineSeries({
                    color: readVar('--accent') || '#1E5A8A',
                    lineWidth: 2,
                    priceLineVisible: false,
                    lastValueVisible: true
                });
                series.line.setData(data);
            }
            currentType = type;
            chart.timeScale().fitContent();
        }

        /**
         * Add or remove a moving average overlay.
         * @param {string} key      'ma20' or 'ma50'
         * @param {Array}  data     line data { time, value }
         * @param {string} color
         */
        function setMovingAverage(key, data, color) {
            if (series[key]) {
                chart.removeSeries(series[key]);
                series[key] = null;
            }
            if (data) {
                series[key] = chart.addLineSeries({
                    color: color,
                    lineWidth: 1.5,
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false
                });
                series[key].setData(data);
            }
        }

        /**
         * Add volume bars in the lower portion of the chart.
         * @param {Array<{time, value, color}>} volumeData
         */
        function setVolume(volumeData) {
            if (series.volume) {
                chart.removeSeries(series.volume);
                series.volume = null;
            }
            if (!volumeData || volumeData.length === 0) return;

            series.volume = chart.addHistogramSeries({
                priceFormat: { type: 'volume' },
                priceScaleId: 'volume',
                color: '#3B85C4'
            });

            // Volume sits in its own scale at the bottom
            chart.priceScale('volume').applyOptions({
                scaleMargins: { top: 0.8, bottom: 0 }
            });

            series.volume.setData(volumeData);
        }

        // ====================================================================
        // Drawing tools — separate <canvas> overlay
        // ====================================================================

        /**
         * Attach a drawing canvas overlay to the chart container.
         * @param {HTMLCanvasElement} canvas
         */
        function attachDrawingCanvas(canvas) {
            drawingCanvas = canvas;
            drawingCtx = canvas.getContext('2d');
            resizeDrawingCanvas();

            canvas.addEventListener('mousedown', onDrawStart);
            canvas.addEventListener('mousemove', onDrawMove);
            canvas.addEventListener('mouseup',   onDrawEnd);
            canvas.addEventListener('mouseleave', onDrawEnd);

            // Redraw saved shapes when chart is panned/zoomed
            chart.timeScale().subscribeVisibleTimeRangeChange(redrawShapes);
        }

        /** Sync the drawing canvas pixel size to its CSS size; redraw all saved shapes. */
        function resizeDrawingCanvas() {
            if (!drawingCanvas) return;
            drawingCanvas.width  = drawingCanvas.offsetWidth;
            drawingCanvas.height = drawingCanvas.offsetHeight;
            redrawShapes();
        }

        /**
         * Activate/deactivate a drawing mode.
         * @param {string|null} mode 'line' | 'horizontal' | 'annotation' | null
         */
        function setDrawingMode(mode) {
            drawingMode = mode;
            if (drawingCanvas) {
                if (mode) drawingCanvas.classList.add('active');
                else      drawingCanvas.classList.remove('active');
            }
        }

        /** Remove all user drawings from the overlay canvas. */
        function clearDrawings() {
            drawings = [];
            redrawShapes();
        }

        /**
         * Return a shallow copy of all saved drawing shapes.
         * @returns {Array<object>}
         */
        function getDrawings() {
            return drawings.slice();
        }

        /**
         * Replace current drawings with a previously saved array.
         * @param {Array<object>} saved
         */
        function restoreDrawings(saved) {
            drawings = saved.slice();
            redrawShapes();
        }

        /**
         * Translate a mouse event to canvas-relative coordinates.
         * @param {MouseEvent} e
         * @returns {{x: number, y: number}}
         */
        function getMousePos(e) {
            const rect = drawingCanvas.getBoundingClientRect();
            return {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        }

        /**
         * Return the drawing stroke color for the active theme.
         * Uses bright green on dark backgrounds, dark green on light backgrounds.
         * @returns {string} CSS color string.
         */
        function drawColor() {
            return document.documentElement.getAttribute('data-theme') === 'dark'
                ? '#22C55E'   // bright green — visible on dark backgrounds
                : '#16A34A';  // dark green   — visible on light backgrounds
        }

        /**
         * Handle mousedown: begin a drawing operation or place an annotation.
         * @param {MouseEvent} e
         */
        function onDrawStart(e) { 

            if (!drawingMode) return; 

            isDrawing = true; 

            startPoint = getMousePos(e); 

 

            if (drawingMode === 'annotation') { 

                const text = prompt('Annotation text:'); 

                if (text && text.trim()) { 

                    drawings.push({ 

                        type: 'annotation', 

                        x: startPoint.x, 

                        y: startPoint.y, 

                        text: text.trim() 

                    }); 

                    redrawShapes(); 

                } 

                isDrawing = false; 

                startPoint = null; 

                // Auto-exit annotation mode so the label doesn't keep following the mouse 

                setDrawingMode(null); 

                drawingCanvas.dispatchEvent(new CustomEvent('drawing:done', { bubbles: true })); 

                return; 

            } 

        } 

 

        /** 

         * Handle mousemove: render a live preview of the shape being drawn. 

         * @param {MouseEvent} e 

         */ 

        function onDrawMove(e) { 

            if (!isDrawing || !startPoint) return; 

            const cur = getMousePos(e); 

 

            // Live preview — redraw saved shapes plus the current one 

            redrawShapes(); 

            drawingCtx.strokeStyle = drawColor(); 

            drawingCtx.lineWidth = 1.5; 

            drawingCtx.beginPath(); 

 

            if (drawingMode === 'line') { 

                drawingCtx.moveTo(startPoint.x, startPoint.y); 

                drawingCtx.lineTo(cur.x, cur.y); 

            } else if (drawingMode === 'horizontal') { 

                drawingCtx.moveTo(0, startPoint.y); 

                drawingCtx.lineTo(drawingCanvas.width, startPoint.y); 

            } 

            drawingCtx.stroke(); 

        } 

 

        /** 

         * Handle mouseup/mouseleave: commit the completed shape to the drawings list. 

         * @param {MouseEvent} e 

         */ 

        function onDrawEnd(e) { 

            if (!isDrawing || !startPoint) return; 

            const end = getMousePos(e); 

 

            if (drawingMode === 'line') { 

                drawings.push({ 

                    type: 'line', 

                    x1: startPoint.x, y1: startPoint.y, 

                    x2: end.x,        y2: end.y 

                }); 

            } else if (drawingMode === 'horizontal') { 

                drawings.push({ 

                    type: 'horizontal', 

                    y: startPoint.y 

                }); 

            } 

 

            isDrawing = false; 

            startPoint = null; 

            redrawShapes(); 

        } 

        /** Clear the overlay canvas and repaint all saved drawings. */
        function redrawShapes() {
            if (!drawingCtx || !drawingCanvas) return;
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

            const color = drawColor();
            for (const s of drawings) {
                drawingCtx.strokeStyle = color;
                drawingCtx.fillStyle   = color;
                drawingCtx.lineWidth   = 1.5;

                if (s.type === 'line') {
                    drawingCtx.beginPath();
                    drawingCtx.moveTo(s.x1, s.y1);
                    drawingCtx.lineTo(s.x2, s.y2);
                    drawingCtx.stroke();
                } else if (s.type === 'horizontal') {
                    drawingCtx.beginPath();
                    drawingCtx.setLineDash([6, 4]);
                    drawingCtx.moveTo(0, s.y);
                    drawingCtx.lineTo(drawingCanvas.width, s.y);
                    drawingCtx.stroke();
                    drawingCtx.setLineDash([]);
                } else if (s.type === 'annotation') {
                    // Pin dot
                    drawingCtx.beginPath();
                    drawingCtx.arc(s.x, s.y, 5, 0, Math.PI * 2);
                    drawingCtx.fill();

                    // Label box — always white bg with dark text for readability
                    drawingCtx.font = '12px -apple-system, sans-serif';
                    const padding   = 6;
                    const textWidth = drawingCtx.measureText(s.text).width;
                    drawingCtx.fillStyle   = '#FFFFFF';
                    drawingCtx.fillRect(s.x + 8, s.y - 18, textWidth + padding * 2, 22);
                    drawingCtx.strokeStyle = color;
                    drawingCtx.strokeRect(s.x + 8, s.y - 18, textWidth + padding * 2, 22);
                    drawingCtx.fillStyle   = '#142F4D';
                    drawingCtx.fillText(s.text, s.x + 8 + padding, s.y - 3);
                }
            }
        }

        /**
         * Add (or replace) a named line overlay on the chart.
         * Used by the prediction page to draw forecast lines.
         * @param {string} key
         * @param {Array<{time, value}>} data
         * @param {string} color
         * @param {object} [opts]  optional { lineStyle, lineWidth }
         */
        function addOverlay(key, data, color, opts) {
            opts = opts || {};
            if (overlays[key]) {
                chart.removeSeries(overlays[key]);
                delete overlays[key];
            }
            if (!data || data.length === 0) return;

            overlays[key] = chart.addLineSeries({
                color: color,
                lineWidth: opts.lineWidth || 2,
                lineStyle: opts.lineStyle !== undefined ? opts.lineStyle : 0,
                priceLineVisible: false,
                lastValueVisible: false,
                crosshairMarkerVisible: false
            });
            overlays[key].setData(data);
        }

        /**
         * Remove a named overlay (or all overlays if no key given).
         * @param {string} [key]
         */
        function clearOverlay(key) {
            if (key) {
                if (overlays[key]) {
                    chart.removeSeries(overlays[key]);
                    delete overlays[key];
                }
            } else {
                Object.keys(overlays).forEach(function (k) {
                    chart.removeSeries(overlays[k]);
                    delete overlays[k];
                });
            }
        }

        /** Resize both the chart and the drawing canvas when the window resizes. */
        function handleResize() {
            chart.applyOptions({
                width: container.clientWidth,
                height: container.clientHeight
            });
            resizeDrawingCanvas();
        }
        window.addEventListener('resize', handleResize);

        /** Remove all event listeners and destroy the chart instance. Call on page unload. */
        function destroy() {
            window.removeEventListener('resize', handleResize);
            if (drawingCanvas) {
                drawingCanvas.removeEventListener('mousedown', onDrawStart);
                drawingCanvas.removeEventListener('mousemove', onDrawMove);
                drawingCanvas.removeEventListener('mouseup',   onDrawEnd);
                drawingCanvas.removeEventListener('mouseleave', onDrawEnd);
            }
            chart.remove();
        }

        // Public controller
        return {
            chart,
            setChartType,
            setMovingAverage,
            setVolume,
            attachDrawingCanvas,
            setDrawingMode,
            clearDrawings,
            getDrawings,
            restoreDrawings,
            addOverlay,
            clearOverlay,
            destroy,
            getCurrentType: () => currentType
        };
    }

    return { createChart };
})();
