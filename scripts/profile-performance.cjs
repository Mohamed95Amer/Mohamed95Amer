// Read-only browser timing probe. It never signs in or mutates application data.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const base = process.argv[2] || "https://getgold.ae";
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    for (const route of [
      "/",
      "/marketplace",
      "/vendors",
      "/live-price",
      "/how-it-works",
    ]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();
      const consoleErrors = [];
      const failedRequests = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("requestfailed", (request) => {
        failedRequests.push(
          `${request.method()} ${request.url()} · ${request.failure()?.errorText ?? "failed"}`,
        );
      });
      await page.addInitScript(() => {
        globalThis.__ggMetrics = { lcp: 0, cls: 0, longTasks: 0 };
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          globalThis.__ggMetrics.lcp =
            entries.at(-1)?.startTime ?? globalThis.__ggMetrics.lcp;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput)
              globalThis.__ggMetrics.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          globalThis.__ggMetrics.longTasks += list.getEntries().length;
        }).observe({ type: "longtask", buffered: true });
      });
      const started = Date.now();
      const response = await page.goto(base + route, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      await page.waitForTimeout(1500);
      const result = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const resources = performance.getEntriesByType("resource");
        return {
          ttfb: Math.round(nav.responseStart),
          dom: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          lcp: Math.round(globalThis.__ggMetrics.lcp),
          cls: Number(globalThis.__ggMetrics.cls.toFixed(4)),
          longTasks: globalThis.__ggMetrics.longTasks,
          requests: resources.length + 1,
          transferKb: Math.round(
            (nav.transferSize +
              resources.reduce(
                (sum, item) => sum + (item.transferSize || 0),
                0,
              )) /
              1024,
          ),
          scriptsKb: Math.round(
            resources
              .filter((item) => item.initiatorType === "script")
              .reduce((sum, item) => sum + (item.transferSize || 0), 0) / 1024,
          ),
        };
      });
      console.log(
        JSON.stringify({
          route,
          status: response?.status(),
          consoleErrors: consoleErrors.length,
          failedRequests: failedRequests.length,
          failures: failedRequests.slice(0, 3),
          wallMs: Date.now() - started,
          ...result,
        }),
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
