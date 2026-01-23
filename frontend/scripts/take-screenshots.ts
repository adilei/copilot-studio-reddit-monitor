import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';
const SCREENSHOT_DIR = '../docs/screenshots';

async function takeScreenshots() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  console.log('Taking screenshots...');

  // Dashboard
  console.log('1. Dashboard');
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/dashboard.png`, fullPage: true });

  // Posts list
  console.log('2. Posts list');
  await page.goto(`${BASE_URL}/posts`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/posts-list.png`, fullPage: true });

  // Posts with negative filter
  console.log('3. Posts filtered by negative sentiment');
  await page.goto(`${BASE_URL}/posts?sentiment=negative`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/posts-negative.png`, fullPage: true });

  // Post detail (get first post ID)
  console.log('4. Post detail');
  await page.goto(`${BASE_URL}/posts`);
  await page.waitForLoadState('networkidle');
  const firstPostLink = page.locator('a[href^="/posts/"]').first();
  if (await firstPostLink.count() > 0) {
    await firstPostLink.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/post-detail.png`, fullPage: true });
  }

  // Contributors
  console.log('5. Contributors');
  await page.goto(`${BASE_URL}/contributors`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/contributors.png`, fullPage: true });

  // Analytics
  console.log('6. Analytics');
  await page.goto(`${BASE_URL}/analytics`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/analytics.png`, fullPage: true });

  await browser.close();
  console.log('Screenshots saved to docs/screenshots/');
}

takeScreenshots().catch(console.error);
