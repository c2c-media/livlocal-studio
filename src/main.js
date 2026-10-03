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
        var holder = radio.closest('label');
        var nameEl = holder && holder.querySelector('.swatch-name');
        out.push({
          key: key,
          value: radio.value,
          label: nameEl ? nameEl.textContent.trim() : radio.value,
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

  function initProduct() {
    var form = document.querySelector('[data-buy]');
    if (!form) return;
    var display = document.querySelector('[data-price-display]');
    var errorBox = form.querySelector('[data-buy-error]');

    function refreshPrice() {
      if (!display) return;
      var p = unitPrice(form);
      if (p == null) return;
      var sel = form.querySelector('select[name]');
      display.textContent = sel ? money(p) : 'From ' + money(p);
    }

    form.addEventListener('change', refreshPrice);
    refreshPrice();

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (errorBox) { errorBox.hidden = true; }

      var missing = [];
      form.querySelectorAll('select[name][required]').forEach(function (s) {
        if (!s.value) missing.push(s.name);
      });
      form.querySelectorAll('fieldset[data-opt]').forEach(function (fs) {
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

      var qtyInput = form.querySelector('input[name="qty"]');
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput && qtyInput.value, 10) || 1));
      var options = readOptions(form);
      var slug = form.getAttribute('data-slug');
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
      return '' +
        '<article class="cart-line" data-index="' + index + '">' +
          '<div class="cart-thumb tile tile--' + tileTint(item.slug) + '"><span class="tile-weave"></span></div>' +
          '<div>' +
            '<h3><a href="/product/' + escapeHtml(item.slug) + '.html">' + escapeHtml(item.name) + '</a></h3>' +
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
        next[idx].qty = Math.max(1, Math.min(10, parseInt(input.value, 10) || 1));
        writeCart(next);
        renderCart();
      });
    });
    list.querySelectorAll('[data-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-remove'), 10);
        var next = readCart();
        next.splice(idx, 1);
        writeCart(next);
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
              secondaryFabric: opts.secondaryFabric || null
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

  /* --------------------------------- gallery -------------------------------- */

  function parseJson(raw) {
    try {
      var value = JSON.parse(raw || '[]');
      return Array.isArray(value) ? value : [];
    } catch (err) {
      return [];
    }
  }

  /** The chosen swatch in one fabric fieldset, with its SKU and display name. */
  function checkedFabric(form, key) {
    var input = form.querySelector('input[name="' + key + '"]:checked');
    if (!input) return null;
    var label = input.closest('label');
    if (!label) return null;
    var nameEl = label.querySelector('.swatch-name');
    return {
      id: input.value,
      sku: label.getAttribute('data-fabric-sku') || '',
      name: nameEl ? nameEl.textContent.trim() : input.value
    };
  }

  function initGallery() {
    var gallery = document.querySelector('[data-gallery]');
    if (!gallery) return;
    var main = gallery.querySelector('[data-gallery-main]');
    var webp = gallery.querySelector('[data-gallery-webp]');
    var caption = gallery.querySelector('[data-gallery-caption]');
    var badge = gallery.querySelector('[data-gallery-badge]');
    var status = gallery.querySelector('[data-gallery-status]');
    var thumbs = Array.prototype.slice.call(gallery.querySelectorAll('[data-gallery-index]'));
    if (!main || !thumbs.length) return;

    var images = parseJson(gallery.getAttribute('data-images'));
    var pairs = parseJson(gallery.getAttribute('data-pairs'));
    var form = document.querySelector('[data-buy]');
    var dir = '/assets/img/lydia/';
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
      if (badge) badge.textContent = im.kind === 'photo' ? 'Photo' : 'Illustrative preview';
      thumbs.forEach(function (thumb, i) {
        var on = i === index;
        thumb.classList.toggle('is-active', on);
        thumb.setAttribute('aria-pressed', String(on));
      });
      if (status) {
        status.textContent = message || '';
        status.hidden = !message;
      }
    }

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        show(parseInt(thumb.getAttribute('data-gallery-index'), 10), '');
      });
    });

    /** A combination photo shows only for an exact dress-body plus collar pair. */
    function syncToSelection() {
      if (!form || !pairs.length) return;
      var body = checkedFabric(form, 'primaryFabric');
      var collar = checkedFabric(form, 'secondaryFabric');
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
              'Showing the preview that matches your selection: ' +
                body.name +
                ' dress body with a ' +
                collar.name +
                ' collar.'
            );
            return;
          }
        }
      }
      if (shown !== 0) show(0, '');
      if (status && body && collar) {
        status.textContent =
          'No preview exists for that combination, so the photos show example combinations, not the fabrics you have selected.';
        status.hidden = false;
      }
    }

    if (form) {
      form.addEventListener('change', function (event) {
        var name = event.target && event.target.name;
        if (name === 'primaryFabric' || name === 'secondaryFabric') syncToSelection();
      });
    }
  }

  /* ----------------------------- fabric previews ---------------------------- */

  function initSwatchPreview() {
    var labels = document.querySelectorAll('.swatch[data-fabric-image]');
    if (!labels.length) return;

    var pop = null;
    var image = null;
    var nameEl = null;
    var openFor = null;

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
        '<p class="fabric-preview-name" data-preview-name></p>';
      document.body.appendChild(pop);
      image = pop.querySelector('[data-preview-image]');
      nameEl = pop.querySelector('[data-preview-name]');
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

    function open(label) {
      var src = label.getAttribute('data-fabric-image');
      if (!src) return;
      var name = label.getAttribute('data-fabric-name') || '';
      build();
      image.setAttribute('src', src);
      image.setAttribute('alt', name + ' fabric swatch');
      nameEl.textContent = name;
      pop.hidden = false;
      openFor = label;
      place(label.querySelector('.swatch-chip') || label);
    }

    function close() {
      if (!pop || pop.hidden) return;
      pop.hidden = true;
      openFor = null;
    }

    Array.prototype.forEach.call(labels, function (label) {
      label.addEventListener('mouseenter', function () { open(label); });
      label.addEventListener('mouseleave', function () {
        if (openFor === label) close();
      });
      label.addEventListener('focusin', function () { open(label); });
      label.addEventListener('focusout', function (event) {
        if (!pop || !pop.contains(event.relatedTarget)) close();
      });
      var zoom = label.querySelector('[data-swatch-zoom]');
      if (zoom) {
        zoom.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (openFor === label) close();
          else open(label);
        });
      }
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
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
  }

  /* ----------------------------------- boot ---------------------------------- */

  function boot() {
    initNav();
    initProduct();
    initGallery();
    initSwatchPreview();
    initFilters();
    renderCart();
    initCheckout();
    initContactPrefill();
    paintCount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
