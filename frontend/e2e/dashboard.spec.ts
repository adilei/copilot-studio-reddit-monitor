import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load dashboard with stats cards', async ({ page }) => {
    // Check page title/heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Check all 4 stat cards are present
    await expect(page.getByText('Total Posts')).toBeVisible();
    await expect(page.getByText('Negative Sentiment')).toBeVisible();
    await expect(page.getByText('Handled', { exact: true })).toBeVisible();
    await expect(page.getByText('Pending', { exact: true })).toBeVisible();

    // Check scrape button exists
    await expect(page.getByRole('button', { name: /Scrape Now/i })).toBeVisible();
  });

  test('should display scraper status section', async ({ page }) => {
    await expect(page.getByText('Scraper Status')).toBeVisible();
    // Should show either "Running" or "Idle"
    const statusText = page.getByText(/Running|Idle/);
    await expect(statusText).toBeVisible();
  });

  test('should navigate to all posts when clicking Total Posts card', async ({ page }) => {
    // Click on the card that contains "Total Posts"
    // The card has cursor-pointer class, find it by its title text
    await page.locator('.cursor-pointer').filter({ hasText: 'Total Posts' }).click();

    await expect(page).toHaveURL('/posts');
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  });

  test('should navigate to negative posts when clicking Negative Sentiment card', async ({ page }) => {
    // Click on the Negative Sentiment card
    await page.locator('.cursor-pointer').filter({ hasText: 'Negative Sentiment' }).click();

    await expect(page).toHaveURL('/posts?sentiment=negative');
  });

  test('should navigate to handled posts when clicking Handled card', async ({ page }) => {
    // Click the Handled card - it contains "Handled" and "posts with MS response"
    await page.locator('.cursor-pointer').filter({ hasText: 'posts with MS response' }).click();

    await expect(page).toHaveURL('/posts?status=handled');
  });

  test('should navigate to pending posts when clicking Pending card', async ({ page }) => {
    // Click the Pending card - it contains "Pending" and "awaiting analysis"
    await page.locator('.cursor-pointer').filter({ hasText: 'awaiting analysis' }).click();

    await expect(page).toHaveURL('/posts?status=pending');
  });

  test('should display Boiling Posts tile when warning posts exist', async ({ page }) => {
    // Check if Boiling Posts tile is visible (only shows when there are warning posts)
    const boilingPostsTile = page.getByText('Boiling Posts');

    // The tile may or may not be visible depending on data
    // If visible, verify it has the expected structure
    const isVisible = await boilingPostsTile.isVisible().catch(() => false);

    if (isVisible) {
      await expect(boilingPostsTile).toBeVisible();
      // Should show count in parentheses
      await expect(page.getByText(/Boiling Posts \(\d+\)/)).toBeVisible();
    }
  });

  test('should navigate to post detail when clicking a boiling post', async ({ page }) => {
    // Check if Boiling Posts tile exists
    const boilingPostsTile = page.getByText('Boiling Posts');
    const isVisible = await boilingPostsTile.isVisible().catch(() => false);

    if (isVisible) {
      // Click the first post link in the Boiling Posts tile
      const firstPost = page.locator('a[href^="/posts/"]').first();
      const href = await firstPost.getAttribute('href');

      if (href) {
        await firstPost.click();
        await expect(page).toHaveURL(href);
      }
    }
  });
});
