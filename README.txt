LivLocal — two new fabrics, 2026-10-09
======================================

Files in this package (repo-relative paths):

  content.json                              Two fabrics added to the list.
  assets/img/fabrics/soft-pink-calico.webp  New tile.
  assets/img/fabrics/pink-bows-calico.webp  New tile.

Nothing else changes. build.js, src/main.js and src/styles.css are untouched.


What was added
--------------
1. Soft Pink Cotton Calico Fabric     SKU 2557528   Solid     Light, Pink
2. Pink Bows Cotton Calico Fabric     SKU 2469302   Novelty   Light, Pink

Both are now in the LivLocal Fabric Library in Notion as well, with their
reference images attached, so the library and the site agree.

The first is Hobby Lobby's plain "Cotton Calico Fabric" in Soft Pink. The name
was written out as "Soft Pink Cotton Calico Fabric" because a fabric called
plain "Cotton Calico Fabric" would be hard to pick out among 49. Say the word
if you would rather it read exactly as Hobby Lobby has it.

The second keeps Hobby Lobby's own name. It is by Brother Sister Design Studio.

Where they sit in the picker
----------------------------
The list runs roughly alphabetically, so they were slotted in:
  Pink Bows Cotton Calico Fabric     after Painted Flowers
  Soft Pink Cotton Calico Fabric     after Rust Floral

The tiles read "Pink Bows" and "Soft Pink" in the grid; the full name shows in
the magnify view and in the cart.


Where the photos came from
---------------------------
Hobby Lobby's own product photos, at 1000 x 1000, cut down to the same
320 x 320 WebP the other 47 tiles use. The photo edges fade to white, so a
25px border was trimmed off before resizing; without that the tiles would have
had a washed-out rim next to the others.

Colour chips: Soft Pink #EFCEDE, Pink Bows #CAC1C4. Those are the average
colour of each tile, which is how the other 47 are set.


Checked
-------
- 49 tiles now, up from 47.
- The filter counts moved as expected: Solid 4 to 5, Novelty 14 to 15,
  Light 20 to 22, Pink 8 to 10. Every other count is unchanged.
- Search finds them by SKU (2557528, 2469302), by name ("bows"), and by
  colour words ("soft pink").
- Both tile images load, and picking one fills the fabric slot.
- 12 pages build. No overflow at 390px wide.
- Site QA reports only the two known mobile photo-strip findings.

One thing worth a glance: the Pink Bows fabric is a pale pink with low-contrast
pink bows, so its tile looks soft next to the bolder prints. That is the fabric,
not the photo. If it reads too washed out in the grid, it can be zoomed in a
little so the bows show more.


After the push
--------------
The GitHub Action runs node build.js and deploys. Nothing else to do.


Commit message
--------------
Two new fabrics: Soft Pink Cotton Calico and Pink Bows Cotton Calico
