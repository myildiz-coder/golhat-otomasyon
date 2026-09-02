'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTffPage } = require('./fetch-super-lig-tff');

test('aktif hafta sinifi yoksa en yaygin oynanan mac sayisindan hafta bulunur', () => {
  const standings = Array.from({ length: 10 }, (_, index) => {
    const rank = index + 1;
    return '<tr><td><a id="row_' + rank + '_lnkTakim">' + rank + '.TAKIM ' + rank + '</a></td>' +
      [3, 2, 1, 0, 5, 2, 3, 7]
        .map((value) => '<td><span>' + value + '</span></td>')
        .join('') +
      '</tr>';
  }).join('');

  const fixture = '<tr class=haftaninMaclariTr>' +
    '<td><span id="f_lblTarih">04.09.2026</span><span id="f_lblSaat">20:00</span></td>' +
    '<td><span id="f_Label4">EV SAHIBI</span></td>' +
    '<td><a href="?macId=42"><span id="f_Label5"></span>-<span id="f_Label6"></span></a></td>' +
    '<td><span id="f_Label1">DEPLASMAN</span></td></tr>';

  const html = '<table id="x_dtlHaftaninMaclari">' + fixture + '</table>' +
    '<div>Trendyol S\u00fcper Lig 2026-2027 Sezonu Puan Cetveli</div>' +
    '<table class="s-table">' + standings + '</table>';

  const output = parseTffPage(html);
  assert.equal(output.roundLabel, '4. Hafta');
  assert.equal(output.fixtures.length, 1);
});
