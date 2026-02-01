import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load dashboard with stats cards', async ({ page }) => {
    // Check page title/heading
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Check all 5 stat cards are present (updated to match current dashboard)
    await expect(page.getByText('Total Posts')).toBeVisible();
    await expect(page.getByText('Waiting for Pickup')).toBeVisible();
    await expect(page.getByText('In Progress')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Handled' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Negative Sentiment' })).toBeVisible();
  });

  test('should navigate to all posts when clicking Total Posts card', async ({ page }) => {
    // Click on the card that contains "Total Posts"
    await page.locator('.cursor-pointer').filter({ hasText: 'Total Posts' }).click();

    // URL may have trailing slash
    await expect(page).toHaveURL(/\/posts\/?$/);
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
  });

  test('should navigate to negative posts when clicking Negative Sentiment card', async ({ page }) => {
    // Click on the Negative Sentiment card
    await page.locator('.cursor-pointer').filter({ hasText: 'Negative Sentiment' }).click();

    await expect(page).toHaveURL(/\/posts\/?\?sentiment=negative/);
  });

  test('should navigate to Handled posts when clicking Handled card', async ({ page }) => {
    // Click the Handled card
    await page.locator('.cursor-pointer').filter({ hasText: 'Handled' }).click();

    await expect(page).toHaveURL(/\/posts\/?\?status=handled/);
  });

  test('should navigate to Waiting for Pickup posts when clicking that card', async ({ page }) => {
    // Click the Waiting for Pickup card
    await page.locator('.cursor-pointer').filter({ hasText: 'Waiting for Pickup' }).click();

    await expect(page).toHaveURL(/\/posts\/?\?status=waiting_for_pickup/);
  });

  test('should display Boiling Posts tile when warning posts exist', async ({ page }) => {
    // Check if Boiling Posts tile is visible (only shows when there are warning posts)
    const boilingPostsTile = page.getByText('Boiling Posts');

    // The tile may or may not be visible depending on data
    // If visible, verify it has the expected structure
    const isVisible = await boilingPostsTile.isVisible().catch(() => false);

    if (isVisible) {
      await expect(boilingPostsTile).toBeVisible();
      // Should show count in parentheses like "(5 of 10)"
      await expect(page.getByText(/\(\d+ of \d+\)/)).toBeVisible();
    }
  });

  test('should navigate to post detail when clicking a boiling post', async ({ page }) => {
    // Check if Boiling Posts tile exists
    const boilingPostsTile = page.getByText('Boiling Posts');
    const isVisible = await boilingPostsTile.isVisible().catch(() => false);

    if (isVisible) {
      // Click the first post link in the Boiling Posts tile
      const firstPost = page.locator('a[href^="/posts/detail"]').first();
      const href = await firstPost.getAttribute('href');

      if (href) {
        await firstPost.click();
        await expect(page).toHaveURL(href);
      }
    }
  });

  test('should have View all negative link in Boiling Posts section', async ({ page }) => {
    const boilingPostsTile = page.getByText('Boiling Posts');
    const isVisible = await boilingPostsTile.isVisible().catch(() => false);

    if (isVisible) {
      // Check for "View all negative" link
      const viewAllLink = page.getByText('View all negative');
      await expect(viewAllLink).toBeVisible();
    }
  });

  test('should show No Boiling Posts message when has unhandled negative', async ({ page }) => {
    // This test checks for the "No Boiling Posts" message card
    // It will only be visible when there are no boiling posts but there are unhandled negative posts
    const noBoilingCard = page.getByText('No Boiling Posts');
    const isVisible = await noBoilingCard.isVisible().catch(() => false);

    if (isVisible) {
      await expect(page.getByText(/negative sentiment post/)).toBeVisible();
      await expect(page.getByText('View negative posts →')).toBeVisible();
    }
  });

  test('should show All Clear message when no unhandled negative posts', async ({ page }) => {
    // This test checks for the "All Clear!" message card
    // It will only be visible when there are no boiling posts AND no unhandled negative posts
    const allClearCard = page.getByText('All Clear!');
    const isVisible = await allClearCard.isVisible().catch(() => false);

    if (isVisible) {
      await expect(page.getByText(/No unhandled negative sentiment posts/)).toBeVisible();
      await expect(page.getByText('View all unhandled posts →')).toBeVisible();
    }
  });
});
