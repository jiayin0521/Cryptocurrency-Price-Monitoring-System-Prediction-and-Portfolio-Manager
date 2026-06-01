============================================================
 CrypCoin - Cryptocurrency Price Monitoring System,
            Prediction and Portfolio Manager
============================================================
 Course   : TWT6223 - Web Techniques and Applications
 Student  : Lee Jia Yin
 Student ID: 242UT241HP
============================================================


1. ABOUT
------------------------------------------------------------
CrypCoin is a client-side web application for real-time
cryptocurrency price monitoring, technical analysis, price
prediction, and portfolio management.

It is built with HTML5, CSS3, and vanilla JavaScript only.
There is NO server-side code and NO database. Live market
data is fetched from the CoinGecko public API, and the price
chart uses the TradingView Lightweight Charts library
(loaded from a CDN).


2. REQUIREMENTS
------------------------------------------------------------
- A modern web browser (Google Chrome, Microsoft Edge, or
  Firefox - latest version recommended).
- An active INTERNET CONNECTION is required, because the app
  loads live data from the CoinGecko API and loads the chart
  library from a CDN.
- No installation, build step, or "npm install" is needed.
- The CoinGecko demo API key is already included in the code
  (js/api.js), so no API key setup is required.


3. HOW TO RUN
------------------------------------------------------------
RECOMMENDED METHOD - Run from a simple local web server
(this avoids any browser restrictions and is the most
reliable way to view the app):

  Option A - Using Node.js (if installed):
     1. Open a terminal/command prompt in this folder
        (the folder that contains index.html).
     2. Run:   npx serve
     3. Open the URL shown in the terminal in your browser
        (for example: http://localhost:3000).

  Option B - Using Python (if installed):
     1. Open a terminal/command prompt in this folder.
     2. Run:   python -m http.server 8000
     3. Open in your browser:   http://localhost:8000

  Option C - Using VS Code:
     1. Install the "Live Server" extension.
     2. Right-click index.html -> "Open with Live Server".

QUICK ALTERNATIVE - Open directly:
  You can also simply double-click "index.html" to open it in
  your browser. This works in most cases, but if any page or
  chart fails to load, please use the local server method
  above instead.

After the app opens, use the top navigation bar to move
between Dashboard, Portfolio, Prediction, and About pages.


4. FOLDER STRUCTURE
------------------------------------------------------------
  index.html                Dashboard (start here)
  css/
    styles.css              All styling (single stylesheet)
  js/
    theme.js                Light / dark theme manager
    utils.js                Shared helper functions
    api.js                  CoinGecko API wrapper (+ fallback)
    dashboard.js            Dashboard page logic
    chart.js                Chart engine + drawing tools
    coin.js                 Coin detail page logic
    indicators.js           SMA, EMA, RSI, MACD
    prediction.js           OLS regression + SMA forecast
    prediction-page.js      Prediction page controller
    storage.js              Portfolio localStorage layer
    portfolio-render.js     Portfolio DOM rendering
    portfolio.js            Portfolio state + events
    about.js                About / Help page logic
  pages/
    coin.html               Coin detail page
    portfolio.html          Portfolio page
    prediction.html         Prediction page
    about.html              About and Help page


5. NOTES
------------------------------------------------------------
- My portfolio holdings and your light/dark theme choice
  are saved in the browser's localStorage, so they persist
  after you close and reopen the app on the same browser.
- Chart drawings (trend lines, levels, annotations) are
  session-only by design and are cleared when the page
  reloads.
- CoinGecko's free tier may occasionally rate-limit very
  frequent requests. If data does not appear, please wait a
  few seconds and refresh - the app caches responses for
  5 minutes to reduce this.
- Best viewed on Chrome/Edge. The layout is responsive and
  also works on mobile screen sizes.
============================================================
