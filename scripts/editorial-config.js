'use strict';

const PAGE_LABELS = Object.freeze({
  'fenerbahce.html': 'Fenerbahçe',
  'galatasaray.html': 'Galatasaray',
  'besiktas.html': 'Beşiktaş',
  'trabzonspor.html': 'Trabzonspor',
  'anadolu.html': 'Anadolu Takımları',
  'super-lig.html': 'Süper Lig',
  'avrupa.html': 'Avrupa Futbolu',
  'sampiyonlar-ligi.html': 'Şampiyonlar Ligi',
  'uefa.html': 'UEFA Avrupa ve Konferans Ligi',
  'transfer.html': 'Transfer Hattı',
  'ozel-haber.html': 'Özel Haber'
});

const EDITOR_ROLES = Object.freeze({
  fenerbahce: {
    label: 'Fenerbahçe Editörü',
    pages: ['fenerbahce.html'],
    topics: 'Fenerbahçe transferleri, maçları, teknik ekip, yönetim ve resmi kulüp açıklamaları'
  },
  galatasaray: {
    label: 'Galatasaray Editörü',
    pages: ['galatasaray.html'],
    topics: 'Galatasaray transferleri, maçları, teknik ekip, yönetim ve resmi kulüp açıklamaları'
  },
  besiktas: {
    label: 'Beşiktaş Editörü',
    pages: ['besiktas.html'],
    topics: 'Beşiktaş transferleri, maçları, teknik ekip, yönetim ve resmi kulüp açıklamaları'
  },
  trabzon_anadolu: {
    label: 'Trabzonspor ve Anadolu Editörü',
    pages: ['trabzonspor.html', 'anadolu.html'],
    topics: 'Trabzonspor ile Süper Lig ve 1. Lig Anadolu kulüplerinin transfer, maç, teknik ekip ve yönetim gelişmeleri'
  },
  super_lig: {
    label: 'Süper Lig Editörü',
    pages: ['super-lig.html'],
    topics: 'Süper Lig geneli, TFF ve hakem gündemi, puan durumu, fikstür ve haftanın önemli gelişmeleri'
  },
  avrupa_kupalari: {
    label: 'Avrupa Kupaları Editörü',
    pages: ['avrupa.html', 'sampiyonlar-ligi.html', 'uefa.html'],
    topics: 'Şampiyonlar Ligi, Avrupa Ligi, Konferans Ligi, Türk takımlarının Avrupa performansı ve dünya futbolundaki önemli gelişmeler'
  },
  transfer_ozel: {
    label: 'Transfer ve Özel Haber Editörü',
    pages: ['transfer.html', 'ozel-haber.html'],
    topics: 'Türkiye ve Avrupa transfer gündemi ile birden fazla kaynakla kurulabilen derinlemesine özel dosyalar'
  }
});

const ALLOWED_TAGS = Object.freeze([
  'Son Dakika',
  'Kesinleşti',
  'Gelişme',
  'İddia',
  'Maç Sonucu',
  'Puan Durumu',
  'Analiz'
]);

const SOURCE_RULES = `
- Önce resmi kulüp, federasyon, UEFA/FIFA ve doğrudan taraf açıklamalarını ara.
- Ardından Reuters, AP, BBC Sport, Sky Sports, The Athletic ve güvenilir Türk spor yayınları gibi editoryal kaynaklarla çapraz doğrula.
- Sosyal medya paylaşımını tek başına yeterli kaynak sayma; paylaşımın resmi hesaptan geldiğini güvenilir bir haber kaynağıyla doğrula.
- Her yayınlanabilir haber için en az iki farklı alan adından, gerçekten açılmış web araması sonucu URL'si ver.
- URL uydurma, arama sonucu olmayan adres üretme ve aynı ajans metnini kopyalayan siteleri bağımsız kaynak gibi sayma.
`.trim();

const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_STORIES_PER_RUN = 3;
const MAX_STORIES_PER_PAGE = 8;
const MAX_STORY_AGE_HOURS = 96;
const HOMEPAGE_MIN_IMPORTANCE = 82;
const HOMEPAGE_MAX_DAILY_CHANGES = 3;
const HOMEPAGE_MIN_IMPROVEMENT = 8;
const HOMEPAGE_HOLD_HOURS = 12;

module.exports = {
  PAGE_LABELS,
  EDITOR_ROLES,
  ALLOWED_TAGS,
  SOURCE_RULES,
  DEFAULT_MODEL,
  MAX_STORIES_PER_RUN,
  MAX_STORIES_PER_PAGE,
  MAX_STORY_AGE_HOURS,
  HOMEPAGE_MIN_IMPORTANCE,
  HOMEPAGE_MAX_DAILY_CHANGES,
  HOMEPAGE_MIN_IMPROVEMENT,
  HOMEPAGE_HOLD_HOURS
};
