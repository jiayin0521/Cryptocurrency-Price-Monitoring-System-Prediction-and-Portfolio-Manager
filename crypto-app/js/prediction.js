/* ==========================================================================
   prediction.js — Price forecasting models
   --------------------------------------------------------------------------
   Two simple time-series forecasting models implemented from scratch:

   1. Linear Regression (Ordinary Least Squares)
      Fits a straight line y = m*x + c through historical prices.
      Good for: capturing overall trend (uptrend, downtrend, sideways).
      Weak for: catching short-term reversals.

   2. Simple Moving Average forecast
      Predicts the next value as the average of the last N data points.
      Good for: smoothing out noise, conservative estimates.
      Weak for: predicting strong trends (it lags behind).

   Each model also reports accuracy metrics computed by re-running the model
   on the historical data (in-sample evaluation):
   - MAE  (Mean Absolute Error):   average absolute prediction error
   - RMSE (Root Mean Squared Err.): penalizes large errors more heavily
   - MAPE (Mean Abs % Error):       error as a percentage of actual price
   ========================================================================== */

const Prediction = (function () {
    'use strict';

    /**
     * Linear regression by ordinary least squares.
     * Given a series of (x, y) points, finds the slope m and intercept c
     * that minimize the squared distance between the line and the points.
     *
     * Formula:
     *   m = (n*Σxy - Σx*Σy) / (n*Σx² - (Σx)²)
     *   c = (Σy - m*Σx) / n
     *
     * @param {Array<{time, value}>} data
     * @returns {{slope, intercept}}
     */
    function fitLinearRegression(data) {
        const n = data.length;
        if (n < 2) return { slope: 0, intercept: data[0] ? data[0].value : 0 };

        // Use the index (0, 1, 2, ...) as x to keep numbers small and stable
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            const x = i;
            const y = data[i].value;
            sumX  += x;
            sumY  += y;
            sumXY += x * y;
            sumXX += x * x;
        }
        const denom = n * sumXX - sumX * sumX;
        const slope     = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        return { slope, intercept };
    }

    /**
     * Generate a forecast using linear regression.
     * @param {Array<{time, value}>} historical
     * @param {number} stepsAhead  number of future points to predict
     * @returns {{forecast, fittedLine, model}}
     *   forecast    = array of {time, value} for future points
     *   fittedLine  = the regression line drawn over historical data
     *   model       = { slope, intercept }
     */
    function linearRegressionForecast(historical, stepsAhead) {
        if (historical.length < 2) {
            return { forecast: [], fittedLine: [], model: { slope: 0, intercept: 0 } };
        }

        const model = fitLinearRegression(historical);

        // Build the fitted line over the historical period
        const fittedLine = historical.map(function (p, i) {
            return { time: p.time, value: model.slope * i + model.intercept };
        });

        // Project the line forward
        const lastTime = historical[historical.length - 1].time;
        const stepSeconds = historical.length > 1
            ? (historical[historical.length - 1].time - historical[0].time) / (historical.length - 1)
            : 86400; // fallback: 1 day

        const forecast = [];
        for (let i = 1; i <= stepsAhead; i++) {
            const x = historical.length - 1 + i;
            forecast.push({
                time:  Math.round(lastTime + i * stepSeconds),
                value: Math.max(0, model.slope * x + model.intercept)
            });
        }
        return { forecast, fittedLine, model };
    }

    /**
     * Generate a forecast using simple moving average.
     * Each future value is the average of the last `window` known values.
     * Once we predict a value, we treat it as known for the next prediction.
     *
     * @param {Array<{time, value}>} historical
     * @param {number} stepsAhead
     * @param {number} window  look-back window (e.g. 7 = last 7 points)
     * @returns {{forecast, fittedLine, window}}
     */
    function movingAverageForecast(historical, stepsAhead, window) {
        if (historical.length < window) {
            return { forecast: [], fittedLine: [], window };
        }

        // Build the in-sample SMA line so the user can see how the model fits
        const fittedLine = [];
        for (let i = window - 1; i < historical.length; i++) {
            let sum = 0;
            for (let j = 0; j < window; j++) sum += historical[i - j].value;
            fittedLine.push({ time: historical[i].time, value: sum / window });
        }

        // For the forecast, keep a rolling window of recent values.
        // Each predicted value is appended and used to compute the next one.
        const recent = historical.slice(-window).map(p => p.value);
        const lastTime = historical[historical.length - 1].time;
        const stepSeconds = historical.length > 1
            ? (historical[historical.length - 1].time - historical[0].time) / (historical.length - 1)
            : 86400;

        const forecast = [];
        for (let i = 1; i <= stepsAhead; i++) {
            const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
            forecast.push({
                time:  Math.round(lastTime + i * stepSeconds),
                value: avg
            });
            recent.shift();
            recent.push(avg);
        }
        return { forecast, fittedLine, window };
    }

    /**
     * Compute accuracy metrics by comparing predicted values to actual values.
     * @param {Array<{time, value}>} actual
     * @param {Array<{time, value}>} predicted  must align by time with actual
     * @returns {{mae, rmse, mape}}
     */
    function evaluateAccuracy(actual, predicted) {
        // Build a map of actual values indexed by time
        const actualMap = new Map(actual.map(p => [p.time, p.value]));
        let sumAbs = 0, sumSq = 0, sumPct = 0, count = 0;

        for (const p of predicted) {
            const actualValue = actualMap.get(p.time);
            if (actualValue === undefined || actualValue === 0) continue;
            const error = p.value - actualValue;
            sumAbs += Math.abs(error);
            sumSq  += error * error;
            sumPct += Math.abs(error / actualValue);
            count++;
        }

        if (count === 0) return { mae: null, rmse: null, mape: null };
        return {
            mae:  sumAbs / count,
            rmse: Math.sqrt(sumSq / count),
            mape: (sumPct / count) * 100
        };
    }

    /**
     * Generate a one-line interpretation of a linear regression model.
     * @param {{slope, intercept}} model
     * @param {number} latestPrice
     * @returns {string}
     */
    function interpretLinearTrend(model, latestPrice) {
        const dailyChangePercent = (model.slope / latestPrice) * 100;
        if (Math.abs(dailyChangePercent) < 0.05) return 'Sideways trend (flat)';
        if (dailyChangePercent > 0)  return 'Uptrend (' + dailyChangePercent.toFixed(2) + '% per period)';
        return 'Downtrend (' + dailyChangePercent.toFixed(2) + '% per period)';
    }

    /**
     * Compare two model evaluations and pick the better one (lower RMSE).
     * @returns {string} description of which is better and by how much
     */
    function compareModels(linMetrics, smaMetrics) {
        if (!linMetrics.rmse || !smaMetrics.rmse) return 'Insufficient data for comparison.';
        if (linMetrics.rmse < smaMetrics.rmse) {
            const diff = ((smaMetrics.rmse - linMetrics.rmse) / smaMetrics.rmse) * 100;
            return 'Linear regression fits this period better (' +
                   diff.toFixed(1) + '% lower RMSE than SMA).';
        } else {
            const diff = ((linMetrics.rmse - smaMetrics.rmse) / linMetrics.rmse) * 100;
            return 'Moving average fits this period better (' +
                   diff.toFixed(1) + '% lower RMSE than linear regression).';
        }
    }

    return {
        linearRegressionForecast,
        movingAverageForecast,
        evaluateAccuracy,
        interpretLinearTrend,
        compareModels
    };
})();
