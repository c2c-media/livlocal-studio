/** Programmatic stand-ins for eyeballing: text clipping, contrast, asset loads. */
const { chromium } = require('playwright');

const BASE = 'http://localhost:4321';
const PAGES = ['/', '/shop.html', '/about.html', '/faq.html', '/contact.html', '/cart.html',
  '/success.html', '/product/kids-dress.html', '/product/quilted-bag.html'];

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/local/bin/chromium', args: ['--no-sandbox'] });
  const findings = [];

  for (const url of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + url, { waitUntil: 'networkidle' });

    const report = await page.evaluate(() => {
      /* --- contrast helpers --- */
      function parseRGB(str) {
        const m = /rgba?\(([^)]+)\)/.exec(str);
        if (!m) return null;
        const parts = m[1].split(',').map((n) => parseFloat(n));
        return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
      }
      function lum({ r, g, b }) {
        const f = (c) => {
          c /= 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      }
      function bgOf(el) {
        let node = el;
        while (node && node !== document.documentElement) {
          const c = parseRGB(getComputedStyle(node).backgroundColor);
          if (c && c.a > 0.5) return c;
          node = node.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
      }
      function ratio(a, b) {
        const l1 = lum(a), l2 = lum(b);
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      }

      const contrast = [];
      const clipped = [];
      const zeroBox = [];

      document.querySelectorAll('p, h1, h2, h3, a, li, dd, dt, span, button, td, th, label, legend').forEach((el) => {
        if (el.offsetParent === null && el.tagName !== 'BODY') return;
        const text = el.textContent.trim();
        if (!text) return;

        /* clipping / truncation */
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') {
          clipped.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} "${text.slice(0, 24)}"`);
        }

        /* contrast on leaf-ish elements only */
        if (el.children.length === 0) {
          const cs = getComputedStyle(el);
          const fg = parseRGB(cs.color);
          if (!fg) return;
          const size = parseFloat(cs.fontSize);
          const weight = parseInt(cs.fontWeight, 10) || 400;
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          const bg = bgOf(el);
          const r = ratio(fg, bg);
          const min = large ? 3 : 4.5;
          if (r < min) {
            contrast.push(`${el.tagName.toLowerCase()} "${text.slice(0, 26)}" ratio=${r.toFixed(2)} need=${min} size=${size}`);
          }
        }

        /* invisible boxes */
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height === 0) zeroBox.push(`${el.tagName.toLowerCase()} "${text.slice(0, 20)}"`);
      });

      /* background images must resolve */
      const bgs = [...document.querySelectorAll('*')].map((el) => getComputedStyle(el).backgroundImage)
        .filter((v) => v && v.includes('url('))
        .map((v) => (/url\("?([^")]+)"?\)/.exec(v) || [])[1])
        .filter(Boolean);

      return { contrast, clipped: clipped.slice(0, 6), zeroBox: zeroBox.slice(0, 4), bgs: [...new Set(bgs)] };
    });

    report.contrast.slice(0, 5).forEach((c) => findings.push(`contrast ${url}: ${c}`));
    report.clipped.forEach((c) => findings.push(`clipped ${url}: ${c}`));
    report.zeroBox.forEach((c) => findings.push(`zero-height text ${url}: ${c}`));

    for (const bg of report.bgs) {
      if (!bg.startsWith('/')) continue;
      const res = await page.request.get(BASE + bg);
      if (res.status() >= 400) findings.push(`background asset ${url}: ${bg} -> ${res.status()}`);
    }

    await page.close();
  }

  await browser.close();
  console.log('=== VISUAL QA (programmatic) ===');
  if (!findings.length) console.log('No contrast, clipping, zero-height, or asset problems found.');
  else findings.forEach((f) => console.log(' - ' + f));
  console.log(`total findings: ${findings.length}`);
})();
