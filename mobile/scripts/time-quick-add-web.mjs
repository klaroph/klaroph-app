/**
 * Times a quick add through the Expo web UI.
 * The in-memory `npm run perf:quick-add` test is a different path.
 *
 *   cd mobile && npx expo start --web --port 8081
 *   node scripts/time-quick-add-web.mjs
 */
import puppeteer from 'puppeteer-core'

const url = process.env.KLARO_WEB_URL ?? 'http://127.0.0.1:8081'
const chrome = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const samples = Number(process.env.KLARO_WEB_SAMPLES ?? 4)

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error))
  })
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await openApp(page)
  await page.locator('aria/Continue').click()
  await page.locator('aria/Start').click()
  await page.locator('[data-testid="home-screen"]').wait()

  const seeded = await page.evaluate(async () => {
    const bench = globalThis.__klaroBench
    if (typeof bench !== 'function') throw new Error('Quick-add bench is not installed.')
    return bench(0)
  })

  const times = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    await page.locator('aria/Add entry').click()
    const amount = page.locator('aria/Amount')
    await amount.wait()
    await amount.fill('12.50')
    await page.locator('[data-testid="quick-add-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="quick-add-sheet"]') == null)
    times.push(performance.now() - started)
  }

  const pulled = await page.evaluate(async () => {
    const pull = globalThis.__klaroPull
    if (typeof pull !== 'function') throw new Error('Pull bench is not installed.')
    return pull(200)
  })
  const afterPull = []
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now()
    await page.locator('aria/Add entry').click()
    const amount = page.locator('aria/Amount')
    await amount.wait()
    await amount.fill('8.00')
    await page.locator('[data-testid="quick-add-save"]').click()
    await page.waitForFunction(() => document.querySelector('[data-testid="quick-add-sheet"]') == null)
    afterPull.push(performance.now() - started)
  }

  await page.locator('aria/Settings').click()
  await page.locator('aria/Sync').wait()
  await new Promise((resolve) => setTimeout(resolve, 800))
  const syncSwitch = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Sync"]')
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })

  const sorted = [...times].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  const report = {
    seeded,
    pulled,
    samples: times.map((time) => Number(time.toFixed(1))),
    medianMs: Number(median.toFixed(1)),
    maxMs: Number(Math.max(...times).toFixed(1)),
    afterPullMs: afterPull.map((time) => Number(time.toFixed(1))),
    syncSwitch,
    pageErrors,
  }
  console.log(JSON.stringify(report, null, 2))
  if (pageErrors.length > 0) process.exitCode = 1
  if (!syncSwitch || syncSwitch.width < 48 || syncSwitch.height < 48) {
    console.error('Sync switch hit box is under 48dp.')
    process.exitCode = 1
  }
} finally {
  await browser.close()
}

async function openApp(page) {
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })
  const ready = await page.evaluate(() => document.body.innerText.includes('Klaro')).catch(() => false)
  if (!ready) {
    await page.reload({ waitUntil: 'networkidle0', timeout: 120000 })
  }
  await page.locator('aria/Continue').wait()
}
