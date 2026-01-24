import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, '../../docs/screenshots');

async function takeScreenshots() {
  // Ensure screenshots directory exists
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  console.log('Taking screenshots...');

  // 1. Dashboard with new tiles
  console.log('1. Dashboard...');
  await page.goto('http://localhost:3000');
  await page.waitForSelector('text=Total Posts');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '01-dashboard.png'),
    fullPage: false
  });

  // 2. Header contributor selector - closed
  console.log('2. Header selector (closed)...');
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '02-header-selector-closed.png'),
    clip: { x: 900, y: 0, width: 500, height: 60 }
  });

  // 3. Header contributor selector - open dropdown
  console.log('3. Header selector (open)...');
  await page.click('text=Select contributor');
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '03-header-selector-open.png'),
    clip: { x: 900, y: 0, width: 500, height: 300 }
  });

  // Select a contributor
  await page.click('text=Adi');
  await page.waitForTimeout(300);

  // 4. Header with contributor selected
  console.log('4. Header with contributor selected...');
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '04-header-contributor-selected.png'),
    clip: { x: 900, y: 0, width: 500, height: 60 }
  });

  // 5. Posts list with checkout buttons
  console.log('5. Posts list...');
  await page.goto('http://localhost:3000/posts');
  await page.waitForSelector('text=Posts');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '05-posts-list.png'),
    fullPage: false
  });

  // 6. Posts list filters
  console.log('6. Posts filters...');
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '06-posts-filters.png'),
    clip: { x: 256, y: 100, width: 800, height: 80 }
  });

  // 7. Post detail page
  console.log('7. Post detail...');
  await page.goto('http://localhost:3000/posts/detail?id=mock_warning_1');
  await page.waitForSelector('text=Back');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '07-post-detail.png'),
    fullPage: false
  });

  // 8. Checkout a post
  console.log('8. Checkout button...');
  const checkoutBtn = page.locator('text=Checkout to handle');
  if (await checkoutBtn.isVisible()) {
    await checkoutBtn.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '08-post-checked-out.png'),
    fullPage: false
  });

  // 9. Go back to posts to show checked out badge
  console.log('9. Posts with checkout badge...');
  await page.goto('http://localhost:3000/posts');
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '09-posts-with-checkout-badge.png'),
    fullPage: false
  });

  await browser.close();
  console.log(`\nScreenshots saved to ${SCREENSHOTS_DIR}`);
}

takeScreenshots().catch(console.error);
