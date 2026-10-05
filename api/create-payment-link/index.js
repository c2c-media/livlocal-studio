'use strict';

/**
 * Creates a Square-hosted checkout page for the LivLocal cart.
 *
 * Uses the Square Checkout API over plain fetch, so this function has no npm
 * dependencies at all. Prices are looked up here, on the server, from the
 * generated catalog, so a tampered cart cannot change what a customer pays.
 *
 * Required app settings:
 *   SQUARE_ACCESS_TOKEN    Square access token (sandbox or production)
 *   SQUARE_LOCATION_ID     The Square location that receives the order
 * Optional app settings:
 *   SQUARE_ENVIRONMENT     "sandbox" (default) or "production"
 *   SQUARE_VERSION         Square API version header, for example 2025-07-16
 *   SITE_URL               https://www.example.com, otherwise the request origin is used
 */

const crypto = require('crypto');
const data = require('../_catalog.js');

const MAX_QTY = 10;
const MAX_LINES = 20;
const MAX_NAME = 512;
const MAX_EMBROIDERY = 30;

function apiBase() {
  const env = (process.env.SQUARE_ENVIRONMENT || 'sandbox').toLowerCase();
  return env === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
}

function resolveBaseUrl(req) {
  const configured = (process.env.SITE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;

  const origin = req.headers.origin || req.headers.referer || '';
  const match = /^(https?:\/\/[^/]+)/.exec(origin);
  if (match) return match[1];

  return 'https://www.livlocal.studio';
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (err) {
      return null;
    }
  }
  return req.body;
}

/** The wording the customer asked for, cleaned and capped at the advertised length. */
function embroideryText(raw, entry) {
  if (typeof raw.embroidery !== 'string') return '';
  const max = (entry && entry.maxLength) || MAX_EMBROIDERY;
  return raw.embroidery
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Turns one cart line into a Square order line item, priced from the catalog. */
function buildLineItem(raw) {
  const entry = data.catalog[raw.slug];
  if (!entry) return { error: `Unknown item: ${String(raw.slug).slice(0, 40)}` };

  const sizeIds = Object.keys(entry.sizes);
  let unitAmount = entry.base;

  if (sizeIds.length) {
    if (!raw.size || !sizeIds.includes(raw.size)) {
      return { error: `Choose a size for ${entry.name}.` };
    }
    unitAmount = entry.sizes[raw.size];
  }

  if (unitAmount == null) {
    return { error: `${entry.name} is priced on request and cannot be checked out online.` };
  }

  const qty = Math.max(1, Math.min(MAX_QTY, parseInt(raw.qty, 10) || 1));
  const text = embroideryText(raw, entry);

  // The embroidery charge rides as its own line, so the buyer sees the $5 and
  // the wording they asked for before they pay.
  if (entry.embroideryAddon) {
    if (!text) {
      return { error: 'Add the wording you would like embroidered, or remove the embroidery line.' };
    }
    return {
      lineItem: {
        name: `Embroidery: ${text}`.slice(0, MAX_NAME),
        quantity: String(qty),
        base_price_money: { amount: unitAmount, currency: 'USD' },
        note: `Embroidery text: ${text}`,
      },
      unitAmount,
      qty,
    };
  }

  const parts = [];
  if (raw.size && entry.sizeLabels[raw.size]) parts.push(`Size: ${entry.sizeLabels[raw.size]}`);
  if (raw.primaryFabric) parts.push(`Primary fabric: ${data.fabricMap[raw.primaryFabric] || 'TBC'}`);
  if (raw.secondaryFabric) parts.push(`Secondary fabric: ${data.fabricMap[raw.secondaryFabric] || 'TBC'}`);
  if (text) parts.push(`Embroidery: ${text}`);

  // The chosen options go in the line item name so the buyer can see them on
  // the checkout page and confirm them before paying.
  const shortParts = [];
  if (raw.size && entry.sizeLabels[raw.size]) shortParts.push(entry.sizeLabels[raw.size]);
  if (raw.primaryFabric) shortParts.push(data.fabricMap[raw.primaryFabric] || 'Fabric TBC');
  if (raw.secondaryFabric) shortParts.push(data.fabricMap[raw.secondaryFabric] || 'Fabric TBC');
  const name = (shortParts.length ? `${entry.name} (${shortParts.join(', ')})` : entry.name).slice(0, MAX_NAME);

  return {
    lineItem: {
      name,
      quantity: String(qty),
      base_price_money: { amount: unitAmount, currency: 'USD' },
      note: parts.join(' | ').slice(0, 500) || undefined,
    },
    unitAmount,
    qty,
  };
}

function buildTaxes() {
  const tax = data.tax || {};
  if (!tax.enabled || !tax.rate) return undefined;
  return [
    {
      uid: 'sales-tax',
      name: tax.label || 'Sales tax',
      percentage: String(tax.rate),
      scope: 'ORDER',
      type: 'ADDITIVE',
    },
  ];
}

function buildCheckoutOptions(base, subtotal) {
  const options = {
    ask_for_shipping_address: true,
    redirect_url: `${base}/success.html`,
    enable_coupon: true,
    accepted_payment_methods: {
      apple_pay: true,
      google_pay: true,
      cash_app_pay: true,
      afterpay_clearpay: true,
    },
  };

  if (data.site && data.site.contactEmail) {
    options.merchant_support_email = data.site.contactEmail;
  }

  const free = data.shipping.freeOver && subtotal >= data.shipping.freeOver;
  if (!free && data.shipping.flatRate > 0) {
    options.shipping_fee = {
      name: data.shipping.standardLabel,
      charge: { amount: data.shipping.flatRate, currency: 'USD' },
    };
  }

  return options;
}

module.exports = async function (context, req) {
  const json = (status, payload) => {
    context.res = {
      status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: payload,
    };
  };

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const token = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!token || !locationId) {
    context.log.error('SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID is not configured.');
    return json(500, { error: 'Payments are not configured yet.' });
  }

  const body = parseBody(req);
  const items = body && Array.isArray(body.items) ? body.items : null;
  if (!items || !items.length) return json(400, { error: 'Your cart is empty.' });
  if (items.length > MAX_LINES) return json(400, { error: 'That is more line items than we can check out at once.' });

  const lineItems = [];
  let subtotal = 0;

  for (const raw of items) {
    const built = buildLineItem(raw || {});
    if (built.error) return json(400, { error: built.error });
    lineItems.push(built.lineItem);
    subtotal += built.unitAmount * built.qty;
  }

  const base = resolveBaseUrl(req);
  const summary = items
    .map((i) => `${i.slug} x${i.qty}${i.size ? ` (${i.size})` : ''}`)
    .join(', ')
    .slice(0, 480);

  const order = { location_id: locationId, line_items: lineItems };
  const taxes = buildTaxes();
  if (taxes) order.taxes = taxes;

  const requestBody = {
    idempotency_key: crypto.randomUUID(),
    order,
    checkout_options: buildCheckoutOptions(base, subtotal),
    payment_note: summary,
  };

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (process.env.SQUARE_VERSION) headers['Square-Version'] = process.env.SQUARE_VERSION;

  try {
    const response = await fetch(`${apiBase()}/v2/online-checkout/payment-links`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const first = payload && payload.errors && payload.errors[0];
      context.log.error(`Square rejected the checkout request: ${response.status} ${first ? first.code : ''} ${first ? first.detail : ''}`);
      return json(502, { error: (first && first.detail) || 'Payment provider error. Please try again.' });
    }

    const url = payload && payload.payment_link && payload.payment_link.url;
    if (!url) {
      context.log.error('Square response had no payment link URL.');
      return json(502, { error: 'Payment provider returned no checkout page. Please try again.' });
    }

    context.log(`Created Square payment link for ${items.length} line item(s), order ${payload.payment_link.order_id}.`);
    return json(200, { url, orderId: payload.payment_link.order_id });
  } catch (err) {
    context.log.error('Square checkout request failed', err && err.message);
    return json(502, { error: 'Could not reach the payment provider. Please try again.' });
  }
};
