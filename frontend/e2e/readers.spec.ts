import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

// Helper to create a reader via API
async function ensureReaderExists(request: any, name: string, alias: string): Promise<number> {
  // First check if reader already exists
  const response = await request.get(`${API_BASE}/api/contributors?include_readers=true`);
  const contributors = await response.json();
  const existing = contributors.find((c: any) => c.microsoft_alias === alias);
  if (existing) {
    return existing.id;
  }

  // Create the reader
  const createResponse = await request.post(`${API_BASE}/api/contributors/readers`, {
    data: { name, microsoft_alias: alias, role: 'Test Reader' },
  });

  if (!createResponse.ok()) {
    const text = await createResponse.text();
    throw new Error(`Failed to create reader: ${createResponse.status()} ${text}`);
  }

  const created = await createResponse.json();
  return created.id;
}

// Helper to create a contributor via API
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
async function selectUserFromSidebar(page: any, userName: string) {
  // The Radix UI Select renders as a button - find by placeholder text or current value
  // Look for buttons in the header/banner area that control user selection
  const selectTrigger = page.getByRole('button', { name: /Select contributor|Not selected/i });
  await selectTrigger.click();

  // Wait for dropdown animation to settle
  await page.waitForTimeout(150);

  // Type to filter/search for the user (Radix Select supports type-ahead)
  await page.keyboard.type(userName.slice(0, 10), { delay: 50 });
  await page.waitForTimeout(100);

  // Find the menuitem and click it
  const menuitem = page.getByRole('menuitem', { name: new RegExp(userName, 'i') });

  // Use dispatchEvent to click instead of normal click (works around viewport issues)
  await menuitem.evaluate((el: HTMLElement) => {
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    el.click();
  });
}

test.describe('Reader Permissions', () => {
  let readerId: number;
  let contributorId: number;

  test.beforeAll(async ({ request }) => {
    // Ensure we have a test reader and contributor
    readerId = await ensureReaderExists(request, 'E2E Test Reader', 'e2etestreader');
    contributorId = await ensureContributorExists(request, 'E2E Test Contributor', 'e2etestcontrib');
  });

  test.describe('Reader selected', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // Select the reader from sidebar
      await selectUserFromSidebar(page, 'E2E Test Reader');
    });

    test('reader can view dashboard', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
      // Dashboard stats should be visible
      await expect(page.getByRole('heading', { name: 'Total Posts' })).toBeVisible();
    });

    test('reader can view posts list', async ({ page }) => {
      await page.goto('/posts');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /Posts/i })).toBeVisible();
    });

    test('reader cannot checkout a post - button disabled', async ({ page }) => {
      await page.goto('/posts');
      await page.waitForLoadState('networkidle');

      // Navigate to first post
      const firstPostLink = page.locator('a[href^="/posts/detail"]').first();
      if (await firstPostLink.count() === 0) {
        test.skip();
        return;
      }

      await firstPostLink.click();
      await expect(page).toHaveURL(/\/posts\/detail/);
      await page.waitForLoadState('networkidle');

      // Look for checkout button - it should either be disabled or not present for checked-out posts
      const checkoutButton = page.getByRole('button', { name: /Checkout to handle/i });
      const isVisible = await checkoutButton.isVisible().catch(() => false);

      if (isVisible) {
        // Button should be disabled for readers
        await expect(checkoutButton).toBeDisabled();
      }
      // If not visible, post might already be checked out - that's OK
    });

    test('reader cannot resolve a post - button disabled', async ({ page }) => {
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

      // Check for Mark as Done button
      const resolveButton = page.getByRole('button', { name: /Mark as Done/i });
      const isVisible = await resolveButton.isVisible().catch(() => false);

      if (isVisible) {
        await expect(resolveButton).toBeDisabled();
      }
      // If not visible, post might already be resolved - check for "Reopen" which should also be disabled
      const reopenButton = page.getByRole('button', { name: /Reopen/i });
      const reopenVisible = await reopenButton.isVisible().catch(() => false);
      if (reopenVisible) {
        await expect(reopenButton).toBeDisabled();
      }
    });

    test('reader cannot analyze a post - button disabled', async ({ page }) => {
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

      // Analyze button should be disabled for readers
      const analyzeButton = page.getByRole('button', { name: /Analyze/i });
      await expect(analyzeButton).toBeVisible();
      await expect(analyzeButton).toBeDisabled();
    });

    test('reader sees permission message instead of action buttons', async ({ page }) => {
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

      // Should see some indication that user is a reader and can't perform actions
      // This could be in tooltip or visible text
      const permissionText = page.getByText(/reader|cannot|view.only/i);
      const hasPermissionMessage = await permissionText.count() > 0;

      // If Mark as Done is not visible, there should be a message
      const resolveButton = page.getByRole('button', { name: /Mark as Done/i });
      const buttonVisible = await resolveButton.isVisible().catch(() => false);

      if (!buttonVisible) {
        // Should show permission reason text
        await expect(page.getByText(/reader|select.*contributor/i).first()).toBeVisible();
      }
    });

    test('reader can view contributors page', async ({ page }) => {
      await page.goto('/contributors');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'Contributors', exact: true })).toBeVisible();
    });

    test('reader cannot add contributor - button disabled', async ({ page }) => {
      await page.goto('/contributors');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

      const addContributorButton = page.getByRole('button', { name: /Add Contributor/i });
      await expect(addContributorButton).toBeVisible();
      await expect(addContributorButton).toBeDisabled();
    });

    test('reader cannot add reader - button disabled', async ({ page }) => {
      await page.goto('/contributors');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

      const addReaderButton = page.getByRole('button', { name: /Add Reader/i });
      await expect(addReaderButton).toBeVisible();
      await expect(addReaderButton).toBeDisabled();
    });

    test('reader can view analytics page', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /Analytics/i })).toBeVisible();
    });

    test('reader can view themes page', async ({ page }) => {
      await page.goto('/themes');
      await page.waitForLoadState('networkidle');
      // May show empty state or themes
      const hasContent = await page.getByText(/Pain Point|Theme|Cluster/i).count() > 0;
      expect(hasContent).toBeTruthy();
    });

    test('reader can view post detail page', async ({ page }) => {
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

      // Should see post content (title, subreddit, author)
      await expect(page.getByText(/r\/\w+/).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
    });

    test('reader can view product areas page', async ({ page }) => {
      await page.goto('/product-areas');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: /Product Areas/i })).toBeVisible();
    });

    test('reader cannot modify product areas - buttons disabled', async ({ page }) => {
      await page.goto('/product-areas');
      await page.waitForLoadState('networkidle');

      // Add Product Area button should be disabled
      const addButton = page.getByRole('button', { name: /Add Product Area/i });
      await expect(addButton).toBeVisible();
      await expect(addButton).toBeDisabled();

      // Edit buttons should be disabled (if any product areas exist)
      const editButtons = page.getByRole('button', { name: '' }).filter({ has: page.locator('svg.lucide-edit, svg.lucide-pencil') });
      const editCount = await editButtons.count();
      if (editCount > 0) {
        await expect(editButtons.first()).toBeDisabled();
      }
    });

    test('reader cannot run clustering analysis - buttons disabled', async ({ page }) => {
      await page.goto('/clustering');
      await page.waitForLoadState('networkidle');

      // Check that clustering action buttons are disabled
      const analyzeNewButton = page.getByRole('button', { name: /Analyze New Posts/i });
      const reanalyzeButton = page.getByRole('button', { name: /Re-analyze All/i });

      // At least one of these should be visible (depends on whether themes exist)
      const analyzeNewVisible = await analyzeNewButton.isVisible().catch(() => false);
      const reanalyzeVisible = await reanalyzeButton.isVisible().catch(() => false);

      if (analyzeNewVisible) {
        await expect(analyzeNewButton).toBeDisabled();
      }
      if (reanalyzeVisible) {
        await expect(reanalyzeButton).toBeDisabled();
      }

      // Check empty state button if visible
      const analyzePostsButton = page.getByRole('button', { name: 'Analyze Posts' });
      const emptyStateVisible = await analyzePostsButton.isVisible().catch(() => false);
      if (emptyStateVisible) {
        await expect(analyzePostsButton).toBeDisabled();
      }
    });

    test('reader cannot edit theme - button disabled', async ({ page }) => {
      await page.goto('/clustering');
      await page.waitForLoadState('networkidle');

      // Find a theme to click on (if any exist)
      const themeButton = page.locator('button').filter({ hasText: /posts$/ }).first();
      const hasThemes = await themeButton.count() > 0;

      if (!hasThemes) {
        test.skip();
        return;
      }

      // Click on the theme to go to detail page
      await themeButton.click();
      await expect(page).toHaveURL(/\/clustering\/theme/);
      await page.waitForLoadState('networkidle');

      // Edit button should be disabled
      const editButton = page.getByRole('button', { name: /Edit/i });
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeDisabled();
    });
  });

  test.describe('Contributor selected (control group)', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      // Select the contributor from sidebar
      await selectUserFromSidebar(page, 'E2E Test Contributor');
    });

    test('contributor can access analyze button (enabled)', async ({ page }) => {
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

      // Analyze button should be enabled for contributors
      const analyzeButton = page.getByRole('button', { name: /Analyze/i });
      await expect(analyzeButton).toBeVisible();
      await expect(analyzeButton).toBeEnabled();
    });

    test('contributor can access resolve button (enabled)', async ({ page }) => {
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

      // Either Mark as Done or Reopen should be enabled
      const resolveButton = page.getByRole('button', { name: /Mark as Done/i });
      const reopenButton = page.getByRole('button', { name: /Reopen/i });

      const resolveVisible = await resolveButton.isVisible().catch(() => false);
      const reopenVisible = await reopenButton.isVisible().catch(() => false);

      if (resolveVisible) {
        await expect(resolveButton).toBeEnabled();
      } else if (reopenVisible) {
        await expect(reopenButton).toBeEnabled();
      }
      // At least one should be visible for contributors
      expect(resolveVisible || reopenVisible).toBeTruthy();
    });

    test('contributor can access product areas add button (enabled)', async ({ page }) => {
      await page.goto('/product-areas');
      await page.waitForLoadState('networkidle');

      const addButton = page.getByRole('button', { name: /Add Product Area/i });
      await expect(addButton).toBeVisible();
      await expect(addButton).toBeEnabled();
    });

    test('contributor can access add contributor button (enabled)', async ({ page }) => {
      await page.goto('/contributors');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

      const addContributorButton = page.getByRole('button', { name: /Add Contributor/i });
      await expect(addContributorButton).toBeVisible();
      await expect(addContributorButton).toBeEnabled();
    });

    test('contributor can access clustering buttons (enabled)', async ({ page }) => {
      await page.goto('/clustering');
      await page.waitForLoadState('networkidle');

      // At least one of the analyze buttons should be enabled
      const analyzeNewButton = page.getByRole('button', { name: /Analyze New Posts/i });
      const reanalyzeButton = page.getByRole('button', { name: /Re-analyze All/i });
      const analyzePostsButton = page.getByRole('button', { name: 'Analyze Posts' });

      const analyzeNewVisible = await analyzeNewButton.isVisible().catch(() => false);
      const reanalyzeVisible = await reanalyzeButton.isVisible().catch(() => false);
      const emptyStateVisible = await analyzePostsButton.isVisible().catch(() => false);

      if (analyzeNewVisible) {
        await expect(analyzeNewButton).toBeEnabled();
      }
      if (reanalyzeVisible) {
        await expect(reanalyzeButton).toBeEnabled();
      }
      if (emptyStateVisible) {
        await expect(analyzePostsButton).toBeEnabled();
      }

      // At least one should be visible and enabled
      expect(analyzeNewVisible || reanalyzeVisible || emptyStateVisible).toBeTruthy();
    });
  });
});

test.describe('Reader Badge Display', () => {
  test('reader shows Reader badge in contributors list', async ({ page, request }) => {
    // Ensure reader exists
    await ensureReaderExists(request, 'E2E Test Reader', 'e2etestreader');

    await page.goto('/contributors');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Loading contributors...')).not.toBeVisible({ timeout: 10000 });

    // Should see Readers section
    await expect(page.getByRole('heading', { name: /Readers/i })).toBeVisible();

    // Reader badge should be visible
    const readerBadges = page.getByText('Reader', { exact: true });
    await expect(readerBadges.first()).toBeVisible();
  });

  test('sidebar shows reader name when reader selected', async ({ page, request }) => {
    await ensureReaderExists(request, 'E2E Test Reader', 'e2etestreader');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Select the reader
    await selectUserFromSidebar(page, 'E2E Test Reader');

    // The select trigger button should now show the reader's name
    const selectButton = page.getByRole('button', { name: /E2E Test Reader/i });
    await expect(selectButton).toBeVisible();
  });
});

test.describe('Contributor Selector Grouping', () => {
  test('dropdown shows both contributors and readers', async ({ page, request }) => {
    // Ensure both reader and contributor exist
    await ensureReaderExists(request, 'E2E Test Reader', 'e2etestreader');
    await ensureContributorExists(request, 'E2E Test Contributor', 'e2etestcontrib');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open the dropdown
    const selectTrigger = page.getByRole('button', { name: /Select contributor|Not selected/i });
    await selectTrigger.click();

    // Wait for dropdown
    await page.waitForTimeout(100);

    // Should see both the contributor (with u/handle) and reader (with u/ empty)
    // Contributor should have a reddit handle visible
    await expect(page.getByRole('menuitem', { name: /E2E Test Contributor.*e2etestcontrib/i })).toBeVisible();

    // Reader should be visible (shows "u/" with empty handle since they're readers)
    await expect(page.getByRole('menuitem', { name: /E2E Test Reader/i })).toBeVisible();
  });
});
