// Anonymous visit and click counts for the admin analytics page (/admin/analytics).
// Sends small batches to /api/track. A random visitor id is kept in this browser so a person
// who comes back is counted once; nothing else about them is sent.
//
// Counted: page views, the visit's source (once per visit), WhatsApp and call taps per artist,
// booking form sends and their "How did you hear about us?" answer, package taps,
// Instagram taps, PDF downloads, Share taps and gallery photo opens.
(function () {
  'use strict';

  var body = document.body;
  var artistPage = body.getAttribute('data-artist-page');
  var path = location.pathname.replace(/index\.html$/, '');
  var page = artistPage || (path === '/' ? 'home' : '');
  if (!page) return;

  function store(kind, key, make) {
    try {
      var s = window[kind], v = s.getItem(key);
      if (!v && make) { v = make(); s.setItem(key, v); }
      return v;
    } catch (e) { return make ? make() : ''; }
  }
  var visitor = store('localStorage', 'affinityVid', function () {
    return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  });

  var queue = [], timer = null;
  function send() {
    clearTimeout(timer);
    if (!queue.length) return;
    var data = JSON.stringify({ v: visitor, p: page, e: queue.splice(0, 30) });
    var sent = false;
    try { sent = navigator.sendBeacon && navigator.sendBeacon('/api/track', new Blob([data], { type: 'text/plain' })); } catch (e) {}
    if (!sent) { try { fetch('/api/track', { method: 'POST', body: data, keepalive: true }); } catch (e) {} }
  }
  function add(type, key, now) {
    if (!key) return;
    queue.push([type, String(key).slice(0, 60)]);
    if (now) send(); else { clearTimeout(timer); timer = setTimeout(send, 600); }
  }

  // Page view, and where this visit came from (booking-source.js has already read ?src=)
  add('pv', page);
  if (!store('sessionStorage', 'affinityTracked')) {
    store('sessionStorage', 'affinityTracked', function () { return '1'; });
    var src = store('sessionStorage', 'affinitySource');
    if (!src) {
      var ref = '';
      try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
      src = ref && ref !== location.hostname ? 'other' : 'direct';
    }
    add('src', src);
  }

  // Which artist a link belongs to: the artist page itself, the artist card it sits in on the
  // home page, or the artist chosen in the home booking form. Otherwise the salon.
  function whose(el) {
    if (artistPage) return artistPage;
    if (el.id === 'waLink') {
      var sel = document.querySelector('#book select[name="artist"]');
      var opt = sel && sel.options[sel.selectedIndex];
      return (opt && opt.getAttribute('data-artist')) || 'salon';
    }
    var card = el.closest('article');
    var tag = card && card.querySelector('[data-availability]');
    return (tag && tag.getAttribute('data-availability')) || 'salon';
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (/^https:\/\/wa\.me\//.test(href)) {
      var who = whose(el);
      add('wa', who);
      if (el.classList.contains('tier-book')) {
        var h = el.closest('li') && el.closest('li').querySelector('h3');
        if (h) add('pkg', h.textContent.trim());
      }
      if (el.id === 'waLink') {
        add('form', who);
        var heard = document.querySelector('#book select[name="source"]');
        if (heard && heard.value) add('heard', heard.value);
      }
      send();
    } else if (/^tel:/.test(href)) {
      add('call', whose(el), true);
    } else if (/instagram\.com\//.test(href)) {
      add('ig', whose(el), true);
    } else if (el.hasAttribute('download') || /\.pdf($|\?)/.test(href)) {
      add('pdf', page, true);
    } else if (el.hasAttribute('data-share')) {
      add('share', page);
    } else if (el.hasAttribute('data-lb')) {
      add('photo', page);
    }
  }, true);

  // Artist page booking forms open WhatsApp from their own submit handler. Invalid sends
  // never get here: the browser's required check and availability.js stop them first.
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.id !== 'bookForm' || !artistPage) return;
    add('wa', artistPage);
    add('form', artistPage);
    if (form.source && form.source.value) add('heard', form.source.value);
    send();
  });

  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(); });
  window.addEventListener('pagehide', send);
})();
