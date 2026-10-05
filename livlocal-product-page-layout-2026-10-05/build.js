/**
 * LivLocal static site generator.
 * Reads content.json and writes the complete site into ./dist.
 * No runtime dependencies. Run: node build.js
 */
const fs = require('fs');
const path = require('path');
const content = require('./content.json');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SITE = content.site;

/* ---------------------------------- helpers --------------------------------- */

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 4000 -> "$40", 4550 -> "$45.50" */
const money = (cents) => {
  if (cents == null) return '';
  const v = cents / 100;
  return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
};

const productBySlug = (slug) => content.products.find((p) => p.slug === slug);
const productHref = (p) => `/product/${p.slug}.html`;
const categoryLabel = (id) =>
  (content.categories.find((c) => c.id === id) || { label: 'Shop' }).label;

const priceFrom = (p) => {
  if (p.price != null) return p.price;
  const size = (p.options || []).find((o) => o.type === 'select');
  if (size) return Math.min(...size.values.map((v) => v.price).filter((n) => n != null));
  return null;
};

/* ----------------------------------- icons ---------------------------------- */

const ICON = {
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  scissors: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 7.4 20 18M8 16.6 20 6"/></svg>',
  spool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v16H8z"/><path d="M6 4h12M6 20h12M8 9h8M8 15h8"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z"/></svg>',
  mark: '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="3" width="26" height="26" rx="7" stroke="currentColor" stroke-width="2.2"/><path d="M9 16h14" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3 3" stroke-linecap="round"/></svg>',
};

/* ---------------------------------- layout ---------------------------------- */

const NAV = [
  { href: '/shop.html', label: 'Shop' },
  { href: '/about.html', label: 'About' },
  { href: '/faq.html', label: 'Sizing & Shipping' },
  { href: '/contact.html', label: 'Contact' },
];

function header(active) {
  const links = NAV.map(
    (n) =>
      `<a class="nav-link${active === n.href ? ' is-active' : ''}" href="${n.href}"${
        active === n.href ? ' aria-current="page"' : ''
      }>${esc(n.label)}</a>`
  ).join('');
  return `<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/" aria-label="${esc(SITE.name)} home">
      <span class="brand-mark">${ICON.mark}</span>
      <span class="brand-text">${esc(SITE.name)}</span>
    </a>
    <nav class="site-nav" aria-label="Main">
      ${links}
      <a class="nav-link" href="/cart.html">Cart<span class="cart-count" data-cart-count hidden>0</span></a>
    </nav>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-nav" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="mobile-nav" id="mobile-nav" hidden>
    <div class="wrap">
      ${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
      <a href="/cart.html">Cart</a>
    </div>
  </div>
</header>`;
}

function footer() {
  const year = new Date().getFullYear();
  const social = [
    SITE.instagram ? `<a href="${esc(SITE.instagram)}" rel="noopener">Instagram</a>` : '',
    SITE.facebook ? `<a href="${esc(SITE.facebook)}" rel="noopener">Facebook</a>` : '',
  ]
    .filter(Boolean)
    .join('');
  return `<footer class="site-footer">
  <div class="wrap footer-inner">
    <div class="footer-col footer-brand">
      <span class="brand-text">${esc(SITE.name)}</span>
      <p>${esc(content.copy.tagline)}.</p>
    </div>
    <div class="footer-col">
      <h3>Shop</h3>
      ${content.products.map((p) => `<a href="${productHref(p)}">${esc(p.name)}</a>`).join('')}
      <a href="/shop.html">Everything</a>
    </div>
    <div class="footer-col">
      <h3>Help</h3>
      <a href="/faq.html">Sizing &amp; shipping</a>
      <a href="/faq.html#returns">Returns</a>
      <a href="/contact.html">Contact</a>
      ${social}
    </div>
  </div>
  <div class="wrap footer-base">
    <p>&copy; ${year} ${esc(SITE.name)}. ${esc(SITE.location)}.</p>
    <p class="footer-note">Prices in USD.</p>
  </div>
</footer>`;
}

function layout({ title, description, body, active = '', bodyClass = '' }) {
  const fullTitle = title ? `${title} | ${SITE.name}` : `${SITE.name} | ${content.copy.tagline}`;
  const canonical = SITE.siteUrl.replace(/\/$/, '') + (active || '/');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || content.copy.heroSub)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description || content.copy.heroSub)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(SITE.siteUrl.replace(/\/$/, ''))}/assets/img/hero.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#9C4A32">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: SITE.name,
    description: content.copy.heroSub,
    email: SITE.contactEmail,
    address: { '@type': 'PostalAddress', addressLocality: 'Ottumwa', addressRegion: 'IA', addressCountry: 'US' },
    url: SITE.siteUrl,
  }).replace(/</g, '\\u003c')}</script>
</head>
<body class="${esc(bodyClass)}">
${header(active)}
<main id="main">
${body}
</main>
${footer()}
<script src="/main.js" defer></script>
</body>
</html>`;
}

/* ------------------------------ shared fragments ---------------------------- */

/* --------------------------- product photography --------------------------- */

/** File paths for one square product photo in assets/img/lydia. */
function photoSet(slug, dir = '/assets/img/lydia/') {
  return {
    jpg: `${dir}${slug}.jpg`,
    jpg550: `${dir}${slug}-550.jpg`,
    webp: `${dir}${slug}.webp`,
    webp550: `${dir}${slug}-550.webp`,
    thumb: `${dir}${slug}-thumb.jpg`,
  };
}

/** Square gallery when a product has photos, otherwise the drawn fabric tile. */
function productMedia(p) {
  const images = p.images || [];
  if (!images.length) {
    return `<div class="product-media">
        ${tile(p, 'tile--lg')}
        <p class="media-note">Product photo coming soon. Every piece is made to order, so your fabric pairing is the real thing.</p>
      </div>`;
  }
  const dir = p.imageDir || '/assets/img/lydia/';
  const first = images[0];
  const set = photoSet(first.slug, dir);
  const sizes = '(min-width: 900px) 540px, 92vw';
  const payload = images.map((im) => ({
    slug: im.slug,
    alt: im.alt,
    caption: im.caption,
    kind: im.kind || 'preview',
  }));
  return `<div class="product-media">
      <div class="gallery" data-gallery data-image-dir="${esc(dir)}" data-pairs="${esc(JSON.stringify(p.imagePairs || []))}" data-images="${esc(JSON.stringify(payload))}">
        <div class="gallery-frame">
        <figure class="gallery-stage">
          <picture>
            <source data-gallery-webp type="image/webp" srcset="${esc(set.webp550)} 550w, ${esc(set.webp)} 1100w" sizes="${sizes}">
            <img data-gallery-main class="gallery-main" src="${esc(set.jpg550)}" srcset="${esc(set.jpg550)} 550w, ${esc(set.jpg)} 1100w" sizes="${sizes}" width="1100" height="1100" alt="${esc(first.alt)}" decoding="async">
          </picture>
        </figure>
        <ul class="gallery-thumbs" data-gallery-thumbs>
          ${images
            .map(
              (im, i) =>
                `<li><button type="button" class="gallery-thumb${
                  i === 0 ? ' is-active' : ''
                }" data-gallery-index="${i}" aria-pressed="${
                  i === 0
                }" aria-label="Show photo ${i + 1} of ${images.length}: ${esc(
                  im.alt
                )}"><img src="${esc(photoSet(im.slug, dir).thumb)}" alt="" width="240" height="240" loading="lazy" decoding="async"></button></li>`
            )
            .join('')}
        </ul>
        </div>
        <div class="gallery-meta">
          <p class="gallery-status" data-gallery-status role="status" aria-live="polite" hidden></p>
        </div>
      </div>
    </div>`;
}

/** CSS-drawn fabric tile used until real product photos exist. */
function tile(p, size = '') {
  const tint = { 'kids-clothing': 'clay', bags: 'sage', 'bible-bags': 'gold' }[p.category] || 'clay';
  return `<div class="tile tile--${tint} ${size}" aria-hidden="true">
      <span class="tile-weave"></span>
    </div>`;
}

function productCard(p) {
  const from = priceFrom(p);
  return `<article class="card">
    <a class="card-media" href="${productHref(p)}" aria-label="${esc(p.name)}">
      ${
        (p.images || []).length
          ? `<img class="card-img" src="${esc(
              photoSet(p.images[0].slug, p.imageDir).jpg550
            )}" alt="${esc(p.images[0].alt)}" width="550" height="550" loading="lazy" decoding="async">`
          : tile(p)
      }
    </a>
    <div class="card-body">
      <p class="card-cat">${esc(categoryLabel(p.category))}</p>
      <h3 class="card-title"><a href="${productHref(p)}">${esc(p.name)}</a></h3>
      <p class="card-price">${from != null ? `From ${money(from)}` : esc(p.priceLabel)}</p>
    </div>
  </article>`;
}

/* ------------------------ fabric picker (product pages) --------------------- */

/** Grid names stay to three words; the full name lives in the slot and magnifier. */
function shortFabricName(name) {
  let base = name;
  for (const tail of [' Cotton Calico Fabric', ' Cotton Fabric', ' Fabric']) {
    if (base.endsWith(tail)) {
      base = base.slice(0, -tail.length);
      break;
    }
  }
  const tokens = base.split(' ');
  const out = [];
  let words = 0;
  for (const token of tokens) {
    if (token === '&') {
      if (words) out.push(token);
      continue;
    }
    if (words === 3) break;
    out.push(token);
    words += 1;
  }
  while (out.length && out[out.length - 1] === '&') out.pop();
  const text = out.join(' ');
  return out.length < tokens.length ? `${text}\u2026` : text;
}

const PATTERN_ORDER = ['Solid', 'Check & gingham', 'Plaid', 'Stripes', 'Floral', 'Novelty'];
const COLOR_ORDER = ['Light', 'Dark', 'Blue', 'Green', 'Orange', 'Pink', 'Purple', 'Red', 'Yellow'];

/** Colour and pattern chips, counted from the library and shown in a fixed order. */
function pickerRows(fabrics) {
  const colors = new Map();
  const patterns = new Map();
  fabrics.forEach((f) => {
    (f.colors || []).forEach((c) => colors.set(c, (colors.get(c) || 0) + 1));
    if (f.pattern) patterns.set(f.pattern, (patterns.get(f.pattern) || 0) + 1);
  });
  return {
    colors,
    patterns,
    colorOrder: COLOR_ORDER.filter((c) => colors.has(c)),
    patternOrder: PATTERN_ORDER.filter((p) => patterns.has(p))
  };
}

function chipRow(values, counts, allLabel) {
  return [
    `<button type="button" class="filter is-active" data-value="" aria-pressed="true">${esc(allLabel)}</button>`,
    ...values.map(
      (v) =>
        `<button type="button" class="filter" data-value="${esc(v)}" aria-pressed="false">${esc(
          v
        )} (${counts.get(v)})</button>`
    )
  ].join('');
}

function fabricTile(f) {
  return `<div class="swatch" data-id="${esc(f.id)}" data-name="${esc(f.name)}" data-hex="${esc(
    f.hex
  )}"${f.sku ? ` data-sku="${esc(f.sku)}"` : ''}${
    f.colors && f.colors.length ? ` data-colors="${esc(f.colors.join('|'))}"` : ''
  }${f.pattern ? ` data-pattern="${esc(f.pattern)}"` : ''}${
    f.image ? ` data-image="${esc(f.image)}"` : ''
  }>
      <button type="button" class="swatch-pick" aria-pressed="false" aria-label="Use ${esc(
        f.name
      )}">
        <span class="swatch-chip" style="--chip:${esc(f.hex)};${
          f.image ? `--chip-image:url('${esc(f.image)}')` : ''
        }" aria-hidden="true"></span>
        <span class="swatch-name">${esc(shortFabricName(f.name))}</span>
      </button>
      ${
        f.image
          ? `<button type="button" class="swatch-zoom" data-zoom aria-label="Preview the ${esc(
              f.name
            )}"><span aria-hidden="true">&#8981;</span></button>`
          : ''
      }
    </div>`;
}

/** Two pinned slots plus one panel, shared by every fabric option on the page. */
function fabricPicker(swatchOpts, fabrics) {
  const rows = pickerRows(fabrics);
  const slots = swatchOpts
    .map((opt, i) => {
      const label = opt.label.replace(/\s*fabric$/i, '');
      return `    <button type="button" class="slot${i === 0 ? ' is-active' : ''}" data-slot="${esc(
        opt.key
      )}"${opt.help ? ` data-help="${esc(opt.help)}"` : ''} aria-pressed="${
        i === 0 ? 'true' : 'false'
      }" aria-controls="fabric-picker-panel">
      <span class="slot-chip" data-slot-chip aria-hidden="true"></span>
      <span class="slot-text">
        <span class="slot-label">${esc(label)}</span>
        <span class="slot-name" data-slot-name>Choose a fabric</span>
      </span>
      <span class="slot-change">Change</span>
    </button>`;
    })
    .join('\n');

  const inputs = swatchOpts
    .map(
      (opt) => `  <fieldset class="opt picker-inputs" data-opt="${esc(opt.key)}">
    <legend class="sr-only">${esc(opt.label)}</legend>
    ${fabrics
      .map((f) => `<input type="radio" name="${esc(opt.key)}" value="${esc(f.id)}">`)
      .join('')}
  </fieldset>`
    )
    .join('\n');

  return `<div class="picker" data-picker>
  <div class="picker-slots">
${slots}
  </div>
  <p class="picker-help" data-picker-help></p>
${inputs}
  <section class="picker-panel" id="fabric-picker-panel" aria-label="Fabric picker">
    <label class="sr-only" for="fabric-search">Search fabrics by name, color, or SKU</label>
    <input type="search" class="fabric-search" id="fabric-search" data-search placeholder="Search name, color, or SKU" autocomplete="off">
    <p class="picker-row-label" id="picker-pattern-label">Pattern</p>
    <div class="filters" role="group" aria-labelledby="picker-pattern-label" data-pattern-row>${chipRow(
      rows.patternOrder,
      rows.patterns,
      `All ${fabrics.length}`
    )}</div>
    <p class="picker-row-label" id="picker-color-label">Color</p>
    <div class="filters" role="group" aria-labelledby="picker-color-label" data-color-row>${chipRow(
      rows.colorOrder,
      rows.colors,
      'All colors'
    )}</div>
    <p class="picker-row-label">All fabrics</p>
    <div class="swatches" data-grid>
      ${fabrics.map(fabricTile).join('\n      ')}
    </div>
    <p class="picker-empty" data-empty>No fabrics match. Clear the search or choose another color.</p>
    <div class="picker-foot">
      <p class="fabric-status" data-status role="status"></p>
      <button type="button" class="picker-reset" data-reset>Start over</button>
    </div>
  </section>
</div>`;
}

function sizeFieldset(opt) {
  const groups = [...new Set(opt.values.map((v) => v.group).filter(Boolean))];
  const options = groups.length
    ? groups
        .map(
          (g) =>
            `<optgroup label="${esc(g)}">` +
            opt.values
              .filter((v) => v.group === g)
              .map(
                (v) =>
                  `<option value="${esc(v.id)}" data-price="${v.price}">${esc(v.label)} &middot; ${money(v.price)}</option>`
              )
              .join('') +
            `</optgroup>`
        )
        .join('')
    : opt.values
        .map(
          (v) =>
            `<option value="${esc(v.id)}" data-price="${v.price == null ? '' : v.price}">${esc(v.label)}${
              v.price != null ? ` &middot; ${money(v.price)}` : ''
            }</option>`
        )
        .join('');

  return `<div class="opt">
  <label class="opt-label" for="opt-${esc(opt.key)}">${esc(opt.label)}<span class="req" aria-hidden="true">*</span></label>
  ${opt.help ? `<p class="opt-help">${esc(opt.help)}</p>` : ''}
  <div class="select-wrap">
    <select id="opt-${esc(opt.key)}" name="${esc(opt.key)}" required>${options}</select>
  </div>
</div>`;
}

/* ----------------------------------- pages ---------------------------------- */

function home() {
  const featured = content.products.slice(0, 3);
  const sizes = content.products[0].options.find((o) => o.type === 'select').values;
  const tiers = [];
  sizes.forEach((s) => {
    const last = tiers[tiers.length - 1];
    if (last && last.price === s.price) last.items.push(s);
    else tiers.push({ price: s.price, items: [s] });
  });

  const body = `
<section class="hero">
  <div class="hero-media" aria-hidden="true"></div>
  <div class="wrap hero-inner">
    ${content.copy.heroEyebrow ? `<p class="eyebrow">${esc(content.copy.heroEyebrow)}</p>` : ''}
    <h1>${esc(content.copy.heroHeadline)}</h1>
    <p class="hero-sub">${esc(content.copy.heroSub)}</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="${esc(content.copy.heroPrimaryCta.href)}">${esc(content.copy.heroPrimaryCta.label)}</a>
      <a class="btn btn-ghost" href="${esc(content.copy.heroSecondaryCta.href)}">${esc(content.copy.heroSecondaryCta.label)}</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="props">
      ${content.copy.valueProps
        .map(
          (v, i) => `<div class="prop">
        <span class="prop-icon">${[ICON.scissors, ICON.spool, ICON.heart][i] || ICON.heart}</span>
        <h3>${esc(v.title)}</h3>
        <p>${esc(v.body)}</p>
      </div>`
        )
        .join('')}
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <h2>Shop the current pieces</h2>
      <p>Each piece is made to order in the size and fabric pairing you choose.</p>
    </div>
    <div class="grid grid-3">
      ${featured.map(productCard).join('')}
    </div>
    <p class="section-more"><a class="link-arrow" href="/shop.html">See everything in the shop</a></p>
  </div>
</section>

<section class="section section-alt" id="how-it-works">
  <div class="wrap">
    <div class="section-head">
      <h2>How ordering works</h2>
      <p>Here is what to expect after you place an order.</p>
    </div>
    <ol class="steps">
      ${content.copy.howItWorks
        .map(
          (s, i) => `<li>
        <span class="step-num">${i + 1}</span>
        <div>
          <h3>${esc(s.step)}</h3>
          <p>${esc(s.body)}</p>
        </div>
      </li>`
        )
        .join('')}
    </ol>
  </div>
</section>

<section class="section">
  <div class="wrap split">
    <div class="split-media">
      <picture>
        <source srcset="/assets/img/workshop.webp" type="image/webp">
        <img src="/assets/img/workshop.jpg" alt="Hands guiding fabric through a sewing machine" loading="lazy" width="1408" height="768">
      </picture>
    </div>
    <div class="split-copy">
      <h2>${esc(content.copy.aboutTitle)}</h2>
      ${content.copy.aboutBody.map((p) => `<p>${esc(p)}</p>`).join('')}
      <a class="link-arrow" href="/about.html">More about LivLocal</a>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head">
      <h2>Kids sizing and price</h2>
      <p>The price follows the size, because the fabric and the sewing time grow with the piece.</p>
    </div>
    <div class="table-scroll">
      <table class="price-table">
        <thead><tr><th scope="col">Sizes</th><th scope="col">Fits</th><th scope="col">Price</th></tr></thead>
        <tbody>
          ${tiers
            .map(
              (t) => `<tr>
            <td>${esc(t.items.map((i) => i.id).join(', '))}</td>
            <td>${esc(t.items[0].group || '')}</td>
            <td class="price-cell">${money(t.price)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="table-note">Prices are for The Lydia Dress, which changes with size.</p>
  </div>
</section>

<section class="cta-band">
  <div class="wrap cta-inner">
    <div>
      <h2>${esc(content.copy.ctaBandTitle)}</h2>
      <p>${esc(content.copy.ctaBandBody)}</p>
    </div>
    <a class="btn btn-light" href="${esc(content.copy.ctaBandButton.href)}">${esc(content.copy.ctaBandButton.label)}</a>
  </div>
</section>`;

  return layout({ title: '', description: content.copy.heroSub, body, active: '/' });
}

function shop() {
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">The shop</p>
    <h1>Handmade pieces</h1>
    <p class="page-sub">Made to order in Ottumwa, Iowa. Pick your size and your two fabrics on any product page.</p>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="filters" role="group" aria-label="Filter by category">
      ${content.categories
        .map(
          (c, i) =>
            `<button class="filter${i === 0 ? ' is-active' : ''}" type="button" data-filter="${esc(c.id)}" aria-pressed="${
              i === 0
            }">${esc(c.label)}</button>`
        )
        .join('')}
    </div>
    <div class="grid grid-3" id="shop-grid">
      ${content.products.map((p) => `<div class="grid-item" data-category="${esc(p.category)}">${productCard(p)}</div>`).join('')}
    </div>
    <p class="shop-empty" id="shop-empty" hidden>Nothing in this category yet. More pieces are on the way.</p>
    <div class="notice">
      <h3>More on the way</h3>
      <p>This is what is ready so far. New pieces get added as they are finished, so check back.</p>
    </div>
  </div>
</section>`;
  return layout({
    title: 'Shop',
    description: 'Handmade kids clothes, quilted bags, and Bible bags made to order in Ottumwa, Iowa.',
    body,
    active: '/shop.html',
  });
}

function productPage(p) {
  const from = priceFrom(p);
  const selectOpt = (p.options || []).find((o) => o.type === 'select');
  const swatchOpts = (p.options || []).filter((o) => o.type === 'swatch');
  const buyable = from != null;

  const body = `
<section class="section product-page">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/shop.html">Shop</a><span aria-hidden="true">/</span>
      <a href="/shop.html">${esc(categoryLabel(p.category))}</a><span aria-hidden="true">/</span>
      <span aria-current="page">${esc(p.name)}</span>
    </nav>

    <div class="product-layout" data-buy-area>
      ${productMedia(p)}

      <div class="product-head">
        <p class="eyebrow">${esc(categoryLabel(p.category))}</p>
        <h1>${esc(p.name)}</h1>
        <p class="product-price" data-price-display data-base="${buyable ? from : ''}">${
          buyable ? `From ${money(from)}` : esc(p.priceLabel)
        }</p>
        <p class="product-summary">${esc(p.summary)}</p>
      </div>

      <div class="product-buy">
        ${
          buyable
            ? `<form class="buy" data-buy data-slug="${esc(p.slug)}" data-name="${esc(p.name)}" data-base="${from}">
          ${selectOpt ? sizeFieldset(selectOpt) : ''}
          <div class="buy-row">
            <div class="qty-field">
              <label for="qty">Quantity</label>
              <input id="qty" name="qty" type="number" min="1" max="10" value="1" inputmode="numeric">
            </div>
            <button class="btn btn-primary btn-block" type="submit">Add to cart</button>
          </div>
          <p class="buy-note">Made to order. Ships in about ${esc(SITE.leadTime)}.</p>
          <p class="buy-jump">Make sure to pick your fabric options below! <span class="buy-jump-arrow" aria-hidden="true">&darr;</span></p>
          <p class="form-error" data-buy-error hidden></p>
        </form>`
            : `<div class="quote-box">
          <p><strong>${esc(p.priceLabel)}.</strong> Sizing, hardware, and any personalization get settled first, then we quote it.</p>
          <a class="btn btn-primary btn-block" href="/contact.html?piece=${esc(p.slug)}">Request a quote</a>
        </div>`
        }
      </div>

      ${
        buyable && swatchOpts.length
          ? `<div class="product-picker">
        ${fabricPicker(swatchOpts, content.fabrics)}
      </div>`
          : ''
      }

      <div class="product-more">
        <ul class="bullets">
          ${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
        </ul>

        <details class="accordion" open>
          <summary>Details</summary>
          <dl class="spec-list">
            ${p.specs
              .map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`)
              .join('')}
          </dl>
        </details>
      </div>
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head"><h2>Keep looking</h2></div>
    <div class="grid grid-3">
      ${content.products
        .filter((x) => x.slug !== p.slug)
        .map(productCard)
        .join('')}
      <article class="card card--quote">
        <div class="card-body">
          <h3 class="card-title">Want something custom?</h3>
          <p>Custom sizes and fabric pairings are possible. Tell us what you are picturing.</p>
          <a class="link-arrow" href="/contact.html">Start a custom order</a>
        </div>
      </article>
    </div>
  </div>
</section>`;

  return layout({
    title: p.name,
    description: p.summary,
    body,
    active: productHref(p),
    bodyClass: 'is-product',
  });
}

function about() {
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">About</p>
    <h1>${esc(content.copy.aboutTitle)}</h1>
    <p class="page-sub">${esc(content.copy.tagline)}</p>
  </div>
</section>

<section class="section">
  <div class="wrap split split--reverse">
    <div class="split-media">
      <picture>
        <source srcset="/assets/img/texture.webp" type="image/webp">
        <img src="/assets/img/texture.jpg" alt="Close-up of layered quilting cotton fabric" loading="lazy" width="900" height="900">
      </picture>
    </div>
    <div class="split-copy">
      ${content.copy.aboutBody.map((p) => `<p>${esc(p)}</p>`).join('')}
    </div>
  </div>
</section>

<section class="section section-alt">
  <div class="wrap">
    <div class="section-head"><h2>How it is made</h2></div>
    <ol class="steps">
      ${content.copy.howItWorks
        .map(
          (s, i) => `<li><span class="step-num">${i + 1}</span><div><h3>${esc(s.step)}</h3><p>${esc(s.body)}</p></div></li>`
        )
        .join('')}
    </ol>
  </div>
</section>

<section class="cta-band">
  <div class="wrap cta-inner">
    <div>
      <h2>${esc(content.copy.ctaBandTitle)}</h2>
      <p>${esc(content.copy.ctaBandBody)}</p>
    </div>
    <a class="btn btn-light" href="/contact.html">Get in touch</a>
  </div>
</section>`;
  return layout({ title: 'About', description: content.copy.aboutBody[0], body, active: '/about.html' });
}

function faq() {
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Good to know</p>
    <h1>Sizing &amp; shipping</h1>
    <p class="page-sub">Sizes, fabrics, how long things take, and returns.</p>
  </div>
</section>

<section class="section">
  <div class="wrap narrow">
    <div class="faq-list">
      ${content.faq
        .map(
          (f, i) => `<details class="accordion"${i === 0 ? ' open' : ''} id="${f.q.toLowerCase().includes('return') ? 'returns' : 'faq-' + i}">
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`
        )
        .join('')}
    </div>

    <div class="notice">
      <h3>Shipping at a glance</h3>
      <ul class="bullets">
        <li>${esc(content.shipping.standardLabel)}: ${money(content.shipping.flatRate)}, free over ${money(
    content.shipping.freeOver
  )}</li>
        <li>${esc(content.shipping.standardEstimate)}</li>
        ${content.shipping.localPickup ? `<li>${esc(content.shipping.localPickupLabel)}: free</li>` : ''}
        <li>Currently shipping within the United States only.</li>
      </ul>
    </div>
  </div>
</section>`;
  return layout({
    title: 'Sizing & Shipping',
    description: 'Sizing, fabrics, lead times, shipping, and returns for LivLocal handmade pieces.',
    body,
    active: '/faq.html',
  });
}

function contact() {
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Contact</p>
    <h1>Tell us what you have in mind</h1>
    <p class="page-sub">Custom sizes, custom fabric pairings, small runs, or a question about an order.</p>
  </div>
</section>

<section class="section">
  <div class="wrap narrow">
    <div class="contact-card">
      <h2>Email us</h2>
      <p>The fastest way to reach us. Tell us the piece, the size, and the two fabrics you have in mind.</p>
      <p class="contact-email"><a href="mailto:${esc(SITE.contactEmail)}" id="contact-link">${esc(SITE.contactEmail)}</a></p>
      <p class="contact-meta">Made in ${esc(SITE.location)}. We reply as soon as we can, usually within a couple of days.</p>
    </div>

    <div class="notice">
      <h3>Before you write</h3>
      <ul class="bullets">
        <li>For a custom piece, include the size range and what it is for.</li>
        <li>For a fabric question, name the two fabrics you are considering.</li>
        <li>For an existing order, include the name used at checkout.</li>
      </ul>
    </div>
  </div>
</section>`;
  return layout({
    title: 'Contact',
    description: 'Contact LivLocal about custom sizes, fabric pairings, or an existing order.',
    body,
    active: '/contact.html',
  });
}

function cart() {
  const body = `
<section class="page-head">
  <div class="wrap">
    <p class="eyebrow">Your order</p>
    <h1>Cart</h1>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div id="cart-root">
      <div class="cart-empty" id="cart-empty">
        <h2>Your cart is empty</h2>
        <p>Pick a piece, choose your size and two fabrics, and it will show up here.</p>
        <a class="btn btn-primary" href="/shop.html">Go to the shop</a>
      </div>

      <div class="cart-layout" id="cart-filled" hidden>
        <div class="cart-lines">
          <div id="cart-items"></div>
        </div>
        <aside class="cart-summary">
          <h2>Summary</h2>
          <dl class="totals">
            <div><dt>Subtotal</dt><dd id="cart-subtotal">$0</dd></div>
            <div><dt>Shipping</dt><dd id="cart-shipping">Calculated at checkout</dd></div>
          </dl>
          <button class="btn btn-primary btn-block" type="button" id="checkout-btn">Checkout</button>
          <p class="buy-note">Shipping and any tax are calculated at checkout. Payment is handled by Square.</p>
          <p class="form-error" id="checkout-error" hidden></p>
          <a class="link-arrow" href="/shop.html">Keep shopping</a>
        </aside>
      </div>
    </div>
  </div>
</section>`;
  return layout({ title: 'Cart', description: 'Review your LivLocal order and check out.', body, active: '/cart.html' });
}

function success() {
  const body = `
<section class="section">
  <div class="wrap narrow center">
    <span class="big-check" aria-hidden="true">${ICON.heart}</span>
    <h1>Thank you</h1>
    <p class="page-sub">Your order is in. Your receipt comes from Square. Your piece is next on the cutting table.</p>
    <div class="notice left">
      <h3>What happens next</h3>
      <ol class="steps steps--tight">
        <li><span class="step-num">1</span><div><h3>Order confirmed</h3><p>A receipt lands in your inbox right away.</p></div></li>
        <li><span class="step-num">2</span><div><h3>Your piece is made</h3><p>Cut, sewn, and finished by hand in about ${esc(SITE.leadTime)}.</p></div></li>
        <li><span class="step-num">3</span><div><h3>It ships</h3><p>We’ll email tracking when your order ships.</p></div></li>
      </ol>
    </div>
    <div class="btn-row center-row">
      <a class="btn btn-primary" href="/shop.html">Back to the shop</a>
      <a class="btn btn-ghost" href="/contact.html">Ask a question</a>
    </div>
  </div>
</section>`;
  return layout({ title: 'Thank you', description: 'Your LivLocal order is confirmed.', body, active: '/success.html' });
}

function cancel() {
  const body = `
<section class="section">
  <div class="wrap narrow center">
    <h1>Checkout canceled</h1>
    <p class="page-sub">Nothing was charged. Your cart is still saved, so you can pick up where you left off.</p>
    <div class="btn-row center-row">
      <a class="btn btn-primary" href="/cart.html">Return to cart</a>
      <a class="btn btn-ghost" href="/shop.html">Keep shopping</a>
    </div>
  </div>
</section>`;
  return layout({ title: 'Checkout canceled', description: 'Your LivLocal checkout was canceled.', body, active: '/cancel.html' });
}

function notFound() {
  const body = `
<section class="section">
  <div class="wrap narrow center">
    <p class="eyebrow">404</p>
    <h1>That page is not here</h1>
    <p class="page-sub">The link may be old, or the piece may have been renamed.</p>
    <div class="btn-row center-row">
      <a class="btn btn-primary" href="/shop.html">Go to the shop</a>
      <a class="btn btn-ghost" href="/">Back home</a>
    </div>
  </div>
</section>`;
  return layout({ title: 'Page not found', description: 'Page not found.', body, active: '' });
}

/* ----------------------------------- write ---------------------------------- */

function write(rel, html) {
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('_raw-')) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function run() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  write('index.html', home());
  write('shop.html', shop());
  write('about.html', about());
  write('faq.html', faq());
  write('contact.html', contact());
  write('cart.html', cart());
  write('success.html', success());
  write('cancel.html', cancel());
  write('404.html', notFound());
  content.products.forEach((p) => write(`product/${p.slug}.html`, productPage(p)));

  copyDir(path.join(ROOT, 'src'), DIST);
  copyDir(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));

  fs.writeFileSync(
    path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\nDisallow: /cart.html\nDisallow: /success.html\nDisallow: /cancel.html\n\nSitemap: ${SITE.siteUrl.replace(
      /\/$/,
      ''
    )}/sitemap.xml\n`
  );

  const urls = ['/', '/shop.html', '/about.html', '/faq.html', '/contact.html']
    .concat(content.products.map(productHref))
    .map(
      (u) =>
        `  <url><loc>${SITE.siteUrl.replace(/\/$/, '')}${u}</loc><changefreq>weekly</changefreq><priority>${
          u === '/' ? '1.0' : '0.8'
        }</priority></url>`
    )
    .join('\n');
  fs.writeFileSync(
    path.join(DIST, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );

  // Server-authoritative catalog for the checkout function.
  const catalog = {};
  content.products.forEach((p) => {
    const size = (p.options || []).find((o) => o.type === 'select');
    catalog[p.slug] = {
      name: p.name,
      base: priceFrom(p),
      sizes: size ? Object.fromEntries(size.values.map((v) => [v.id, v.price])) : {},
      sizeLabels: size ? Object.fromEntries(size.values.map((v) => [v.id, v.label])) : {},
    };
  });
  const fabricMap = Object.fromEntries(content.fabrics.map((f) => [f.id, f.name]));
  fs.writeFileSync(
    path.join(ROOT, 'api', '_catalog.js'),
    `// GENERATED by build.js. Do not edit by hand.\nmodule.exports = ${JSON.stringify(
      { catalog, fabricMap, shipping: content.shipping, tax: content.tax, site: { name: SITE.name, contactEmail: SITE.contactEmail } },
      null,
      2
    )};\n`
  );

  const pages = fs.readdirSync(DIST).length;
  console.log(`Built ${content.products.length + 9} pages into dist/ (${pages} top level entries).`);
  console.log('Wrote api/_catalog.js for the checkout function.');
}

run();
