# LivLocal website

A handmade-goods storefront for LivLocal (Ottumwa, Iowa): kids clothes, quilted bags, and Bible bags.
Every product is made to order, and every product is built from a **primary fabric** and a **secondary fabric** that the customer chooses.

Payments run through **Square**, using the Square Checkout API from one serverless function, so online orders and in-person sales land in the same Square account. Hosting is **Azure Static Web Apps** on the free plan, so the running cost is $0 plus the domain.

---

## Quick start

```bash
npm run build      # generates ./dist from content.json
npm start          # builds, then serves http://localhost:4321
```

Node 20 or newer. There are no runtime dependencies for the site itself.

---

## Project layout

```txt
content.json                All copy, products, sizes, prices, and fabrics. Edit this, not the HTML.
build.js                    Generates ./dist from content.json. Also writes api/_catalog.js.
serve.js                    Local preview server.
src/styles.css              Design tokens and styling. Brand colours are the first block.
src/main.js                 Cart, product options, filters, checkout handoff.
assets/img/                 Hero, texture, and workshop photos (jpg plus webp).
assets/favicon.svg          Brand mark used as the favicon.
api/create-payment-link    The Square checkout endpoint (Azure Function). No dependencies.
api/_catalog.js             GENERATED. Server-side price list. Do not edit by hand.
tools/optimize-images.js    Resizes a photo into the web-ready jpg plus webp pair.
tools/shots.js              Renders every page to PNG for review.
tools/qa.js                 Layout, link, image, and cart-flow checks.
tools/qa-visual.js          Contrast, clipping, and asset-load checks.
tools/test-square.js        Checkout validation and request-shape tests.
tools/source-images/        The 10 fabric photos from the Notion Fabric page, for reference.
staticwebapp.config.json    Routing, caching, and security headers.
.github/workflows/          Deploys on every push to main.
```

---

## Editing content

Everything customer-facing lives in `content.json`. Change it, run `npm run build`, and the whole site regenerates.

**Prices and sizes.** `products[0].options[0].values` holds the dress sizes. Each entry has its own `price` in cents, which is what makes the price change with the size:

```json
{ "id": "6-7y", "label": "6 to 7 years", "price": 5500, "group": "Kids" }
```

**Fabrics.** `fabrics` is one shared list. Every product that has a fabric option reads from it, so renaming a fabric once updates the product pages, the swatch pickers, and the homepage strip. Each entry takes a `name` and a `hex` colour. Add an `image` key with a root-relative path, such as `/assets/img/fabrics/green-daisy.webp`, to use a photo swatch instead of a colour chip.

**Products.** To add one, copy an existing block in `products` and change the `slug`, `name`, `category`, `summary`, and `options`. A product with `"price": null` shows "Pricing on request" and routes to the contact page instead of the cart. The quilted bag and Bible bag currently work that way.

**Brand colours and fonts.** The `:root` block at the top of `src/styles.css`. Five colours control the whole site: `--clay` (primary accent), `--sage`, `--gold`, `--canvas`, and `--ink`. There is also a dark-mode block that mirrors them.

---

## Photos

Every image ships as a matched `.jpg` and `.webp` pair, and the markup offers the WebP first. To replace one:

```bash
node tools/optimize-images.js ~/photos/new-hero.jpg hero 1600
```

Product cards currently use a CSS-drawn fabric tile instead of a photo, so the shop looks finished while real product photography is pending. Once you have photos, add them to `assets/img/` and list the filenames in each product's `images` array, then swap the tile for an `<img>` in `build.js`.

---

## Square setup

The endpoint calls the Square **Checkout API** directly over `fetch`, so the API has no npm dependencies at all.

1. In the Square Developer Dashboard, create an application and copy its **access token**, plus the **location ID** for the location that should receive orders.
2. In the Azure Static Web App, open **Configuration** and add:
   - `SQUARE_ACCESS_TOKEN` = your access token
   - `SQUARE_LOCATION_ID` = the location ID
   - `SQUARE_ENVIRONMENT` = `sandbox` while testing, `production` when live
   - `SQUARE_VERSION` = optional, pins the API version, for example `2025-07-16`
   - `SITE_URL` = `https://www.livlocal.shop` (optional; otherwise the request origin is used)
3. Redeploy so the function picks up the settings.

Run it against `sandbox` first. Square's sandbox checkout page does not look like the production one, but completing a sandbox payment proves the wiring end to end.

Prices are looked up **server-side** in `api/_catalog.js`, which `build.js` generates. Anything the browser sends about price is ignored, so a tampered cart cannot change what a customer is charged. If you change a price in `content.json`, run `npm run build` and commit, or the site and the checkout will disagree.

**What the buyer sees.** Each line item name carries the size and both fabrics, so the shopper can confirm their choices on the Square checkout page before paying. The structured detail also goes into the line item note, which shows in the Square Dashboard.

**Shipping.** Square's checkout accepts one shipping fee, set server-side from `shipping` in `content.json`: a flat US rate, dropped to free once the cart clears the threshold. Local pickup is not a checkout choice here. If you want pickup offered at checkout, that is built into Square Online rather than the Checkout API.

**Tax.** The `tax` block in `content.json` controls this and it is **off by default**, because LivLocal needs an Iowa sales tax permit before collecting tax. Ottumwa is 6% Iowa state tax plus a 1% local option tax, so 7.0% combined. Confirm the current rules with the Iowa Department of Revenue, then set `"enabled": true`. While it is on, the order carries an order-scoped additive tax.

**Where orders land.** Paid orders appear in the Square Dashboard under Orders and in the Square POS Order Manager, so the same place you handle in-person sales handles these.

**One limitation to know about.** The Checkout API does not decrement Square inventory. If you want stock counts to stay in sync between the website and the card reader, that is Square Online rather than the Checkout API. Everything else on this site keeps working either way.

---

## Deploying to Azure

1. Create a private repository on GitHub and upload everything **inside** this folder. Do not upload the outer folder as a nested folder.
2. In the Azure portal, create a **Static Web App** on the **Free** plan, source **GitHub**, and pick the repository and the `main` branch.
3. Build details, choose **Custom**:
   - App location: `dist`
   - API location: `api`
   - Output location: leave blank
4. Azure commits a workflow file into the repository. Keep the one in `.github/workflows/` and delete the extra one Azure adds, then commit.
5. Open the temporary `azurestaticapps.net` address and confirm the site loads.
6. Add the Square settings under **Configuration**, then redeploy.
7. **Custom domains**: add `www` first with a CNAME to the Azure hostname. Add the root domain with an `ALIAS` or `ANAME` record at `@`, or forward it to `www`.
8. Add the domain to Google Search Console and submit `https://www.livlocal.shop/sitemap.xml`.

---

## Before launch

- [ ] Set the real domain in `content.json` (`site.siteUrl`) and rebuild.
- [ ] Set the real contact email (`site.contactEmail`). It currently points at `trevan@c2cmedia.studio`.
- [ ] Confirm the shipping rates and the made-to-order lead time.
- [ ] Confirm the remaining Fabric 01 through Fabric 10 names and add their swatch photos. Five named Hobby Lobby fabrics already have photo swatches.
- [ ] Add product photography.
- [ ] Register for an Iowa sales tax permit, then turn tax on in `content.json`.
- [ ] Add the Square access token and location ID in Azure, and run a sandbox order.
- [ ] Decide whether stock counts need to sync with the card reader. If they do, move the storefront to Square Online and keep this site as the brand front door.
- [ ] Children's clothing sold in the US falls under CPSIA. It needs a permanent tracking label with the manufacturer, location, and production date, and lead and phthalate limits apply. Small-batch manufacturers have some testing relief, but the label requirement still applies. Worth reading before the first sale: https://www.cpsc.gov/Business--Manufacturing/Business-Education/tracking-label

---

## QA

```bash
npm start                     # in one terminal
node tools/qa.js              # layout, links, images, cart flow
node tools/qa-visual.js       # contrast, clipping, asset loads
node tools/test-square.js     # Square checkout validation and request shape
node tools/shots.js           # renders previews into ./previews
```
