/* v0.6 dashboard + project management:
 * greeting, new-project flow, page picker subset, persistence/reopen,
 * drag-drop lands in the flow, delete, add-pages-later keeps state.
 */
import { chromium } from 'playwright-core';
import { openPdf, reopenProject } from './helpers.mjs';

const EXE =
  'C:/Users/Nicholas/AppData/Local/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe';
const APP = 'http://localhost:5199/';
const PDF =
  'C:/Users/Nicholas/Desktop/coding/paint-takeoff/friend-examples/2 Drawings - Architectural.pdf';

const errors = [];
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) errors.push(`check failed: ${name}`);
};

const browser = await chromium.launch({ executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(APP, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });

// --- greeting + empty state ---
const greet = await page.locator('.dash-greeting').textContent();
check('greeting renders', /Good (morning|afternoon|evening)/.test(greet ?? ''));
check('subtitle', (await page.locator('.dash-sub').textContent())?.includes('quoting'));
check('New Project button', await page.locator('.big-open-button').isVisible());
check('empty state how-to strip', (await page.locator('.dash-howto-item').count()) === 3);
check('toolbar hidden on dashboard', (await page.locator('.toolbar').count()) === 0);
check('dashboard is full-window', await page.evaluate(() => {
  const d = document.querySelector('.dashboard').getBoundingClientRect();
  return d.width >= window.innerWidth - 20 && d.height >= window.innerHeight - 100;
}));
await page.screenshot({ path: 'dashboard-empty.png' });

// --- create project via New Project button (details step) ---
await page.locator('.big-open-button').click();
await page.waitForSelector('.np-input.big');
await page.fill('.np-input.big', 'Summerville Pines');
await page.locator('.np-input').nth(1).fill('Region of Peel GC');
await page.locator('textarea.np-input').fill('Client wants quick turnaround.');
await page.screenshot({ path: 'new-project.png' });
check('create disabled without a PDF', await page.getByRole('button', { name: 'Create project' }).isDisabled());
await page.setInputFiles('input[type=file]', PDF);
check('pdf attached', (await page.locator('.np-file').textContent())?.includes('.pdf'));

// --- page picker: deselect pages, keep 4 ---
await page.getByRole('button', { name: 'Create project' }).click();
await page.waitForSelector('.picker-modal');
check('picker shows all 11 pages', (await page.locator('.picker-card').count()) === 11);
check('all selected by default', (await page.locator('.picker-card.selected').count()) === 11);
await page.waitForSelector('.picker-card img[src]', { timeout: 30000 }); // thumbs render
// keep pages 1,3,5,7: deselect the others
await page.getByRole('button', { name: 'Select none' }).click();
for (const i of [0, 2, 4, 6]) await page.locator('.picker-card').nth(i).click();
check('4 pages selected', (await page.locator('.picker-card.selected').count()) === 4);
check('footer count', (await page.locator('.picker-footer').textContent())?.includes('4 of 11'));
await page.screenshot({ path: 'page-picker.png' });
await page.locator('.picker-footer .go-button').click();
await page.waitForFunction(() => document.querySelector('.pdf-canvas')?.width > 400, null, { timeout: 60000 });
await page.waitForTimeout(600);
check('viewer shows subset', (await page.locator('.page-label').textContent())?.includes('of 4'));

// set a scale on the first subset page (original page 1) so we can verify
// per-original-page state survives
await page.selectOption('.preset-select', '1:75');
await page.waitForSelector('.modal');
await page.getByRole('button', { name: 'Skip this' }).click();
await page.waitForTimeout(200);
check('scale badge on page 1', (await page.locator('.scale-badge').textContent())?.includes('1:75'));

// --- persistence: reload -> card -> reopen -> state intact ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-card');
const cardText = await page.locator('.dash-card').first().textContent();
check('card shows name/company', cardText?.includes('Summerville Pines') && cardText?.includes('Region of Peel'));
check('card shows page count', cardText?.includes('4 of 11'));
await page.screenshot({ path: 'dashboard-card.png' });
await reopenProject(page);
check('reopen shows subset', (await page.locator('.page-label').textContent())?.includes('of 4'));
check('scale persisted by original page index', (await page.locator('.scale-badge').textContent())?.includes('1:75'));

// --- Pages button: add a page back, state undisturbed ---
await page.getByRole('button', { name: 'Pages', exact: true }).click();
await page.waitForSelector('.picker-modal');
check('picker reopens with current selection', (await page.locator('.picker-card.selected').count()) === 4);
await page.locator('.picker-card').nth(1).click(); // add original page 2
await page.locator('.picker-footer .go-button').click();
await page.waitForTimeout(600);
check('subset now 5 pages', (await page.locator('.page-label').textContent())?.includes('of 5'));
check('page-1 scale still there', (await page.locator('.scale-badge').textContent())?.includes('1:75'));

// --- home return path ---
// measure a wall first so the stats strip has honest data
await page.getByRole('button', { name: 'Measure', exact: true }).click();
const vbox = await page.locator('.viewer').boundingBox();
await page.mouse.click(vbox.x + 400, vbox.y + 300);
await page.mouse.click(vbox.x + 600, vbox.y + 300);
await page.mouse.dblclick(vbox.x + 600, vbox.y + 300);
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Home', exact: true }).click();
await page.waitForSelector('.dash-card');
check('home returns to dashboard', await page.locator('.dash-greeting').isVisible());
check('toolbar hidden after home', (await page.locator('.toolbar').count()) === 0);

// --- stats: single projects pill near the heading ---
check('projects pill', (await page.locator('.dash-count-pill').textContent())?.trim() === '1 project');
check('no stat cards remain', (await page.locator('.stat-card').count()) === 0);

// --- what's new card: shows on version change, dismisses persistently ---
await page.evaluate(() => localStorage.setItem('pt:v1:last-seen-version', '0.5.0'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.whatsnew');
check('whats-new card shows on version change', (await page.locator('.whatsnew').textContent())?.includes('What’s new'));
await page.locator('.whatsnew-dismiss').click();
check('dismiss hides card', (await page.locator('.whatsnew').count()) === 0);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-greeting');
check('dismiss persists across reload', (await page.locator('.whatsnew').count()) === 0);

// --- tips card ---
check('tip renders', ((await page.locator('.dash-tip').textContent()) ?? '').includes('Did you know?'));

await reopenProject(page);
check('reopen after home keeps subset', (await page.locator('.page-label').textContent())?.includes('of 5'));

// --- delete project ---
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-card');
await page.locator('.dash-delete').first().click();
await page.waitForSelector('.modal');
check('delete confirm copy', (await page.locator('.modal-text').textContent())?.includes('measurements go with it'));
await page.getByRole('button', { name: 'Delete project' }).click();
await page.waitForTimeout(300);
check('project deleted', (await page.locator('.dash-card').count()) === 0);

// --- drag-drop onto dashboard lands in the flow ---
const dtHandle = await page.evaluateHandle(() => {
  const dt = new DataTransfer();
  dt.items.add(new File(['%PDF-1.4 fake'], 'dropped-plan.pdf', { type: 'application/pdf' }));
  return dt;
});
await page.dispatchEvent('body', 'dragover', { dataTransfer: dtHandle });
check('drop veil shows', await page.locator('.drop-veil').isVisible());
await page.dispatchEvent('body', 'drop', { dataTransfer: dtHandle });
await page.waitForSelector('.np-input.big', { timeout: 10000 });
check('drop lands in new-project flow', await page.locator('.np-input.big').isVisible());
check('name prefilled from dropped file', (await page.locator('.np-input.big').inputValue()) === 'dropped-plan');
await page.screenshot({ path: 'dashboard-dropped.png' });

// --- search appears with >6 projects and filters ---
await page.keyboard.press('Escape'); // close the new-project modal
await page.locator('.modal-actions .tool').first().click().catch(() => {});
await page.waitForSelector('.dash-greeting');
await page.evaluate(() => {
  const fake = (i) => ({
    id: `fake-${i}`, name: `Project ${i}`, company: i === 3 ? 'Summerville GC' : 'Other Co',
    notes: '', fingerprint: 'fake', pages: [0], numPages: 1, createdAt: Date.now(), modifiedAt: Date.now(),
  });
  const existing = JSON.parse(localStorage.getItem('pt:v1:projects') ?? '[]');
  localStorage.setItem('pt:v1:projects', JSON.stringify([...existing, ...Array.from({ length: 7 }, (_, i) => fake(i))]));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.dash-search');
check('search box appears with >6 projects', true);
await page.fill('.dash-search', 'Summerville');
await page.waitForTimeout(200);
check('search filters to matches', (await page.locator('.dash-card').count()) === 1 &&
  (await page.locator('.dash-card').first().textContent())?.includes('Summerville'));
await page.screenshot({ path: 'dashboard-search.png' });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
