/** Automated QA for the built site: layout, links, images, cart flow. */
const { chromium } = require('playwright');

const BASE = 'http://localhost:4321';
const PAGES = ['/', '/shop.html', '/about.html', '/faq.html', '/contact.html', '/cart.html',
  '/success.html', '/cancel.html', '/404.html', '/product/kids-dress.html',
  '/product/quilted-bag.html', '/product/bible-bag.html'];
const VIEWPORTS = [{ w: 1440, h: 900, tag: 'desktop' }, { w: 390, h: 844, tag: 'mobile' }];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const problems = [];

  for (const vp of VIEWPORTS) {
    for (const url of PAGES) {
      const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h } });
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
      page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
      await page.goto(BASE + url, { waitUntil: 'networkidle' });

      const report = await page.evaluate(() => {
        const de = document.documentElement;
        const overflowX = de.scrollWidth - de.clientWidth;

        // elements sticking out past the right edge of the viewport
        const spill = [];
        document.querySelectorAll('body *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          if (r.right > de.clientWidth + 1.5 && el.offsetParent !== null) {
            spill.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} right=${Math.round(r.right)}`);
          }
        });

        const brokenImages = [];
        document.querySelectorAll('img').forEach((img) => {
          if (img.complete && img.naturalWidth === 0) brokenImages.push(img.getAttribute('src'));
        });

        const missingAlt = [];
        document.querySelectorAll('img:not([alt])').forEach((i) => missingAlt.push(i.getAttribute('src')));

        const emptyButtons = [];
        document.querySelectorAll('a.btn, button').forEach((b) => {
          if (!b.textContent.trim() && !b.getAttribute('aria-label')) emptyButtons.push(b.outerHTML.slice(0, 60));
        });

        // small hit targets
        const small = [];
        document.querySelectorAll('a, button, input, select').forEach((el) => {
          const r = el.getBoundingClientRect();
          const hidden = el.type === 'radio' || el.type === 'checkbox';
          if (hidden) return;
          if (r.height > 0 && r.height < 32 && el.offsetParent !== null) {
            small.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 20)}" h=${Math.round(r.height)}`);
          }
        });

        return { overflowX, spill: spill.slice(0, 6), brokenImages, missingAlt, emptyButtons: emptyButtons.slice(0, 3), small: small.slice(0, 6) };
      });

      const label = `${vp.tag} ${url}`;
      if (report.overflowX > 1) problems.push(`${label}: horizontal overflow ${report.overflowX}px`);
      if (report.spill.length) problems.push(`${label}: elements past right edge -> ${report.spill.join(' | ')}`);
      if (report.brokenImages.length) problems.push(`${label}: broken images ${report.brokenImages.join(', ')}`);
      if (report.missingAlt.length) problems.push(`${label}: img without alt ${report.missingAlt.join(', ')}`);
      if (report.emptyButtons.length) problems.push(`${label}: unlabelled control ${report.emptyButtons.join(', ')}`);
      if (report.small.length) problems.push(`${label}: small hit targets -> ${report.small.join(' | ')}`);
      if (consoleErrors.length) problems.push(`${label}: console errors -> ${consoleErrors.slice(0, 3).join(' | ')}`);

      await page.close();
    }
  }

  /* ------------------------------ internal links ----------------------------- */
  const page = await browser.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const hrefs = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))]
      .filter((h) => h && !h.startsWith('http') && !h.startsWith('mailto') && !h.startsWith('#'))
  );
  for (const h of hrefs) {
    const res = await page.request.get(BASE + h);
    if (res.status() >= 400) problems.push(`dead internal link: ${h} -> ${res.status()}`);
  }
  console.log(`Checked ${hrefs.length} internal links.`);
  await page.close();

  /* ------------------------------- cart + form ------------------------------- */
  const shop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await shop.goto(BASE + '/product/kids-dress.html', { waitUntil: 'networkidle' });
  const priceBefore = await shop.textContent('[data-price-display]');
  await shop.selectOption('select[name="size"]', '6-7y');
  const priceAfter = await shop.textContent('[data-price-display]');
  /* Picking a fabric fills the first slot, then the picker moves to the collar
     on its own, so the second pick needs no Change button. */
  await shop.locator('.swatch-pick').first().click();
  const activeAfterFirst = await shop
    .locator('[data-slot].is-active')
    .getAttribute('data-slot');
  await shop.locator('.swatch').nth(4).locator('.swatch-pick').click();
  const chosen = await shop.evaluate(() => ({
    primary: document.querySelector('input[name="primaryFabric"]:checked')?.value || '',
    secondary: document.querySelector('input[name="secondaryFabric"]:checked')?.value || '',
  }));
  if (activeAfterFirst !== 'secondaryFabric') {
    problems.push(`picker did not advance to the collar slot, stayed on ${activeAfterFirst}`);
  }
  if (!chosen.primary || !chosen.secondary) problems.push('picker did not fill both fabric slots');
  if (chosen.primary && chosen.primary === chosen.secondary) {
    problems.push('both fabric slots took the same fabric');
  }
  console.log('picker:', activeAfterFirst, JSON.stringify(chosen));
  await shop.click('button[type="submit"]');
  await shop.waitForURL('**/cart.html');
  await shop.waitForTimeout(300);

  const cart = await shop.evaluate(() => ({
    lines: document.querySelectorAll('.cart-line').length,
    subtotal: document.getElementById('cart-subtotal')?.textContent,
    opts: [...document.querySelectorAll('.cart-opts span')].map((s) => s.textContent),
    count: document.querySelector('[data-cart-count]')?.textContent,
  }));
  console.log('price display:', priceBefore.trim(), '->', priceAfter.trim());
  console.log('cart after add:', JSON.stringify(cart));
  if (priceBefore.trim() === priceAfter.trim()) problems.push('size change did not update the displayed price');
  if (cart.lines !== 1) problems.push(`expected 1 cart line, got ${cart.lines}`);
  if (cart.subtotal !== '$55') problems.push(`expected subtotal $55, got ${cart.subtotal}`);
  if (cart.opts.length !== 3) problems.push(`expected 3 option lines in cart, got ${cart.opts.length}`);

  /* --------------------------- checkout without a key -------------------------- */
  const res = await shop.request.post(BASE + '/api/create-checkout-session', { data: { items: [] } });
  console.log('checkout endpoint reachable via static server?', res.status(), '(expected 404, API runs only on Azure)');

  await browser.close();

  console.log('\n=== QA SUMMARY ===');
  if (!problems.length) console.log('No problems found.');
  else problems.forEach((p) => console.log(' - ' + p));
  console.log(`total findings: ${problems.length}`);
})();
