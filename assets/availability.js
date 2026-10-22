// Shows each artist's wait time and keeps booking dates on days they can take.
// Reads /api/availability (set from /admin). If that fails, the site works as before.
//
//   [data-availability="sunny-ali"]   filled with "Next available: Sat, 15 Nov" and the admin note
//   form[data-booking]                date input limited to the chosen artist's open days.
//                                     The artist comes from the selected <option data-artist>
//                                     or from the form's own data-artist.
//   [data-date-hint]                  inside the form, where date messages appear
(function () {
  'use strict';

  function iso(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function addDays(s, n) {
    var d = new Date(s + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function nice(s) {
    return new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  var today = iso(new Date());

  // First day on or after `from` that is past the artist's wait and not blocked
  function firstOpen(a, from) {
    var d = from > today ? from : today;
    if (a.nextAvailable && a.nextAvailable > d) d = a.nextAvailable;
    for (var i = 0; i < 400 && a.blocked.indexOf(d) !== -1; i++) d = addDays(d, 1);
    return d;
  }

  function fillStatus(el, a) {
    var open = firstOpen(a, today);
    var main = !a.accepting ? 'Not taking new bookings right now'
      : open > today ? 'Next available: ' + nice(open)
      : 'Available from today';
    el.className = (el.className.replace(/\bis-(open|wait|closed)\b/g, '') + ' ' +
      (!a.accepting ? 'is-closed' : open > today ? 'is-wait' : 'is-open')).trim();
    el.textContent = '';
    var b = document.createElement('b');
    b.textContent = main;
    el.appendChild(b);
    if (a.note) {
      var n = document.createElement('span');
      n.textContent = a.note;
      el.appendChild(n);
    }
    el.hidden = false;
  }

  function wireForm(form, byId) {
    var date = form.querySelector('input[type="date"]');
    var hint = form.querySelector('[data-date-hint]');
    var select = form.querySelector('select[name="artist"]');
    if (!date) return;
    var invalid = false;

    function artist() {
      var id = form.getAttribute('data-artist');
      if (select) {
        var opt = select.options[select.selectedIndex];
        id = opt && opt.getAttribute('data-artist');
      }
      return id ? byId[id] : null;
    }
    function say(msg, isError) {
      if (!hint) return;
      hint.textContent = msg;
      hint.hidden = !msg;
      hint.classList.toggle('is-error', !!isError);
    }
    function check() {
      var a = artist();
      invalid = false;
      if (!a) { date.min = today; say(''); return; }
      if (!a.accepting) {
        invalid = true;
        say(a.name + ' is not taking new bookings right now. Please choose another artist or message the salon.', true);
        return;
      }
      var open = firstOpen(a, today);
      date.min = open;
      var v = date.value;
      if (v && (v < open || a.blocked.indexOf(v) !== -1)) {
        invalid = true;
        say(a.name + ' is not available on ' + nice(v) + '. The next open day is ' + nice(firstOpen(a, v < open ? open : v)) + '.', true);
        return;
      }
      var msg = open > today ? a.name + "'s next available day is " + nice(open) + '.' : '';
      if (a.note) msg = (msg ? msg + ' ' : '') + a.note;
      say(msg, false);
    }

    if (select) select.addEventListener('change', check);
    date.addEventListener('change', check);
    // Runs before the page's own submit handler and stops it while the date is not bookable
    form.addEventListener('submit', function (e) {
      check();
      if (!invalid) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      date.focus();
    }, true);
    check();
  }

  fetch('/api/availability', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      if (!data || !Array.isArray(data.artists)) return;
      var byId = {};
      data.artists.forEach(function (a) { byId[a.id] = a; });
      document.querySelectorAll('[data-availability]').forEach(function (el) {
        var a = byId[el.getAttribute('data-availability')];
        if (a) fillStatus(el, a);
      });
      document.querySelectorAll('form[data-booking]').forEach(function (f) { wireForm(f, byId); });
    })
    .catch(function () { /* No availability data: booking works without limits */ });
})();
