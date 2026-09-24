/** Read-only browser proof: node scripts/audit/public-browser.mjs <origin> <output-directory> [before|public] */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const [base, output, stage = 'public'] = process.argv.slice(2);
if (!base || !output) throw Error('Supply origin and output directory');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
const result = { at: new Date().toISOString(), base, stage, checks: [], errors: [], passed: false };
try {
  for (const width of [1440, 375, ...(stage === 'before' ? [] : [320])]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.on('pageerror', error => result.errors.push(error.message));
    await page.goto(base);
    await page.waitForFunction(() => [...document.querySelectorAll('.orbit-position img')].filter(i => i.complete && i.naturalWidth > 0).length === 10, {}, { timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(output, `${stage}-${width}.png`), fullPage: true });
    result.checks.push(`${width}: all ten catalogue logos decoded; no horizontal overflow`);
    if (stage !== 'before') {
      await page.goto(base + '/#basket');
      await page.locator('.token-button').first().click();
      await page.getByRole('dialog').waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (width === 375) await page.screenshot({ path: join(output, `${stage}-375-detail.png`) });
      await page.keyboard.press('Escape');
      await page.goto(base + '/#rewards');
      await page.getByText('Verified round history is not connected.').waitFor();
      const previous = await page.evaluate(() => ({ hash: location.hash, length: history.length }));
      await page.locator('.skip').focus(); await page.keyboard.press('Enter');
      assert.deepEqual(await page.evaluate(() => ({ hash: location.hash, length: history.length })), previous);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
      result.checks.push(`${width}: token details, unavailable ledger and keyboard skip verified`);
    }
    await page.close();
  }
  assert.deepEqual(result.errors, []); result.passed = true;
} catch (error) { result.failure = String(error.stack); process.exitCode = 1; }
finally { await browser.close(); await writeFile(join(output, `${stage}-browser.json`), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result)); }
