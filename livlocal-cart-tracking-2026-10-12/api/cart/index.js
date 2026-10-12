'use strict';

/**
 * Records what a shopper has in their cart.
 *
 * The cart only exists in the shopper's browser, so nothing about it reaches the
 * server on its own. The page posts a snapshot here when the cart changes or the
 * shopper leaves, and this function forwards it to the Notion Worker, which
 * keeps one row per cart in LivLocal Carts.
 *
 * The page cannot call the Worker webhook directly: its preflight answers 404,
 * so there is no CORS, and the site's Content-Security-Policy only allows
 * same-origin requests.
 *
 * Required app setting:
 *   CART_WEBHOOK_URL   the onCartActivity webhook URL from the Notion Worker
 */

const MAX_CART_ID = 40;
const MAX_LINES = 20;
const MAX_TEXT = 120;
const MAX_PRICE = 1000000;

// Best-effort throttle, held per instance. A shopper legitimately posts several
// times per visit, so this only blunts a flood.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const recent = new Map();

function throttled(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((time) => now - time < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);

  if (recent.size > 500) {
    for (const [key, times] of recent) {
      if (!times.some((time) => now - time < WINDOW_MS)) recent.delete(key);
    }
  }

  return hits.length > MAX_PER_WINDOW;
}

function singleLine(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, max);
}

function wholeNumber(value, fallback, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), low), high);
}

function json(status, body) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

/** Rebuilds one cart line from whatever the browser sent, dropping anything odd. */
function cleanLine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = singleLine(raw.name, MAX_TEXT);
  if (!name) return null;
  return {
    name,
    qty: wholeNumber(raw.qty, 1, 1, 20),
    price: wholeNumber(raw.price, 0, 0, MAX_PRICE),
    size: singleLine(raw.size, MAX_TEXT),
    primaryFabric: singleLine(raw.primaryFabric, MAX_TEXT),
    secondaryFabric: singleLine(raw.secondaryFabric, MAX_TEXT),
    embroidery: singleLine(raw.embroidery, MAX_TEXT)
  };
}

module.exports = async function (context, req) {
  const webhook = process.env.CART_WEBHOOK_URL;
  if (!webhook) {
    context.log.error('CART_WEBHOOK_URL is not set.');
    context.res = json(500, { error: 'Cart reporting is not set up yet.' });
    return;
  }

  const body = req.body || {};
  const cartId = singleLine(body.cartId, MAX_CART_ID);
  if (!/^[a-z0-9]{4,40}$/i.test(cartId)) {
    context.res = json(400, { error: 'A cart id is required.' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (throttled(ip)) {
    context.log.warn(`Cart reporting throttled for ${ip}.`);
    context.res = json(429, { error: 'Too many cart updates.' });
    return;
  }

  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : [];
  const items = rawItems.map(cleanLine).filter(Boolean);

  const event = ['cart', 'checkout', 'emptied'].includes(body.event) ? body.event : 'cart';
  const page = singleLine(body.page, 200);
  const seenAt = singleLine(body.seenAt, 40);
  // The total is worked out here rather than trusted from the browser.
  const value = items.reduce((total, line) => total + line.price * line.qty, 0);

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cartId, event, page, seenAt, value, items })
    });

    if (!response.ok) {
      context.log.error(`Cart webhook answered ${response.status}.`);
      context.res = json(502, { error: 'Cart update not recorded.' });
      return;
    }
  } catch (error) {
    context.log.error('Cart webhook request failed', error && error.message);
    context.res = json(502, { error: 'Cart update not recorded.' });
    return;
  }

  context.res = json(202, { ok: true });
};
