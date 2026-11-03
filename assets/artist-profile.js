// Fills an artist page with what the artist saved in /studio (via /api/profile).
// The page's own HTML stays as the fallback: nothing changes until the artist has saved,
// and if the request fails the page works as before.
//
//   <body data-artist-page="sunny-ali" data-phone="919872366050">
//   [data-p="tagline"]     one-line intro
//   [data-p="bio"]         paragraphs (class "lead")
//   [data-p="services"]    service groups (.svc cards)
//   [data-p="gallery"]     photos first, then Instagram reels/posts
//   [data-p="rates"]       price groups with "Book this look"; left alone if no rates saved
//   [data-p="phone-text"]  visible phone number
//   [data-p="stats"]       the highlights under the name (experience etc.)
//   [data-p="avatar"]      replaced by the round profile picture
//   [data-p="cover"]       an <img> gets the cover as its src; any other element gets it as --cover
//                          and the class has-cover
//   a[href^="https://wa.me/<old>"], a[href="tel:+<old>"]  switched to the saved number
//
// On the homepage, [data-artist-phones] makes artist cards and the booking form use saved numbers,
// and artist cards show saved profile pictures.
(function () {
  'use strict';

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function swapPhone(oldP, newP) {
    if (!newP || newP === oldP) return;
    document.querySelectorAll('a[href^="https://wa.me/' + oldP + '"], a[href="tel:+' + oldP + '"]').forEach(function (a) {
      a.setAttribute('href', a.getAttribute('href').replace(oldP, newP));
    });
    document.querySelectorAll('[data-wa="' + oldP + '"]').forEach(function (o) { o.setAttribute('data-wa', newP); });
  }

  // ---------- Homepage: just the phone numbers ----------
  if (document.querySelector('[data-artist-phones]')) {
    fetch('/api/profile?phones=1').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.artists) return;
      document.querySelectorAll('option[data-artist][data-wa]').forEach(function (o) {
        var saved = d.artists[o.getAttribute('data-artist')];
        if (saved) swapPhone(o.getAttribute('data-wa'), saved);
      });
      // "10+ years." on artist cards follows the experience the artist saved
      Object.keys(d.years || {}).forEach(function (id) {
        var marker = document.querySelector('.artist [data-availability="' + id + '"]');
        var y = marker && marker.closest('.artist').querySelector('.years');
        if (!y) return;
        var v = d.years[id].replace(/\s*years?\b/i, '').trim();
        var txt = /^[\d+.\s]+$/.test(v) ? v + ' years' : d.years[id];
        if (/^[\d+.\s]+years?/i.test(y.textContent)) y.textContent = y.textContent.replace(/^[\d+.\s]+years?/i, txt);
        else y.textContent = txt + '.';
      });
      Object.keys(d.avatars || {}).forEach(function (id) {
        var marker = document.querySelector('.artist [data-availability="' + id + '"]');
        var card = marker && marker.closest('.artist');
        if (!card) return;
        var name = (card.querySelector('h3') || {}).textContent || '';
        var mono = card.querySelector('.monogram');
        var img = card.querySelector(':scope > img');
        if (mono) {
          var a = h('img', { src: d.avatars[id], alt: name, class: 'monogram', loading: 'lazy', width: '76', height: '76' });
          a.style.cssText = 'object-fit:cover;padding:3px;background:none';
          a.style.borderRadius = '50%';
          mono.replaceWith(a);
        } else if (img) { img.src = d.avatars[id]; img.alt = name; }
      });
    }).catch(function () {});
    return;
  }

  var body = document.body;
  var id = body.getAttribute('data-artist-page');
  if (!id) return;
  var first = (body.getAttribute('data-first') || '').trim();

  var CSS = '' +
    '.p-tile{position:relative;aspect-ratio:1/1;overflow:hidden;border-radius:4px;background:#e2d7c4}' +
    '.p-tile img{width:100%;height:100%;object-fit:cover;object-position:top;display:block;transition:transform .6s ease}' +
    '.p-tile a{position:absolute;inset:0;z-index:2;display:flex;align-items:flex-end;padding:12px 14px;color:#fff;text-decoration:none;background:linear-gradient(transparent 62%,rgba(14,13,11,.55));cursor:zoom-in}' +
    '.p-tile a span{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}' +
    '.p-tile:hover img{transform:scale(1.04)}' +
    '.p-tile::after{content:"";position:absolute;inset:8px;z-index:3;border:1px solid rgba(255,255,255,.45);pointer-events:none}' +
    '.gallery .p-tile{aspect-ratio:3/4}' +
    '.gallery .ig-tile{position:relative;aspect-ratio:3/4;overflow:hidden;border-radius:3px;background:#e2d7c4}' +
    '.ig-tile iframe{position:absolute;left:0;top:0;width:540px;height:760px;border:0;pointer-events:none;transform-origin:0 0;transform:translateY(calc(-54px * var(--s,.6))) scale(var(--s,.6))}' +
    '.ig-tile a{position:absolute;inset:0;z-index:2;display:flex;align-items:flex-end;padding:12px 14px;text-decoration:none;color:#fff;background:linear-gradient(transparent 62%,rgba(14,13,11,.55))}' +
    '.ig-tile a span{font-size:11px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}' +
    '.p-lb{width:100%;max-width:none;height:100%;max-height:none;margin:0;padding:0;border:0;background:rgba(8,7,6,.96);color:#f8f4ee}' +
    '.p-lb::backdrop{background:rgba(8,7,6,.96)}' +
    '.p-lb[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}' +
    '.p-lb .t{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#b9b0a2}' +
    '.p-lb .s{display:grid;place-items:center;min-height:0;padding:0 12px}' +
    '.p-lb .s img{max-width:100%;max-height:100%;object-fit:contain}' +
    '.p-lb .n{display:flex;justify-content:center;gap:12px;padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px))}' +
    '.p-lb button{min-width:48px;min-height:48px;padding:0 18px;border:1px solid rgba(217,191,140,.28);border-radius:999px;background:transparent;color:#f8f4ee;font:500 13px Jost,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}' +
    '.rates-wrap .price-block+.price-block{margin-top:64px}' +
    '.p-avatar{width:132px;height:132px;margin:0 auto 26px;padding:4px;border-radius:50%;border:1px solid var(--gold,#d9bf8c);box-shadow:0 0 0 6px rgba(14,13,11,.55)}' +
    '.p-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block}' +
    '.hero-body .p-avatar{margin-top:-40px;position:relative;z-index:3}' +
    '@media (max-width:600px){.p-avatar{width:108px;height:108px}}' +
    '.rates-wrap .price-head{margin-top:0}' +
    '.rates-cta{display:flex;justify-content:center;margin-top:48px}';

  function wa(phone, text) { return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text); }

  // ---------- Lightbox for uploaded photos ----------
  var lb, lbImg, lbCount, lbList = [], lbI = 0;
  function lbShow(i) {
    lbI = (i + lbList.length) % lbList.length;
    lbImg.src = lbList[lbI].src; lbImg.alt = lbList[lbI].caption || '';
    lbCount.textContent = (lbI + 1) + ' / ' + lbList.length;
  }
  function lbOpen(i) {
    if (!lb) {
      lb = h('dialog', { class: 'p-lb', 'aria-label': 'Photo viewer' }, [
        h('div', { class: 't' }, [lbCount = h('span'), h('button', { type: 'button', 'data-x': '', text: 'Close' })]),
        h('div', { class: 's' }, [lbImg = h('img', { alt: '' })]),
        h('div', { class: 'n' }, [h('button', { type: 'button', 'data-step': '-1', 'aria-label': 'Previous photo', text: '←' }), h('button', { type: 'button', 'data-step': '1', 'aria-label': 'Next photo', text: '→' })])
      ]);
      document.body.appendChild(lb);
      lb.addEventListener('click', function (e) {
        var st = e.target.closest('[data-step]');
        if (st) lbShow(lbI + Number(st.getAttribute('data-step')));
        else if (e.target.closest('[data-x]') || e.target === lb || e.target.classList.contains('s')) lb.close();
      });
      lb.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') lbShow(lbI + 1); if (e.key === 'ArrowLeft') lbShow(lbI - 1); });
      var x0 = null;
      lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) lbShow(lbI + (dx < 0 ? 1 : -1)); x0 = null; });
    }
    lbShow(i);
    if (typeof lb.showModal === 'function') lb.showModal(); else window.open(lbList[lbI].src, '_blank');
  }

  // ---------- Renderers ----------
  function renderGallery(el, p) {
    if (!(p.photos || []).length && !(p.reels || []).length) return;
    el.textContent = '';
    lbList = p.photos || [];
    lbList.forEach(function (ph, i) {
      var a = h('a', { href: ph.src, 'aria-label': 'Open photo ' + (i + 1) + (ph.caption ? ': ' + ph.caption : '') }, [ph.caption ? h('span', { text: ph.caption }) : null]);
      a.addEventListener('click', function (e) { e.preventDefault(); lbOpen(i); });
      el.appendChild(h('div', { class: 'p-tile' }, [h('img', { src: ph.src, alt: ph.caption || 'Work by ' + (first || 'the artist'), loading: 'lazy' }), a]));
    });
    (p.reels || []).forEach(function (r) {
      var isReel = r.indexOf('reel/') === 0;
      el.appendChild(h('div', { class: 'ig-tile' }, [
        h('iframe', { src: 'https://www.instagram.com/' + r + '/embed/', loading: 'lazy', scrolling: 'no', tabindex: '-1', title: 'Instagram ' + (isReel ? 'reel' : 'post') }),
        h('a', { href: 'https://www.instagram.com/' + r + '/', target: '_blank', rel: 'noopener', 'aria-label': (isReel ? 'Watch this reel' : 'View this post') + ' on Instagram' }, [h('span', { text: (isReel ? 'Watch reel' : 'View post') + ' ↗' })])
      ]));
    });
    // Scale the 540px Instagram embeds to the tile size
    function fit() {
      var t = el.querySelector('.ig-tile');
      if (t) el.style.setProperty('--s', (t.clientWidth / 540).toFixed(4));
    }
    fit();
    if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el); else window.addEventListener('resize', fit);
  }

  function renderServices(el, p) {
    if (!(p.services || []).length) return;
    el.textContent = '';
    p.services.forEach(function (g, i) {
      el.appendChild(h('div', { class: 'svc' }, [
        h('span', { class: 'n', text: (i < 9 ? '0' : '') + (i + 1) }),
        h('h3', { text: g.title }),
        h('ul', {}, g.items.map(function (t) { return h('li', { text: t }); }))
      ]));
    });
  }

  function renderRates(el, p) {
    if (!(p.rates || []).length) return;
    el.textContent = '';
    el.classList.remove('quote-box');
    el.classList.add('rates-wrap');
    var who = first || 'there';
    p.rates.forEach(function (g, gi) {
      el.appendChild(h('div', { class: 'price-block' }, [
        h('div', { class: 'price-head' }, [
          h('div', {}, [h('p', { class: 'kicker', text: (gi < 9 ? '0' : '') + (gi + 1) + ' — Pricing' }), h('h2', { text: g.title })]),
          g.note ? h('p', { text: g.note }) : null
        ]),
        h('ul', { class: 'tiers' }, g.items.map(function (it, i) {
          var num = /\d/.test(it.price);
          var priceText = it.price ? it.price.replace(/^\s*(rs\.?|inr|₹)\s*/i, '') : '';
          var msg = 'Hi ' + who + ', I\'d like to book the ' + it.name + (priceText ? ' (Rs ' + priceText + ')' : '') + '. My date is: ';
          return h('li', {}, [
            h('span', { class: 'rn', text: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][i] || '' }),
            h('div', {}, [
              h('h3', { text: it.name }),
              it.desc ? h('p', { text: it.desc }) : null,
              h('a', { class: 'tier-book', href: wa(p.phone, msg), 'data-wa-source': '', target: '_blank', rel: 'noopener', text: 'Book this look' })
            ]),
            priceText ? h('span', { class: 'price' }, [num && !/^from/i.test(priceText) ? h('small', { text: '₹' }) : null, priceText]) : h('span', { class: 'price', text: '' })
          ]);
        }))
      ]));
    });
  }

  function apply(p) {
    var style = h('style', { text: CSS }); document.head.appendChild(style);
    var oldPhone = body.getAttribute('data-phone');
    swapPhone(oldPhone, p.phone);
    body.setAttribute('data-phone', p.phone);
    document.querySelectorAll('[data-p="phone-text"]').forEach(function (el) { el.textContent = '+91 ' + p.phone.slice(2, 7) + ' ' + p.phone.slice(7); });

    var av = document.querySelector('[data-p="avatar"]');
    if (av && p.avatar) {
      av.className = 'p-avatar'; av.textContent = ''; av.hidden = false; av.removeAttribute('aria-hidden');
      av.appendChild(h('img', { src: p.avatar.src, alt: (body.getAttribute('data-name') || first || 'The artist') + ', profile picture' }));
    }
    var cv = document.querySelector('[data-p="cover"]');
    if (cv && p.cover) {
      if (cv.tagName === 'IMG') { cv.src = p.cover.src; cv.removeAttribute('srcset'); cv.style.objectFit = 'cover'; cv.style.objectPosition = 'center 30%'; }
      else { cv.style.setProperty('--cover', 'url("' + p.cover.src.replace(/"/g, '%22') + '")'); cv.classList.add('has-cover'); }
    }

    var st = document.querySelector('[data-p="stats"]');
    if (st && (p.stats || []).length) {
      st.textContent = '';
      st.style.gridTemplateColumns = 'repeat(' + p.stats.length + ', minmax(0, 1fr))';
      p.stats.forEach(function (x) { st.appendChild(h('div', {}, [h('strong', { text: x.value }), x.label ? h('span', { text: x.label }) : null])); });
    }

    var tag = document.querySelector('[data-p="tagline"]');
    if (tag && p.tagline) tag.textContent = p.tagline;
    var bio = document.querySelector('[data-p="bio"]');
    if (bio && (p.bio || []).length) { bio.textContent = ''; p.bio.forEach(function (t) { bio.appendChild(h('p', { class: 'lead', text: t })); }); }
    var s = document.querySelector('[data-p="services"]'); if (s) renderServices(s, p);
    var g = document.querySelector('[data-p="gallery"]'); if (g) renderGallery(g, p);
    var r = document.querySelector('[data-p="rates"]'); if (r) renderRates(r, p);
    // New "Book this look" links pick up "Found you via" from booking-source.js on its next run
    document.dispatchEvent(new CustomEvent('artist-profile-ready'));
  }

  var fresh = /[?&]updated=/.test(location.search) ? '&t=' + Date.now() : '';
  fetch('/api/profile?artist=' + encodeURIComponent(id) + fresh)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { if (d && d.saved && d.profile) apply(d.profile); })
    .catch(function () {});
})();
