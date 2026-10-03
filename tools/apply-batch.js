#!/usr/bin/env node
/**
 * Applies the Lydia Dress batch to content.json.
 *
 * Run it against the content.json you are about to upload, so newer copy in
 * that file is kept:
 *
 *   node tools/apply-batch.js                     # edits ./content.json
 *   node tools/apply-batch.js path/to/content.json
 *
 * Safe to run more than once: each change is reported as changed, unchanged,
 * or already applied.
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2] || path.join(__dirname, '..', 'content.json');
const dataFile = path.join(__dirname, 'lydia-batch-data.json');
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
const content = JSON.parse(fs.readFileSync(target, 'utf8'));

const log = [];
const changed = (what, from, to) => log.push(`  changed   ${what}\n              was: ${from}\n              now: ${to}`);
const same = (what) => log.push(`  already   ${what}`);
const warn = (what) => log.push(`  SKIPPED   ${what}`);

function setValue(owner, key, value, label) {
  if (JSON.stringify(owner[key]) === JSON.stringify(value)) return same(label);
  const before = JSON.stringify(owner[key]);
  owner[key] = value;
  changed(label, before, JSON.stringify(value));
}

/* ---------------------------------------------------------------- fabrics */
const beforeCount = Array.isArray(content.fabrics) ? content.fabrics.length : 0;
const placeholders = (content.fabrics || []).filter((f) => f.placeholder).length;
if (JSON.stringify(content.fabrics) === JSON.stringify(data.fabrics)) {
  same(`fabrics list (${data.fabrics.length} fabrics from the LivLocal Fabric Library)`);
} else {
  content.fabrics = data.fabrics;
  changed('fabrics list', `${beforeCount} entries, ${placeholders} placeholder(s)`, `${data.fabrics.length} entries, 0 placeholders`);
}
setValue(content, 'fabricNote', data.fabricNote, 'fabricNote');
setValue(content, 'fabricSource', data.fabricSource, 'fabricSource (Notion database reference)');

/* --------------------------------------------------------------- settings */
if (data.site) {
  if (!content.site) throw new Error('content.site is missing');
  Object.keys(data.site).forEach((key) =>
    setValue(content.site, key, data.site[key], `site.${key}`)
  );
}

/* ------------------------------------------------------------------- copy */
if (!content.copy) throw new Error('content.copy is missing');
setValue(content.copy, 'aboutTitle', data.about.title, 'copy.aboutTitle');

const removeRe = new RegExp(data.about.removeBodyMatching);
if (Array.isArray(content.copy.aboutBody)) {
  const kept = content.copy.aboutBody.filter((p) => !removeRe.test(p.trim()));
  const removed = content.copy.aboutBody.length - kept.length;
  if (removed) {
    changed('copy.aboutBody', `${content.copy.aboutBody.length} paragraphs`, `${kept.length} paragraphs (removed: "${content.copy.aboutBody.find((p) => removeRe.test(p.trim())).slice(0, 60)}...")`);
    content.copy.aboutBody = kept;
  } else {
    same('copy.aboutBody (the incorrect origin story is not present)');
  }
} else {
  warn('copy.aboutBody is not an array, left alone');
}

/* --------------------------------------------------------------- products */
function findProduct(slug) {
  return (content.products || []).find((p) => p.slug === slug);
}

const dress = findProduct(data.dress.slug);
if (!dress) throw new Error(`No product with slug "${data.dress.slug}" in ${target}`);
setValue(dress, 'name', data.dress.name, `products[${data.dress.slug}].name`);

(dress.options || []).forEach((opt) => {
  const wanted = data.dress.optionLabels[opt.key];
  if (!wanted) return;
  if (opt.label === wanted.label && opt.help === wanted.help) return same(`products[${data.dress.slug}].options[${opt.key}] label`);
  changed(`products[${data.dress.slug}].options[${opt.key}]`, `${opt.label} / ${opt.help}`, `${wanted.label} / ${wanted.help}`);
  opt.label = wanted.label;
  opt.help = wanted.help;
});

function replaceBullet(product, map, label) {
  let hits = 0;
  (product.bullets || []).forEach((b, i) => {
    Object.keys(map).forEach((from) => {
      if (b === from) { product.bullets[i] = map[from]; hits++; }
    });
  });
  if (hits) changed(`${label} bullets`, `${hits} line(s)`, 'rewritten');
  else same(`${label} bullets`);
}

replaceBullet(dress, data.dress.bulletReplace, `products[${data.dress.slug}]`);
setValue(dress, 'images', data.dress.images, `products[${data.dress.slug}].images (${data.dress.images.length} photos)`);
setValue(dress, 'imagePairs', data.dress.imagePairs, `products[${data.dress.slug}].imagePairs (${data.dress.imagePairs.length} verified pairs)`);
setValue(dress, 'imageNote', data.dress.imageNote, `products[${data.dress.slug}].imageNote`);

const bag = findProduct(data.bibleBag.slug);
if (!bag) throw new Error(`No product with slug "${data.bibleBag.slug}" in ${target}`);
setValue(bag, 'price', data.bibleBag.price, `products[${data.bibleBag.slug}].price`);
setValue(bag, 'priceLabel', data.bibleBag.priceLabel, `products[${data.bibleBag.slug}].priceLabel`);
replaceBullet(bag, data.bibleBag.bulletReplace, `products[${data.bibleBag.slug}]`);

/* ------------------------------------------------------------------ notes */
if (content._notes && Array.isArray(content._notes.needsConfirmation)) {
  const drop = /(Fabric 01|placeholder|images is empty)/i;
  const kept = content._notes.needsConfirmation.filter((n) => !drop.test(n));
  if (kept.length !== content._notes.needsConfirmation.length) {
    changed('_notes.needsConfirmation', `${content._notes.needsConfirmation.length} items`, `${kept.length} items (fabric and photo placeholders are done)`);
    content._notes.needsConfirmation = kept;
  } else same('_notes.needsConfirmation');
}

fs.writeFileSync(target, JSON.stringify(content, null, 2) + '\n');
console.log(`Applied the ${data.batch} to ${path.relative(process.cwd(), target)}\n`);
console.log(log.join('\n'));
