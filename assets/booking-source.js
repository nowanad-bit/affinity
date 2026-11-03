// Remembers how a visitor found the site, so every booking message tells the artist.
//
// The source comes from ?src= (or ?utm_source=) on the link they opened, otherwise from the
// site they came from (Instagram, Facebook, Google, WhatsApp). It is kept for the visit.
// Links to share: affinitychandigarh.com/neeraj-sidhu?src=instagram  (also facebook, google,
// whatsapp, qr)
//
//   select[data-source]   "How did you hear about us?" is preselected when the source is known
//   a[data-wa-source]     WhatsApp link: "Found you via: Instagram" is added to its message
(function () {
  'use strict';

  var KEY = 'affinitySource';
  // Labels match the options in the booking forms
  var LABELS = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    google: 'Google search',
    whatsapp: 'WhatsApp',
    qr: 'Portfolio PDF or QR code'
  };

  function fromParam(v) {
    v = (v || '').toLowerCase();
    if (/^(ig|insta)/.test(v)) return 'instagram';
    if (/^(fb|facebook|meta)/.test(v)) return 'facebook';
    if (/google|gmb|maps/.test(v)) return 'google';
    if (/^(wa|whatsapp)/.test(v)) return 'whatsapp';
    if (/^(qr|pdf)/.test(v)) return 'qr';
    return '';
  }

  function fromReferrer(ref) {
    var host = '';
    try { host = new URL(ref).hostname; } catch (e) { return ''; }
    if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'facebook';
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'google';
    if (/(^|\.)whatsapp\.(com|net)$/.test(host)) return 'whatsapp';
    return '';
  }

  var params = new URLSearchParams(location.search);
  var found = fromParam(params.get('src') || params.get('utm_source')) || fromReferrer(document.referrer);
  var source = '';
  try {
    // First source of the visit wins, so moving between pages does not overwrite it
    source = sessionStorage.getItem(KEY) || '';
    if (!source && found) sessionStorage.setItem(KEY, found);
  } catch (e) { /* storage blocked: use this page's source only */ }
  source = source || found;
  var label = LABELS[source];
  if (!label) return;

  document.querySelectorAll('select[data-source]').forEach(function (select) {
    if (select.value) return;
    Array.prototype.forEach.call(select.options, function (o, i) {
      if (o.text === label) select.selectedIndex = i;
    });
  });

  function tagLinks() {
    document.querySelectorAll('a[data-wa-source]:not([data-wa-tagged])').forEach(function (a) {
      try {
        var url = new URL(a.href);
        var text = url.searchParams.get('text') || '';
        url.searchParams.set('text', (text ? text + '\n\n' : '') + 'Found you via: ' + label);
        a.href = url.toString();
        a.setAttribute('data-wa-tagged', '');
      } catch (e) { /* leave the link as it is */ }
    });
  }
  tagLinks();
  // Links added later (an artist's saved rates from /studio) get tagged too
  document.addEventListener('artist-profile-ready', tagLinks);
})();
