/* ==========================================================================
   indicators.js — Technical analysis indicators
   --------------------------------------------------------------------------
   Pure JavaScript implementations of common trading indicators.
   All functions take an array of price points and return arrays of
   { time, value } objects compatible with Lightweight Charts.
   ========================================================================== */

const Indicators = (function () {
    'use strict';

    /**
     * Simple Moving Average (SMA)
     * Average of the last `period` closing prices.
     * @param {Array<{time, value}>} data
     * @param {number} period e.g. 20 for MA20
     * @returns {Array<{time, value}>}
     */
    function simpleMovingAverage(data, period) {
        const result = [];
        for (let i = period - 1; i < data.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j].value;
            }
            result.push({
                time: data[i].time,
                value: sum / period
            });
        }
        return result;
    }

    /**
     * Exponential Moving Average (EMA)
     * Weighted average that gives more importance to recent prices.
     * @param {Array<{time, value}>} data
     * @param {number} period
     * @returns {Array<{time, value}>}
     */
    function exponentialMovingAverage(data, period) {
        if (data.length < period) return [];

        const result = [];
        const k = 2 / (period + 1);

        // First EMA value = simple average of first `period` points
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i].value;
        let ema = sum / period;
        result.push({ time: data[period - 1].time, value: ema });

        // Subsequent values use the EMA formula
        for (let i = period; i < data.length; i++) {
            ema = (data[i].value - ema) * k + ema;
            result.push({ time: data[i].time, value: ema });
        }
        return result;
    }

    /**
     * Relative Strength Index (RSI)
     * Momentum oscillator measuring speed and change of price movements.
     * Values range 0-100. >70 = overbought, <30 = oversold.
     * @param {Array<{time, value}>} data
     * @param {number} period typically 14
     * @returns {Array<{time, value}>}
     */
    function relativeStrengthIndex(data, period = 14) {
        if (data.length < period + 1) return [];

        const result = [];
        let gains = 0;
        let losses = 0;

        // Initial average gain/loss over first `period` candles
        for (let i = 1; i <= period; i++) {
            const change = data[i].value - data[i - 1].value;
            if (change >= 0) gains += change;
            else             losses += -change;
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;

        // Calculate RSI for each subsequent point using Wilder's smoothing
        for (let i = period; i < data.length; i++) {
            const change = data[i].value - data[i - 1].value;
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? -change : 0;

            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;

            const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));

            result.push({ time: data[i].time, value: rsi });
        }
        return result;
    }

    /**
     * MACD (Moving Average Convergence Divergence)
     * Returns the MACD line (fast EMA - slow EMA) and the signal line (EMA of MACD).
     * @param {Array<{time, value}>} data
     * @param {number} fastPeriod   default 12
     * @param {number} slowPeriod   default 26
     * @param {number} signalPeriod default 9
     * @returns {{macd: Array, signal: Array, histogram: Array}}
     */
    function macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const fastEma = exponentialMovingAverage(data, fastPeriod);
        const slowEma = exponentialMovingAverage(data, slowPeriod);

        // Align by time — slowEma starts later than fastEma
        const macdLine = [];
        const slowMap = new Map(slowEma.map(p => [p.time, p.value]));

        for (const fastPoint of fastEma) {
            const slowVal = slowMap.get(fastPoint.time);
            if (slowVal !== undefined) {
                macdLine.push({
                    time: fastPoint.time,
                    value: fastPoint.value - slowVal
                });
            }
        }

        const signalLine = exponentialMovingAverage(macdLine, signalPeriod);

        // Histogram = MACD - Signal
        const signalMap = new Map(signalLine.map(p => [p.time, p.value]));
        const histogram = macdLine
            .filter(p => signalMap.has(p.time))
            .map(p => ({
                time: p.time,
                value: p.value - signalMap.get(p.time)
            }));

        return { macd: macdLine, signal: signalLine, histogram };
    }

    /**
     * Get a one-line interpretation of an RSI value.
     * @param {number} rsi
     * @returns {string}
     */
    function interpretRSI(rsi) {
        if (rsi >= 70) return 'Overbought';
        if (rsi <= 30) return 'Oversold';
        if (rsi >= 50) return 'Bullish momentum';
        return 'Bearish momentum';
    }

    /**
     * Get a one-line interpretation of MACD vs signal.
     * @param {number} macdValue
     * @param {number} signalValue
     * @returns {string}
     */
    function interpretMACD(macdValue, signalValue) {
        const diff = macdValue - signalValue;
        if (diff > 0) return 'Bullish (MACD above signal)';
        if (diff < 0) return 'Bearish (MACD below signal)';
        return 'Neutral';
    }

    // Public API
    return {
        simpleMovingAverage,
        exponentialMovingAverage,
        relativeStrengthIndex,
        macd,
        interpretRSI,
        interpretMACD
    };
})();
