(function(){
  'use strict';

  var DATA_URL = '/data/avrupa-ligleri.json';
  var LIVE_URL = '/data/canli-skorlar.json';
  var LEAGUES = [
    { key:'england', id:39, tab:'İngiltere' },
    { key:'spain', id:140, tab:'İspanya' },
    { key:'italy', id:135, tab:'İtalya' },
    { key:'france', id:61, tab:'Fransa' },
    { key:'germany', id:78, tab:'Almanya' },
    { key:'netherlands', id:88, tab:'Hollanda' }
  ];
  var state = {
    active:'england',
    data:null,
    live:null
  };

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function activeConfig() {
    return LEAGUES.find(function(league) {
      return league.key === state.active;
    }) || LEAGUES[0];
  }

  function currentLeague() {
    return state.data && state.data.leagues
      ? state.data.leagues[state.active]
      : null;
  }

  function zone(rank, total) {
    if (rank === 1) return 'zone-title';
    if (rank <= 4) return 'zone-europe';
    if (rank > Math.max(0, total - 3)) return 'zone-drop';
    return '';
  }

  function signed(value) {
    var number = Number(value || 0);
    return number > 0 ? '+' + number : String(number);
  }

  function addCell(row, className, value) {
    row.appendChild(make('td', className, value));
  }

  function renderStandings() {
    var body = document.querySelector('[data-europe-body]');
    var league = currentLeague();
    var rows = league && Array.isArray(league.standings)
      ? league.standings
      : [];
    if (!body) return;
    body.replaceChildren();

    if (!rows.length) {
      var emptyRow = make('tr', '');
      var emptyCell = make(
        'td',
        'europe-empty',
        'Puan cetveli güncelleniyor. Kısa süre sonra yeniden deneyin.'
      );
      emptyCell.style.gridColumn = '1 / -1';
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
      return;
    }

    rows.forEach(function(item) {
      var row = make('tr', zone(Number(item.rank), rows.length));
      addCell(row, 'rank', String(item.rank));
      var teamCell = make('td', 'team-cell');
      teamCell.appendChild(make(
        'span',
        'europe-team-name',
        item.team || 'Takım'
      ));
      row.appendChild(teamCell);
      addCell(row, 'played', String(item.played));
      addCell(row, 'difference', signed(item.goalDifference));
      addCell(row, 'points', String(item.points));
      body.appendChild(row);
    });
  }

  function dayKey(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone:'Europe/Istanbul',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).format(date);
  }

  function liveMatchesForActiveLeague() {
    var config = activeConfig();
    var matches = state.live && Array.isArray(state.live.matches)
      ? state.live.matches
      : [];
    return matches.filter(function(match) {
      return Number(match.leagueId) === config.id &&
        ['live','finished','upcoming'].indexOf(match.kind) !== -1;
    });
  }

  function matchKey(match) {
    function teamKey(value) {
      return String(value || '')
        .toLocaleLowerCase('tr-TR')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
    }
    return dayKey(new Date(match.date)) + '|' +
      teamKey(match.home) + '|' + teamKey(match.away);
  }

  function mergedMatches() {
    var league = currentLeague();
    var schedule = league && Array.isArray(league.fixtures)
      ? league.fixtures
      : [];
    var merged = new Map();

    schedule.forEach(function(match) {
      merged.set(matchKey(match), Object.assign({}, match, {
        kind:'upcoming',
        homeScore:null,
        awayScore:null,
        minute:null
      }));
    });
    liveMatchesForActiveLeague().forEach(function(match) {
      merged.set(matchKey(match), match);
    });

    return Array.from(merged.values())
      .filter(function(match) {
        return match.date && match.home && match.away;
      })
      .sort(function(left, right) {
        return Number(left.timestamp || 0) - Number(right.timestamp || 0);
      })
      .slice(0, 18);
  }

  function renderFixtureStatus(match, date) {
    var status = make('div', 'europe-fixture-status');
    var main = '';
    var detail = '';
    if (match.kind === 'live') {
      main = String(match.homeScore == null ? 0 : match.homeScore) +
        '–' + String(match.awayScore == null ? 0 : match.awayScore);
      detail = match.minute == null ? 'CANLI' : String(match.minute) + '′ CANLI';
    } else if (match.kind === 'finished') {
      main = String(match.homeScore == null ? '–' : match.homeScore) +
        '–' + String(match.awayScore == null ? '–' : match.awayScore);
      detail = 'MAÇ SONU';
    } else {
      main = new Intl.DateTimeFormat('tr-TR', {
        timeZone:'Europe/Istanbul',
        hour:'2-digit',
        minute:'2-digit',
        hour12:false
      }).format(date);
      detail = match.status === 'PST' ? 'ERTELENDİ' : 'OYNANACAK';
    }
    status.appendChild(make('strong', '', main));
    status.appendChild(make('small', '', detail));
    return status;
  }

  function renderFixtures() {
    var list = document.querySelector('[data-europe-fixture-list]');
    var count = document.querySelector('[data-europe-fixtures-count]');
    if (!list) return;
    var matches = mergedMatches();
    list.replaceChildren();
    if (count) count.textContent = matches.length + ' MAÇ';

    if (!matches.length) {
      list.appendChild(make(
        'div',
        'europe-empty',
        'Bu lig için sıradaki maç programı henüz açıklanmadı.'
      ));
      return;
    }

    var dayFormat = new Intl.DateTimeFormat('tr-TR', {
      timeZone:'Europe/Istanbul',
      weekday:'long',
      day:'numeric',
      month:'long'
    });
    var activeDay = '';

    matches.forEach(function(match) {
      var date = new Date(match.date);
      var currentDay = dayKey(date);
      if (currentDay !== activeDay) {
        activeDay = currentDay;
        list.appendChild(make(
          'div',
          'europe-fixture-day',
          dayFormat.format(date)
        ));
      }

      var row = make(
        'article',
        'europe-fixture' + (match.kind === 'live' ? ' is-live' : '')
      );
      row.appendChild(renderFixtureStatus(match, date));

      var teams = make('div', 'europe-fixture-teams');
      var home = make('div', 'europe-fixture-team');
      var away = make('div', 'europe-fixture-team');
      home.appendChild(make('span', '', match.home));
      away.appendChild(make('span', '', match.away));
      if (match.kind === 'live' || match.kind === 'finished') {
        home.appendChild(make(
          'span',
          'europe-fixture-score',
          String(match.homeScore == null ? '–' : match.homeScore)
        ));
        away.appendChild(make(
          'span',
          'europe-fixture-score',
          String(match.awayScore == null ? '–' : match.awayScore)
        ));
      }
      teams.appendChild(home);
      teams.appendChild(away);
      row.appendChild(teams);
      list.appendChild(row);
    });
  }

  function formatUpdated(value) {
    if (!value) return 'ilk veri bekleniyor';
    return new Date(value).toLocaleString('tr-TR', {
      timeZone:'Europe/Istanbul',
      day:'2-digit',
      month:'2-digit',
      hour:'2-digit',
      minute:'2-digit',
      hour12:false
    });
  }

  function renderHeader() {
    var league = currentLeague();
    var title = document.querySelector('[data-europe-title]');
    var country = document.querySelector('[data-europe-country]');
    var summary = document.querySelector('[data-europe-summary]');
    var season = document.querySelector('[data-europe-season]');
    var updated = document.querySelector('[data-europe-updated]');
    var liveState = document.querySelector('[data-europe-live-state]');
    var liveCount = liveMatchesForActiveLeague().filter(function(match) {
      return match.kind === 'live';
    }).length;
    var rows = league && Array.isArray(league.standings)
      ? league.standings
      : [];

    if (title) title.textContent = league ? league.name : 'Lig Merkezi';
    if (country) country.textContent = league ? league.country : '';
    if (summary) {
      summary.textContent = rows.length
        ? rows.length + ' takım · tam puan cetveli'
        : 'Puan cetveli hazırlanıyor';
    }
    if (season) {
      season.textContent = state.data && state.data.seasonLabel
        ? state.data.seasonLabel
        : '2026/27';
    }
    if (updated) {
      var latest = state.live && state.live.updatedAt
        ? state.live.updatedAt
        : state.data && state.data.updatedAt;
      updated.textContent = formatUpdated(latest);
    }
    if (liveState) {
      liveState.classList.toggle('has-live', liveCount > 0);
      liveState.textContent = liveCount
        ? liveCount + ' MAÇ CANLI'
        : 'CANLI MERKEZ AKTİF';
    }
  }

  function render() {
    renderHeader();
    renderStandings();
    renderFixtures();
  }

  function selectLeague(key, focus) {
    state.active = key;
    document.querySelectorAll('[data-europe-tab]').forEach(function(tab) {
      var selected = tab.getAttribute('data-europe-tab') === key;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    render();
  }

  function setupTabs() {
    var tabs = Array.prototype.slice.call(
      document.querySelectorAll('[data-europe-tab]')
    );
    tabs.forEach(function(tab, index) {
      tab.addEventListener('click', function() {
        selectLeague(tab.getAttribute('data-europe-tab'), false);
      });
      tab.addEventListener('keydown', function(event) {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        var step = event.key === 'ArrowRight' ? 1 : -1;
        var next = (index + step + tabs.length) % tabs.length;
        selectLeague(tabs[next].getAttribute('data-europe-tab'), true);
      });
    });
  }

  function fetchJson(url) {
    return fetch(url + '?v=' + Date.now(), { cache:'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      });
  }

  function loadAll() {
    return Promise.allSettled([
      fetchJson(DATA_URL),
      fetchJson(LIVE_URL)
    ]).then(function(results) {
      if (results[0].status === 'fulfilled') state.data = results[0].value;
      if (results[1].status === 'fulfilled') state.live = results[1].value;
      render();
    });
  }

  function refreshLive() {
    fetchJson(LIVE_URL)
      .then(function(data) {
        state.live = data;
        render();
      })
      .catch(function(){});
  }

  setupTabs();
  loadAll();
  window.setInterval(refreshLive, 60000);
})();

