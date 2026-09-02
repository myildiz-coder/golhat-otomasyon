(function(){
  'use strict';

  var root = document.querySelector('main[data-club-key]');
  if (!root) return;
  var clubKey = root.getAttribute('data-club-key');
  var desk = root.querySelector('.single-desk');
  var hub = document.createElement('aside');
  hub.className = 'club-live-hub';
  hub.setAttribute('aria-label', 'Kulüp maç ve kadro merkezi');
  hub.setAttribute('aria-live', 'polite');
  hub.innerHTML =
    '<div class="club-hub-bar"><span class="club-hub-state">VERİ HATTI AKTİF</span>' +
    '<span class="club-hub-updated">yükleniyor</span></div>' +
    '<div class="club-hub-head"><span class="club-hub-kicker">KULÜP MERKEZİ</span>' +
    '<h2>Maç Hattı</h2><div class="club-hub-meta"></div></div>' +
    '<div class="club-next"></div>' +
    '<div class="club-list"></div>' +
    '<div class="club-kap"></div>' +
    '<div class="club-form"></div>' +
    '<div class="club-hub-links"></div>';
  root.insertBefore(hub, desk);

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function formatUpdated(value) {
    if (!value) return 'ilk veri bekleniyor';
    return new Date(value).toLocaleString('tr-TR', {
      timeZone:'Europe/Istanbul', day:'2-digit', month:'2-digit',
      hour:'2-digit', minute:'2-digit', hour12:false
    });
  }

  function matchDate(value) {
    return new Date(value).toLocaleDateString('tr-TR', {
      timeZone:'Europe/Istanbul', weekday:'short', day:'2-digit', month:'short'
    });
  }

  function matchTime(value) {
    return new Date(value).toLocaleTimeString('tr-TR', {
      timeZone:'Europe/Istanbul', hour:'2-digit', minute:'2-digit', hour12:false
    });
  }

  function scoreText(match) {
    if (match.kind === 'upcoming') return matchTime(match.date);
    return String(match.homeScore == null ? '–' : match.homeScore) + '–' +
      String(match.awayScore == null ? '–' : match.awayScore);
  }

  function fixtureRow(match) {
    var row = make('article', 'club-fixture');
    var when = make('div', 'club-fixture-time', matchDate(match.date));
    when.appendChild(make('strong', '', match.kind === 'upcoming' ? matchTime(match.date) : (match.status || 'SONUÇ')));
    row.appendChild(when);
    var teams = make('div', 'club-fixture-teams');
    var home = make('div', '');
    var away = make('div', '');
    home.appendChild(make('span', '', match.home));
    away.appendChild(make('span', '', match.away));
    if (match.kind !== 'upcoming') {
      home.appendChild(make('span', 'club-fixture-score', match.homeScore == null ? '–' : String(match.homeScore)));
      away.appendChild(make('span', 'club-fixture-score', match.awayScore == null ? '–' : String(match.awayScore)));
    }
    teams.appendChild(home);
    teams.appendChild(away);
    row.appendChild(teams);
    return row;
  }

  function renderMeta(club) {
    var meta = hub.querySelector('.club-hub-meta');
    [
      ['Teknik Direktör', club.coach || '—'],
      ['Kadro', String(club.squad && club.squad.total || 0) + ' oyuncu'],
      ['Sakatlık', String(club.squad && club.squad.injured || 0) + ' kayıt']
    ].forEach(function(item) {
      var cell = make('div', '');
      cell.appendChild(make('span', '', item[0]));
      cell.appendChild(make('strong', '', item[1]));
      meta.appendChild(cell);
    });
  }

  function renderNext(club) {
    var box = hub.querySelector('.club-next');
    var match = Array.isArray(club.nextMatches) ? club.nextMatches[0] : null;
    var label = make('div', 'club-section-label');
    label.appendChild(make('span', '', match && match.kind === 'live' ? 'ŞİMDİ OYNUYOR' : 'SIRADAKİ MAÇ'));
    label.appendChild(make('strong', '', match ? match.tournament : 'PROGRAM'));
    box.appendChild(label);
    if (!match) {
      box.appendChild(make('div', 'club-empty', 'Sıradaki maç programı henüz açıklanmadı.'));
      return;
    }
    box.appendChild(make('div', 'club-next-time', matchDate(match.date) + ' · ' + matchTime(match.date)));
    var teams = make('div', 'club-next-teams');
    teams.appendChild(make('div', 'club-next-team', match.home));
    teams.appendChild(make('div', 'club-next-score', scoreText(match)));
    teams.appendChild(make('div', 'club-next-team', match.away));
    box.appendChild(teams);
  }

  function renderFixtures(club) {
    var list = hub.querySelector('.club-list');
    var matches = Array.isArray(club.nextMatches) ? club.nextMatches.slice(1) : [];
    if (!matches.length) {
      list.appendChild(make('div', 'club-empty', 'Devam eden fikstür verisi bekleniyor.'));
      return;
    }
    matches.forEach(function(match) { list.appendChild(fixtureRow(match)); });
  }

  function renderKap(club) {
    var box = hub.querySelector('.club-kap');
    var kap = club.kap || {};
    var notices = Array.isArray(kap.disclosures) ? kap.disclosures.slice(0, 4) : [];
    var label = make('div', 'club-section-label');
    label.appendChild(make('span', '', 'KAP BİLDİRİMLERİ'));
    label.appendChild(make('strong', '', kap.ticker || 'RESMÎ'));
    box.appendChild(label);
    if (!notices.length) {
      box.appendChild(make('div', 'club-empty', 'Yeni futbol açıklaması bulunmuyor.'));
      return;
    }
    notices.forEach(function(notice) {
      var link = make('a', 'club-kap-item');
      link.href = notice.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.appendChild(make('time', '', matchDate(notice.date) + ' · ' + matchTime(notice.date)));
      link.appendChild(make('strong', '', notice.summary));
      link.appendChild(make('small', '', notice.type + ' · KAP ↗'));
      box.appendChild(link);
    });
    var all = make('a', 'club-kap-all', 'TÜM KAP AÇIKLAMALARI →');
    all.href = kap.queryUrl || 'https://www.kap.org.tr/';
    all.target = '_blank';
    all.rel = 'noopener';
    box.appendChild(all);
  }


  function renderForm(club) {
    var form = hub.querySelector('.club-form');
    var label = make('div', 'club-section-label');
    label.appendChild(make('span', '', 'SON 5 MAÇ'));
    label.appendChild(make('strong', '', 'FORM'));
    form.appendChild(label);
    var row = make('div', 'club-form-row');
    var matches = Array.isArray(club.recentMatches) ? club.recentMatches.slice().reverse() : [];
    if (!matches.length) {
      row.appendChild(make('span', 'club-empty', 'Sonuç bekleniyor.'));
    } else {
      matches.forEach(function(match) {
        var letter = match.result === 'W' ? 'G' : match.result === 'L' ? 'M' : 'B';
        var tone = match.result === 'W' ? 'win' : match.result === 'L' ? 'loss' : 'draw';
        var pill = make('span', 'club-form-pill ' + tone, letter);
        pill.title = match.home + ' ' + scoreText(match) + ' ' + match.away;
        row.appendChild(pill);
      });
    }
    form.appendChild(row);
  }

  function renderLinks(club) {
    var links = hub.querySelector('.club-hub-links');
    var official = make('a', '', 'RESMÎ KULÜP HABERLERİ ↗');
    official.href = club.officialUrl;
    official.target = '_blank';
    official.rel = 'noopener';
    var data = make('a', '', 'FİKSTÜR KAYNAĞI ↗');
    data.href = club.sourceUrl;
    data.target = '_blank';
    data.rel = 'noopener';
    links.appendChild(official);
    links.appendChild(data);
  }

  function render(payload) {
    var club = payload && payload.clubs && payload.clubs[clubKey];
    if (!club) throw new Error('Kulüp kaydı bulunamadı');
    hub.querySelector('.club-hub-head h2').textContent = club.name + ' Hattı';
    hub.querySelector('.club-hub-updated').textContent = formatUpdated(payload.updatedAt);
    var live = (club.nextMatches || []).some(function(match) { return match.kind === 'live'; });
    var state = hub.querySelector('.club-hub-state');
    state.classList.toggle('has-live', live);
    state.textContent = live ? 'MAÇ CANLI' : 'VERİ HATTI AKTİF';
    renderMeta(club);
    renderNext(club);
    renderFixtures(club);
    renderKap(club);
    renderForm(club);
    renderLinks(club);
  }

  fetch('/data/kulup-merkezi.json', { cache:'no-store' })
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(render)
    .catch(function() {
      hub.querySelector('.club-hub-state').textContent = 'VERİ YENİLENİYOR';
      hub.querySelector('.club-hub-updated').textContent = 'kısa süre sonra';
      hub.querySelector('.club-next').appendChild(make(
        'div', 'club-empty', 'Kulüp merkezi verisi şu anda yenileniyor.'
      ));
    });
})();
