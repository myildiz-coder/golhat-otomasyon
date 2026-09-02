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
  'ozel-haber.html': 'Araştırma Dosyaları ve Özel Haber',
  'skor.html': 'Canlı Skor'
});

const PAGE_OWNERS = Object.freeze({
  'index.html': 'bas_editor',
  'skor.html': 'canli_skor',
  'fenerbahce.html': 'fenerbahce',
  'galatasaray.html': 'galatasaray',
  'besiktas.html': 'besiktas',
  'trabzonspor.html': 'trabzonspor',
  'anadolu.html': 'anadolu',
  'super-lig.html': 'super_lig',
  'avrupa.html': 'avrupa',
  'sampiyonlar-ligi.html': 'sampiyonlar_ligi',
  'uefa.html': 'uefa',
  'transfer.html': 'transfer',
  'ozel-haber.html': 'ozel_haber'
});
const PAGE_TOPIC_RULES = Object.freeze({
  'fenerbahce.html': { requiredAny: ['fenerbahçe', 'sarı-lacivert', 'kanarya'] },
  'galatasaray.html': { requiredAny: ['galatasaray', 'sarı-kırmızı', 'cimbom'] },
  'besiktas.html': { requiredAny: ['beşiktaş', 'siyah-beyaz', 'kartal'] },
  'trabzonspor.html': { requiredAny: ['trabzonspor', 'bordo-mavi'] },
  'anadolu.html': {
    requiredAny: [
      'anadolu', 'amedspor', 'başakşehir', 'göztepe', 'çaykur rizespor', 'rizespor',
      'gaziantep fk', 'gençlerbirliği', 'samsunspor', 'kocaelispor', 'konyaspor',
      'kayserispor', 'alanyaspor', 'antalyaspor', 'kasımpaşa', 'eyüpspor',
      'sivasspor', 'adana demirspor', 'hatayspor', 'karagümrük', 'bodrum fk',
      'sakaryaspor', 'erzurumspor', 'bandırmaspor'
    ]
  },
  'super-lig.html': {
    requiredAny: [
      'süper lig', 'tff', 'mhk', 'pfdk', 'hakem', 'var kararı', 'fikstür',
      'puan durumu', 'gol krallığı', 'hafta programı'
    ]
  },
  'avrupa.html': {
    requiredAny: [
      'premier league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'eredivisie',
      'arsenal', 'chelsea', 'liverpool', 'manchester city', 'manchester united',
      'tottenham', 'everton', 'sunderland', 'crystal palace', 'aston villa', 'newcastle',
      'barcelona', 'real madrid', 'atletico madrid', 'atlético madrid', 'villarreal',
      'athletic bilbao', 'sevilla', 'valencia', 'real betis', 'inter', 'ac milan',
      'juventus', 'napoli', 'roma', 'lazio', 'fiorentina', 'torino', 'como', 'cagliari',
      'bayern münih', 'borussia dortmund', 'rb leipzig', 'bayer leverkusen',
      'eintracht frankfurt', 'stuttgart', 'psg', 'paris saint-germain', 'marsilya',
      'marseille', 'lyon', 'monaco', 'lille', 'ajax', 'psv', 'feyenoord', 'az alkmaar'
    ]
  },
  'sampiyonlar-ligi.html': { requiredAny: ['şampiyonlar ligi', 'champions league', 'lig aşaması'] },
  'uefa.html': {
    requiredAny: ['avrupa ligi', 'europa league', 'konferans ligi', 'conference league']
  },
  'transfer.html': {
    requiredAny: [
      'transfer', 'bonservis', 'sözleşme', 'imza', 'kiralık', 'kadrosuna kattı',
      'anlaşma', 'anlaştı', 'görüşme', 'teklif', 'serbest oyuncu'
    ]
  },
  'ozel-haber.html': { requiredAny: [] },
  'skor.html': { requiredAny: ['maç', 'skor', 'gol', 'fikstür'] }
});


const EDITOR_ROLES = Object.freeze({
  fenerbahce: {
    label: 'Fenerbahçe Editörü',
    pages: ['fenerbahce.html'],
    topics: 'Fenerbahçe transferleri, maçları, teknik ekip, yönetim, resmi kulüp ve KAP açıklamaları'
  },
  galatasaray: {
    label: 'Galatasaray Editörü',
    pages: ['galatasaray.html'],
    topics: 'Galatasaray transferleri, maçları, teknik ekip, yönetim, resmi kulüp ve KAP açıklamaları'
  },
  besiktas: {
    label: 'Beşiktaş Editörü',
    pages: ['besiktas.html'],
    topics: 'Beşiktaş transferleri, maçları, teknik ekip, yönetim, resmi kulüp ve KAP açıklamaları'
  },
  trabzonspor: {
    label: 'Trabzonspor Editörü',
    pages: ['trabzonspor.html'],
    topics: 'Trabzonspor transferleri, maçları, teknik ekip, yönetim, resmi kulüp ve KAP açıklamaları'
  },
  anadolu: {
    label: 'Anadolu Kulüpleri Editörü',
    pages: ['anadolu.html'],
    topics: 'Süper Lig ve 1. Lig Anadolu kulüplerinin transfer, maç, teknik ekip ve yönetim gelişmeleri'
  },
  super_lig: {
    label: 'Süper Lig Editörü',
    pages: ['super-lig.html'],
    topics: 'Süper Lig geneli, TFF ve hakem gündemi, puan durumu, fikstür ve haftanın önemli gelişmeleri'
  },
  avrupa: {
    label: 'Avrupa Ligleri Editörü',
    pages: ['avrupa.html'],
    topics: 'İngiltere, İspanya, İtalya, Almanya, Fransa ve Hollanda liglerindeki önemli gelişmeler'
  },
  sampiyonlar_ligi: {
    label: 'Şampiyonlar Ligi Editörü',
    pages: ['sampiyonlar-ligi.html'],
    topics: 'Şampiyonlar Ligi, Türk takımları, haftanın maçları, kura ve resmi UEFA açıklamaları'
  },
  uefa: {
    label: 'Avrupa ve Konferans Ligi Editörü',
    pages: ['uefa.html'],
    topics: 'Avrupa Ligi ve Konferans Ligi, Türk takımları, haftanın maçları, kura ve resmi UEFA açıklamaları'
  },
  transfer: {
    label: 'Transfer Hattı Editörü',
    pages: ['transfer.html'],
    topics: 'Türkiye ve Avrupa futbolundaki doğrulanmış transfer görüşmeleri, imzalar ve sözleşme gelişmeleri'
  },
  ozel_haber: {
    label: 'Araştırma Dosyaları ve Özel Haber Editörü',
    pages: ['ozel-haber.html'],
    topics: 'GOLHAT’ın kendi sorusunu, yöntemini ve yeni bulgusunu taşıyan; kamu belgesi, resmi veri veya doğrudan muhabirlik kanıtıyla kurulan özgün futbol dosyaları',
    researchTeam: [
      'Veri editörü: ham veriyi toplar, hesaplamayı ve karşılaştırmayı yeniden üretilebilir biçimde kaydeder',
      'Belge editörü: birincil belgeyi, resmî kaydı ve kaynak zincirini doğrular',
      'Dosya editörü: GOLHAT’ın özgün sorusunu, yeni bulgusunu ve kamu yararını kurar',
      'Cevap hakkı editörü: iddiadan etkilenen tarafın yanıtını arar; yanıt zorunluysa yayını durdurur'
    ]
  }
});

const ALLOWED_TAGS = Object.freeze([
  'Son Dakika',
  'Kesinleşti',
  'Gelişme',
  'İddia',
  'Maç Sonucu',
  'Puan Durumu',
  'Analiz',
  'Dosya',
  'Özel Haber'
]);

const SOURCE_RULES = `
- Önce resmi kulüp, federasyon, UEFA/FIFA ve doğrudan taraf açıklamalarını ara.
- Halka açık futbol şirketlerinin transfer, oyuncu sözleşmesi ve teknik yönetim bildirimlerinde KAP'ı birincil resmi kaynak olarak kontrol et.
- Ardından Reuters, AP, BBC Sport, Sky Sports, The Athletic ve güvenilir Türk spor yayınları gibi editoryal kaynaklarla çapraz doğrula.
- Sosyal medya paylaşımını tek başına yeterli kaynak sayma; paylaşımın resmi hesaptan geldiğini güvenilir bir haber kaynağıyla doğrula.
- Her yayınlanabilir haber için en az iki farklı alan adından, gerçekten açılmış web araması sonucu URL'si ver.
- URL uydurma, arama sonucu olmayan adres üretme ve aynı ajans metnini kopyalayan siteleri bağımsız kaynak gibi sayma.
`.trim();


const GOLHAT_ORIGINAL_JOURNALISM_POLICY = `
- GOLHAT için kaynakları özetlemek veya farklı haberleri yeniden yazmak özgün habercilik sayılmaz.
- Her araştırma dosyası GOLHAT’ın kendi sorusuyla başlamalı; birincil belge ya da ham veri kullanmalı; yöntemini açıklamalı ve kaynaklarda hazır bulunmayan en az iki yeni bulgu üretmelidir.
- Yeni bulgu; GOLHAT’ın hesaplaması, karşılaştırması, zaman çizelgesi, belge eşleştirmesi veya doğrudan muhabirlik çalışmasıyla ortaya çıkan doğrulanabilir sonuçtur.
- Araştırma Dosyası etiketi yalnız kamu belgesi analizi veya özgün veri analizi bu koşulları taşıyorsa kullanılabilir.
- Özel Haber etiketi yalnız GOLHAT muhabirinin doğrudan görüşmesi, saha çalışması ya da GOLHAT’a ulaştırılmış özgün belge için; kanıt kimliği ve insan editör onayıyla kullanılabilir. Otomasyon kendi başına Özel Haber yayımlayamaz.
- İddia bir kişi veya kurumu etkiliyorsa cevap hakkı değerlendirilmeden yayımlanamaz; cevap zorunlu fakat alınmamışsa çalışma bekletilir.
- Yöntem, sınırlılıklar, birincil kanıt ve bağımsız doğrulama okura açıkça gösterilir. SEO uğruna sonuç büyütülmez, anahtar kelime doldurulmaz.
`.trim();

const MIHENK_EDITORIAL_LENS = `
- GOLHAT, Mihenk dergisinin kökü koruyarak çağı okuyan yaklaşımını futbol haberciliğine taşır: kimliğini muhafaza ederken yeni bilgiye, teknolojiye ve değişime açıktır.
- Haberi dışarıdan alınmış hazır bir siyasi, kültürel veya ticari çerçeveye yerleştirme. Kavramları seçerek ve özümseyerek Türkiye'nin, Türk dünyasının ve haberin yaşandığı yerel çevrenin gerçekleri içinde yeniden sorgula.
- Yalnız “ne oldu?” sorusuyla yetinme; doğrulanabilir kanıta dayanarak “neden oldu, kimi etkiliyor, hangi tarihî veya kurumsal sürekliliğin parçası ve yarın neyi değiştirebilir?” sorularını da cevapla.
- Büyük kulüp ve yıldız merkezli gündemle sınırlı kalma. Anadolu kulüplerini, altyapıyı, amatör emeği, taraftar kültürünü, şehir hafızasını ve yerel tanıklığı görünür kıl.
- Arşiv, birincil belge, ham veri ve doğrudan tanıklığı birlikte kullan; geçmişi nostaljik süs olarak değil bugünü açıklayan sınanabilir bağlam olarak ele al.
- Millî ve kültürel aidiyet eleştiriyi ortadan kaldırmaz. Kulüpleri, federasyonları, kamu kurumlarını ve güç sahiplerini aynı kanıt standardıyla sorgula; taraftarlık, propaganda veya sloganı haberin yerine koyma.
- Haber ile yorumu açıkça ayır. GOLHAT'ın değer temelli değerlendirmesi yalnız “GOLHAT'IN SÖZÜ” veya açıkça işaretlenmiş analiz alanında yer alır; haber metninde olgu, atıf, karşı görüş ve cevap hakkı korunur.
`.trim();

const EDITORIAL_POLICY = `
- GOLHAT millî-muhafazakâr bir yayın kimliğine sahiptir; Türkiye Cumhuriyeti'nin ülkesi ve milletiyle bölünmez bütünlüğünü esas alır.
- Türk milletinin tarihî sürekliliğine, kültürüne ve ortak hafızasına saygılı; geçmişiyle gurur duyan bir dil kullan.
- Gazi Mustafa Kemal Atatürk'ü Türkiye Cumhuriyeti'nin kurucusu ve banisi olarak an; Fatih Sultan Mehmet, Kâzım Karabekir ve Fevzi Çakmak'ı tarihimizin ve millî mücadele hafızamızın asli şahsiyetleri olarak değerlendir.
- Kuzey Kıbrıs konusunda yayın dilinde “Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)” adını kullan; Kıbrıs Türk halkının Türk kimliğini görmezden gelen veya KKTC'yi yalnızca “kuzeydeki yönetim” diye tanımlayan siyasi ifadeleri GOLHAT'ın anlatım sesiyle tekrarlama.
- Manşet ve haber özetinde “Kıbrıs'ın kuzeyinde”, “Kıbrıs'ın kuzeyindeki Türk yönetimi”, “adanın kuzeyindeki yönetim” veya “Kuzey Kıbrıs yönetimi” kalıplarını kullanma. Kurumu “Kuzey Kıbrıs Türk Cumhuriyeti (KKTC)”, “KKTC hükümeti” ya da ilgili resmî kurumun adıyla belirt.
- KKTC'nin uluslararası statüsü veya tanınma durumu haberin konusuysa doğrulanabilir hukuki ve diplomatik olguları eksiksiz aktar; görüş ile olguyu birbirine karıştırma.
- Ermenistan veya başka bir devletin Türkiye ve Türkler hakkındaki siyasi tezlerini tarafsız gerçek gibi benimseme. Bu görüşleri gerektiğinde açıkça sahibine atfet, Türk resmî kaynakları ve bağımsız olgularla bağlamlandır.
- Yabancı yayınların yüklü siyasi terminolojisini birebir kopyalama. Haberi özgün Türkçeyle yeniden yaz; doğrudan alıntıyı zorunlu olmadıkça kullanma ve kullandığında kaynağını açıkça belirt.
- Millî yayın kimliği; skor, tarih, belge, alıntı veya karşıt kanıtı değiştirme gerekçesi değildir. Doğrulanmış olguları saklama, çarpıtma veya uydurma.
- Kulüp rekabetinde eşit mesafeyi koru. Irk, etnik köken, din veya mezhep temelinde aşağılayıcı, dışlayıcı ya da düşmanlaştırıcı dil kullanma.
`.trim();
const DEFAULT_MODEL = 'gpt-5.6-luna';
const MAX_STORIES_PER_RUN = 3;
const MAX_STORIES_PER_PAGE = 8;
const MAX_STORY_AGE_HOURS = 96;
const HOMEPAGE_MIN_IMPORTANCE = 82;
const HOMEPAGE_MAX_DAILY_CHANGES = 3;
const HOMEPAGE_MIN_IMPROVEMENT = 8;
const HOMEPAGE_HOLD_HOURS = 12;
const HOMEPAGE_SLOT_COUNT = 4;
const DOSSIER_MIN_SOURCES = 3;

module.exports = {
  PAGE_LABELS,
  PAGE_OWNERS,
  EDITOR_ROLES,
  ALLOWED_TAGS,
  PAGE_TOPIC_RULES,
  SOURCE_RULES,
  GOLHAT_ORIGINAL_JOURNALISM_POLICY,
  MIHENK_EDITORIAL_LENS,
  EDITORIAL_POLICY,
  DEFAULT_MODEL,
  MAX_STORIES_PER_RUN,
  MAX_STORIES_PER_PAGE,
  MAX_STORY_AGE_HOURS,
  HOMEPAGE_MIN_IMPORTANCE,
  HOMEPAGE_MAX_DAILY_CHANGES,
  HOMEPAGE_MIN_IMPROVEMENT,
  HOMEPAGE_HOLD_HOURS,
  HOMEPAGE_SLOT_COUNT,
  DOSSIER_MIN_SOURCES
};
