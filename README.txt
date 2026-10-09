LivLocal — Google Analytics, 2026-10-09
=======================================

Files in this package (repo-relative paths):

  content.json               The measurement ID, and the two social links put back.
  build.js                   Emits the analytics tag, and copies the config into dist.
  staticwebapp.config.json   Policy updated for Google, and fixed for the fabric tiles.

Nothing else changes. src/main.js, src/styles.css and the api/ folder are untouched.


1. Google Analytics
-------------------
Measurement ID: G-4S7Z0GV0TD

Every one of the 12 pages now carries:

  <script async src="https://www.googletagmanager.com/gtag/js?id=G-4S7Z0GV0TD"></script>
  <script src="/analytics.js" defer></script>

The bootstrap lives in its own /analytics.js file, which the build writes, rather
than an inline <script>. That matters because the site's policy says
script-src 'self' — an inline snippet would be blocked and Google would silently
never see anything. Keeping it in a file means the tag works and the policy stays
strict.

The ID sits in content.json under site.analyticsId. Clear that value and the tag
disappears from the build entirely, so turning analytics off is a one-line change.

Verified with the policy switched on, in a browser:
  - 10 page types loaded, 0 policy violations, 0 script errors
  - all 49 fabric tiles kept their colour chips and photos
  - the page fired a real request to google-analytics.com/g/collect


2. Your social links had been reverted — this puts them back
------------------------------------------------------------
My 2026-10-09 fabric package shipped a content.json that still held the older
handles, so pushing it undid your corrections. Sorry — that one is on me. The live
site has been showing the wrong links since that deploy.

  wrong: https://www.instagram.com/livin.with.liv_/
  right: https://www.instagram.com/livin.with.liv__/

  wrong: https://www.tiktok.com/@livin_with_liv
  right: https://www.tiktok.com/@livin_with_liv_

This package carries the corrected ones, so pushing it fixes them. Worth clicking
both links afterwards to be sure they land on the right accounts.


3. Your site's security config was never reaching the site
----------------------------------------------------------
staticwebapp.config.json only existed in the repo root, but the deploy publishes
the dist/ folder. Azure reads that file from the folder being published, so none
of it was ever applied — the live site has been running on Azure's defaults.

That is why there was no Content-Security-Policy, no X-Frame-Options and no
Permissions-Policy live, and why Referrer-Policy was Azure's same-origin instead
of your strict-origin-when-cross-origin. The build now copies the file into dist.

One thing had to be fixed before that was safe. Your policy says style-src 'self',
which blocks inline style attributes — and the fabric tiles need them. Each of the
49 tiles sets its colour and photo with style="--chip:...;--chip-image:...". Left
as it was, switching the policy on would have wiped the colours and photos out of
every fabric picker on the site.

So the policy now reads:

  default-src 'self';
  img-src 'self' data: https://www.google-analytics.com https://www.googletagmanager.com;
  style-src 'self'; style-src-attr 'unsafe-inline';
  script-src 'self' https://www.googletagmanager.com;
  connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com
                https://analytics.google.com https://*.analytics.google.com
                https://www.googletagmanager.com;
  frame-src 'none'; base-uri 'self'; form-action 'self'

style-src-attr 'unsafe-inline' allows the tile style attributes and nothing else —
inline <style> blocks and outside stylesheets stay blocked. Google's two domains
were added in img-src, script-src and connect-src.

This is the part to look at hardest after the push: it is the first time these
headers have ever been live. If anything looks wrong on the site, this file is the
one to revert, and the Google tag will keep working without it.


4. Still outstanding
--------------------
The site has no privacy note, and Google Analytics sets a cookie. The queue card
"Privacy and terms" covers this. Worth doing next.


Commit message
--------------
Google Analytics, restore the social links, and publish the site's security config
