import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

// Helper to ensure a contributor exists via API
async function ensureContributorExists(request: any, name: string, redditHandle: string): Promise<number> {
  const response = await request.get(`${API_BASE}/api/contributors`);
  const contributors = await response.json();
  const existing = contributors.find((c: any) => c.reddit_handle === redditHandle);
  if (existing) {
    return existing.id;
  }

  const createResponse = await request.post(`${API_BASE}/api/contributors`, {
    data: { name, reddit_handle: redditHandle, role: 'Test Contributor' },
  });

  if (!createResponse.ok()) {
    const text = await createResponse.text();
    throw new Error(`Failed to create contributor: ${createResponse.status()} ${text}`);
  }

  const created = await createResponse.json();
  return created.id;
}

// Helper to select a user from the sidebar dropdown
async function selectContributorFromSidebar(page: any, userName: string) {
  const selectTrigger = page.getByRole('button', { name: /Select contributor|Not selected/i });
  await selectTrigger.click();
  await page.waitForTimeout(150);
  await page.keyboard.type(userName.slice(0, 10), { delay: 50 });
  await page.waitForTimeout(100);
  const menuitem = page.getByRole('menuitem', { name: new RegExp(userName, 'i') });
  await menuitem.evaluate((el: HTMLElement) => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.click();
  });
}

test.describe('Contributors Page', () => {
  test.beforeAll(async ({ request }) => {
    // Ensure we have a test contributor for clicking buttons
    await ensureContributorExists(request, 'E2E Test Contributor', 'e2etestcontrib');
  });

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

    // Must select a contributor first to enable the button
    await selectContributorFromSidebar(page, 'E2E Test Contributor');
    await page.goto('/contributors');
    await page.waitForLoadState('networkidle');

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

    // Must select a contributor first to enable the button
    await selectContributorFromSidebar(page, 'E2E Test Contributor');
    await page.goto('/contributors');
    await page.waitForLoadState('networkidle');

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
