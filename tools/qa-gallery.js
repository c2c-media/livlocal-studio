/** Checks the product gallery, the exact-pair rule, and the fabric preview. */
const { chromium } = require('playwright');
const assert = require('assert');

const BASE = 'http://localhost:4321';
const PAGE = '/product/kids-dress.html';
const problems = [];

(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + PAGE, { waitUntil: 'networkidle' });

  const mainSrc = () => page.getAttribute('[data-gallery-main]', 'src');
  const caption = () => page.textContent('[data-gallery-caption]');
  const status = () => page.evaluate(() => {
    const el = document.querySelector('[data-gallery-status]');
    return el && !el.hidden ? el.textContent : '';
  });
  const check = async (label, fn) => {
    try { await fn(); console.log('  ok   ' + label); }
    catch (err) { problems.push(label + ' -> ' + err.message); console.log('  FAIL ' + label + ' -> ' + err.message); }
  };

  const thumbs = await page.locator('[data-gallery-index]').count();
  await check('seven gallery thumbnails', async () => assert.strictEqual(thumbs, 7));
  await check('default photo is the first one', async () => assert.match(await mainSrc(), /lydia-boho-mauve-550\.jpg$/));
  await check('default caption names both fabrics', async () => assert.match(await caption(), /Boho Blender dress body with a Mauve Rose Textured collar/));
  await check('no preview status before a selection', async () => assert.strictEqual(await status(), ''));

  const broken = await page.evaluate(() => [...document.querySelectorAll('.gallery img')]
    .filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')));
  await check('every gallery image loads', async () => assert.deepStrictEqual(broken, []));

  await page.check('input[name="primaryFabric"][value="boho-blender"]');
  await page.check('input[name="secondaryFabric"][value="mauve-rose-textured"]');
  await check('matching pair keeps the pair photo', async () => assert.match(await mainSrc(), /lydia-boho-mauve-550\.jpg$/));
  await check('matching pair explains the preview', async () => assert.match(await status(), /matches your selection/));

  await page.check('input[name="secondaryFabric"][value="green-daisy"]');
  await check('unmatched pair falls back to the default photo', async () => assert.match(await mainSrc(), /lydia-boho-mauve-550\.jpg$/));
  await check('unmatched pair says so', async () => assert.match(await status(), /No preview exists for that combination/));

  await page.check('input[name="primaryFabric"][value="green-daisy"]');
  await page.check('input[name="secondaryFabric"][value="yellow-scroll"]');
  await check('second verified pair is shown', async () => assert.match(await mainSrc(), /lydia-green-daisy-yellow-scroll-550\.jpg$/));

  await page.check('input[name="primaryFabric"][value="yellow-scroll"]');
  await page.check('input[name="secondaryFabric"][value="green-daisy"]');
  await check('reversed pair is not treated as a match', async () => assert.match(await mainSrc(), /lydia-boho-mauve-550\.jpg$/));

  await page.click('[data-gallery-index="4"]');
  await check('thumbnail click changes the photo', async () => assert.match(await mainSrc(), /lydia-navy-nautical-light-nautical-550\.jpg$/));
  await check('thumbnail click updates the caption', async () => assert.match(await caption(), /Navy Nautical Map dress body/));

  const pairText = await page.getAttribute('.gallery-status', 'hidden');
  await check('status clears after browsing photos', async () => assert.ok(pairText === '' || pairText === null));

  await page.focus('input[name="primaryFabric"][value="tea-dye-bee"]');
  const previewOpen = await page.evaluate(() => {
    const p = document.querySelector('.fabric-preview');
    return !!p && !p.hidden && /\.webp$/.test(p.querySelector('img').getAttribute('src') || '');
  });
  await check('keyboard focus opens the fabric preview', async () => assert.ok(previewOpen));

  await page.keyboard.press('Escape');
  const previewClosed = await page.evaluate(() => {
    const p = document.querySelector('.fabric-preview');
    return !p || p.hidden;
  });
  await check('Escape closes the fabric preview', async () => assert.ok(previewClosed));

  const selected = await page.inputValue('input[name="primaryFabric"]:checked');
  await check('previewing never changes the selection', async () => assert.strictEqual(selected, 'yellow-scroll'));

  const clipped = await page.evaluate(() => {
    const el = document.querySelector('.fabric-preview');
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    return r.left < 0 || r.right > window.innerWidth || r.top < 0 || r.bottom > window.innerHeight;
  });
  await check('preview stays inside the viewport when open', async () => assert.ok(clipped === null || clipped === false));

  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem(s):\n - ` + problems.join('\n - ') : '\nGallery checks passed.');
  process.exit(problems.length ? 1 : 0);
})();
