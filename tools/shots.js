/** Renders the built site to PNGs for review. Run: node tools/shots.js */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = path.join(__dirname, '..', 'previews');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/local/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  async function shot(name, url, { width = 1440, height = 900, full = true, before } = {}) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const failed = [];
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    if (before) await before(page);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full });
    if (errors.length) console.log(`[${name}] console errors:`, errors.slice(0, 5));
    if (failed.length) console.log(`[${name}] failed requests:`, failed.slice(0, 5));
    await page.close();
  }

  await shot('01-home-desktop', '/');
  await shot('02-shop-desktop', '/shop.html');
  await shot('03-product-desktop', '/product/kids-dress.html');
  await shot('04-faq-desktop', '/faq.html');
  await shot('05-cart-desktop', '/cart.html', {
    before: async (page) => {
      await page.evaluate(() => {
        localStorage.setItem('livlocal.cart.v1', JSON.stringify([
          { id: 'a', slug: 'kids-dress', name: 'Handmade Kids Dress', price: 4500, qty: 1,
            options: [
              { key: 'size', value: '12-18m', label: '12 to 18 months', fieldLabel: 'Size' },
              { key: 'primaryFabric', value: 'fabric-02', label: 'Fabric 02', fieldLabel: 'Primary fabric' },
              { key: 'secondaryFabric', value: 'fabric-05', label: 'Fabric 05', fieldLabel: 'Secondary fabric' }
            ] },
          { id: 'b', slug: 'bible-bag', name: 'Bible Bag', price: 0, qty: 1,
            options: [
              { key: 'primaryFabric', value: 'fabric-06', label: 'Fabric 06', fieldLabel: 'Primary fabric' },
              { key: 'secondaryFabric', value: 'fabric-10', label: 'Fabric 10', fieldLabel: 'Secondary fabric' }
            ] }
        ]));
      });
      await page.reload({ waitUntil: 'networkidle' });
    },
  });
  await shot('06-about-desktop', '/about.html');
  await shot('07-contact-desktop', '/contact.html');
  await shot('08-product-mobile', '/product/kids-dress.html', { width: 390, height: 844 });
  await shot('09-home-mobile', '/', { width: 390, height: 844 });
  await shot('10-404-desktop', '/nope.html', { full: false });
  await shot('11-cancel-desktop', '/cancel.html', { full: false });
  await shot('12-success-desktop', '/success.html', { full: false });

  await browser.close();
  console.log('Screenshots written to previews/');
})();
