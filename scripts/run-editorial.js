'use strict';

const fs = require('node:fs');
const path = require('node:path');

const UEFA_2026_QUALIFYING_URL = 'https://www.uefa.com/uefachampionsleague/news/02a6-20e5a8be4e63-ae971c582f8c-1000--champions-league-qualifying-fixtures-results-dates-how-it-/';

const {
  PAGE_LABELS,
  EDITOR_ROLES,
  ALLOWED_TAGS,
  SOURCE_RULES,
  GOLHAT_ORIGINAL_JOURNALISM_POLICY,
  GOLHAT_PUBLISHER_EXPERIENCE,
  GOLHAT_COMMENTARY_VOICE,
  GOLHAT_SEO_PLAYBOOK,
  EDITORIAL_POLICY,
  DEFAULT_MODEL,
  MAX_STORIES_PER_RUN,
  MAX_STORIES_PER_PAGE
} = require('./editorial-config');
const {
  loadState,
  saveState,
  urlSignature,
  collectCitedUrls,
  parseStructuredResponse,
  storyIsDuplicate,
  storyMatchesPage,
  validateStory,
  existingHeadlines,
  formatIstanbulDate,
  requestOpenAI,
  writeCategoryPage,
  writeStoryPages,
  writeSitemap,
  writeNewsSitemap,
  writeHomepageArchive,
  writeHomepage,
  selectHomepagePrimary
} = require('./editorial-lib');

const CATEGORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'rationale', 'stories'],
  properties: {
    decision: { type: 'string', enum: ['update', 'no_change'] },
    rationale: { type: 'string' },
    stories: {
      type: 'array',
      maxItems: MAX_STORIES_PER_RUN,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'headline', 'summary', 'tag', 'published_at', 'importance', 'content_type', 'author_name', 'seo_title', 'seo_description', 'focus_keyword', 'original_angle', 'key_findings', 'originality_basis', 'methodology', 'original_findings', 'limitations', 'right_of_reply_status', 'golhat_evidence_id', 'sources'],
        properties: {
          page: { type: 'string', enum: Object.keys(PAGE_LABELS) },
          headline: { type: 'string', minLength: 20, maxLength: 180 },
          summary: { type: 'string', minLength: 70, maxLength: 700 },
          tag: { type: 'string', enum: ALLOWED_TAGS },
          published_at: { type: 'string' },
          importance: { type: 'integer', minimum: 50, maximum: 100 },
          content_type: { type: 'string', enum: ['news', 'analysis', 'dossier', 'exclusive'] },
          author_name: { type: 'string', minLength: 2, maxLength: 80 },
          seo_title: { type: 'string', minLength: 20, maxLength: 110 },
          seo_description: { type: 'string', minLength: 70, maxLength: 180 },
          focus_keyword: { type: 'string', minLength: 2, maxLength: 80 },
          original_angle: { type: 'string', minLength: 70, maxLength: 900 },
          key_findings: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', minLength: 20, maxLength: 350 } },
          originality_basis: { type: 'string', enum: ['reported_event', 'public_document_analysis', 'original_data_analysis', 'direct_reporting', 'original_document_obtained'] },
          methodology: { type: 'string', maxLength: 1200 },
          original_findings: { type: 'array', minItems: 0, maxItems: 6, items: { type: 'string', minLength: 20, maxLength: 400 } },
          limitations: { type: 'string', maxLength: 700 },
          right_of_reply_status: { type: 'string', enum: ['not_applicable', 'response_in_sources', 'required_before_publish'] },
          golhat_evidence_id: { type: 'string', maxLength: 120 },
          sources: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'publisher', 'url', 'published_at', 'source_role'],
              properties: {
                title: { type: 'string' },
                publisher: { type: 'string' },
                url: { type: 'string' },
                published_at: { type: 'string' },
                source_role: { type: 'string', enum: ['primary_evidence', 'independent_verification', 'context'] }
              }
            }
          }
        }
      }
    }
  }
};

function parseArgs(argv) {
  const options = { all: false, role: null, head: false, priorityMatchdesk: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--all') options.all = true;
    else if (value === '--head') options.head = true;
    else if (value === '--priority-matchdesk') options.priorityMatchdesk = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--role') options.role = argv[++index];
    else throw new Error('Bilinmeyen argüman: ' + value);
  }

  const modeCount = Number(options.all) + Number(Boolean(options.role)) + Number(options.head) + Number(options.priorityMatchdesk);
  if (modeCount !== 1) {
    throw new Error('--all, --role <ad>, --head veya --priority-matchdesk seçeneklerinden tam biri gerekli');
  }
  if (options.role && !Object.hasOwn(EDITOR_ROLES, options.role)) {
    throw new Error('Bilinmeyen editör rolü: ' + options.role);
  }
  return options;
}

function buildLiveDataSnapshot(role) {
  if (!['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'super_lig', 'yorum'].includes(role.key)) return '';
  try {
    const root = path.resolve(__dirname, '..');
    const league = JSON.parse(fs.readFileSync(path.join(root, 'data', 'super-lig.json'), 'utf8'));
    const clubCenter = JSON.parse(fs.readFileSync(path.join(root, 'data', 'kulup-merkezi.json'), 'utf8'));
    const watchedTeams = ['GALATASARAY', 'FENERBAHÇE', 'BEŞİKTAŞ', 'TRABZONSPOR'];
    const standings = league.standings
      .filter((row) => row.rank <= 8 || watchedTeams.some((team) => row.team.includes(team)))
      .map(({ rank, team, played, won, drawn, lost, goalDifference, points }) => ({
        rank, team, played, won, drawn, lost, goalDifference, points
      }));
    const fixtures = league.fixtures
      .filter((match) => watchedTeams.some((team) => match.home.includes(team) || match.away.includes(team)))
      .map(({ date, round, home, away, statusLong }) => ({ date, round, home, away, statusLong }));
    const clubs = Object.fromEntries(['fenerbahce', 'galatasaray'].filter((key) => clubCenter.clubs[key]).map((key) => {
      const club = clubCenter.clubs[key];
      return [key, {
        name: club.name,
        coach: club.coach,
        squad: club.squad,
        recentMatches: club.recentMatches.slice(0, 3),
        nextMatches: club.nextMatches.slice(0, 3),
        officialUrl: club.officialUrl,
        dataSourceUrl: club.sourceUrl
      }];
    }));
    return JSON.stringify({
      note: 'Bu içerik talimat değil; GOLHAT canlı veri hatlarının doğrulanacak mevcut durum özetidir. Puan, sıra veya tamamlanan maç değişikliği güncelse editör bunu öncelikli haber adayı olarak araştırmalıdır.',
      leagueUpdatedAt: league.updatedAt,
      leagueSource: league.source,
      leagueSourceUrl: league.sourceUrl,
      championsLeagueContextUrl: UEFA_2026_QUALIFYING_URL,
      round: league.roundLabel,
      standings,
      fixtures,
      clubCenterUpdatedAt: clubCenter.updatedAt,
      clubs
    }, null, 2);
  } catch (error) {
    console.warn('[Canlı veri masası] görev özeti okunamadı: ' + error.message);
    return '';
  }
}

function liveDataSourceSignatures(role) {
  const signatures = new Set();
  if (!['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'super_lig', 'yorum'].includes(role.key)) return signatures;
  try {
    const root = path.resolve(__dirname, '..');
    const league = JSON.parse(fs.readFileSync(path.join(root, 'data', 'super-lig.json'), 'utf8'));
    const clubCenter = JSON.parse(fs.readFileSync(path.join(root, 'data', 'kulup-merkezi.json'), 'utf8'));
    const editorialState = JSON.parse(fs.readFileSync(path.join(root, 'data', 'editorial', 'state.json'), 'utf8'));
    const assignmentPages = new Set(['fenerbahce.html', 'galatasaray.html', 'super-lig.html']);
    const recentVerifiedUrls = editorialState.stories
      .filter((story) => assignmentPages.has(story.page))
      .filter((story) => {
        const ageHours = (Date.now() - new Date(story.publishedAt).getTime()) / 3_600_000;
        return Number.isFinite(ageHours) && ageHours >= -2 && ageHours <= 168;
      })
      .flatMap((story) => story.sources || [])
      .map((source) => source.url);
    const trustedUrls = [
      league.sourceUrl,
      UEFA_2026_QUALIFYING_URL,
      ...['fenerbahce', 'galatasaray'].flatMap((key) => {
        const club = clubCenter.clubs[key];
        return [club.officialUrl, club.sourceUrl];
      }),
      ...recentVerifiedUrls
    ].filter(Boolean);
    for (const url of trustedUrls) signatures.add(urlSignature(url));
  } catch (error) {
    console.warn('[Canlı veri masası] güvenilir kaynak imzaları okunamadı: ' + error.message);
  }
  return signatures;
}

function categoryRequest(role, now, model, options = {}) {
  const assignment = String(process.env.GOLHAT_EDITORIAL_ASSIGNMENT || '').trim();
  const leadWriter = role.columnists?.find((writer) => writer.lead) || role.columnists?.[0] || null;
  const liveDataSnapshot = buildLiveDataSnapshot(role);
  const priorityMatchBrief = options.priorityMatchdesk && role.key === 'yorum' ? [
    'Bu öncelikli maç masası görevidir. Önemli yerli maç yorumunu Mustafa YILDIZ imzasıyla üret; author_name alanı tam olarak Mustafa YILDIZ olmalı.',
    'Yalnız doğrulanabilen skor/kırılma, taktik tercih, oyuncu etkisi, hakem/VAR kararı, teknik direktör tercihi ve puan tablosu etkisini işle; kaynakta olmayan unsurları limitations alanında açıkça sınırla.'
  ] : [];
  const assignmentBrief = assignment ? [
    'ÖZEL YAYIN GÖREVİ: ' + assignment,
    ...(leadWriter ? [
      'Bu özel görev baş yazar ' + leadWriter.name + ' imzasıyla, tek ve bütünlüklü bir köşe yazısı olarak hazırlanmalı.',
      'decision=update ve stories dizisinde tam bir yazı hedefle; author_name alanını tam olarak ' + leadWriter.name + ' yaz.',
      'Bu görev son dakika haberi değil mevcut durum analizidir; son 12 saatte yeni olay bulunması şartını uygulama.',
      'Sağlanan canlı veri özetini başlangıç noktası say, fakat yayımlanacak her olguyu özgün kaynak URLlerinde web araştırmasıyla yeniden doğrula.',
      'Kaynak URL tahmin etme veya belleğinden üretme. UEFA eleme bağlamı gerekiyorsa canlı veri özetindeki championsLeagueContextUrl adresini karakter karakter aynen kullan ve web aramasında aç.',
      'Her takım ve lig hükmünü ayrı ayrı doğrula; doğrulanamayan iddiayı çıkar ve sınırlılığı açıkça yaz. Sırf yeni olay yok diye no_change döndürme.'
    ] : [])
  ] : [];
  const productionBrief = role.columnists ? [
    'Bu masa haber üretmez; doğrulanmış güncel olgudan hareket eden, açıkça YORUM olarak işaretlenmiş köşe yazısı üretir.',
    'Her içerikte content_type=analysis, tag=Yorum ve originality_basis=reported_event kullan.',
    'author_name yalnız şu kayıtlı GOLHAT yazarlarından biri olabilir: ' + role.columnists.map((writer) => writer.name + ' — ' + writer.focus).join(' | '),
    'Yazarı konu uzmanlığına göre seç. Yeni olgu, alıntı veya içeriden bilgi uydurma; yorum ile doğrulanmış olgu arasındaki sınırı görünür tut.',
    'original_angle alanında yazının tek, savunulabilir ve özgün tezini kur; key_findings yalnız bu tezi taşıyan doğrulanmış olguları içersin.',
    GOLHAT_COMMENTARY_VOICE,
    'Kulüp taraftarlığı yapma, kişiye saldırma, kesin hüküm vermeyen kanıtı kesinmiş gibi yazma. Kaynaklardaki haber metnini köşe yazısı diye yeniden paketleme.',
    'Yeterli güncel olgu ve özgün tez yoksa decision=no_change döndür.'
  ] : role.researchTeam ? [
    'Bu masa dört uzman denetimiyle çalışır:',
    ...role.researchTeam,
    'Kaynak derlemesi, haber özeti veya başka yayınların analizini yeniden anlatan çalışma üretme.',
    'Bu otomasyon yalnız content_type=dossier üretebilir; exclusive üretme. Özel Haber insan muhabir kanıtı ve editör onayı gerektirir.',
    'originality_basis yalnız public_document_analysis veya original_data_analysis olabilir.',
    'En az bir source_role=primary_evidence ve bir source_role=independent_verification kullan.',
    'methodology alanında veri kümesini, tarih aralığını, hesabı ve karşılaştırmayı yeniden üretilebilir biçimde açıkla.',
    'original_findings alanında kaynaklarda hazır cümle olarak bulunmayan, GOLHAT’ın yöntemle çıkardığı en az iki yeni sonucu yaz.',
    'limitations alanında verinin kapsamadığı noktaları açıkla. right_of_reply_status=required_before_publish ise yayımlama; decision=no_change döndür.',
    'SEO alanlarında anahtar kelime doldurma yapma; başlık bulguyu aşmasın.',
    'author_name alanını tam olarak GOLHAT Araştırma Kurulu yaz.'
  ] : [
    'Her haber için doğal seo_title, seo_description, focus_keyword, original_angle ve key_findings üret.',
    'Normal haberlerde originality_basis=reported_event, original_findings=[], golhat_evidence_id="" kullan; methodology ile çapraz doğrulama yolunu, limitations ile bilinen sınırı kısaca açıkla.',
    'Her kaynağı primary_evidence, independent_verification veya context olarak sınıflandır.',
    'author_name alanını tam olarak GOLHAT Haber Merkezi yaz.'
  ];
  const pageSummary = role.pages
    .map((page) => page + ': ' + PAGE_LABELS[page])
    .join('\n');
  const current = role.pages.map((page) => {
    const headlines = existingHeadlines(page).slice(0, 14);
    return PAGE_LABELS[page] + ' mevcut manşetleri:\n- ' + headlines.join('\n- ');
  }).join('\n\n');

  return {
    model,
    store: false,
    reasoning: { effort: 'low' },
    tools: [{
      type: 'web_search',
      user_location: {
        type: 'approximate',
        country: 'TR',
        city: 'Istanbul',
        region: 'Istanbul'
      }
    }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    instructions: [
      'Sen GOLHAT haber merkezinde çalışan deneyimli bir spor editörüsün.',
      'Yalnızca web aramasında gerçekten bulduğun ve birbiriyle çapraz doğruladığın güncel olguları yaz.',
      'Türkçe yaz. Dedikodu ve yorumu olgu gibi sunma. Uydurma alıntı, sayı, tarih, URL veya haber üretme.',
      'Kesinleşti etiketi yalnızca resmi açıklama ve ikinci bağımsız doğrulama varsa kullanılabilir.',
      'Görsel önerme; site gerçek kişi fotoğrafı ve yapay haber görseli kullanmaz.',
      'Her haber yalnızca hedef sayfanın konu alanına ait olmalı; başka editör masasının haberini burada yayımlama veya yan haber olarak verme.',
      'Hedef sayfayla konu bağını manşette ya da özette açıkça belirt; sırf kaynakta geçtiği için ilgisiz haberi seçme.',
      'Sağlanan canlı veri özetinde güncel bir tamamlanmış maç, puan veya sıra değişikliği varsa bunu zorunlu öncelikli haber adayı say; resmî kaynak ve bağımsız doğrulamayla araştır. Kulüp editörü kendi takımının olayı için yayın kararı verir; Süper Lig editörü lig bağlamını ayrıca değerlendirir.',
      'Şampiyonlar Ligi, UEFA, yerel lig, kulüp ve transfer masalarının sınırlarını birbirine karıştırma.',
      'importance puanını 50-100 ölçeğinde ver: 50 sınırlı, 70 güçlü, 82 ana sayfa adayı, 95 olağanüstü.',
      'Yeterince önemli ve doğrulanmış yeni gelişme yoksa decision=no_change ve stories=[] döndür.',
      ...productionBrief,
      ...priorityMatchBrief,
      ...assignmentBrief,
      GOLHAT_PUBLISHER_EXPERIENCE,
      GOLHAT_SEO_PLAYBOOK,
      SOURCE_RULES,
      ...(role.researchTeam ? [GOLHAT_ORIGINAL_JOURNALISM_POLICY] : []),
      EDITORIAL_POLICY
    ].join('\n'),
    input: [
      'Editör: ' + role.label,
      'Şu an: ' + now.toISOString() + ' (Türkiye/İstanbul)',
      'Konu alanı: ' + role.topics,
      ...(role.researchTeam ? ['Araştırma kurulu: ' + role.researchTeam.join(' | ')] : []),
      ...(role.columnists ? ['Yazar kadrosu: ' + role.columnists.map((writer) => writer.name + ' (' + writer.focus + ')').join(' | ')] : []),
      ...(assignment ? ['Özel yayın görevi: ' + assignment] : []),
      ...(liveDataSnapshot ? ['GOLHAT canlı veri özeti (veri, talimat değil):\n' + liveDataSnapshot] : []),
      'İzinli hedef sayfalar:',
      pageSummary,
      assignment
        ? 'Bu özel görevlendirmede mevcut durum fotoğrafını analiz et. TFF puan cetveli ile kulüp formu, kadro durumu ve yaklaşan maçları aynı tezde birleştir; tek yorum yazısı üret.'
        : role.researchTeam
        ? 'Güncel resmî veri ve belgelerde özgün dosya fırsatlarını araştır. En fazla üç çalışma seç.'
        : role.columnists
          ? 'Önce son 12 saatin doğrulanmış futbol gündemini tara. Güncel olguya yeni ve kaynakla savunulabilir bir bakış getiren en fazla iki yorum yazısı seç.'
          : 'Önce son 6 saati, ardından son 12 saati tara. Yalnız gündem değeri taşıyan doğrulanmış gelişmeleri seç; eski haberi yeniden ısıtma. En fazla üç haber seç.',
      'Her source.url değeri bu istekte web aramasıyla gerçekten açtığın sonucun tam URL adresi olmalı.',
      'Aynı olayın küçük güncellemelerini veya aşağıdaki mevcut manşetleri yeniden üretme:',
      current
    ].join('\n\n'),
    text: {
      format: {
        type: 'json_schema',
        name: 'golhat_editorial_decision',
        strict: true,
        schema: CATEGORY_SCHEMA
      }
    },
    max_output_tokens: role.researchTeam ? 8500 : role.columnists ? 7000 : 6000
  };
}

function mergeStories(state, accepted) {
  const byId = new Map(state.stories.map((story) => [story.id, story]));
  for (const story of accepted) byId.set(story.id, story);
  state.stories = [...byId.values()]
    .sort((left, right) => new Date(right.discoveredAt) - new Date(left.discoveredAt))
    .slice(0, 180);
}
function refreshRolePages(role, state, now) {
  for (const page of role.pages) {
    const pageStories = state.stories
      .filter((story) => story.page === page)
      .slice(0, MAX_STORIES_PER_PAGE);
    writeCategoryPage(page, pageStories, now);
  }
}


async function runCategory(roleName, state, options, apiKey, model, now) {
  const role = { ...EDITOR_ROLES[roleName], key: roleName };
  console.log('\n[' + role.label + '] araştırma başladı');
  const response = await requestOpenAI(categoryRequest(role, now, model, options), apiKey);
  const result = parseStructuredResponse(response);
  const citedUrls = collectCitedUrls(response);
  for (const signature of liveDataSourceSignatures(role)) citedUrls.add(signature);

  if (result.decision !== 'update' || result.stories.length === 0) {
    console.log('[' + role.label + '] değişiklik yok: ' + result.rationale);
    if (!options.dryRun) refreshRolePages(role, state, now);
    return 0;
  }

  const knownHeadlines = role.pages.flatMap((page) => existingHeadlines(page))
    .concat(state.stories.map((story) => story.headline));

  const accepted = [];
  for (const candidate of result.stories) {
    try {
      const story = validateStory(candidate, {
        now,
        role: roleName,
        allowedPages: role.pages,
        citedUrls
      });
      if (options.priorityMatchdesk && roleName === 'yorum' && story.authorName !== 'Mustafa YILDIZ') {
        throw new Error('Öncelikli yerli maç yorumu Mustafa YILDIZ imzasını taşımalı');
      }
      const comparison = knownHeadlines.concat(accepted.map((item) => item.headline));
      if (storyIsDuplicate(story.headline, comparison)) {
        console.warn('[' + role.label + '] yinelenen haber atlandı: ' + story.headline);
        continue;
      }
      accepted.push(story);
    } catch (error) {
      console.warn('[' + role.label + '] doğrulamadan geçmeyen haber atlandı: ' + error.message);
    }
  }

  if (accepted.length === 0) {
    console.log('[' + role.label + '] yayınlanabilir yeni haber bulunmadı');
    if (!options.dryRun) refreshRolePages(role, state, now);
    return 0;
  }

  console.log('[' + role.label + '] ' + accepted.length + ' doğrulanmış haber kabul edildi');
  if (options.dryRun) {
    for (const story of accepted) console.log('  - ' + story.page + ': ' + story.headline);
    return accepted.length;
  }

  mergeStories(state, accepted);
  refreshRolePages(role, state, now);
  const storyPageChanges = writeStoryPages(state.stories, now);
  const sitemapChanged = writeSitemap(state.stories, now);
  const newsSitemapChanged = writeNewsSitemap(state.stories, now);
  console.log('[' + role.label + '] kalıcı haber sayfaları=' + storyPageChanges + ', sitemap=' + (sitemapChanged ? 'güncellendi' : 'aynı') + ', haber sitemap=' + (newsSitemapChanged ? 'güncellendi' : 'aynı'));
  state.updatedAt = now.toISOString();
  saveState(state);
  return accepted.length;
}

async function runHeadEditor(state, options, now) {
  const currentStory = state.stories.find((story) => story.id === state.homepage.storyId) || null;
  const lastPublishedChange = [...state.homepage.changes]
    .reverse()
    .find((change) => change.storyId === currentStory?.id);

  if (currentStory && !options.dryRun) {
    const repairTime = new Date(
      lastPublishedChange?.at || currentStory.discoveredAt || currentStory.publishedAt
    );
    const homepageChanged = writeHomepage(currentStory, repairTime, state.stories);
    const archiveChanged = writeHomepageArchive(currentStory, repairTime);
    if (homepageChanged) {
      console.log('[Baş Editör] ana sayfa bütünlüğü otomatik onarıldı');
    } else {
      console.log('[Baş Editör] ana sayfa bütünlüğü doğrulandı');
    }
    if (archiveChanged) console.log('[Baş Editör] mevcut manşet Özel Haber arşivine alındı');
  }

  const selected = selectHomepagePrimary(currentStory, state.stories, now);
  if (!selected) {
    console.log('[Baş Editör] son 12 saatte manşet eşiğini geçen aday yok; kategori taraması bekleniyor');
    return 0;
  }

  if (selected.id === state.homepage.storyId) {
    console.log('[Baş Editör] 1 numaralı manşet güncellik ve önem puanında lider');
    return 0;
  }

  console.log('[Baş Editör] gündem puanıyla seçilen manşet: ' + selected.headline);
  if (options.dryRun) return 1;

  writeHomepage(selected, now, state.stories);
  writeHomepageArchive(selected, now);
  state.homepage.storyId = selected.id;
  state.homepage.changes.push({ at: now.toISOString(), storyId: selected.id });
  state.homepage.changes = state.homepage.changes.slice(-40);
  state.updatedAt = now.toISOString();
  saveState(state);
  return 1;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OPENAI_API_KEY;
  if (!options.head && !apiKey) throw new Error('OPENAI_API_KEY tanımlı değil');
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const now = new Date();
  const state = loadState();

  console.log(
    'GOLHAT otomasyonu | model=' + model +
    ' | tarih=' + formatIstanbulDate(now) +
    ' | dry_run=' + options.dryRun
  );

  if (options.head) {
    await runHeadEditor(state, options, now);
    return;
  }

  const roles = options.all
    ? Object.keys(EDITOR_ROLES).filter((role) => role !== 'ozel_haber')
    : options.priorityMatchdesk
      ? ['galatasaray', 'fenerbahce', 'besiktas', 'trabzonspor', 'super_lig', 'yorum']
      : [options.role];
  let failures = 0;
  let accepted = 0;
  for (const role of roles) {
    try {
      accepted += await runCategory(role, state, options, apiKey, model, now);
    } catch (error) {
      failures += 1;
      console.error('::error title=' + EDITOR_ROLES[role].label + '::' + error.message);
      if (error.fatal) {
        process.exitCode = 1;
        break;
      }
    }
  }

  console.log('\nSonuç: ' + accepted + ' haber kabul edildi, ' + failures + ' editör hatası');
  if (failures === roles.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('::error title=GOLHAT otomasyon hatası::' + error.message);
  process.exitCode = 1;
});
