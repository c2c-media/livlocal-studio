/* LivLocal client behaviour: nav, cart, product options, checkout. */
(function () {
  'use strict';

  var STORAGE_KEY = 'livlocal.cart.v1';

  /* --------------------------------- storage -------------------------------- */

  function readCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      /* storage unavailable, cart stays in memory for this page only */
    }
    paintCount(items);
  }

  function money(cents) {
    var v = cents / 100;
    return '$' + (v % 1 === 0 ? String(v) : v.toFixed(2));
  }

  function paintCount(items) {
    var count = (items || readCart()).reduce(function (n, i) { return n + i.qty; }, 0);
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(count);
      el.hidden = count === 0;
    });
  }

  /* ----------------------------------- nav ---------------------------------- */

  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var panel = document.getElementById('mobile-nav');
    if (!toggle || !panel) return;
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      panel.hidden = open;
      toggle.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    });
  }

  /* --------------------------------- product -------------------------------- */

  function fieldName(form, key) {
    var el = form.querySelector('[name="' + key + '"]');
    if (!el) return key;
    var fieldset = el.closest('fieldset');
    if (fieldset) {
      var legend = fieldset.querySelector('legend');
      if (legend) return legend.textContent.replace('*', '').trim();
    }
    var label = form.querySelector('label[for="' + el.id + '"]');
    if (label) return label.textContent.replace('*', '').trim();
    return key;
  }

  /** Reads every select and radio group in the buy form into a flat option list. */
  function readOptions(form) {
    var keys = [];
    form.querySelectorAll('select[name]').forEach(function (s) { keys.push(s.name); });
    var seen = {};
    form.querySelectorAll('input[type="radio"][name]').forEach(function (r) {
      if (!seen[r.name]) { seen[r.name] = true; keys.push(r.name); }
    });

    var out = [];
    keys.forEach(function (key) {
      var select = form.querySelector('select[name="' + key + '"]');
      var radio = form.querySelector('input[name="' + key + '"]:checked');
      var fieldLabel = fieldName(form, key);

      if (select && select.value) {
        // Option text looks like "0 to 3 months \u00b7 $40", so drop the price half.
        var text = select.options[select.selectedIndex].textContent.split('\u00b7')[0].trim();
        out.push({ key: key, value: select.value, label: text, fieldLabel: fieldLabel });
      } else if (radio) {
        var tile = tileFor(form, radio.value);
        out.push({
          key: key,
          value: radio.value,
          label: tile ? tile.getAttribute('data-name') || radio.value : radio.value,
          fieldLabel: fieldLabel
        });
      }
    });
    return out;
  }

  function unitPrice(form) {
    var sel = form.querySelector('select[name]');
    if (sel) {
      var opt = sel.options[sel.selectedIndex];
      if (opt && opt.dataset.price) return parseInt(opt.dataset.price, 10);
    }
    var base = form.getAttribute('data-base');
    return base ? parseInt(base, 10) : null;
  }

  /** The embroidery add-on, or null when the wording field was left empty. */
  function readEmbroidery(area, errorBox) {
    var toggle = area.querySelector('[data-embroidery-toggle]');
    if (!toggle || !toggle.checked) return { on: false, text: '', price: 0 };
    var field = area.querySelector('[data-embroidery-text]');
    var max = parseInt(toggle.getAttribute('data-max'), 10) || 30;
    var text = (field && field.value ? field.value : '').replace(/\s+/g, ' ').trim().slice(0, max);
    if (!text) {
      if (errorBox) {
        errorBox.textContent = 'Add the wording you would like embroidered, or untick Add embroidery.';
        errorBox.hidden = false;
      }
      return null;
    }
    return { on: true, text: text, price: parseInt(toggle.getAttribute('data-price'), 10) || 0 };
  }

  function initProduct() {
    var form = document.querySelector('[data-buy]');
    if (!form) return;
    var area = document.querySelector('[data-buy-area]') || form;
    var display = document.querySelector('[data-price-display]');
    var errorBox = form.querySelector('[data-buy-error]');

    function refreshPrice() {
      if (!display) return;
      var p = unitPrice(form);
      if (p == null) return;
      var toggle = area.querySelector('[data-embroidery-toggle]');
      if (toggle && toggle.checked) p += parseInt(toggle.getAttribute('data-price'), 10) || 0;
      var sel = form.querySelector('select[name]');
      display.textContent = sel ? money(p) : 'From ' + money(p);
    }

    form.addEventListener('change', refreshPrice);
    refreshPrice();

    /* The wording field only appears once embroidery is ticked. */
    var embroideryToggle = area.querySelector('[data-embroidery-toggle]');
    var embroideryField = area.querySelector('[data-embroidery-field]');
    if (embroideryToggle && embroideryField) {
      var syncEmbroidery = function () {
        embroideryField.hidden = !embroideryToggle.checked;
      };
      embroideryToggle.addEventListener('change', syncEmbroidery);
      syncEmbroidery();
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (errorBox) { errorBox.hidden = true; }

      var missing = [];
      area.querySelectorAll('select[name][required]').forEach(function (s) {
        if (!s.value) missing.push(s.name);
      });
      area.querySelectorAll('fieldset[data-opt]').forEach(function (fs) {
        if (!fs.querySelector('input[type="radio"]:checked')) missing.push(fs.getAttribute('data-opt'));
      });
      if (missing.length) {
        if (errorBox) { errorBox.textContent = 'Choose an option for every field before adding to cart.'; errorBox.hidden = false; }
        return;
      }

      var price = unitPrice(form);
      if (price == null) {
        if (errorBox) { errorBox.textContent = 'This piece needs a quote before it can be ordered. Please use the request form.'; errorBox.hidden = false; }
        return;
      }

      var embroidery = readEmbroidery(area, errorBox);
      if (!embroidery) return;

      var qtyInput = form.querySelector('input[name="qty"]');
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput && qtyInput.value, 10) || 1));
      var options = readOptions(area);
      var slug = form.getAttribute('data-slug');
      if (embroidery.on) {
        options.push({
          key: 'embroidery',
          value: embroidery.text,
          label: embroidery.text,
          fieldLabel: 'Embroidery'
        });
      }
      var id = slug + '|' + options.map(function (o) { return o.key + ':' + o.value; }).join('|');

      var items = readCart();
      var existing = items.find(function (i) { return i.id === id; });
      if (existing) {
        existing.qty = Math.min(10, existing.qty + qty);
      } else {
        items.push({
          id: id,
          slug: slug,
          name: form.getAttribute('data-name'),
          price: price,
          qty: qty,
          options: options
        });
      }

      /* The $5 embroidery charge is its own cart line, and follows the item's quantity. */
      if (embroidery.on && embroidery.price > 0) {
        var addonId = slug + '--embroidery|' + embroidery.text.toLowerCase();
        var addon = items.find(function (i) { return i.id === addonId; });
        if (addon) {
          addon.qty = Math.min(10, addon.qty + qty);
          addon.parentId = id;
        } else {
          items.push({
            id: addonId,
            slug: slug + '--embroidery',
            parentSlug: slug,
            name: 'Embroidery',
            price: embroidery.price,
            qty: qty,
            addon: true,
            parentId: id,
            options: [{
              key: 'embroidery',
              value: embroidery.text,
              label: embroidery.text,
              fieldLabel: 'Embroidery'
            }]
          });
        }
      }

      writeCart(items);
      window.location.href = '/cart.html';
    });
  }

  /* ---------------------------------- filters -------------------------------- */

  function initFilters() {
    var buttons = document.querySelectorAll('[data-filter]');
    if (!buttons.length) return;
    var items = document.querySelectorAll('#shop-grid .grid-item');
    var empty = document.getElementById('shop-empty');

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var want = btn.getAttribute('data-filter');
        buttons.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        var shown = 0;
        items.forEach(function (item) {
          var match = want === 'all' || item.getAttribute('data-category') === want;
          item.hidden = !match;
          if (match) shown++;
        });
        if (empty) empty.hidden = shown > 0;
      });
    });
  }

  /* ----------------------------------- cart --------------------------------- */

  function tileTint(slug) {
    var map = { 'kids-dress': 'clay', 'quilted-bag': 'sage', 'bible-bag': 'gold' };
    return map[slug] || 'clay';
  }

  function renderCart() {
    var root = document.getElementById('cart-filled');
    var empty = document.getElementById('cart-empty');
    if (!root || !empty) return;

    var items = readCart();
    if (!items.length) {
      root.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    root.hidden = false;

    var list = document.getElementById('cart-items');
    list.innerHTML = items.map(function (item, index) {
      var opts = item.options.map(function (o) {
        return '<span>' + escapeHtml(o.label) + ': ' + escapeHtml(o.fieldLabel || o.value) + '</span>';
      }).join('');
      var linkSlug = item.parentSlug || item.slug;
      return '' +
        '<article class="cart-line' + (item.addon ? ' cart-line--addon' : '') + '" data-index="' + index + '">' +
          '<div class="cart-thumb tile tile--' + tileTint(linkSlug) + '"><span class="tile-weave"></span></div>' +
          '<div>' +
            '<h3><a href="/product/' + escapeHtml(linkSlug) + '.html">' + escapeHtml(item.name) + '</a></h3>' +
            '<p class="cart-opts">' + opts + '</p>' +
            '<div class="cart-line-controls">' +
              '<label class="sr-only" for="qty-' + index + '">Quantity for ' + escapeHtml(item.name) + '</label>' +
              '<input id="qty-' + index + '" type="number" min="1" max="10" value="' + item.qty + '" inputmode="numeric" data-qty="' + index + '">' +
              '<button class="cart-remove" type="button" data-remove="' + index + '">Remove</button>' +
            '</div>' +
          '</div>' +
          '<p class="cart-line-price">' + money(item.price * item.qty) + '</p>' +
        '</article>';
    }).join('');

    var subtotal = items.reduce(function (n, i) { return n + i.price * i.qty; }, 0);
    document.getElementById('cart-subtotal').textContent = money(subtotal);

    list.querySelectorAll('[data-qty]').forEach(function (input) {
      input.addEventListener('change', function () {
        var idx = parseInt(input.getAttribute('data-qty'), 10);
        var next = readCart();
        var line = next[idx];
        if (!line) return;
        var qty = Math.max(1, Math.min(10, parseInt(input.value, 10) || 1));
        line.qty = qty;
        /* An embroidery charge is per item, so it follows the quantity it belongs to. */
        if (!line.addon) {
          next.forEach(function (other) {
            if (other.addon && other.parentId === line.id) other.qty = qty;
          });
        }
        writeCart(next);
        renderCart();
      });
    });
    list.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-remove'), 10);
        var next = readCart();
        var line = next[idx];
        if (!line) return;
        /* Removing the piece takes its embroidery with it, and removing the
           embroidery leaves the piece without it. */
        var kept = next.filter(function (other, i) {
          if (i === idx) return false;
          if (line.addon) return true;
          return !(other.addon && other.parentId === line.id);
        });
        if (line.addon) {
          kept.forEach(function (other) {
            if (other.id === line.parentId && other.options) {
              other.options = other.options.filter(function (o) { return o.key !== 'embroidery'; });
            }
          });
        }
        writeCart(kept);
        renderCart();
      });
    });
  }

  function initCheckout() {
    var btn = document.getElementById('checkout-btn');
    if (!btn) return;
    var errorBox = document.getElementById('checkout-error');

    btn.addEventListener('click', function () {
      var items = readCart();
      if (!items.length) return;
      if (errorBox) { errorBox.hidden = true; }
      btn.disabled = true;
      btn.textContent = 'Starting checkout...';

      fetch('/api/create-payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(function (i) {
            var opts = {};
            i.options.forEach(function (o) { opts[o.key] = o.value; });
            return {
              slug: i.slug,
              qty: i.qty,
              size: opts.size || null,
              primaryFabric: opts.primaryFabric || null,
              secondaryFabric: opts.secondaryFabric || null,
              embroidery: opts.embroidery || null
            };
          })
        })
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (result.ok && result.data && result.data.url) {
            window.location.href = result.data.url;
            return;
          }
          throw new Error((result.data && result.data.error) || 'Checkout could not be started.');
        })
        .catch(function (err) {
          btn.disabled = false;
          btn.textContent = 'Checkout';
          if (errorBox) { errorBox.textContent = err.message + ' Please try again, or email us and we will take the order directly.'; errorBox.hidden = false; }
        });
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* --------------------------------- contact --------------------------------- */

  function initContactPrefill() {
    var params = new URLSearchParams(window.location.search);
    var piece = params.get('piece');
    var link = document.getElementById('contact-link');
    if (!piece || !link) return;
    var href = link.getAttribute('href');
    link.setAttribute('href', href + '?subject=' + encodeURIComponent('Custom order: ' + piece));
  }

/* --------------------------------- contact -------------------------------- */

  function initContactForm() {
    var form = document.querySelector('[data-contact-form]');
    if (!form) return;

    var status = form.querySelector('[data-contact-status]');
    var submit = form.querySelector('[data-contact-submit]');
    var link = document.getElementById('contact-link');
    var fallback = link ? link.textContent.trim() : 'us';

    function say(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className = 'contact-status' + (kind ? ' is-' + kind : '');
    }

    function valueOf(key) {
      var el = form.elements.namedItem(key);
      return el && typeof el.value === 'string' ? el.value.trim() : '';
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var data = {
        name: valueOf('name'),
        email: valueOf('email'),
        topic: valueOf('topic'),
        message: valueOf('message'),
        website: valueOf('website')
      };

      if (!data.name || !data.email || !data.message) {
        say('Please add your name, your email, and a message.', 'bad');
        return;
      }

      submit.disabled = true;
      say('Sending&hellip;'.replace('&hellip;', '\u2026'));

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (response) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (body) {
              if (!response.ok) {
                throw new Error((body && body.error) || 'We could not send that just now.');
              }
              form.reset();
              say('Thanks, we got it. We reply as soon as we can, usually within a couple of days.', 'good');
            });
        })
        .catch(function (error) {
          say((error && error.message ? error.message : 'We could not send that just now.') + ' You can also email us at ' + fallback + '.', 'bad');
        })
        .then(function () {
          submit.disabled = false;
        });
    });
  }

  /* --------------------------------- gallery -------------------------------- */

  function parseJson(raw) {
    try {
      var value = JSON.parse(raw || '[]');
      return Array.isArray(value) ? value : [];
    } catch (err) {
      return [];
    }
  }

  /** The grid tile for one fabric id, which carries the name and SKU. */
  function tileFor(form, id) {
    if (!form || !id) return null;
    return form.querySelector('[data-grid] .swatch[data-id="' + id + '"]');
  }

  /** The chosen fabric for one option, read from the picker's hidden radio. */
  function checkedFabric(form, key) {
    var input = form.querySelector('input[name="' + key + '"]:checked');
    if (!input) return null;
    var tile = tileFor(form, input.value);
    return {
      id: input.value,
      sku: tile ? tile.getAttribute('data-sku') || '' : '',
      name: tile ? tile.getAttribute('data-name') || input.value : input.value
    };
  }

  function initGallery() {
    var gallery = document.querySelector('[data-gallery]');
    if (!gallery) return;
    var main = gallery.querySelector('[data-gallery-main]');
    var webp = gallery.querySelector('[data-gallery-webp]');
    var caption = gallery.querySelector('[data-gallery-caption]');
    var status = gallery.querySelector('[data-gallery-status]');
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-index]'));
    var stage = gallery.querySelector('[data-gallery-stage]');
    var prevBtn = gallery.querySelector('[data-gallery-prev]');
    var nextBtn = gallery.querySelector('[data-gallery-next]');
    var counter = gallery.querySelector('[data-gallery-count]');
    if (!main || !thumbs.length) return;

    var images = parseJson(gallery.getAttribute('data-images'));
    var pairs = parseJson(gallery.getAttribute('data-pairs'));
    var form = document.querySelector('[data-buy]');
    var root = document.querySelector('[data-buy-area]') || form;
    var dir = gallery.getAttribute('data-image-dir') || '/assets/img/lydia/';
    var shown = 0;

    function show(index, message) {
      var im = images[index];
      if (!im) return;
      shown = index;
      main.setAttribute('src', dir + im.slug + '-550.jpg');
      main.setAttribute('srcset', dir + im.slug + '-550.jpg 550w, ' + dir + im.slug + '.jpg 1100w');
      main.setAttribute('alt', im.alt || '');
      if (webp) {
        webp.setAttribute('srcset', dir + im.slug + '-550.webp 550w, ' + dir + im.slug + '.webp 1100w');
      }
      if (caption) caption.textContent = im.caption || '';
      thumbs.forEach(function (thumb, i) {
        var on = i === index;
        thumb.classList.toggle('is-active', on);
        thumb.setAttribute('aria-pressed', String(on));
      });
      if (status) {
        status.textContent = message || '';
        status.hidden = !message;
      }
      if (counter) counter.textContent = (index + 1) + ' / ' + images.length;
    }

    /** Moving by hand, which clears any message about the selected pair. */
    function step(delta) {
      if (images.length < 2) return;
      show((shown + delta + images.length) % images.length, '');
    }

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        show(parseInt(thumb.getAttribute('data-gallery-index'), 10), '');
      });
    });

    if (prevBtn) prevBtn.addEventListener('click', function () { step(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { step(1); });

    if (stage) {
      /* Keyboard: the stage takes focus, then the arrow keys walk the photos. */
      stage.addEventListener('keydown', function (event) {
        var key = event.key;
        if (key === 'ArrowRight') { event.preventDefault(); step(1); }
        else if (key === 'ArrowLeft') { event.preventDefault(); step(-1); }
        else if (key === 'Home') { event.preventDefault(); show(0, ''); }
        else if (key === 'End') { event.preventDefault(); show(images.length - 1, ''); }
      });

      /* Swipe: a sideways drag moves one photo. A vertical drag is left alone, so
         the page still scrolls normally. */
      var tracking = false;
      var decided = false;
      var startX = 0;
      var startY = 0;
      var moved = 0;

      stage.addEventListener('pointerdown', function (event) {
        if (images.length < 2) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        tracking = true;
        decided = false;
        moved = 0;
        startX = event.clientX;
        startY = event.clientY;
      });

      stage.addEventListener('pointermove', function (event) {
        if (!tracking) return;
        var dx = event.clientX - startX;
        var dy = event.clientY - startY;
        if (!decided) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          decided = true;
          if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
          if (stage.setPointerCapture) {
            try { stage.setPointerCapture(event.pointerId); } catch (err) { /* not capturable */ }
          }
        }
        moved = dx;
      });

      function endDrag() {
        if (!tracking) return;
        tracking = false;
        if (Math.abs(moved) < 40) return;
        step(moved < 0 ? 1 : -1);
      }

      stage.addEventListener('pointerup', endDrag);
      stage.addEventListener('pointercancel', function () { tracking = false; });
    }

    /** A combination photo shows only for an exact dress-body plus collar pair. */
    function syncToSelection() {
      if (!root || !pairs.length) return;
      var body = checkedFabric(root, 'primaryFabric');
      var collar = checkedFabric(root, 'secondaryFabric');
      var match = null;
      if (body && collar && body.sku && collar.sku) {
        for (var i = 0; i < pairs.length; i++) {
          if (pairs[i].dress === body.sku && pairs[i].collar === collar.sku) {
            match = pairs[i];
            break;
          }
        }
      }
      if (match) {
        for (var j = 0; j < images.length; j++) {
          if (images[j].slug === match.image) {
            show(
              j,
              'Showing the photo that matches your selection: ' +
                body.name +
                ' dress body with a ' +
                collar.name +
                ' collar.'
            );
            return;
          }
        }
      }
      /* no photo of this pair: fall back to the first photo and say nothing */
      if (status) {
        status.textContent = '';
        status.hidden = true;
      }
      if (shown !== 0) show(0, '');
    }

    if (root) {
      root.addEventListener('change', function (event) {
        var name = event.target && event.target.name;
        if (name === 'primaryFabric' || name === 'secondaryFabric') syncToSelection();
      });
    }
  }

  /* ----------------------------- fabric previews ---------------------------- */

  /** The magnifier opens the preview on click, on every device. */
  function initSwatchPreview() {
    var tiles = document.querySelectorAll('[data-picker] .swatch[data-image]');
    if (!tiles.length) return;

    var pop = null;
    var image = null;
    var nameEl = null;
    var metaEl = null;
    var openFor = null;
    var openedAt = 0;

    function build() {
      if (pop) return;
      pop = document.createElement('div');
      pop.className = 'fabric-preview';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Fabric preview');
      pop.hidden = true;
      pop.innerHTML =
        '<button type="button" class="fabric-preview-close" data-preview-close aria-label="Close fabric preview">\u00d7</button>' +
        '<img data-preview-image alt="" width="320" height="320" decoding="async">' +
        '<p class="fabric-preview-name" data-preview-name></p>' +
        '<p class="fabric-preview-meta" data-preview-meta></p>';
      document.body.appendChild(pop);
      image = pop.querySelector('[data-preview-image]');
      nameEl = pop.querySelector('[data-preview-name]');
      metaEl = pop.querySelector('[data-preview-meta]');
      pop.querySelector('[data-preview-close]').addEventListener('click', close);
    }

    function place(anchor) {
      var rect = anchor.getBoundingClientRect();
      var box = pop.getBoundingClientRect();
      var margin = 10;
      var top = rect.bottom + margin;
      if (top + box.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - box.height - margin);
      }
      var left = rect.left + rect.width / 2 - box.width / 2;
      left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - box.width - margin));
      pop.style.top = Math.round(top + window.scrollY) + 'px';
      pop.style.left = Math.round(left) + 'px';
    }

    /** Colour tags, pattern, and SKU, which the three-word tile name leaves out. */
    function detail(tile) {
      var colors = (tile.getAttribute('data-colors') || '').split('|').filter(Boolean);
      var pattern = tile.getAttribute('data-pattern') || '';
      var sku = tile.getAttribute('data-sku') || '';
      return [colors.join(', '), pattern, sku ? 'SKU ' + sku : ''].filter(Boolean).join(' \u00b7 ');
    }

    function open(tile) {
      var src = tile.getAttribute('data-image');
      if (!src) return;
      var name = tile.getAttribute('data-name') || '';
      build();
      image.setAttribute('src', src);
      image.setAttribute('alt', name + ' fabric swatch');
      nameEl.textContent = name;
      metaEl.textContent = detail(tile);
      pop.hidden = false;
      openFor = tile;
      openedAt = Date.now();
      place(tile.querySelector('.swatch-chip') || tile);
    }

    function close() {
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      openFor = null;
    }

    Array.prototype.forEach.call(tiles, function (tile) {
      var zoom = tile.querySelector('[data-zoom]');
      if (!zoom) return;
      zoom.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (openFor === tile) close();
        else open(tile);
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.keyCode === 27) close();
    });
    document.addEventListener('click', function (event) {
      if (!pop || pop.hidden) return;
      if (pop.contains(event.target)) return;
      if (openFor && openFor.contains(event.target)) return;
      close();
    });
    /* A tap can land while the page is still settling, so ignore the scroll that
       follows it rather than closing the preview the moment it opens. */
    window.addEventListener(
      'scroll',
      function () {
        if (Date.now() - openedAt < 300) return;
        close();
      },
      { passive: true }
    );
    window.addEventListener('resize', close);
  }

  /* ------------------------------- fabric picker ----------------------------- */

  /** Two pinned slots, a search box, a pattern row, a colour row, and the grid. */
  function initPicker() {
    var picker = document.querySelector('[data-picker]');
    if (!picker) return;
    var root = document.querySelector('[data-buy-area]') || picker;

    var grid = picker.querySelector('[data-grid]');
    var tiles = Array.prototype.slice.call(grid.querySelectorAll('.swatch'));
    var slots = Array.prototype.slice.call(picker.querySelectorAll('[data-slot]'));
    var help = picker.querySelector('[data-picker-help]');
    var search = picker.querySelector('[data-search]');
    var status = picker.querySelector('[data-status]');
    var empty = picker.querySelector('[data-empty]');
    var patternRow = picker.querySelector('[data-pattern-row]');
    var colorRow = picker.querySelector('[data-color-row]');
    var reset = picker.querySelector('[data-reset]');
    var total = tiles.length;
    var active = slots.length ? slots[0].getAttribute('data-slot') : '';
    var pattern = '';
    var color = '';

    function radioFor(key) {
      return root.querySelector('input[name="' + key + '"]:checked');
    }

    function tileForId(id) {
      for (var i = 0; i < tiles.length; i++) {
        if (tiles[i].getAttribute('data-id') === id) return tiles[i];
      }
      return null;
    }

    function matches(tile) {
      if (pattern && tile.getAttribute('data-pattern') !== pattern) return false;
      if (color) {
        var colors = (tile.getAttribute('data-colors') || '').split('|');
        if (colors.indexOf(color) === -1) return false;
      }
      var query = (search && search.value ? search.value : '').trim().toLowerCase();
      if (!query) return true;
      var haystack = [
        tile.getAttribute('data-name') || '',
        tile.getAttribute('data-sku') || '',
        (tile.getAttribute('data-colors') || '').split('|').join(' ')
      ].join(' ').toLowerCase();
      return haystack.indexOf(query) !== -1;
    }

    function applyFilters() {
      var shown = 0;
      tiles.forEach(function (tile) {
        var ok = matches(tile);
        tile.classList.toggle('is-filtered-out', !ok);
        if (ok) shown += 1;
      });
      if (empty) empty.classList.toggle('is-on', shown === 0);
      if (!status) return;
      var bits = ['Showing ' + shown + ' of ' + total];
      if (pattern) bits.push('Pattern: ' + pattern);
      if (color) bits.push('Color: ' + color);
      var query = (search && search.value ? search.value : '').trim();
      if (query) bits.push('\u201c' + query + '\u201d');
      status.textContent = bits.join(' \u00b7 ');
    }

    function paint() {
      slots.forEach(function (slot) {
        var key = slot.getAttribute('data-slot');
        var on = key === active;
        slot.classList.toggle('is-active', on);
        slot.setAttribute('aria-pressed', String(on));
        var chosen = radioFor(key);
        var tile = chosen ? tileForId(chosen.value) : null;
        var chip = slot.querySelector('[data-slot-chip]');
        var nameEl = slot.querySelector('[data-slot-name]');
        if (tile) {
          chip.style.setProperty('--chip', tile.getAttribute('data-hex') || '');
          chip.style.setProperty(
            '--chip-image',
            tile.getAttribute('data-image') ? 'url("' + tile.getAttribute('data-image') + '")' : 'none'
          );
          nameEl.textContent = tile.getAttribute('data-name') || '';
        } else {
          chip.style.removeProperty('--chip-image');
          chip.style.removeProperty('--chip');
          nameEl.textContent = 'Choose a fabric';
        }
        if (on && help) help.textContent = slot.getAttribute('data-help') || '';
      });

      tiles.forEach(function (tile) {
        var id = tile.getAttribute('data-id');
        // remember which slot took this tile, so the collar's outline stays blue
        var pickedBy = '';
        slots.forEach(function (slot) {
          var chosen = radioFor(slot.getAttribute('data-slot'));
          if (chosen && chosen.value === id && !pickedBy) pickedBy = slot.getAttribute('data-slot');
        });
        var picked = !!pickedBy;
        tile.classList.toggle('is-picked', picked);
        if (picked) tile.setAttribute('data-picked-slot', pickedBy);
        else tile.removeAttribute('data-picked-slot');
        var button = tile.querySelector('.swatch-pick');
        if (button) button.setAttribute('aria-pressed', String(picked));
      });
    }

    /**
     * Picking a tile fills the active slot and tells the gallery what changed.
     * The picker then moves on to the slot that still needs a fabric, so the
     * buyer never presses Change, and one fabric is never used in both slots.
     */
    function pick(id) {
      var input = root.querySelector('input[name="' + active + '"][value="' + id + '"]');
      if (!input) return;
      var previous = radioFor(active);
      var previousId = previous ? previous.value : '';
      slots.forEach(function (slot) {
        var key = slot.getAttribute('data-slot');
        if (key === active) return;
        var chosen = radioFor(key);
        if (!chosen || chosen.value !== id) return;
        var swap = previousId
          ? root.querySelector('input[name="' + key + '"][value="' + previousId + '"]')
          : null;
        chosen.checked = false;
        if (swap) {
          swap.checked = true;
          swap.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      for (var i = 0; i < slots.length; i++) {
        var nextKey = slots[i].getAttribute('data-slot');
        if (!radioFor(nextKey)) {
          active = nextKey;
          break;
        }
      }
      paint();
    }

    function setChipRow(row, value) {
      if (!row) return;
      Array.prototype.forEach.call(row.children, function (button) {
        var on = (button.getAttribute('data-value') || '') === value;
        button.classList.toggle('is-active', on);
        button.setAttribute('aria-pressed', String(on));
      });
    }

    slots.forEach(function (slot) {
      slot.addEventListener('click', function () {
        active = slot.getAttribute('data-slot');
        paint();
      });
    });

    if (search) {
      search.addEventListener('input', applyFilters);
      /* Enter should narrow the list, never submit the buy form. */
      search.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.keyCode === 13) event.preventDefault();
        if (event.key === 'Escape' || event.keyCode === 27) {
          search.value = '';
          applyFilters();
        }
      });
    }

    function chipClick(row, set) {
      if (!row) return;
      row.addEventListener('click', function (event) {
        var button = event.target.closest('button[data-value]');
        if (!button) return;
        set(button.getAttribute('data-value') || '');
        applyFilters();
      });
    }
    chipClick(patternRow, function (value) {
      pattern = value;
      setChipRow(patternRow, value);
    });
    chipClick(colorRow, function (value) {
      color = value;
      setChipRow(colorRow, value);
    });

    grid.addEventListener('click', function (event) {
      var button = event.target.closest('.swatch-pick');
      if (!button) return;
      var tile = button.closest('.swatch');
      if (tile) pick(tile.getAttribute('data-id'));
    });

    if (reset) {
      reset.addEventListener('click', function () {
        slots.forEach(function (slot) {
          var key = slot.getAttribute('data-slot');
          Array.prototype.forEach.call(root.querySelectorAll('input[name="' + key + '"]'), function (radio) {
            radio.checked = false;
          });
        });
        pattern = '';
        color = '';
        if (search) search.value = '';
        setChipRow(patternRow, '');
        setChipRow(colorRow, '');
        var first = slots.length ? slots[0].getAttribute('data-slot') : '';
        if (first) {
          active = first;
          var radio = root.querySelector('input[name="' + first + '"]');
          if (radio) radio.dispatchEvent(new Event('change', { bubbles: true }));
        }
        paint();
        applyFilters();
      });
    }

    paint();
    applyFilters();
  }

  /* ----------------------------------- boot ---------------------------------- */

  function boot() {
    initNav();
    initProduct();
    initPicker();
    initGallery();
    initSwatchPreview();
    initFilters();
    renderCart();
    initCheckout();
    initContactPrefill();
    initContactForm();
    paintCount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
