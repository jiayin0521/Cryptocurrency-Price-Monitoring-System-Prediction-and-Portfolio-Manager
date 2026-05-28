================================================================
  CrypCoin — Cryptocurrency Price Monitoring System
  TWT6223 Web Techniques and Applications
================================================================

STUDENT INFORMATION
-------------------
Course  : TWT6223 — Web Techniques and Applications
System  : CrypCoin — Cryptocurrency Price Monitoring,
          Prediction and Portfolio Manager

================================================================
PROJECT OVERVIEW
================================================================

CrypCoin is a fully client-side web application for real-time
cryptocurrency price monitoring, technical analysis, price
prediction, and portfolio management. It runs entirely in the
browser with no server, no backend, and no installation required.

================================================================
FOLDER STRUCTURE
================================================================

Crypto-app/
├── index.html                  (Dashboard — main entry point)
├── README.txt                  (This file)
├── css/
│   └── styles.css              (Main stylesheet)
├── js/
│   ├── theme.js                (Light/dark theme manager)
│   ├── utils.js                (Shared utility functions)
│   ├── api.js                  (CoinGecko API + CoinCap fallback)
│   ├── dashboard.js            (Dashboard page logic)
│   ├── chart.js                (Chart engine + drawing tools)
│   ├── coin.js                 (Coin detail page logic)
│   ├── indicators.js           (SMA, EMA, RSI, MACD)
│   ├── prediction.js           (Linear regression + SMA models)
│   ├── prediction-page.js      (Prediction page controller)
│   ├── storage.js              (Portfolio localStorage CRUD)
│   ├── portfolio-render.js     (Portfolio DOM rendering)
│   ├── portfolio.js            (Portfolio state management)
│   └── about.js                (About page FAQ accordion)
└── pages/
    ├── coin.html               (Coin detail page)
    ├── portfolio.html          (Portfolio page)
    ├── prediction.html         (Prediction page)
    └── about.html              (About and Help page)

================================================================
REQUIREMENTS
================================================================

- A modern web browser (Google Chrome recommended)
    Chrome 90+  ✓
    Firefox 88+ ✓
    Edge 90+    ✓
    Safari 14+  ✓

- Active internet connection
    Required to fetch live cryptocurrency data from
    CoinGecko API and load TradingView Lightweight
    Charts library from CDN.

- No installation, no Node.js, no npm, no server needed.

================================================================
HOW TO RUN
================================================================

METHOD 1 — Open directly in browser (simplest)
-----------------------------------------------
1. Extract the zip folder if not already done.
2. Open the Crypto-app/ folder.
3. Double-click index.html.
4. The application opens in your default browser.

NOTE: Some browsers block API requests when opening
HTML files directly (file:// protocol). If the dashboard
shows no data, use Method 2 below.

METHOD 2 — Run with VS Code Live Server (recommended)
------------------------------------------------------
1. Install Visual Studio Code (https://code.visualstudio.com)
2. Install the "Live Server" extension by Ritwick Dey
   (Extensions panel → search "Live Server" → Install)
3. Open the Crypto-app/ folder in VS Code
   (File → Open Folder → select Crypto-app/)
4. Right-click index.html in the Explorer panel
5. Select "Open with Live Server"
6. Browser opens automatically at http://127.0.0.1:5500

METHOD 3 — Run with Python HTTP server
---------------------------------------
1. Open Terminal / Command Prompt
2. Navigate to the Crypto-app/ folder:
   cd path/to/Crypto-app
3. Run one of these commands:

   Python 3:
   python -m http.server 8000

   Python 2:
   python -m SimpleHTTPServer 8000

4. Open your browser and go to:
   http://localhost:8000

================================================================
PAGES AND NAVIGATION
================================================================

Dashboard (index.html)
  - View top 50 cryptocurrencies by market cap
  - Live prices, 24h change, market cap, volume
  - Search by coin name or symbol
  - Auto-refreshes every 60 seconds

Coin Detail (pages/coin.html)
  - Click any coin on the dashboard to open
  - Line and candlestick chart with zoom and pan
  - Time ranges: 24H / 7D / 30D / 90D / 1Y
  - MA20, MA50 indicator overlays
  - RSI and MACD readout cards
  - Drawing tools: trend line, horizontal level, annotation

Portfolio (pages/portfolio.html)
  - Add holdings: search coin, enter amount, buy price, date
  - Live profit/loss calculation at current prices
  - SVG donut chart showing allocation by coin
  - Edit or delete individual holdings
  - Reset button to clear all holdings

Prediction (pages/prediction.html)
  - Select coin, history range, forecast horizon, SMA window
  - Runs linear regression (OLS) and SMA forecasts
  - Side-by-side accuracy metrics: MAE, RMSE, MAPE
  - Model recommendation banner

About (pages/about.html)
  - Feature overview and FAQ accordion

================================================================
DATA SOURCES
================================================================

Primary  : CoinGecko public API
           https://api.coingecko.com/api/v3
           Free tier — rate limited to ~30 calls/minute

Fallback : CoinCap API (chart data only)
           https://api.coincap.io/v2
           Used automatically if CoinGecko rate limits

Chart    : TradingView Lightweight Charts v4.1.3
           Loaded from unpkg CDN

================================================================
DATA STORAGE
================================================================

All data is stored locally in your browser only.
Nothing is sent to any server.

  crypcoin-portfolio  — your portfolio holdings (localStorage)
  crypcoin-theme      — your light/dark preference (localStorage)

To clear portfolio data:
  Portfolio page → Reset button
  OR open browser DevTools → Application → Local Storage → Delete

================================================================
TROUBLESHOOTING
================================================================

Problem  : Dashboard shows no data / loading spinner stuck
Fix      : Use Live Server or Python HTTP server (Method 2/3)
           instead of opening the file directly.

Problem  : "Using backup data source (CoinCap)" warning toast
Fix      : Normal behaviour. CoinGecko rate limit was hit.
           CoinCap data loads automatically. Wait 1 minute
           and try again for full data.

Problem  : Chart does not load on coin detail page
Fix      : Check internet connection. The TradingView library
           is loaded from CDN and requires internet access.

Problem  : Portfolio data disappeared
Fix      : Data is stored in localStorage. Clearing browser
           data or using private/incognito mode will erase it.

Problem  : Prediction page shows "Not enough historical data"
Fix      : Reduce the SMA window size, or choose a longer
           history range (90 days or 1 year).

================================================================
TECHNICAL NOTES
================================================================

- No frameworks used (no React, Vue, jQuery, Bootstrap)
- No build tools (no Webpack, Vite, npm)
- No server-side code (no PHP, Node.js, Python backend)
- Single external library: TradingView Lightweight Charts
  (loaded via CDN, not installed locally)
- All indicators (SMA, EMA, RSI, MACD) implemented from scratch
- All prediction models (OLS, SMA) implemented from scratch
- IIFE pattern used in all 13 JS modules to prevent global
  scope pollution

================================================================
DISCLAIMER
================================================================

CrypCoin is an academic project developed for educational
purposes only (TWT6223 — Web Techniques and Applications).

Price predictions are based on simple statistical models
and historical data only. They do not account for market
news, regulations, or sentiment.

DO NOT use this application as financial advice.

================================================================
