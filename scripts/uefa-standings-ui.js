(function(){
  'use strict';

  var DATA_URL = '/data/uefa-standings.json';

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function zone(rank) {
    if (rank <= 8) return 'zone-direct';
    if (rank <= 24) return 'zone-playoff';
    return 'zone-out';
  }

  function signed(value) {
    var number = Number(value || 0);
    return number > 0 ? '+' + number : String(number);
  }

  function addCell(row, className, value) {
    row.appendChild(make('td', className, value));
  }

  function renderRows(table, competition) {
    var body = table.querySelector('[data-uefa-body]');
    var rows = competition && Array.isArray(competition.standings)
      ? competition.standings
      : [];

    body.replaceChildren();
    if (!rows.length) {
      var emptyRow = make('tr', 'uefa-loading');
      var emptyCell = make(
        'td',
        '',
        'Puan cetveli şu anda okunamıyor.'
      );
      emptyCell.colSpan = 10;
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
      return;
    }

    rows.forEach(function(item) {
      var row = make('tr', zone(Number(item.rank)));
      if (item.countryCode === 'TUR') row.classList.add('is-turkish');

      addCell(row, 'rank', String(item.rank));

      var teamCell = make('td', 'team-cell');
      var team = make('div', 'uefa-team');
      var code = make(
        'span',
        'uefa-code',
        item.countryCode || item.code || '—'
      );
      var name = make(
        'span',
        'uefa-team-name team-name',
        item.team || 'Takım'
      );
      team.appendChild(code);
      team.appendChild(name);
      teamCell.appendChild(team);
      row.appendChild(teamCell);

      addCell(row, 'played', String(item.played));
      addCell(row, 'optional', String(item.won));
      addCell(row, 'optional', String(item.drawn));
      addCell(row, 'optional', String(item.lost));
      addCell(row, 'optional', String(item.goalsFor));
      addCell(row, 'optional', String(item.goalsAgainst));
      addCell(row, 'difference', signed(item.goalDifference));
      addCell(row, 'points', String(item.points));
      body.appendChild(row);
    });
  }

  function renderFixtures(container, competition) {
    var list = container.querySelector('[data-uefa-fixture-list]');
    var label = container.querySelector('[data-uefa-round]');
    var matchday = competition && competition.nextMatchday;
    var matches = matchday && Array.isArray(matchday.matches)
      ? matchday.matches
      : [];

    list.replaceChildren();
    if (label) {
      label.textContent = matchday && matchday.label
        ? matchday.label
        : 'Program Bekleniyor';
    }
    if (!matches.length) {
      list.appendChild(make(
        'div',
        'uefa-fixtures-empty',
        'Sıradaki maç programı henüz açıklanmadı.'
      ));
      return;
    }

    var dayFormat = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    var keyFormat = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    var timeFormat = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    var activeDay = '';

    matches.forEach(function(match) {
      var date = new Date(match.date);
      var dayKey = keyFormat.format(date);
      if (dayKey !== activeDay) {
        activeDay = dayKey;
        list.appendChild(make(
          'div',
          'uefa-fixture-day',
          dayFormat.format(date)
        ));
      }

      var row = make('article', 'uefa-fixture');
      var time = make('time', 'uefa-fixture-time', timeFormat.format(date));
      time.dateTime = match.date;
      row.appendChild(time);

      var teams = make('div', 'uefa-fixture-teams');
      var home = make('span', '', match.home || 'Ev sahibi');
      var away = make('span', '', match.away || 'Deplasman');
      if (match.homeCountry === 'TUR') home.classList.add('is-turkish');
      if (match.awayCountry === 'TUR') away.classList.add('is-turkish');
      teams.appendChild(home);
      teams.appendChild(away);
      row.appendChild(teams);
      list.appendChild(row);
    });
  }
  function render(data) {
    document.querySelectorAll('[data-uefa-table]').forEach(function(table) {
      var key = table.getAttribute('data-uefa-table');
      renderRows(table, data.competitions && data.competitions[key]);
    });
    document.querySelectorAll('[data-uefa-fixtures]').forEach(function(panel) {
      var key = panel.getAttribute('data-uefa-fixtures');
      renderFixtures(panel, data.competitions && data.competitions[key]);
    });

    document.querySelectorAll('[data-uefa-season]').forEach(function(element) {
      element.textContent = data.seasonLabel || '2026/27';
    });

    var updated = data.updatedAt
      ? new Date(data.updatedAt).toLocaleString('tr-TR', {
          timeZone: 'Europe/Istanbul',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      : '—';
    document.querySelectorAll('[data-uefa-updated]').forEach(function(element) {
      element.textContent = updated;
    });
  }

  function showError() {
    document.querySelectorAll('[data-uefa-body]').forEach(function(body) {
      body.replaceChildren();
      var row = make('tr', 'uefa-loading');
      var cell = make(
        'td',
        '',
        'UEFA verisine şu anda ulaşılamıyor. ' +
        'Kısa süre sonra yeniden deneyin.'
      );
      cell.colSpan = 10;
      row.appendChild(cell);
      body.appendChild(row);
    });
    document.querySelectorAll('[data-uefa-fixture-list]').forEach(
      function(list) {
        list.replaceChildren(make(
          'div',
          'uefa-fixtures-empty',
          'UEFA maç programına şu anda ulaşılamıyor.'
        ));
      }
    );
  }

  function setupTabs() {
    var tabs = Array.prototype.slice.call(
      document.querySelectorAll('[data-uefa-tab]')
    );
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        var key = tab.getAttribute('data-uefa-tab');
        tabs.forEach(function(item) {
          item.setAttribute(
            'aria-selected',
            String(item === tab)
          );
        });
        document.querySelectorAll('[data-uefa-panel]').forEach(
          function(panel) {
            panel.hidden =
              panel.getAttribute('data-uefa-panel') !== key;
          }
        );
      });
    });
  }

  setupTabs();
  fetch(DATA_URL + '?v=' + Date.now(), { cache: 'no-store' })
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(render)
    .catch(showError);
})();
