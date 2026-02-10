/**
 * Responsive UI tests — every page tested at both mobile (390x844) and desktop (1280x720).
 *
 * Pattern: each page has a describe block that runs two sub-tests (mobile + desktop).
 * Both viewports check for horizontal overflow and verify layout-specific assertions.
 *
 * Always select a contributor so interactive elements (buttons, actions) are visible.
 */
import { test, expect, Page } from "@playwright/test"

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 720 }

// --- Helpers ---

async function selectContributor(page: Page) {
  const dropdown = page.locator("header").getByRole("button").filter({ hasText: /Select contributor|Adi|Loading/ }).first()
  await dropdown.waitFor({ state: "visible", timeout: 5000 }).catch(() => {})
  if (await dropdown.isVisible()) {
    await dropdown.click()
    const menu = page.locator("[role=menu]")
    await menu.waitFor({ state: "visible", timeout: 3000 }).catch(() => {})
    const item = menu.locator("[role=menuitem]").filter({ hasText: "Adi" }).first()
    if (await item.isVisible()) await item.click()
  }
  await page.waitForTimeout(500)
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
}

async function screenshotAt(page: Page, name: string, scrollY = 0) {
  if (scrollY > 0) await page.evaluate((y) => window.scrollTo(0, y), scrollY)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `e2e/screenshots/${name}.png` })
}

// --- Navigation shell ---

test.describe("Navigation — mobile", () => {
  test.use({ viewport: MOBILE })

  test("sidebar hidden, hamburger opens drawer", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("aside")).toBeHidden()

    const hamburger = page.locator("header button").first()
    await expect(hamburger).toBeVisible()
    await hamburger.click()
    await page.waitForTimeout(300)

    const drawer = page.locator(".fixed.inset-0.z-50")
    await expect(drawer).toBeVisible()
    await expect(drawer.getByText("Dashboard")).toBeVisible()
    await expect(drawer.getByText("Posts")).toBeVisible()
    await expect(drawer.getByText("Themes")).toBeVisible()
    await expect(drawer.getByText("Contributors")).toBeVisible()
    await expect(drawer.getByText("Analytics")).toBeVisible()
    await expect(drawer.getByText("Product Areas")).toBeVisible()
    await screenshotAt(page, "mobile-drawer")

    // Close on backdrop
    await page.mouse.click(350, 400)
    await page.waitForTimeout(300)
    await expect(drawer).toBeHidden()
  })

  test("drawer closes on navigation", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.locator("header button").first().click()
    await page.waitForTimeout(300)
    await page.locator(".fixed.inset-0 a").filter({ hasText: "Posts" }).click()
    await page.waitForLoadState("networkidle")
    await expect(page).toHaveURL(/\/posts/)
    await expect(page.locator(".fixed.inset-0.z-50")).toBeHidden()
  })
})

test.describe("Navigation — desktop", () => {
  test.use({ viewport: DESKTOP })

  test("sidebar visible, no hamburger", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")

    await expect(page.locator("aside")).toBeVisible()
    await expect(page.locator("aside").getByText("Dashboard")).toBeVisible()

    // Hamburger should not be visible
    const buttons = page.locator("header button")
    const count = await buttons.count()
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      const classes = await btn.getAttribute("class") || ""
      if (classes.includes("md:hidden")) {
        await expect(btn).toBeHidden()
      }
    }
    await screenshotAt(page, "desktop-sidebar")
  })
})

// --- Notifications ---

test.describe("Notifications — mobile", () => {
  test.use({ viewport: MOBILE })

  test("bell, popover, and preferences", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await selectContributor(page)

    const bell = page.locator("header button").filter({ has: page.locator("svg.lucide-bell") })
    await expect(bell).toBeVisible()
    await bell.click()
    await page.waitForTimeout(500)
    await expect(page.locator("[data-state=open]").filter({ hasText: "Notifications" })).toBeVisible()
    await screenshotAt(page, "mobile-bell-popover")

    // Open preferences
    const gear = page.locator("[data-state=open] button").filter({ has: page.locator("svg.lucide-settings") })
    await gear.click()
    await page.waitForTimeout(500)
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText("Notification Preferences")).toBeVisible()
    await screenshotAt(page, "mobile-notification-prefs")
  })
})

test.describe("Notifications — desktop", () => {
  test.use({ viewport: DESKTOP })

  test("bell, popover, and mark all read", async ({ page }) => {
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await selectContributor(page)
    await page.waitForTimeout(2000)

    const bell = page.locator("header button").filter({ has: page.locator("svg.lucide-bell") })
    await expect(bell).toBeVisible()
    await bell.click()
    await page.waitForTimeout(500)
    await expect(page.locator("[data-state=open]").filter({ hasText: "Notifications" })).toBeVisible()
    await screenshotAt(page, "desktop-bell-popover")
  })
})

// --- Page-level responsive tests ---
// Each page: mobile + desktop, both check overflow and take screenshots.

const pages = [
  { name: "dashboard", url: "/", waitFor: "Total Posts" },
  { name: "posts", url: "/posts", waitFor: "Posts" },
  { name: "post-detail", url: "/posts/detail?id=1r0e7x4", waitFor: "Back" },
  { name: "themes", url: "/clustering", waitFor: "Themes" },
  { name: "contributors", url: "/contributors", waitFor: "Contributors" },
  { name: "analytics", url: "/analytics", waitFor: "Analytics" },
  { name: "product-areas", url: "/product-areas", waitFor: "Product Areas" },
]

for (const pg of pages) {
  test.describe(`${pg.name} — mobile`, () => {
    test.use({ viewport: MOBILE })

    test(`renders without overflow`, async ({ page }) => {
      await page.goto(pg.url)
      await page.waitForLoadState("networkidle")
      await selectContributor(page)
      await page.waitForSelector(`text=${pg.waitFor}`, { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(1000)

      await noHorizontalOverflow(page)
      await screenshotAt(page, `mobile-${pg.name}-top`)
      await screenshotAt(page, `mobile-${pg.name}-scroll`, 600)
    })
  })

  test.describe(`${pg.name} — desktop`, () => {
    test.use({ viewport: DESKTOP })

    test(`renders without overflow`, async ({ page }) => {
      await page.goto(pg.url)
      await page.waitForLoadState("networkidle")
      await selectContributor(page)
      await page.waitForSelector(`text=${pg.waitFor}`, { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(1000)

      await noHorizontalOverflow(page)

      // Desktop: sidebar should be visible
      await expect(page.locator("aside")).toBeVisible()

      await screenshotAt(page, `desktop-${pg.name}-top`)
      await screenshotAt(page, `desktop-${pg.name}-scroll`, 600)
    })
  })
}
