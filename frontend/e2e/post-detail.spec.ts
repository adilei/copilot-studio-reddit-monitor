import { test, expect } from '@playwright/test';

test.describe('Post Detail Page', () => {
  test('should navigate to post detail when clicking a post title', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Find and click the first post link (links to detail page)
    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    const postExists = await firstPostLink.count() > 0;

    if (!postExists) {
      test.skip();
      return;
    }

    await firstPostLink.click();

    // Should be on a post detail page
    await expect(page).toHaveURL(/\/posts\/detail\/?.*id=/);

    // Detail page should have "Back" button (unique to detail page)
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
  });

  test('should display post content on detail page', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);
    await page.waitForLoadState('networkidle');

    // Check key elements present on detail page
    // Subreddit in format r/something
    const subredditText = page.getByText(/r\/\w+/).first();
    await expect(subredditText).toBeVisible();
  });

  test('should show View on Reddit link on detail page', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);
    await page.waitForLoadState('networkidle');

    // On detail page, there should be exactly one "View on Reddit" link
    const redditLink = page.getByRole('link', { name: /View on Reddit/i });
    await expect(redditLink).toBeVisible();
    // Verify it's a single element (not multiple like on list page)
    expect(await redditLink.count()).toBe(1);
  });

  test('should navigate back when clicking Back button', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);

    // Click Back button (unique to detail page)
    await page.getByRole('button', { name: /Back/i }).click();

    // Should be back on posts list
    await expect(page).toHaveURL(/\/posts/);
  });

  test('should show analysis and sentiment status on detail page', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);
    await page.waitForLoadState('networkidle');

    // Check status labels exist (Analysis, Sentiment, MS Reply, Status)
    await expect(page.getByText('Analysis:')).toBeVisible();
    await expect(page.getByText('Sentiment:')).toBeVisible();
    await expect(page.getByText('MS Reply:')).toBeVisible();
    await expect(page.getByText('Status:')).toBeVisible();
  });

  test('should show Analyze button on detail page', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('button', { name: /Analyze/i })).toBeVisible();
  });

  test('should show resolution section on detail page', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
    if (await firstPostLink.count() === 0) {
      test.skip();
      return;
    }

    await firstPostLink.click();
    await expect(page).toHaveURL(/\/posts\/detail/);
    await page.waitForLoadState('networkidle');

    // Check resolution section exists
    await expect(page.getByText('Resolution:')).toBeVisible();
  });
});

test.describe('Post Detail - Not Found', () => {
  test('should show not found for invalid post ID', async ({ page }) => {
    await page.goto('/posts/detail?id=invalid-post-id-xyz123');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});
