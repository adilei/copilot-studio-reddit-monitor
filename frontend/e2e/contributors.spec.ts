import { test, expect } from '@playwright/test';

test.describe('Contributors Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contributors');
    // Wait for page to finish loading (loading state to disappear)
    await page.waitForLoadState('networkidle');
  });

  test('should load contributors page', async ({ page }) => {
    // Wait for loading to finish
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });
    // Use exact match to avoid matching multiple headings
    await expect(page.getByRole('heading', { name: 'Contributors', exact: true })).toBeVisible();
  });

  test('should have add contributor button', async ({ page }) => {
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Add Contributor/i })).toBeVisible();
  });

  test('should show add form when clicking Add Contributor button', async ({ page }) => {
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Add Contributor/i }).click();

    // Form should now be visible
    await expect(page.getByPlaceholder('Name')).toBeVisible();
    await expect(page.getByPlaceholder(/Reddit Handle/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Role/i)).toBeVisible();
  });

  test('should show existing contributors or empty state', async ({ page }) => {
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

    // Look for either contributor cards or empty state message
    const emptyState = page.getByText(/No contributors added yet/i);
    const microsoftContributorsHeading = page.getByText('Microsoft Contributors');

    const isEmpty = await emptyState.isVisible().catch(() => false);
    const hasSection = await microsoftContributorsHeading.isVisible().catch(() => false);

    // Should show either the section or empty state
    expect(isEmpty || hasSection).toBeTruthy();
  });

  test('should hide form when clicking Cancel', async ({ page }) => {
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

    // Open form
    await page.getByRole('button', { name: /Add Contributor/i }).click();
    await expect(page.getByPlaceholder('Name')).toBeVisible();

    // Cancel
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Form should be hidden
    await expect(page.getByPlaceholder('Name')).not.toBeVisible();
  });
});

test.describe('Analytics Page', () => {
  test('should load analytics page', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: /Analytics/i })).toBeVisible();
  });

  test('should display charts or data sections', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    // Look for any chart/data section - sentiment, subreddit, etc.
    const hasContent = await page.locator('svg, canvas, [class*="chart"], [class*="Chart"]').count() > 0 ||
      await page.getByText(/Sentiment|Subreddit|Status/i).count() > 0;

    expect(hasContent).toBeTruthy();
  });
});
