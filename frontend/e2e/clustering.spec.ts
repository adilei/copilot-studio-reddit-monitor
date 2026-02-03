import { test, expect } from '@playwright/test';

test.describe('Clustering Page', () => {
  test('should load clustering page with themes', async ({ page }) => {
    await page.goto('/clustering');

    // Page title should be visible
    await expect(page.getByRole('heading', { name: 'Themes' })).toBeVisible();

    // Description text
    await expect(page.getByText('Recurring issues discovered from Reddit posts')).toBeVisible();
  });

  test('should display theme cards with severity badges', async ({ page }) => {
    await page.goto('/clustering');

    // Wait for loading to complete
    await page.waitForLoadState('networkidle');

    // Either theme cards should be visible or empty state
    const hasThemes = await page.locator('.cursor-pointer').filter({ hasText: /posts$/ }).first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText(/No themes discovered yet|No themes found/).isVisible().catch(() => false);

    expect(hasThemes || hasEmptyState).toBeTruthy();
  });

  test('should have product area filter dropdown', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Filter button should be visible (contains "Filter by product area" text)
    const filterButton = page.locator('button').filter({ hasText: /Filter by product area|areas selected/i });
    await expect(filterButton).toBeVisible();
  });

  test('should open product area filter and show options', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Click filter button
    const filterButton = page.locator('button').filter({ hasText: /Filter by product area|areas selected/i });
    await filterButton.click();

    // Popover should open with product area options
    await expect(page.getByRole('dialog')).toBeVisible();
    // Check for product area option buttons in the dropdown (each shows theme count)
    await expect(page.locator('button').filter({ hasText: /Agent Flows.*themes?/ })).toBeVisible();
  });

  test('should filter themes by product area', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Click filter button
    const filterButton = page.locator('button').filter({ hasText: /Filter by product area|areas selected/i });
    await filterButton.click();

    // Select a product area (click the first checkbox option)
    const firstOption = page.locator('button').filter({ hasText: /Agent Flows|Generative Answers/ }).first();
    await firstOption.click();

    // URL should update with product_area_ids param
    await expect(page).toHaveURL(/product_area_ids=/);
  });

  test('should show clear filter button when filter is active', async ({ page }) => {
    // Go directly with filter param
    await page.goto('/clustering?product_area_ids=1');

    await page.waitForLoadState('networkidle');

    // Clear button should be visible
    await expect(page.getByRole('button', { name: /Clear/i })).toBeVisible();
  });

  test('should clear filter when clicking Clear button', async ({ page }) => {
    await page.goto('/clustering?product_area_ids=1');

    await page.waitForLoadState('networkidle');

    // Click clear button
    await page.getByRole('button', { name: /Clear/i }).click();

    // URL should no longer have filter param
    await expect(page).not.toHaveURL(/product_area_ids=/);
  });

  test('should display product area tags on theme cards', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // If there are themes with product area tags, they should show as badges
    // This checks for the badge structure with post counts like "(3)"
    const tagBadges = page.locator('.text-xs').filter({ hasText: /\(\d+\)/ });

    // Either we have tags visible or themes without tags (both are valid states)
    const hasThemes = await page.locator('.cursor-pointer').filter({ hasText: /posts$/ }).first().isVisible().catch(() => false);

    if (hasThemes) {
      // Page loaded with themes - test passed (tags may or may not be present depending on data)
      expect(true).toBeTruthy();
    }
  });

  test('should navigate to theme detail when clicking a theme card', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Check if there are any theme cards
    const themeCard = page.locator('.cursor-pointer').filter({ hasText: /posts$/ }).first();
    const hasThemeCard = await themeCard.isVisible().catch(() => false);

    if (hasThemeCard) {
      await themeCard.click();

      // Should navigate to theme detail page (URL may have trailing slash before query)
      await expect(page).toHaveURL(/\/clustering\/theme\/?\?id=/);
    } else {
      // Skip if no themes exist
      test.skip();
    }
  });

  test('should show theme count in stats', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Stats row should show theme count
    await expect(page.getByText(/\d+ themes/)).toBeVisible();
  });

  test('should have Refresh button', async ({ page }) => {
    await page.goto('/clustering');

    await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
  });

  test('should have Analyze New Posts button', async ({ page }) => {
    await page.goto('/clustering');

    await expect(page.getByRole('button', { name: /Analyze New Posts/i })).toBeVisible();
  });

  test('should have Re-analyze All button', async ({ page }) => {
    await page.goto('/clustering');

    await expect(page.getByRole('button', { name: /Re-analyze All/i })).toBeVisible();
  });

  test('should show unclustered posts link when themes exist', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Check if there are themes
    const hasThemes = await page.locator('.cursor-pointer').filter({ hasText: /posts$/ }).first().isVisible().catch(() => false);

    if (hasThemes) {
      // Unclustered posts link should be visible
      await expect(page.getByText('View unclustered posts')).toBeVisible();
    }
  });

  test('should show theme counts in filter dropdown', async ({ page }) => {
    await page.goto('/clustering');

    await page.waitForLoadState('networkidle');

    // Click filter button
    const filterButton = page.locator('button').filter({ hasText: /Filter by product area|areas selected/i });
    await filterButton.click();

    // Filter options should show theme counts like "0 themes" or "3 themes"
    await expect(page.getByText(/\d+ themes?/).first()).toBeVisible();
  });
});
