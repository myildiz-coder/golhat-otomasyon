'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PAGE_TOPIC_RULES } = require('./editorial-config');
const {
  START_MARKER,
  END_MARKER,
  canonicalUrl,
  collectCitedUrls,
  urlSignature,
  assertEditorialLanguage,
  storyMatchesPage,
  stripHtml,
  validateStory,
  buildCategoryHtml,
  buildHomepageArchiveHtml,
  buildHomepageHtml,
  assertHomepageIntegrity
} = require('./editorial-lib');

const NOW = new Date('2026-09-02T09:00:00.000Z');

function rawStory(overrides = {}) {
  return {
    page: 'fenerbahce.html',
    headline: 'Fenerbahçe için doğrulanan önemli yeni gelişme açıklandı',
    summary: 'Kulübün gündemindeki gelişme iki bağımsız yayın tarafından doğrulandı ve ayrıntılar kamuoyuyla paylaşıldı.',
    tag: 'Gelişme',
    published_at: '2026-09-02T07:30:00.000Z',
    importance: 88,
    sources: [
      {
        title: 'Kulüpten gelişmeyle ilgili resmi açıklama',
        publisher: 'Fenerbahçe',
        url: 'https://www.fenerbahce.org/haberler/aciklama?utm_source=test',
        published_at: '2026-09-02T07:00:00.000Z'
      },
      {
        title: 'Gelişmenin bağımsız doğrulaması',
        publisher: 'Reuters',
        url: 'https://www.reuters.com/sports/guncel-dosya/',
        published_at: '2026-09-02T07:20:00.000Z'
      }
    ],
    ...overrides
  };
}

function citedResponse() {
  return {
    output: [
      {
        type: 'web_search_call',
        action: {
          sources: [
            { url: 'https://www.fenerbahce.org/haberler/aciklama' },
            { url: 'https://www.reuters.com/sports/guncel-dosya' }
          ]
        }
      }
    ]
  };
}

function validStory(overrides = {}) {
  return validateStory(rawStory(overrides), {
    now: NOW,
    role: 'fenerbahce',
    allowedPages: ['fenerbahce.html'],
    citedUrls: collectCitedUrls(citedResponse())
  });
}

test('canonicalUrl izleme parametrelerini ve parçayı kaldırır', () => {
  assert.equal(
    canonicalUrl('https://WWW.Example.com/path/?utm_source=x&fbclid=abc&foo=1#bolum'),
    'https://www.example.com/path?foo=1'
  );
});

test('Responses API web kaynakları imza kümesine alınır', () => {
  const cited = collectCitedUrls(citedResponse());
  assert.equal(cited.has(urlSignature('https://fenerbahce.org/haberler/aciklama')), true);
  assert.equal(cited.has(urlSignature('https://reuters.com/sports/guncel-dosya')), true);
});

test('haber yalnızca gerçek arama URLleri ve iki alan adıyla kabul edilir', () => {
  const story = validStory();
  assert.equal(story.sources.length, 2);
  assert.equal(story.page, 'fenerbahce.html');
  assert.match(story.id, /^[a-f0-9]{16}$/);
});

test('arama sonuçlarında görülmeyen URL reddedilir', () => {
  const candidate = rawStory();
  candidate.sources[1].url = 'https://uydurma.example/haber';
  assert.throws(() => validateStory(candidate, {
    now: NOW,
    role: 'fenerbahce',
    allowedPages: ['fenerbahce.html'],
    citedUrls: collectCitedUrls(citedResponse())
  }), /web araması sonuçlarında bulunmuyor/);
});

test('aynı alan adındaki iki URL bağımsız kaynak sayılmaz', () => {
  const candidate = rawStory();
  candidate.sources[1].url = 'https://www.fenerbahce.org/haberler/ikinci-aciklama';
  const response = citedResponse();
  response.output[0].action.sources.push({
    url: 'https://www.fenerbahce.org/haberler/ikinci-aciklama'
  });
  assert.throws(() => validateStory(candidate, {
    now: NOW,
    role: 'fenerbahce',
    allowedPages: ['fenerbahce.html'],
    citedUrls: collectCitedUrls(response)
  }), /iki farklı alan adından/);
});

test('KKTC yerine yabancı siyasi terminolojisi kullanan haber karantinaya alınır', () => {
  assert.throws(
    () => validStory({
      headline: "Batan feribotun ardından Kıbrıs'ın kuzeyinde ulaştırma bakanı görevden alındı"
    }),
    /Yayın politikası karantinası/
  );
  assert.throws(
    () => assertEditorialLanguage(
      "Kıbrıs'ın kuzeyindeki Türk yönetimi yeni bir karar açıkladı"
    ),
    /KKTC, kendi adı ve kurumlarıyla anılmalı/
  );
  assert.doesNotThrow(() => assertEditorialLanguage(
    'KKTC hükümeti, Bayındırlık ve Ulaştırma Bakanı hakkındaki kararını açıkladı'
  ));
});
test('haber yalnız kendi sayfasının konu alanında yayınlanır', () => {
  assert.equal(storyMatchesPage(
    'anadolu.html',
    'Trabzonspor’da Fatih Tekke dönemi sona erdi',
    'Trabzonspor teknik direktör değişikliğini KAP üzerinden duyurdu.'
  ), false);
  assert.equal(storyMatchesPage(
    'anadolu.html',
    'Amedspor, Trabzonspor karşısında üç puanı aldı',
    'Amedspor kendi sahasındaki lig karşılaşmasını son dakika golüyle kazandı.'
  ), true);
  assert.equal(storyMatchesPage(
    'super-lig.html',
    'Fiorentina, Torreira için Galatasaray ile temasa geçti',
    'İtalyan kulübü oyuncunun transfer şartlarını görüşmek üzere teklif hazırladı.'
  ), false);
  assert.equal(storyMatchesPage(
    'super-lig.html',
    'Süper Lig hafta programı TFF tarafından açıklandı',
    'TFF, Süper Lig fikstüründeki karşılaşmaların gün ve saatlerini duyurdu.'
  ), true);

  const misplaced = rawStory({
    page: 'super-lig.html',
    headline: 'Fiorentina, Torreira için Galatasaray ile temasa geçti',
    summary: 'İtalyan kulübü, oyuncunun transfer şartlarını görüşmek üzere teklif hazırladı ve taraflar görüşmelere başladı.'
  });
  assert.throws(() => validateStory(misplaced, {
    now: NOW,
    role: 'super_lig',
    allowedPages: ['super-lig.html'],
    citedUrls: collectCitedUrls(citedResponse())
  }), /konu alanıyla eşleşmiyor/);
});

test('mevcut haber kartlarının tamamı kendi sayfasının konusundadır', () => {
  const root = path.resolve(__dirname, '..');
  for (const page of Object.keys(PAGE_TOPIC_RULES)) {
    if (['ozel-haber.html', 'skor.html'].includes(page)) continue;
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const pattern = /<article class="dispatch"[^>]*>[\s\S]*?<h3 class="dispatch-headline">([\s\S]*?)<\/h3>[\s\S]*?<p class="dispatch-dek">([\s\S]*?)<\/p>[\s\S]*?<\/article>/g;
    for (const match of html.matchAll(pattern)) {
      const headline = stripHtml(match[1]);
      const summary = stripHtml(match[2]);
      assert.equal(
        storyMatchesPage(page, headline, summary),
        true,
        page + ' konu dışı haber içeriyor: ' + headline
      );
    }
    const main = (html.match(/<main[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
    for (const link of main.matchAll(/href="\/([^"#?]+\.html)(?:[^"]*)"/g)) {
      assert.equal(link[1], page, page + ' başka haber sayfasına bağlantı veriyor: ' + link[1]);
    }
  }
});


test('kategori HTMLi yalnızca otomasyon bloğu ekler ve fotoğraf üretmez', () => {
  const html = [
    '<main>',
    '  <section class="single-desk">',
    '    <div class="desk-heading"><h2>Fenerbahçe</h2><span class="desk-count mono">0 haber</span></div>',
    '  </section>',
    '  <section class="page-hero">',
    '    <h1>Fenerbahçe</h1>',
    '  </section>',
    '</main>',
    '<footer>Son tarama: <span id="foot-updated">01.09.2026</span></footer>'
  ].join('\n');
  const story = validStory({
    headline: 'Fenerbahçe için <etiket> içeren doğrulanmış yeni gelişme'
  });
  const output = buildCategoryHtml(html, 'fenerbahce.html', [story], NOW);

  assert.equal(output.includes(START_MARKER), true);
  assert.equal(output.includes(END_MARKER), true);
  assert.match(output, /1 haber/);
  assert.match(output, /&lt;etiket&gt;/);
  assert.doesNotMatch(output, /<img\b/i);
  assert.match(output, /https:\/\/www\.reuters\.com\/sports\/guncel-dosya/);
  assert.match(output, /● CANLI/);
});

test('yinelenen otomatik haber bölümleri tekilleştirilir', () => {
  const story = validStory();
  const html = [
    '<main>',
    '  <section class="page-hero"><h1>Fenerbahçe</h1></section>',
    '  <section class="single-desk"><div class="desk-heading"><h2>Gündem</h2><span class="desk-count mono">0 haber</span></div></section>',
    '</main>',
    '<footer>Son tarama: <span id="foot-updated">01.09.2026</span></footer>'
  ].join('\n');
  const once = buildCategoryHtml(html, 'fenerbahce.html', [story], NOW);
  const section = once.match(/<section class="single-desk"[^>]*>[\s\S]*?<\/section>/)[0];
  const duplicated = once.replace('</main>', section + '\n</main>');
  const cleaned = buildCategoryHtml(duplicated, 'fenerbahce.html', [story], NOW);
  assert.equal((cleaned.match(/GOLHAT:AUTO_EDITOR:START/g) || []).length, 1);
  assert.equal((cleaned.match(new RegExp('data-auto-id="' + story.id + '"', 'g')) || []).length, 1);
});


test('ana sayfa manşetleri Özel Haber sayfasında birikir ve tekrar eklenmez', () => {
  const html = [
    '<main>',
    '  <section class="page-hero">',
    '    <h1>Özel Haber</h1>',
    '  </section>',
    '  <article class="dosya-block"><h2>Mevcut özel dosya</h2></article>',
    '</main>',
    '<footer>Son tarama: <span id="foot-updated">01.09.2026</span></footer>'
  ].join('\n');
  const first = validStory();
  const firstOutput = buildHomepageArchiveHtml(html, first, NOW);
  assert.match(firstOutput, /Mevcut özel dosya/);
  assert.match(firstOutput, new RegExp('data-homepage-story-id="' + first.id + '"'));
  assert.match(firstOutput, /Ana Sayfa Manşet Arşivi/);
  assert.doesNotMatch(firstOutput, /<img\b/i);
  assert.match(firstOutput, /homepage-archive-index/);
  assert.match(firstOutput, new RegExp('href="#manset-' + first.id + '"'));
  assert.match(firstOutput, />1 haber<\/span>/);
  const second = validStory({
    headline: "Fenerbahçe'nin Avrupa kadrosuna ilişkin yeni karar açıklandı",
    summary: 'Kulüp, Avrupa kupası kadrosuna ilişkin yeni kararını resmî kanallarından duyurdu ve ayrıntılar iki bağımsız kaynak tarafından doğrulandı.'
  });
  const secondOutput = buildHomepageArchiveHtml(firstOutput, second, NOW);
  assert.equal((secondOutput.match(new RegExp('data-homepage-story-id="' + second.id + '"', 'g')) || []).length, 1);
  assert.ok(secondOutput.indexOf(second.headline) < secondOutput.indexOf(first.headline));
  assert.match(secondOutput, />2 haber<\/span>/);
  assert.match(secondOutput, /1\. haber/);
  assert.match(secondOutput, /2\. haber/);
  assert.match(secondOutput, new RegExp('href="#manset-' + second.id + '"'));
  assert.match(secondOutput, new RegExp('href="#manset-' + first.id + '"'));
  assert.equal(buildHomepageArchiveHtml(secondOutput, second, NOW), secondOutput);
});
test('ana sayfa manşet dosyasının bütününü aynı haberle atomik yeniler', () => {
  const html = [
    '<body>',
    '<header class="masthead"></header>',
    '<div class="ticker" id="ticker"></div>',
    '<main class="wrap">',
    '  <section class="frontpage" id="dosya">',
    '    <h2 class="frontpage-headline">ESKİ MANŞET</h2>',
    '  </section>',
    '  <section class="breakdown" id="kirilma-ani">',
    '    <p>ESKİ ANALİZ</p>',
    '  </section>',
    '  <section class="voices-wrap">',
    '    <p>ESKİ KAYNAK VE KARAR</p>',
    '  </section>',
    '  <section class="transferline"></section>',
    '  <section class="desks"></section>',
    '  <section class="brand-manifesto"></section>',
    '</main>',
    '<script>',
    "const ticker = [{ cat:'SON DAKİKA', urgent:true, text:'Eski haber' }];",
    '</script>',
    '<footer>Son tarama: <span id="foot-updated">01.09.2026</span></footer>',
    '</body>'
  ].join('\n');
  const story = validStory({
    headline: "Fenerbahçe'nin <kritik> dosyasında doğrulanmış gelişme"
  });
  const output = buildHomepageHtml(html, story, NOW);

  assert.equal(
    (output.match(new RegExp('data-auto-story-id="' + story.id + '"', 'g')) || []).length,
    3
  );
  assert.match(output, /&lt;KRİTİK&gt;/);
  assert.match(output, /Orijinal Kaynaklar/);
  assert.match(output, /Manşet Dosyasının Kırılma Noktaları/);
  assert.match(output, /Kaynaklar Ne Diyor\?/);
  assert.match(output, /GOLHAT’IN SÖZÜ/);
  assert.match(output, new RegExp("storyId:'" + story.id + "'"));
  assert.match(output, /Bu bir fotoğraf değildir/);
  assert.doesNotMatch(output, /<img\b/i);
  assert.doesNotMatch(output, /ESKİ MANŞET|ESKİ ANALİZ|ESKİ KAYNAK VE KARAR/);
  assert.match(output, /Fenerbahçe\\'nin <kritik> dosyasında doğrulanmış gelişme/);
  assert.equal(assertHomepageIntegrity(output, story), true);

  const broken = output.replace(
    'class="breakdown" id="kirilma-ani" data-auto-story-id="' + story.id + '"',
    'class="breakdown" id="kirilma-ani" data-auto-story-id="başka-haber"'
  );
  assert.throws(() => assertHomepageIntegrity(broken, story), /analiz farklı habere bağlı/);
  assert.equal(buildHomepageHtml(output, story, NOW), output);
  const missingTransferLine = output.replace('class="transferline"', 'class="missing-transferline"');
  assert.throws(
    () => assertHomepageIntegrity(missingTransferLine, story),
    /transfer hattı bölümü 0 kez bulundu/
  );
});

test('özel sayfa yapısı korunarak ayrı otomasyon bölümü eklenir', () => {
  const html = [
    '<main>',
    '  <section class="page-hero"><h1>Transfer Hattı</h1></section>',
    '  <section class="transferline"><p>Mevcut özel liste korunur.</p></section>',
    '</main>',
    '<footer>Son tarama: <span id="foot-updated">01.09.2026</span></footer>'
  ].join('\n');
  const story = {
    ...validStory(),
    page: 'transfer.html',
    headline: 'Fenerbahçe yeni transfer görüşmesini resmen açıkladı',
    summary: 'Kulüp, transfer görüşmesinin başladığını resmi kanallarından duyurdu ve gelişme ikinci bağımsız kaynak tarafından da doğrulandı.'
  };
  const output = buildCategoryHtml(html, 'transfer.html', [story], NOW);

  assert.match(output, /class="single-desk"/);
  assert.match(output, /Doğrulanmış Güncellemeler/);
  assert.match(output, /Mevcut özel liste korunur/);
  assert.equal(output.includes(START_MARKER), true);
  assert.equal(output.includes(END_MARKER), true);
  assert.doesNotMatch(output, /<img\b/i);
});
