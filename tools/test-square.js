/**
 * Exercises the Square checkout function without network access.
 * Stubs global.fetch and inspects the exact request body we would send.
 */
const assert = require('assert');
const path = require('path');

process.env.SQUARE_ACCESS_TOKEN = 'sandbox-token-for-tests';
process.env.SQUARE_LOCATION_ID = 'LTESTLOCATION';
process.env.SQUARE_ENVIRONMENT = 'sandbox';
process.env.SITE_URL = 'https://www.livlocal.shop';

const CATALOG_PATH = require.resolve('../api/_catalog.js');

function loadHandler({ taxEnabled = false } = {}) {
  delete require.cache[CATALOG_PATH];
  const data = require(CATALOG_PATH);
  data.tax = Object.assign({}, data.tax, { enabled: taxEnabled, rate: 7.0, label: 'Sales tax (Iowa 7%)' });
  const handlerPath = require.resolve('../api/create-payment-link/index.js');
  delete require.cache[handlerPath];
  return require(handlerPath);
}

function makeCtx() {
  return { log: Object.assign(() => {}, { error: () => {} }) };
}

let sent = null;
global.fetch = async (url, init) => {
  sent = { url, init, body: JSON.parse(init.body) };
  return {
    ok: true,
    status: 200,
    json: async () => ({ payment_link: { id: 'PL1', order_id: 'ORDER1', url: 'https://sandbox.square.link/u/abc123' } }),
  };
};

(async () => {
  let passed = 0;
  let failed = 0;

  function check(label, fn) {
    try {
      fn();
      console.log(`PASS  ${label}`);
      passed++;
    } catch (err) {
      console.log(`FAIL  ${label}: ${err.message}`);
      failed++;
    }
  }

  async function run(handler, body, method = 'POST') {
    const ctx = makeCtx();
    sent = null;
    await handler(ctx, { method, body, headers: { origin: 'https://www.livlocal.shop' } });
    return ctx.res;
  }

  /* ------------------------------ validation ------------------------------- */

  let handler = loadHandler();
  check('rejects GET', async () => {});
  const getRes = await run(handler, { items: [] }, 'GET');
  check('GET returns 405', () => assert.strictEqual(getRes.status, 405));

  const emptyRes = await run(handler, { items: [] });
  check('empty cart returns 400', () => {
    assert.strictEqual(emptyRes.status, 400);
    assert.match(emptyRes.body.error, /empty/i);
  });

  const unknownRes = await run(handler, { items: [{ slug: 'nope', qty: 1 }] });
  check('unknown product returns 400', () => assert.strictEqual(unknownRes.status, 400));

  const noSizeRes = await run(handler, { items: [{ slug: 'kids-dress', qty: 1 }] });
  check('missing size returns 400', () => {
    assert.strictEqual(noSizeRes.status, 400);
    assert.match(noSizeRes.body.error, /choose a size/i);
  });

  const badSizeRes = await run(handler, { items: [{ slug: 'kids-dress', qty: 1, size: '99y' }] });
  check('invalid size returns 400', () => assert.strictEqual(badSizeRes.status, 400));

  const quoteRes = await run(handler, { items: [{ slug: 'quilted-bag', qty: 1 }] });
  check('price-on-request item returns 400', () => {
    assert.strictEqual(quoteRes.status, 400);
    assert.match(quoteRes.body.error, /priced on request/i);
  });

  const manyRes = await run(handler, { items: Array.from({ length: 25 }, () => ({ slug: 'kids-dress', qty: 1, size: '0-3m' })) });
  check('too many lines returns 400', () => assert.strictEqual(manyRes.status, 400));

  /* -------------------------- the happy path request ------------------------ */

  const okRes = await run(handler, {
    items: [
      { slug: 'kids-dress', qty: 2, size: '6-7y', primaryFabric: 'boho-blender', secondaryFabric: 'mauve-rose-textured' },
    ],
  });

  check('valid cart returns 200 with a checkout url', () => {
    assert.strictEqual(okRes.status, 200);
    assert.strictEqual(okRes.body.url, 'https://sandbox.square.link/u/abc123');
  });

  check('posts to the sandbox payment-links endpoint', () => {
    assert.strictEqual(sent.url, 'https://connect.squareupsandbox.com/v2/online-checkout/payment-links');
    assert.strictEqual(sent.init.method, 'POST');
    assert.match(sent.init.headers.Authorization, /^Bearer sandbox-token/);
  });

  check('sends an idempotency key', () => assert.ok(sent.body.idempotency_key && sent.body.idempotency_key.length >= 16));

  check('line item is priced from the server catalog', () => {
    const li = sent.body.order.line_items[0];
    assert.strictEqual(li.base_price_money.amount, 5500, 'size 6-7y should be $55');
    assert.strictEqual(li.base_price_money.currency, 'USD');
    assert.strictEqual(li.quantity, '2');
  });

  check('line item name shows the size and both fabrics to the buyer', () => {
    const name = sent.body.order.line_items[0].name;
    assert.match(name, /The Lydia Dress/);
    assert.match(name, /6 to 7 years/);
    assert.match(name, /Boho Blender Cotton Calico Fabric/);
    assert.match(name, /Mauve Rose Textured Cotton Calico Fabric/);
  });

  check('line item note carries the structured options', () => {
    assert.match(sent.body.order.line_items[0].note, /Primary fabric: Boho Blender Cotton Calico Fabric/);
  });

  check('location id is set on the order', () => assert.strictEqual(sent.body.order.location_id, 'LTESTLOCATION'));

  check('asks the buyer for a shipping address', () => assert.strictEqual(sent.body.checkout_options.ask_for_shipping_address, true));

  check('redirects to the thank-you page after payment', () => {
    assert.strictEqual(sent.body.checkout_options.redirect_url, 'https://www.livlocal.shop/success.html');
  });

  check('a $110 cart clears the free-shipping threshold', () => {
    assert.strictEqual(sent.body.checkout_options.shipping_fee, undefined);
  });

  check('wallet payments are enabled', () => {
    const m = sent.body.checkout_options.accepted_payment_methods;
    assert.strictEqual(m.apple_pay, true);
    assert.strictEqual(m.google_pay, true);
  });

  check('no tax is sent while tax is disabled', () => assert.strictEqual(sent.body.order.taxes, undefined));

  /* ------------------------------- shipping fee ------------------------------ */

  const smallRes = await run(handler, {
    items: [{ slug: 'kids-dress', qty: 1, size: '0-3m', primaryFabric: 'green-daisy', secondaryFabric: 'cream-sunflower' }],
  });
  check('applies the flat shipping fee below the free threshold', () => {
    assert.strictEqual(smallRes.status, 200);
    assert.strictEqual(sent.body.checkout_options.shipping_fee.charge.amount, 600);
    assert.strictEqual(sent.body.checkout_options.shipping_fee.charge.currency, 'USD');
  });

  /* ---------------------------- free shipping + tax -------------------------- */

  const freeHandler = loadHandler({ taxEnabled: true });
  const freeRes = await run(freeHandler, {
    items: [{ slug: 'kids-dress', qty: 2, size: '7-8y', primaryFabric: 'green-daisy', secondaryFabric: 'cream-sunflower' }],
  });

  check('order over the threshold drops the shipping fee', () => {
    assert.strictEqual(freeRes.status, 200);
    assert.strictEqual(sent.body.checkout_options.shipping_fee, undefined);
  });

  check('tax is sent as an order-scoped 7% additive tax when enabled', () => {
    const t = sent.body.order.taxes[0];
    assert.strictEqual(t.percentage, '7');
    assert.strictEqual(t.scope, 'ORDER');
    assert.strictEqual(t.type, 'ADDITIVE');
  });

  /* ------------------------------- error paths ------------------------------ */

  global.fetch = async () => ({
    ok: false,
    status: 400,
    json: async () => ({ errors: [{ code: 'BAD_REQUEST', detail: 'Location is not valid' }] }),
  });
  const upstream = await run(handler, { items: [{ slug: 'kids-dress', qty: 1, size: '0-3m' }] });
  check('surfaces a Square error as 502', () => {
    assert.strictEqual(upstream.status, 502);
    assert.match(upstream.body.error, /Location is not valid/);
  });

  global.fetch = async () => { throw new Error('socket hang up'); };
  const network = await run(handler, { items: [{ slug: 'kids-dress', qty: 1, size: '0-3m' }] });
  check('surfaces a network failure as 502', () => assert.strictEqual(network.status, 502));

  delete process.env.SQUARE_ACCESS_TOKEN;
  const unconfiguredHandler = loadHandler();
  const unconfigured = await run(unconfiguredHandler, { items: [{ slug: 'kids-dress', qty: 1, size: '0-3m' }] });
  check('missing Square settings returns 500', () => {
    assert.strictEqual(unconfigured.status, 500);
    assert.match(unconfigured.body.error, /not configured/i);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
