import { test, expect } from '@playwright/test';

test.describe('Posts - Basic Page Load', () => {
  test('should load posts page with header and filters', async ({ page }) => {
    await page.goto('/posts');

    // Page structure loads
    await expect(page.getByRole('heading', { name: 'Posts' })).toBeVisible();

    // Has filter controls (2 dropdowns + search) - Status and Sentiment
    const dropdowns = page.getByRole('combobox');
    expect(await dropdowns.count()).toBe(2);
    await expect(page.getByPlaceholder('Search posts...')).toBeVisible();
    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();

    // Has filter labels
    await expect(page.getByText('Status')).toBeVisible();
    await expect(page.getByText('Sentiment')).toBeVisible();
  });

  test('should display posts or empty message', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Either posts are shown or empty message
    const postLinks = page.locator('a[href^="/posts/detail"]');
    const emptyMessage = page.getByText(/No posts found/i);

    const hasLinks = await postLinks.count() > 0;
    const hasEmptyMessage = await emptyMessage.isVisible().catch(() => false);

    expect(hasLinks || hasEmptyMessage).toBeTruthy();
  });
});

test.describe('Posts - Filtering Workflow', () => {
  test('can filter by sentiment via dropdown and posts update', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Click Sentiment dropdown (second combobox)
    const sentimentDropdown = page.getByRole('combobox').nth(1);
    await sentimentDropdown.click();

    // Select negative option
    await page.getByRole('option', { name: /Negative/i }).click();
    await page.waitForLoadState('networkidle');

    // Dropdown should now show Negative
    await expect(page.getByRole('combobox').nth(1)).toContainText('Negative');

    // Clear filters should appear
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();
  });

  test('can filter by status via dropdown', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Click Status dropdown (first combobox)
    const statusDropdown = page.getByRole('combobox').first();
    await statusDropdown.click();

    // Select "In Progress" option
    await page.getByRole('option', { name: /In Progress/i }).click();
    await page.waitForLoadState('networkidle');

    // Dropdown should now show In Progress
    await expect(page.getByRole('combobox').first()).toContainText('In Progress');

    // Clear filters should appear
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();
  });

  test('sentiment filter from URL param is applied', async ({ page }) => {
    await page.goto('/posts?sentiment=negative');
    await page.waitForLoadState('networkidle');

    // The sentiment dropdown should reflect the filter
    await expect(page.getByRole('combobox').nth(1)).toContainText('Negative');
  });

  test('status filter from URL param is applied', async ({ page }) => {
    await page.goto('/posts?status=handled');
    await page.waitForLoadState('networkidle');

    // The status dropdown should reflect the filter
    await expect(page.getByRole('combobox').first()).toContainText('Handled');
  });

  test('can clear filters after applying them', async ({ page }) => {
    await page.goto('/posts?sentiment=negative');
    await page.waitForLoadState('networkidle');

    // Clear filters button should be visible
    const clearBtn = page.getByRole('button', { name: /Clear filters/i });
    await expect(clearBtn).toBeVisible();

    await clearBtn.click();
    await page.waitForLoadState('networkidle');

    // Clear button should disappear
    await expect(clearBtn).not.toBeVisible();

    // Dropdowns should reset to "All" variants
    await expect(page.getByRole('combobox').first()).toContainText('All Posts');
    await expect(page.getByRole('combobox').nth(1)).toContainText('All');
  });

  test('can search posts by text', async ({ page }) => {
    await page.goto('/posts');

    const searchInput = page.getByPlaceholder('Search posts...');
    await searchInput.fill('copilot');

    // Wait for debounced search
    await page.waitForTimeout(500);
    await page.waitForLoadState('networkidle');

    // Clear filters should appear when search is active
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();
  });
});

test.describe('Posts - Navigation Workflow', () => {
  test('can navigate to post detail from list', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const postLinks = page.locator('a[href^="/posts/detail"]');
    const count = await postLinks.count();

    if (count > 0) {
      // Click first post
      await postLinks.first().click();

      // Should navigate to detail page (with optional trailing slash)
      await expect(page).toHaveURL(/\/posts\/detail\/?.*id=/);

      // Detail page should have back button
      await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
    }
  });

  test('can navigate back from post detail', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    const postLinks = page.locator('a[href^="/posts/detail"]');
    const count = await postLinks.count();

    if (count > 0) {
      await postLinks.first().click();
      await expect(page).toHaveURL(/\/posts\/detail/);

      // Click back
      await page.getByRole('button', { name: /Back/i }).click();

      // Should be back on posts list
      await expect(page).toHaveURL(/\/posts/);
    }
  });
});

test.describe('Posts - Dashboard Integration', () => {
  test('clicking Total Posts card navigates to posts page', async ({ page }) => {
    await page.goto('/');

    // Click Total Posts card
    await page.locator('.cursor-pointer').filter({ hasText: /Total Posts/i }).click();

    // Should navigate to posts page
    await expect(page).toHaveURL(/\/posts/);
  });

  test('clicking Negative Sentiment card navigates with filter', async ({ page }) => {
    await page.goto('/');

    await page.locator('.cursor-pointer').filter({ hasText: /Negative Sentiment/i }).click();

    // Should navigate with sentiment filter
    await expect(page).toHaveURL(/sentiment=negative/);
  });

  test('clicking Handled card navigates with status filter', async ({ page }) => {
    await page.goto('/');

    await page.locator('.cursor-pointer').filter({ hasText: /Handled/i }).click();

    // Should navigate with status filter
    await expect(page).toHaveURL(/status=handled/);
  });

  test('clicking Waiting for Pickup card navigates with status filter', async ({ page }) => {
    await page.goto('/');

    await page.locator('.cursor-pointer').filter({ hasText: /Waiting for Pickup/i }).click();

    // Should navigate with status filter
    await expect(page).toHaveURL(/status=waiting_for_pickup/);
  });
});

test.describe('Posts - Status Filter Options', () => {
  test('status filter dropdown includes all workflow states', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Click status dropdown
    const statusDropdown = page.getByRole('combobox').first();
    await statusDropdown.click();

    // Should have all workflow status options
    await expect(page.getByRole('option', { name: /All Posts/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Waiting for Pickup/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /In Progress/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /Handled/i })).toBeVisible();
  });

  test('can filter by Handled status', async ({ page }) => {
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // Click status dropdown
    const statusDropdown = page.getByRole('combobox').first();
    await statusDropdown.click();

    // Select Handled
    await page.getByRole('option', { name: /Handled/i }).click();
    await page.waitForLoadState('networkidle');

    // Dropdown should now show Handled
    await expect(page.getByRole('combobox').first()).toContainText('Handled');

    // Clear filters should be visible
    await expect(page.getByRole('button', { name: /Clear filters/i })).toBeVisible();
  });

  test('handled status filter from URL param is applied', async ({ page }) => {
    await page.goto('/posts?status=handled');
    await page.waitForLoadState('networkidle');

    // Status dropdown should show Handled
    await expect(page.getByRole('combobox').first()).toContainText('Handled');
  });
});
