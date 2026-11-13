import path from 'path';
import fs from 'fs';

export type PlaywrightOrderResult = {
  success: boolean;
  orderId: string | null;
  screenshotPath: string | null;
  errorMessage: string | null;
};

const DRY_RUN = process.env.PLAYWRIGHT_DRY_RUN === 'true';
const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const SCREENSHOT_DIR = path.join(process.cwd(), 'public', 'screenshots');

function ensureScreenshotDir() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

export async function placeExternalOrder(params: {
  productUrl: string;
  itemName: string;
  quantity: number;
  maxSpendRlusd: number;
  rlusdRateZar: number;
}): Promise<PlaywrightOrderResult> {
  ensureScreenshotDir();
  const screenshotName = `restock_${Date.now()}_${params.itemName.replace(/\s+/g, '_')}.png`;
  const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);

  if (DRY_RUN) {
    return {
      success: true,
      orderId: `DRY-${Date.now()}`,
      screenshotPath: null,
      errorMessage: null,
    };
  }

  let browser: import('playwright').Browser | null = null;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: HEADLESS });
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);

    await page.goto(params.productUrl, { waitUntil: 'networkidle' });

    // Detect CAPTCHA by looking for common indicators
    const pageText = await page.textContent('body');
    if (
      pageText?.toLowerCase().includes('captcha') ||
      pageText?.toLowerCase().includes('robot') ||
      pageText?.toLowerCase().includes('verify you are human')
    ) {
      await page.screenshot({ path: screenshotPath });
      return {
        success: false,
        orderId: null,
        screenshotPath,
        errorMessage: 'CAPTCHA detected — manual intervention required.',
      };
    }

    // Generic order attempt: look for quantity input + add-to-cart button
    const qtyInput = page.locator('input[name*="qty"], input[name*="quantity"], input[type="number"]').first();
    if (await qtyInput.isVisible()) {
      await qtyInput.fill(String(params.quantity));
    }

    const addBtn = page
      .locator(
        'button:has-text("Add to cart"), button:has-text("Buy"), button:has-text("Order"), button:has-text("Purchase")',
      )
      .first();

    if (!(await addBtn.isVisible())) {
      await page.screenshot({ path: screenshotPath });
      return {
        success: false,
        orderId: null,
        screenshotPath,
        errorMessage: 'Could not locate add-to-cart/order button on the page.',
      };
    }

    await addBtn.click();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: screenshotPath });

    // Best-effort order ID extraction from the confirmation page
    const bodyAfter = (await page.textContent('body')) ?? '';
    const orderMatch = bodyAfter.match(/order[#\s:]+([A-Z0-9\-]{5,20})/i);
    const orderId = orderMatch ? orderMatch[1] : null;

    return { success: true, orderId, screenshotPath, errorMessage: null };
  } catch (err) {
    try {
      if (browser) {
        const page = (await browser.contexts()[0]?.pages()) ?? [];
        if (page[0]) await page[0].screenshot({ path: screenshotPath }).catch(() => null);
      }
    } catch {
      // best-effort screenshot
    }
    return {
      success: false,
      orderId: null,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
      errorMessage: (err as Error).message,
    };
  } finally {
    await browser?.close();
  }
}
