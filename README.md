# LivLocal push — behind-the-scenes photos, plaid removed, stray source cleaned

Built from commit 07978b6 (the current head of main).

## Add or replace these files

Drag each folder into the repo root on GitHub, replacing what is there:

- `build.js`
- `content.json`
- `src/styles.css`
- `api/_catalog.js`
- `assets/img/bts/` — 18 new files (9 photos, each a .jpg and a .webp)

## Delete these files

These five are no longer needed. Use the GitHub web UI (open the file, then the
"..." menu, then Delete file) for each:

- `assets/img/fabrics/brown-plaid.webp`
- `assets/img/stroller/build.js`
- `assets/img/stroller/content.json`
- `assets/img/stroller/src/main.js`
- `assets/img/stroller/src/styles.css`

The last four were an old copy of the site's own source sitting inside the
deployed assets folder. They were publicly downloadable and the stale
`content.json` still listed the brown and white plaid.

## What changed

- Brown & White Plaid Cotton Fabric removed. 49 fabrics down to 48.
- Home page: new "Made by hand, one at a time" band with three photos.
- About page: new "From the workroom" gallery with six photos.
- `src/styles.css`: photo grid styles, three across on desktop and two on a phone.

Do not delete any other file in `assets/img/stroller/` — the 50 bag photos there
are still used by the Quilted Stroller Bag product.
