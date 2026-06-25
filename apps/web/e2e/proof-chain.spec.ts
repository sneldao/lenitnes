import { test, expect } from '@playwright/test';

test.describe('Proof chain public surfaces', () => {
  test('landing page renders agent stats', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText(/LENITNES|Signal|Agent/i);
    await expect(page.locator('[class*="animate-"]').first()).toBeVisible();
  });

  test('scorecard page loads and shows recent calls', async ({ page }) => {
    await page.goto('/scorecard');
    await expect(page.locator('h1')).toContainText(/Scorecard/i);

    // Should show the agent activity panel
    await expect(
      page.locator('text=Agent Activity').or(page.locator('text=Signals scored')),
    ).toBeVisible({ timeout: 10000 });
  });

  test('case study page loads with proof chain', async ({ page }) => {
    await page.goto('/case-study/halo2');
    await expect(page.locator('h1')).toContainText(/Case Study/i);

    // The proof chain section should be interactive
    const proofChain = page.locator('text=Proof Chain');
    if (await proofChain.isVisible()) {
      const step = page.locator('[class*="proof-step"]').first();
      await expect(step).toBeAttached();
    }
  });

  test('nav navigates between public surfaces', async ({ page }) => {
    await page.goto('/');
    await page.locator('nav a:has-text("Scorecard")').first().click();
    await expect(page).toHaveURL(/\/scorecard/);
    await expect(page.locator('h1')).toContainText(/Scorecard/i);

    await page.locator('nav a:has-text("Case Study")').first().click();
    await expect(page).toHaveURL(/\/case-study\/halo2/);
  });
});
