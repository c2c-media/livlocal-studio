/** Builds the curated preview images used in the Notion project page. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:4321';
const OUT = path.join(__dirname, '..', 'previews');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] });

  async function clip(name, url, selector, pad = 40, width = 1440) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    if (url === '/cart.html') {
      await page.evaluate(() => {
        localStorage.setItem('livlocal.cart.v1', JSON.stringify([
          { id: 'a', slug: 'kids-dress', name: 'The Lydia Dress', price: 4500, qty: 1,
            options: [
              { key: 'size', value: '12-18m', label: '12 to 18 months', fieldLabel: 'Size' },
              { key: 'primaryFabric', value: 'boho-blender', label: 'Boho Blender Cotton Calico Fabric', fieldLabel: 'Dress body fabric' },
              { key: 'secondaryFabric', value: 'cream-sunflower', label: 'Cream Sunflower Cotton Calico Fabric', fieldLabel: 'Collar fabric' }] },
          { id: 'b', slug: 'bible-bag', name: 'Bible Bag', price: 0, qty: 1,
            options: [
              { key: 'primaryFabric', value: 'homespun-plaid', label: 'Homespun Plaid Cotton Fabric', fieldLabel: 'Primary fabric' },
              { key: 'secondaryFabric', value: 'tiny-pink-hearts', label: 'Tiny Pink Hearts Cotton Calico Fabric', fieldLabel: 'Secondary fabric' }] }
        ]));
      });
      await page.reload({ waitUntil: 'networkidle' });
    }
    // Scroll the target into view first: a clipped screenshot must sit inside the viewport.
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const box = await page.locator(selector).first().boundingBox();
    const x = Math.max(0, box.x - pad);
    const y = Math.max(0, box.y - pad);
    await page.screenshot({
      path: path.join(OUT, name + '.jpg'),
      type: 'jpeg', quality: 88,
      clip: { x, y, width: Math.min(width - x, box.width + pad * 2), height: Math.min(1000 - y, box.height + pad * 2) },
    });
    await page.close();
    console.log('wrote', name + '.jpg');
  }

  await clip('preview-1-home', '/', '.hero', 0);
  await clip('preview-2-shop', '/shop.html', '#shop-grid', 30);
  await clip('preview-3-product-options', '/product/kids-dress.html', '.buy', 30);
  await clip('preview-4-cart', '/cart.html', '#cart-filled', 30);
  await clip('preview-5-fabrics', '/', '.fabric-strip', 40);
  await clip('preview-6-price-table', '/', '.price-table', 40);

  await browser.close();
})();
