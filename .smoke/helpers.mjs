/* Shared helpers for the smoke suites (v0.6+: everything opens through
 * the project flow — New Project → page picker → viewer). */

/** Open a PDF through the full project flow (all pages selected). */
export async function openPdf(page, pdfPath, { timeout = 60000 } = {}) {
  await page.setInputFiles('input[type=file]', pdfPath);
  await page.waitForSelector('.modal .np-input.big', { timeout: 15000 });
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.waitForSelector('.picker-modal', { timeout: 30000 });
  await page.locator('.picker-footer .go-button').click();
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout });
  await page.waitForTimeout(500);
}

/** Reopen the (single) project from the dashboard after a reload. */
export async function reopenProject(page, { timeout = 60000 } = {}) {
  await page.waitForSelector('.dash-card', { timeout: 15000 });
  await page.locator('.dash-card').first().click();
  await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout });
  await page.waitForTimeout(500);
}
