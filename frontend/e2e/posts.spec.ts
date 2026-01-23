import { test, expect } from '@playwright/test';

test.describe('Posts List', () => {
  test('should load posts page', async ({ page }) => {
    await page.goto('/posts');

    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();
    await expect(page.getByText('Browse and manage scraped Reddit posts')).toBeVisible();
  });

  test('should display filter dropdowns and search', async ({ page }) => {
    await page.goto('/posts');

    // Check filter dropdowns exist
    await expect(page.getByRole('combobox').first()).toBeVisible(); // Status
    await expect(page.getByRole('combobox').nth(1)).toBeVisible(); // Sentiment
    await expect(page.getByPlaceholder('Search posts...')).toBeVisible();
  });

  test('should have refresh button', async ({ page }) => {
    await page.goto('/posts');

    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  });
});

test.describe('Posts Filtering', () => {
  test('should filter by status when using dropdown', async ({ page }) => {
    await page.goto('/posts');

    // Open status dropdown and select "Handled"
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Handled' }).click();

    // Wait for posts to load
    await page.waitForLoadState('networkidle');

    // Verify dropdown shows Handled
    await expect(page.getByRole('combobox').first()).toContainText('Handled');
  });

  test('should filter by sentiment when using dropdown', async ({ page }) => {
    await page.goto('/posts');

    // Open sentiment dropdown and select "Negative"
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: 'Negative' }).click();

    // Wait for posts to load
    await page.waitForLoadState('networkidle');

    // Verify dropdown shows Negative
    await expect(page.getByRole('combobox').nth(1)).toContainText('Negative');
  });

  test('sentiment dropdown should have correct options', async ({ page }) => {
    await page.goto('/posts');

    // Open sentiment dropdown
    await page.getByRole('combobox').nth(1).click();

    // Verify options exist (warning is NOT a sentiment option - it's a flag)
    await expect(page.getByRole('option', { name: 'All Sentiment' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Positive' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Neutral' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Negative' })).toBeVisible();
  });

  test('should apply status filter from URL params on page load', async ({ page }) => {
    // Navigate directly to filtered URL
    await page.goto('/posts?status=handled');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Status dropdown should show "Handled"
    const statusDropdown = page.getByRole('combobox').first();
    await expect(statusDropdown).toContainText('Handled');
  });

  test('should apply sentiment filter from URL params', async ({ page }) => {
    await page.goto('/posts?sentiment=negative');

    await page.waitForLoadState('networkidle');

    // Sentiment dropdown should show "Negative"
    const sentimentDropdown = page.getByRole('combobox').nth(1);
    await expect(sentimentDropdown).toContainText('Negative');
  });

  test('should show clear filters button when filters are active', async ({ page }) => {
    await page.goto('/posts?status=pending');

    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible();
  });

  test('should clear filters when clicking clear button', async ({ page }) => {
    await page.goto('/posts?status=pending&sentiment=negative');

    await page.getByRole('button', { name: 'Clear filters' }).click();

    // Wait for reload
    await page.waitForLoadState('networkidle');

    // Dropdowns should reset
    await expect(page.getByRole('combobox').first()).toContainText('All Status');
    await expect(page.getByRole('combobox').nth(1)).toContainText('All Sentiment');

    // Clear filters button should disappear
    await expect(page.getByRole('button', { name: 'Clear filters' })).not.toBeVisible();
  });
});

test.describe('Posts Filter Correctness', () => {
  test('pending filter should only show pending posts or empty list', async ({ page }) => {
    await page.goto('/posts?status=pending');
    await page.waitForLoadState('networkidle');

    // Wait a moment for posts to load
    await page.waitForTimeout(500);

    // Check if there are any posts displayed
    const postCards = page.locator('a[href^="/posts/"]');
    const postCount = await postCards.count();

    if (postCount > 0) {
      // If posts exist, they should all have "pending" status badge
      const pendingBadges = page.locator('text=pending').filter({ hasText: /^pending$/ });
      const analyzedBadges = page.getByText('analyzed', { exact: true });
      const handledBadges = page.getByText('handled', { exact: true });

      // Should not have analyzed or handled posts
      expect(await analyzedBadges.count()).toBe(0);
      expect(await handledBadges.count()).toBe(0);
    } else {
      // Empty list is valid for pending filter
      const emptyMessage = page.getByText(/No posts found/i);
      await expect(emptyMessage).toBeVisible();
    }
  });

  test('analyzed filter should only show analyzed posts', async ({ page }) => {
    await page.goto('/posts?status=analyzed');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const postCards = page.locator('a[href^="/posts/"]');
    const postCount = await postCards.count();

    if (postCount > 0) {
      // All visible posts should have "analyzed" badge
      const pendingBadges = page.getByText('pending', { exact: true });
      expect(await pendingBadges.count()).toBe(0);
    }
  });
});

test.describe('Posts Navigation from Dashboard', () => {
  test('clicking Handled card should navigate to handled posts', async ({ page }) => {
    // Start at dashboard
    await page.goto('/');

    // Click the Handled card
    await page.locator('.cursor-pointer').filter({ hasText: 'posts with MS response' }).click();

    // Should navigate to posts with handled filter
    await expect(page).toHaveURL('/posts?status=handled');

    // Wait for posts to load
    await page.waitForLoadState('networkidle');

    // Status dropdown should show "Handled"
    await expect(page.getByRole('combobox').first()).toContainText('Handled');
  });

  test('clicking Negative Sentiment card should navigate to negative posts', async ({ page }) => {
    await page.goto('/');

    // Click the Negative Sentiment card
    await page.locator('.cursor-pointer').filter({ hasText: 'Negative Sentiment' }).click();

    await expect(page).toHaveURL('/posts?sentiment=negative');
    await page.waitForLoadState('networkidle');

    // Sentiment dropdown should show "Negative"
    await expect(page.getByRole('combobox').nth(1)).toContainText('Negative');
  });

  test('clicking Pending card should navigate to pending posts', async ({ page }) => {
    await page.goto('/');

    // Click the Pending card
    await page.locator('.cursor-pointer').filter({ hasText: 'awaiting analysis' }).click();

    await expect(page).toHaveURL('/posts?status=pending');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('combobox').first()).toContainText('Pending');
  });
});
