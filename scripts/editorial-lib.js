'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWED_TAGS,
  DOSSIER_MIN_SOURCES,
  GOLHAT_EDITORIAL_THRESHOLDS,
  HOMEPAGE_SLOT_COUNT,
  MAX_STORIES_PER_PAGE,
  MAX_STORY_AGE_HOURS,
  PAGE_LABELS,
  PAGE_OWNERS,
  PAGE_TOPIC_RULES
} = require('./editorial-config');

const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(REPO_ROOT, 'data', 'editorial', 'state.json');
const START_MARKER = '  <!-- GOLHAT:AUTO_EDITOR:START -->';
const END_MARKER = '  <!-- GOLHAT:AUTO_EDITOR:END -->';
const HOMEPAGE_ARCHIVE_START = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE:START -->';
const HOMEPAGE_ARCHIVE_END = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE:END -->';
const HOMEPAGE_ARCHIVE_INDEX_START = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE_INDEX:START -->';
const HOMEPAGE_ARCHIVE_INDEX_END = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE_INDEX:END -->';
const PAGE_LIVE_START = '  <!-- GOLHAT:PAGE_LIVE:START -->';
const PAGE_LIVE_END = '  <!-- GOLHAT:PAGE_LIVE:END -->';
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src'
]);
const CONTENT_TYPES = new Set(['news', 'analysis', 'dossier', 'exclusive']);
const ORIGINALITY_BASES = new Set(['reported_event', 'public_document_analysis', 'original_data_analysis', 'direct_reporting', 'original_document_obtained']);
const SOURCE_ROLES = new Set(['primary_evidence', 'independent_verification', 'context']);
const RIGHT_OF_REPLY_STATUSES = new Set(['not_applicable', 'response_in_sources', 'required_before_publish']);
const EDITORIAL_QUARANTINE_RULES = Object.freeze([
  /Kıbrıs['’]ın kuzeyinde/iu,
  /Kıbrıs['’]ın kuzeyindeki(?:\s+Türk)?\s+yönetim/iu,
  /adanın kuzeyindeki(?:\s+Türk)?\s+yönetim/iu,
  /Kuzey Kıbrıs(?:\s+Türk)?\s+yönetimi/iu,
  /sözde\s+KKTC/iu
]);

function emptyState() {
  return {
    version: 1,
    updatedAt: null,
    stories: [],
    homepage: {
      storyId: null,
      changes: []
    }
  };
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return emptyState();
  }

  const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  const state = {
    ...emptyState(),
    ...parsed,
    homepage: {
      ...emptyState().homepage,
      ...(parsed.homepage || {})
    }
  };

  if (!Array.isArray(state.stories)) state.stories = [];
  if (!Array.isArray(state.homepage.changes)) state.homepage.changes = [];
  for (const story of state.stories) {
    if (Number.isInteger(story.importance) && story.importance >= 1 && story.importance <= 10) {
      story.importance *= 10;
    }
  }
  return state;
}

function writeTextAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = filePath + '.tmp-' + process.pid;
  fs.writeFileSync(temporary, value, 'utf8');
  fs.renameSync(temporary, filePath);
}

function saveState(state) {
  writeTextAtomic(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&middot;|&ndash;|&mdash;|&rarr;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeadline(value) {
  return stripHtml(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeHeadline(value)
    .replaceAll('ı', 'i').replaceAll('ş', 's').replaceAll('ğ', 'g')
    .replaceAll('ç', 'c').replaceAll('ö', 'o').replaceAll('ü', 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
}

function storySlug(story) {
  const base = slugify(story.seoTitle || story.headline) || 'golhat-haber';
  return base + '-' + String(story.id || 'dosya').slice(0, 8);
}

function storyUrl(story) {
  return '/haber/' + storySlug(story) + '.html';
}

function assertEditorialLanguage(...values) {
  const text = values.map((value) => String(value || '')).join('\n');
  if (EDITORIAL_QUARANTINE_RULES.some((pattern) => pattern.test(text))) {
    throw new Error(
      'Yayın politikası karantinası: KKTC, kendi adı ve kurumlarıyla anılmalı'
    );
  }
  return true;
}
function canonicalUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Desteklenmeyen kaynak protokolü');
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

function urlSignature(value) {
  const url = new URL(canonicalUrl(value));
  return (url.hostname.replace(/^(www|m|amp)\./, '') + url.pathname).toLocaleLowerCase('en-US');
}

function sourceDomain(value) {
  const url = new URL(canonicalUrl(value));
  return url.hostname.replace(/^(www|m|amp)\./, '');
}

function collectCitedUrls(response) {
  const collected = new Set();

  function add(value) {
    if (!value) return;
    try {
      collected.add(urlSignature(value));
    } catch {
      // Responses API dışındaki veya bozuk değerler kaynak olarak kabul edilmez.
    }
  }

  for (const item of response.output || []) {
    if (item.type === 'web_search_call') {
      for (const source of item.action?.sources || []) add(source.url);
      for (const result of item.action?.results || []) add(result.url);
      for (const result of item.results || []) add(result.url);
    }

    if (item.type === 'message') {
      for (const part of item.content || []) {
        for (const annotation of part.annotations || []) {
          if (annotation.type === 'url_citation') add(annotation.url);
        }
      }
    }
  }

  return collected;
}

function responseOutputText(response) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks = [];
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function parseStructuredResponse(response) {
  const output = responseOutputText(response);
  if (!output) throw new Error('OpenAI yanıtında yapılandırılmış metin bulunamadı');
  return JSON.parse(output);
}

function tokenSet(value) {
  return new Set(normalizeHeadline(value).split(' ').filter((token) => token.length > 2));
}

function headlineSimilarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.max(a.size, b.size);
}

function storyIsDuplicate(headline, headlines) {
  const normalized = normalizeHeadline(headline);
  return headlines.some((candidate) => {
    const other = normalizeHeadline(candidate);
    return normalized === other || headlineSimilarity(normalized, other) >= 0.82;
  });
}
function storyMatchesPage(page, headline, summary) {
  const rule = PAGE_TOPIC_RULES[page];
  if (!rule) return false;
  const text = [headline, summary]
    .map((value) => String(value || '').normalize('NFC').toLocaleLowerCase('tr-TR'))
    .join(' ');
  return rule.requiredAny.length === 0 || rule.requiredAny.some((term) =>
    text.includes(term.toLocaleLowerCase('tr-TR'))
  );
}

function assertStoryPageRelevance(page, headline, summary) {
  if (!storyMatchesPage(page, headline, summary)) {
    throw new Error('Haber hedef sayfanın konu alanıyla eşleşmiyor: ' + page);
  }
}


function validateStory(raw, context) {
  const now = context.now || new Date();
  if (!raw || typeof raw !== 'object') throw new Error('Haber nesnesi geçersiz');
  if (!context.allowedPages.includes(raw.page)) throw new Error('Hedef sayfa izinli değil');
  if (PAGE_OWNERS[raw.page] !== context.role) throw new Error('Haber yanlış editör masasına atanmış');

  const headline = String(raw.headline || '').trim();
  const summary = String(raw.summary || '').trim();
  const tag = String(raw.tag || '').trim();
  const importance = Number(raw.importance);
  const contentType = String(raw.content_type || 'news').trim();
  const seoTitle = String(raw.seo_title || headline).trim();
  const seoDescription = String(raw.seo_description || summary).trim();
  const focusKeyword = String(raw.focus_keyword || '').trim();
  const originalAngle = String(raw.original_angle || summary).trim();
  const keyFindings = Array.isArray(raw.key_findings)
    ? raw.key_findings.map((item) => String(item || '').trim()).filter(Boolean)
    : [summary];
  const originalityBasis = String(raw.originality_basis || 'reported_event').trim();
  const methodology = String(raw.methodology || 'Olgular en az iki bağımsız kaynaktan çapraz doğrulandı.').trim();
  const originalFindings = Array.isArray(raw.original_findings)
    ? raw.original_findings.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const limitations = String(raw.limitations || 'Mevcut açık kaynakların kapsamadığı ayrıntılar sonuç olarak sunulmadı.').trim();
  const rightOfReplyStatus = String(raw.right_of_reply_status || 'not_applicable').trim();
  const evidenceId = String(raw.golhat_evidence_id || '').trim();
  const rawEditorialReview = raw.editorial_review;
  if (!rawEditorialReview || typeof rawEditorialReview !== 'object' || Array.isArray(rawEditorialReview)) {
    throw new Error('GOLHAT–MİHENK editoryal değerlendirmesi zorunlu');
  }
  const reviewLabels = {
    tahkik: 'Tahkik',
    adalet: 'Adalet',
    musbet_hareket: 'Müsbet hareket',
    uhuvvet_sefkat: 'Uhuvvet ve şefkat',
    public_interest: 'Kamu yararı'
  };
  const editorialReview = {};
  for (const [key, threshold] of Object.entries(GOLHAT_EDITORIAL_THRESHOLDS)) {
    const criterion = rawEditorialReview[key];
    const score = Number(criterion?.score);
    const note = String(criterion?.note || '').trim();
    if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error(reviewLabels[key] + ' puanı 0-100 aralığında tam sayı olmalı');
    if (note.length < 30 || note.length > 500) throw new Error(reviewLabels[key] + ' değerlendirmesi 30-500 karakter aralığında olmalı');
    if (score < threshold) throw new Error('GOLHAT–MİHENK yayın kapısı: ' + reviewLabels[key] + ' puanı ' + threshold + ' eşiğinin altında');
    editorialReview[key] = { score, note };
  }
  if (rawEditorialReview.news_comment_separated !== true) {
    throw new Error('GOLHAT–MİHENK yayın kapısı: haber ile yorum ayrılmadan yayın yapılamaz');
  }
  editorialReview.newsCommentSeparated = true;

  assertEditorialLanguage(headline, summary, seoTitle, seoDescription, originalAngle, methodology, limitations, ...keyFindings, ...originalFindings, ...Object.values(editorialReview).filter((value) => value && typeof value === 'object').map((value) => value.note));
  assertStoryPageRelevance(raw.page, headline, summary);
  if (headline.length < 20 || headline.length > 180) {
    throw new Error('Manşet uzunluğu 20-180 karakter aralığında olmalı');
  }
  if (summary.length < 70 || summary.length > 700) {
    throw new Error('Özet uzunluğu 70-700 karakter aralığında olmalı');
  }
  if (!ALLOWED_TAGS.includes(tag)) throw new Error('Haber etiketi izinli değil');
  if (!CONTENT_TYPES.has(contentType)) throw new Error('İçerik türü izinli değil');
  if (seoTitle.length < 20 || seoTitle.length > 110) throw new Error('SEO başlığı 20-110 karakter aralığında olmalı');
  if (seoDescription.length < 70 || seoDescription.length > 180) throw new Error('SEO açıklaması 70-180 karakter aralığında olmalı');
  if (originalAngle.length < 70 || originalAngle.length > 900) throw new Error('Özgün açı 70-900 karakter aralığında olmalı');
  if (keyFindings.length < 1 || keyFindings.length > 6) throw new Error('Doğrulanmış bulgu sayısı 1-6 aralığında olmalı');
  if (!ORIGINALITY_BASES.has(originalityBasis)) throw new Error('Özgünlük dayanağı izinli değil');
  if (!RIGHT_OF_REPLY_STATUSES.has(rightOfReplyStatus)) throw new Error('Cevap hakkı durumu izinli değil');
  if (methodology.length > 1200) throw new Error('Yöntem açıklaması en fazla 1200 karakter olmalı');
  if (limitations.length > 700) throw new Error('Sınırlılıklar en fazla 700 karakter olmalı');
  if (originalFindings.length > 6) throw new Error('Özgün bulgu sayısı en fazla altı olabilir');
  if (rightOfReplyStatus === 'required_before_publish') throw new Error('Cevap hakkı tamamlanmadan haber yayımlanamaz');
  if (contentType === 'exclusive') {
    if (raw.page !== 'ozel-haber.html' || !context.humanApprovedExclusive) throw new Error('Otomasyon Özel Haber yayımlayamaz; insan editör onayı gerekli');
    if (!['direct_reporting', 'original_document_obtained'].includes(originalityBasis) || evidenceId.length < 8) {
      throw new Error('Özel Haber için doğrudan muhabirlik veya özgün belge kanıt kimliği gerekli');
    }
  }
  if (context.role === 'ozel_haber') {
    if (!['dossier', 'exclusive'].includes(contentType)) throw new Error('Araştırma masası yalnız özgün araştırma dosyası veya insan onaylı özel haber yayımlar');
    if (keyFindings.length < 3) throw new Error('Araştırma dosyası en az üç doğrulanmış bulgu içermeli');
    if (originalFindings.length < 2) throw new Error('Özgün dosya GOLHAT yönteminden çıkan en az iki yeni bulgu içermeli');
    if (originalAngle.length < 120) throw new Error('Özgün dosyanın GOLHAT açısı en az 120 karakter olmalı');
    if (methodology.length < 100) throw new Error('Özgün dosyanın yeniden üretilebilir yöntem açıklaması eksik');
    if (limitations.length < 50) throw new Error('Özgün dosyanın sınırlılık açıklaması eksik');
    if (contentType === 'dossier' && !['public_document_analysis', 'original_data_analysis'].includes(originalityBasis)) {
      throw new Error('Kaynak derlemesi özgün dosya değildir; kamu belgesi veya veri analizi gerekli');
    }
  }
  if (!Number.isInteger(importance) || importance < 50 || importance > 100) {
    throw new Error('Yayınlanabilir haberin önem puanı 50-100 aralığında tam sayı olmalı');
  }

  const publishedAt = new Date(raw.published_at);
  if (Number.isNaN(publishedAt.getTime())) throw new Error('Haber tarihi geçersiz');
  const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
  if (ageHours < -2 || ageHours > MAX_STORY_AGE_HOURS) {
    throw new Error('Haber yayın penceresinin dışında');
  }

  const minimumSources = context.role === 'ozel_haber' ? DOSSIER_MIN_SOURCES : 2;
  if (!Array.isArray(raw.sources) || raw.sources.length < minimumSources || raw.sources.length > 5) {
    throw new Error('Bu içerik için en az ' + minimumSources + ', en fazla beş kaynak gerekli');
  }

  const sources = raw.sources.map((source) => {
    const url = canonicalUrl(source.url);
    const signature = urlSignature(url);
    if (!context.citedUrls.has(signature)) {
      throw new Error('Kaynak URL web araması sonuçlarında bulunmuyor');
    }

    const title = String(source.title || '').trim();
    const publisher = String(source.publisher || '').trim();
    const sourceRole = String(source.source_role || 'independent_verification').trim();
    if (title.length < 3 || publisher.length < 2) {
      throw new Error('Kaynak başlığı veya yayıncı adı eksik');
    }
    if (!SOURCE_ROLES.has(sourceRole)) throw new Error('Kaynak rolü izinli değil');

    return {
      title,
      publisher,
      url,
      publishedAt: String(source.published_at || '').trim(),
      sourceRole
    };
  });

  const uniqueSources = [];
  const seenSignatures = new Set();
  for (const source of sources) {
    const signature = urlSignature(source.url);
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    uniqueSources.push(source);
  }

  const independentDomains = new Set(uniqueSources.map((source) => sourceDomain(source.url)));
  if (independentDomains.size < 2) {
    throw new Error('Kaynaklar en az iki farklı alan adından gelmeli');
  }
  if (context.role === 'ozel_haber') {
    if (independentDomains.size < DOSSIER_MIN_SOURCES) throw new Error('Özgün dosya en az üç farklı alan adı kullanmalı');
    const sourceRoles = new Set(uniqueSources.map((source) => source.sourceRole));
    if (!sourceRoles.has('primary_evidence')) throw new Error('Özgün dosyada birincil belge veya ham veri kaynağı gerekli');
    if (!sourceRoles.has('independent_verification')) throw new Error('Özgün dosyada bağımsız doğrulama kaynağı gerekli');
  }

  const idSeed = [
    raw.page,
    normalizeHeadline(headline),
    ...[...independentDomains].sort()
  ].join('|');

  return {
    id: crypto.createHash('sha256').update(idSeed).digest('hex').slice(0, 16),
    role: context.role,
    page: raw.page,
    headline,
    summary,
    tag,
    importance,
    contentType,
    seoTitle,
    seoDescription,
    focusKeyword,
    originalAngle,
    keyFindings,
    originalityBasis,
    methodology,
    originalFindings,
    limitations,
    rightOfReplyStatus,
    evidenceId,
    editorialReview,
    publishedAt: publishedAt.toISOString(),
    discoveredAt: now.toISOString(),
    sources: uniqueSources
  };
}

function pagePath(page) {
  if (!Object.hasOwn(PAGE_LABELS, page)) throw new Error('Bilinmeyen sayfa: ' + page);
  return path.join(REPO_ROOT, page);
}

function existingHeadlines(page) {
  const html = fs.readFileSync(pagePath(page), 'utf8');
  const patterns = [
    /<h3 class="dispatch-headline">([\s\S]*?)<\/h3>/g,
    /<span class="translist-player">([\s\S]*?)<\/span>/g,
    /<article class="dosya-block">[\s\S]*?<h2>([\s\S]*?)<\/h2>/g
  ];
  const headlines = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const headline = stripHtml(match[1]);
      if (headline) headlines.push(headline);
    }
  }
  return [...new Set(headlines)];
}

function formatIstanbulDate(value) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function formatIstanbulDateTime(value) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(value));
}

function tagClass(tag) {
  if (tag === 'Son Dakika') return 'tag-urgent';
  if (tag === 'Kesinleşti') return 'tag-confirmed';
  if (tag === 'Gelişme' || tag === 'Maç Sonucu') return 'tag-progress';
  if (tag === 'İddia') return 'tag-claim';
  return 'tag-desk';
}

function renderArticle(story) {
  const visualClass = story.importance >= 90 ? 'dispatch-visual urgent' : 'dispatch-visual';
  assertEditorialLanguage(story.headline, story.summary);
  const sources = story.sources
    .map((source, index) => {
      const label = 'Kaynak ' + (index + 1) + ': ' + source.publisher + ' →';
      return '          <a class="dispatch-source" href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">' + htmlEscape(label) + '</a>';
    })
    .join('\n');

  return [
    '    <article class="dispatch" data-auto-id="' + htmlEscape(story.id) + '" data-time="' + htmlEscape(story.publishedAt) + '">',
    '      <div class="' + visualClass + '" aria-hidden="true"></div>',
    '      <div class="dispatch-body">',
    '        <div class="dispatch-meta">',
    '          <span class="tag ' + tagClass(story.tag) + '">' + htmlEscape(story.tag) + '</span>',
    '          <span class="dateline">' + htmlEscape(formatIstanbulDate(story.publishedAt)) + '</span>',
    '        </div>',
    '        <h3 class="dispatch-headline"><a class="dispatch-story-link" href="' + htmlEscape(storyUrl(story)) + '" style="color:inherit;text-decoration:none">' + htmlEscape(story.headline) + '</a></h3>',
    '        <p class="dispatch-dek">' + htmlEscape(story.summary) + '</p>',
    sources,
    '      </div>',
    '    </article>'
  ].join('\n');
}
function renderHomepageArchiveArticle(story, archivedAt) {
  assertEditorialLanguage(story.headline, story.summary);
  const pageLabel = PAGE_LABELS[story.page] || story.page;
  const sources = story.sources.map((source) => [
    '        <li><a href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">' +
      htmlEscape(source.publisher) + ' &rarr;</a> <span class="note">' +
      htmlEscape(source.title) + '</span></li>'
  ].join('')).join('\n');
  return [
    '    <article class="dosya-block homepage-archive-item" id="manset-' + htmlEscape(story.id) + '" data-homepage-story-id="' + htmlEscape(story.id) + '">',
    '      <span class="section-label">Ana Sayfa Manşet Arşivi</span>',
    '      <h2>' + htmlEscape(story.headline) + '</h2>',
    '      <p class="standfirst">' + htmlEscape(story.summary) + '</p>',
    '      <div class="dosya-facts"><span>Yayın: <b>' + htmlEscape(formatIstanbulDateTime(archivedAt)) + '</b></span><span>Kategori: <b>' + htmlEscape(pageLabel) + '</b></span><span>Kaynak güveni: <b>' + story.sources.length + ' bağımsız kaynak</b></span><span><a href="/' + htmlEscape(story.page) + '">Haber masasına git &rarr;</a></span></div>',
    '      <ul class="dosya-sources">',
    sources,
    '      </ul>',
    '    </article>'
  ].join('\n');
}

function refreshHomepageArchiveIndex(html) {
  let updated = html.replace(
    /<article class="dosya-block homepage-archive-item"(?![^>]*\sid=)([^>]*data-homepage-story-id="([^"]+)"[^>]*)>/g,
    '<article class="dosya-block homepage-archive-item" id="manset-$2"$1>'
  );
  const entries = Array.from(updated.matchAll(
    /<article class="dosya-block homepage-archive-item"[^>]*?\sid="([^"]+)"[^>]*>[\s\S]*?<h2>([\s\S]*?)<\/h2>/g
  )).map((match) => ({ anchor: match[1], headline: match[2].trim() }));
  if (!entries.length) return updated;

  const index = [
    HOMEPAGE_ARCHIVE_INDEX_START,
    '    <nav class="homepage-archive-index" aria-label="Arşivlenen ana sayfa manşetleri">',
    '      <p class="homepage-archive-index-title">Arşivlenen manşetler</p>',
    '      <ol>',
    entries.map((entry, indexNumber) => [
      '        <li><a href="#' + htmlEscape(entry.anchor) + '">',
      '          <span>' + (indexNumber + 1) + '. haber</span>',
      '          <strong>' + entry.headline + '</strong>',
      '        </a></li>'
    ].join('\n')).join('\n'),
    '      </ol>',
    '    </nav>',
    HOMEPAGE_ARCHIVE_INDEX_END
  ].join('\n');

  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const indexPattern = new RegExp(
    escapeRegex(HOMEPAGE_ARCHIVE_INDEX_START) + '[\\s\\S]*?' + escapeRegex(HOMEPAGE_ARCHIVE_INDEX_END)
  );
  if (indexPattern.test(updated)) {
    updated = updated.replace(indexPattern, index);
  } else {
    updated = updated.replace(
      /(<section class="single-desk homepage-archive"[\s\S]*?<div class="desk-heading">[\s\S]*?<\/div>)/,
      '$1\n' + index
    );
  }

  return updated.replace(
    /(<section class="single-desk homepage-archive"[\s\S]*?<span class="desk-count mono">)[^<]*(<\/span>)/,
    '$1' + entries.length + ' haber$2'
  );
}

function buildHomepageArchiveHtml(html, story, archivedAt) {
  assertEditorialLanguage(story.headline, story.summary);
  const storyToken = 'data-homepage-story-id="' + story.id + '"';
  if (html.includes(storyToken)) return refreshHomepageArchiveIndex(html);
  const article = renderHomepageArchiveArticle(story, archivedAt);
  let updated = html;
  const hasStart = html.includes(HOMEPAGE_ARCHIVE_START);
  const hasEnd = html.includes(HOMEPAGE_ARCHIVE_END);
  if (hasStart !== hasEnd) throw new Error('Özel Haber manşet arşivi işaretleri eksik');
  if (hasStart) {
    updated = html.replace(HOMEPAGE_ARCHIVE_START, HOMEPAGE_ARCHIVE_START + '\n' + article);
  } else {
    const heroPattern = /  <section class="page-hero">[\s\S]*?  <\/section>/;
    if (!heroPattern.test(html)) throw new Error('ozel-haber.html içinde page-hero bölümü bulunamadı');
    const archive = [
      '',
      '  <section class="single-desk homepage-archive" aria-label="Ana sayfa manşet arşivi">',
      '    <div class="desk-heading"><h2>Ana Sayfa Manşet Arşivi</h2><span class="desk-count mono">Kalıcı kayıt</span></div>',
      HOMEPAGE_ARCHIVE_START,
      article,
      HOMEPAGE_ARCHIVE_END,
      '  </section>'
    ].join('\n');
    updated = html.replace(heroPattern, (hero) => hero + archive);
  }
  updated = updated.replace(
    /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
    'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(archivedAt)) + '</span>'
  );
  return refreshHomepageArchiveIndex(updated);
}
function updatePageScanDate(html, now) {
  return html.replace(
    /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
    'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(now)) + '</span>'
  );
}

function refreshPageLiveStatus(html, page, now) {
  const label = PAGE_LABELS[page] || page;
  const block = [
    PAGE_LIVE_START,
    '  <div class="editor-live-status mono" role="status" aria-label="' + htmlEscape(label) + ' haber masası canlı durumu" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin:0 0 20px;padding:10px 12px;border:1px solid var(--line);border-left:4px solid #22a46b;background:var(--surface-raised);font-size:.72rem;line-height:1.45;">',
    '    <span style="font-weight:800;letter-spacing:.08em;color:#08784a;">● CANLI</span>',
    '    <span><b>' + htmlEscape(label) + ' haber masası</b> · Son kontrol: <time datetime="' + htmlEscape(now.toISOString()) + '">' + htmlEscape(formatIstanbulDateTime(now)) + '</time></span>',
    '  </div>',
    PAGE_LIVE_END
  ].join('\n');
  const hasStart = html.includes(PAGE_LIVE_START);
  const hasEnd = html.includes(PAGE_LIVE_END);
  if (hasStart !== hasEnd) throw new Error(page + ' canlı durum işaretleri eksik');

  let updated = html;
  if (hasStart) {
    const pattern = new RegExp(escapeRegExp(PAGE_LIVE_START) + '[\\s\\S]*?' + escapeRegExp(PAGE_LIVE_END));
    updated = html.replace(pattern, block);
  } else {
    const heroPattern = /(<section class="page-hero">[\s\S]*?<\/section>)/;
    if (heroPattern.test(html)) updated = html.replace(heroPattern, '$1\n' + block);
  }
  return updatePageScanDate(updated, now);
}

function collapseDuplicateAutoSections(html) {
  const pattern = new RegExp(
    '<section class="single-desk"[^>]*>[\\s\\S]*?' +
    escapeRegExp(START_MARKER) + '[\\s\\S]*?' + escapeRegExp(END_MARKER) +
    '[\\s\\S]*?<\\/section>',
    'g'
  );
  let seen = false;
  return html.replace(pattern, (section) => {
    if (seen) return '';
    seen = true;
    return section;
  }).replace(/^[ \t]+$/gm, '');
}

function buildCategoryHtml(html, page, stories, now) {
  const pageStories = stories
    .filter((story) => story.page === page && storyMatchesPage(page, story.headline, story.summary))
    .filter((story) => page !== 'ozel-haber.html' || ['dossier', 'exclusive'].includes(story.contentType))
    .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt))
    .slice(0, MAX_STORIES_PER_PAGE);
  const liveHtml = collapseDuplicateAutoSections(refreshPageLiveStatus(html, page, now));

  if (!pageStories.length && !liveHtml.includes(START_MARKER)) return liveHtml;

  if (!/<section class="single-desk"(?:\s|>)/.test(liveHtml)) {
    const articles = pageStories.map(renderArticle).join('\n\n');
    const label = PAGE_LABELS[page] || page;
    const wrapper = [
      '  <section class="single-desk" aria-label="' + htmlEscape(label) + ' doğrulanmış güncellemeleri">',
      '    <div class="desk-heading"><h2>Doğrulanmış Güncellemeler</h2><span class="desk-count mono">' + pageStories.length + ' haber</span></div>',
      START_MARKER,
      articles,
      END_MARKER,
      '  </section>'
    ].join('\n');
    const pageHeroPattern = /(<section class="page-hero">[\s\S]*?<\/section>\r?\n?)/;
    if (!pageHeroPattern.test(liveHtml)) throw new Error(page + ' içinde page-hero bulunamadı');

    let updated = liveHtml.replace(pageHeroPattern, '$1\n' + wrapper + '\n');
    updated = updated.replace(
      /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
      'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(now)) + '</span>'
    );
    return updated;
  }

  const articles = pageStories.map(renderArticle).join('\n\n');
  const block = [START_MARKER, articles, END_MARKER].filter(Boolean).join('\n');

  let updated = liveHtml;
  if (updated.includes(START_MARKER) && updated.includes(END_MARKER)) {
    const markerPattern = new RegExp(escapeRegExp(START_MARKER) + '[\\s\\S]*?' + escapeRegExp(END_MARKER));
    updated = updated.replace(markerPattern, block);
  } else {
    const headingPattern = /(<div class="desk-heading">[\s\S]*?<\/div>\r?\n?)/;
    if (!headingPattern.test(updated)) throw new Error(page + ' içinde desk-heading bulunamadı');
    updated = updated.replace(headingPattern, '$1' + block + '\n');
  }

  const sectionPattern = /(<section class="single-desk"[^>]*>)([\s\S]*?)(\s*<\/section>)/;
  const sectionMatch = updated.match(sectionPattern);
  if (!sectionMatch) throw new Error(page + ' içinde single-desk bulunamadı');

  const count = (sectionMatch[2].match(/<article class="dispatch"/g) || []).length;
  const sectionBody = sectionMatch[2].replace(
    /<span class="desk-count mono">[^<]*<\/span>/,
    '<span class="desk-count mono">' + count + ' haber</span>'
  );
  updated = updated.replace(sectionPattern, sectionMatch[1] + sectionBody + sectionMatch[3]);

  const scanDate = formatIstanbulDate(now);
  updated = updated.replace(
    /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
    'Son tarama: <span id="foot-updated">' + htmlEscape(scanDate) + '</span>'
  );

  return updated;
}

function publisherInitials(publisher) {
  const words = String(publisher || '')
    .split(/[\s/.-]+/u)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]).join('');
  return (initials || 'GH').toLocaleUpperCase('tr-TR');
}

function renderHomepageBreakdown(story) {
  const firstSource = story.sources[0];
  const secondSource = story.sources[1] || firstSource;
  const thirdSource = story.sources[2] || secondSource;
  const sourceNames = story.sources.map((source) => source.publisher).join(', ');

  return [
    '  <section class="breakdown" id="kirilma-ani" data-auto-story-id="' + htmlEscape(story.id) + '">',
    '    <div class="section-label">Manşet Dosyasının Kırılma Noktaları</div>',
    '    <div class="breakdown-grid">',
    '      <div class="breakdown-item">',
    '        <h3>Ne oldu?</h3>',
    '        <p>' + htmlEscape(story.summary) + '</p>',
    '        <a href="' + htmlEscape(firstSource.url) + '" target="_blank" rel="noopener">Kaynak: ' + htmlEscape(firstSource.publisher) + ' →</a>',
    '      </div>',
    '      <div class="breakdown-item">',
    '        <h3>Nasıl doğrulandı?</h3>',
    '        <p>Dosya, ' + story.sources.length + ' bağımsız alan adındaki yayın karşılaştırılarak hazırlandı. Çapraz doğrulamada kullanılan kaynaklar: ' + htmlEscape(sourceNames) + '.</p>',
    '        <a href="' + htmlEscape(secondSource.url) + '" target="_blank" rel="noopener">İkinci kaynağı aç →</a>',
    '      </div>',
    '      <div class="breakdown-item">',
    '        <h3>Neden manşette?</h3>',
    '        <p>Baş Editör bu gelişmeye 100 üzerinden ' + story.importance + ' önem puanı verdi. Yayın durumu “' + htmlEscape(story.tag) + '”; doğrulanmayan ayrıntılar dosyaya eklenmedi.</p>',
    '        <a href="' + htmlEscape(thirdSource.url) + '" target="_blank" rel="noopener">Doğrulama kaynağı →</a>',
    '      </div>',
    '    </div>',
    '  </section>'
  ].join('\n');
}

function renderHomepageSources(story) {
  const cards = story.sources.slice(0, 3).map((source) => [
    '      <article class="voice-card source-card">',
    '        <div class="voice-who">',
    '          <span class="voice-avatar" aria-hidden="true">' + htmlEscape(publisherInitials(source.publisher)) + '</span>',
    '          <div class="voice-id">',
    '            <span class="voice-name">' + htmlEscape(source.publisher) + '</span>',
    '            <span class="voice-role">Bağımsız doğrulama kaynağı</span>',
    '          </div>',
    '        </div>',
    '        <p class="voice-quote">' + htmlEscape(source.title) + '</p>',
    '        <p class="voice-context">Kaynak yayını · ' + htmlEscape(formatIstanbulDate(source.publishedAt)) + '</p>',
    '        <a class="voice-source" href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">Orijinal haberi aç →</a>',
    '      </article>'
  ].join('\n')).join('\n');
  const sourceNames = story.sources.map((source) => source.publisher).join(' · ');

  return [
    '  <section class="voices-wrap" data-auto-story-id="' + htmlEscape(story.id) + '">',
    '    <div class="section-label">Kaynaklar Ne Diyor?</div>',
    '    <div class="voices">',
    cards,
    '    </div>',
    '    <p class="foot-mono voices-note">Bu kartlar kişi alıntısı değildir; doğrulamada kullanılan yayınların özgün haber başlıklarıdır. Kaynaklar: ' + htmlEscape(sourceNames) + '.</p>',
    '',
    '    <div class="verdict">',
    '      <div class="section-label"><b>GOLHAT’IN SÖZÜ</b> · EDİTORYAL KARAR</div>',
    '      <p class="verdict-disclaimer mono">Bu değerlendirme yalnızca yukarıdaki doğrulanmış haber kaydı ve kaynak kümesine dayanır.</p>',
    '      <p class="verdict-text">Bu gelişme ' + story.importance + '/100 önem puanıyla ana sayfa dosyası seçildi ve “' + htmlEscape(story.tag) + '” statüsüyle yayımlandı. Karar ' + story.sources.length + ' bağımsız kaynağın kesişen bilgisine dayanıyor; kaynakların ortak doğrulamadığı ayrıntılar manşete dahil edilmedi. Yeni doğrulama geldiğinde manşet, analiz ve kaynak bölümleri birlikte yenilenir.</p>',
    '    </div>',
    '  </section>'
  ].join('\n');
}

function assertHomepageIntegrity(html, story) {
  const expected = String(story.id);
  const requiredStructure = [
    { name: 'site başlığı', pattern: /<header class="masthead"/g },
    { name: 'son dakika şeridi', pattern: /<div class="ticker" id="ticker"/g },
    { name: 'ana içerik', pattern: /<main class="wrap"/g },
    { name: 'manşet dosyası', pattern: /<section class="frontpage"/g },
    { name: 'manşet analizi', pattern: /<section class="breakdown"/g },
    { name: 'kaynak ve karar', pattern: /<section class="voices-wrap"/g },
    { name: 'transfer hattı', pattern: /<section class="transferline"/g },
    { name: 'haber masaları', pattern: /<section class="desks"/g },
    { name: 'yayın yaklaşımı', pattern: /<section class="brand-manifesto"/g },
    { name: 'sayfa altı', pattern: /<footer(?:\s|>)/g }
  ];

  for (const region of requiredStructure) {
    const count = (html.match(region.pattern) || []).length;
    if (count !== 1) {
      throw new Error(
        'Ana sayfa yapı hatası: ' + region.name + ' bölümü ' + count + ' kez bulundu'
      );
    }
  }

  const regions = [
    {
      name: 'manşet',
      pattern: /<section class="frontpage" id="dosya"[^>]*data-auto-story-id="([^"]+)"/
    },
    {
      name: 'analiz',
      pattern: /<section class="breakdown" id="kirilma-ani"[^>]*data-auto-story-id="([^"]+)"/
    },
    {
      name: 'kaynak ve karar',
      pattern: /<section class="voices-wrap"[^>]*data-auto-story-id="([^"]+)"/
    }
  ];

  for (const region of regions) {
    const match = html.match(region.pattern);
    if (!match) throw new Error('Ana sayfa bütünlük hatası: ' + region.name + ' haber kimliği eksik');
    if (match[1] !== expected) {
      throw new Error('Ana sayfa bütünlük hatası: ' + region.name + ' farklı habere bağlı');
    }
  }

  const tickerPattern = new RegExp(
    "\\{ cat:'SON DAKİKA', urgent:true, storyId:'" +
    escapeRegExp(expected) +
    "', text:'(?:\\\\.|[^'])*' \\}"
  );
  if (!tickerPattern.test(html)) {
    throw new Error('Ana sayfa bütünlük hatası: son dakika şeridi farklı habere bağlı');
  }
  return true;
}

function selectHomepageStories(primary, stories, now, limit = HOMEPAGE_SLOT_COUNT) {
  const recentThreshold = new Date(now).getTime() - 7 * 24 * 3_600_000;
  const pool = [primary, ...(stories || [])].filter((story, index, items) => story && items.findIndex((item) => item && item.id === story.id) === index && storyMatchesPage(story.page, story.headline, story.summary) && new Date(story.publishedAt).getTime() >= recentThreshold);
  const score = (story) => story.importance + (story.contentType === 'exclusive' ? 16 : story.contentType === 'dossier' ? 12 : story.contentType === 'analysis' ? 5 : 0) + (story.page === 'ozel-haber.html' ? 7 : 0);
  pool.sort((left, right) => score(right) - score(left) || new Date(right.publishedAt) - new Date(left.publishedAt));
  const selected = [primary];
  const research = pool.find((item) => item.id !== primary.id && ['dossier', 'exclusive'].includes(item.contentType));
  if (research) selected.push(research);
  for (const item of pool) { if (selected.length >= limit) break; if (!selected.some((chosen) => chosen.id === item.id) && !selected.some((chosen) => chosen.page === item.page)) selected.push(item); }
  for (const item of pool) { if (selected.length >= limit) break; if (!selected.some((chosen) => chosen.id === item.id)) selected.push(item); }
  return selected.slice(0, limit);
}

function renderHomepageSlide(story, index, now) {
  const pageLabel = PAGE_LABELS[story.page] || story.page;
  const sourceNames = story.sources.map((source) => source.publisher).join(' · ');
  const contentLabel = story.contentType === 'exclusive' ? 'Özel Haber' : story.contentType === 'dossier' ? 'Araştırma Dosyası' : story.contentType === 'analysis' ? 'Analiz' : 'Günün Dosyası';
  const sourceLinks = story.sources.slice(0, 3).map((source) => [
    '          <a class="cover-secondary-item" href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">',
    '            <span class="tag tag-desk">' + htmlEscape(source.publisher) + '</span><h3>' + htmlEscape(source.title) + '</h3>',
    '            <span class="dateline">Orijinal kaynağı aç →</span>',
    '          </a>'
  ].join('\n')).join('\n');
  return [
    '    <article class="headline-slide' + (index === 0 ? ' is-active' : '') + '" id="headline-slide-' + (index + 1) + '" data-headline-index="' + index + '" data-story-id="' + htmlEscape(story.id) + '"' + (index === 0 ? '' : ' hidden') + '>',
    '      <span class="frontpage-kicker">' + htmlEscape(contentLabel) + ' · ' + htmlEscape(pageLabel) + '</span>',
    '      <h2 class="frontpage-headline">' + htmlEscape(story.headline.toLocaleUpperCase('tr-TR')) + '</h2>',
    '      <p class="frontpage-standfirst">' + htmlEscape(story.summary) + '</p>',
    '      <p class="byline frontpage-byline mono">GOLHAT · ' + htmlEscape(formatIstanbulDateTime(now)) + ' · ' + story.sources.length + ' bağımsız kaynakla doğrulandı</p>',
    '      <a class="headline-read-more mono" href="' + htmlEscape(storyUrl(story)) + '">GOLHAT dosyasını oku →</a>',
    '      <div class="cover-grid"><div class="cover-visual">',
    '        <div class="cover-clash" role="img" aria-label="' + htmlEscape(story.tag + ': ' + story.headline) + '">',
    '          <div class="clash-side claim"><div class="clash-label">Yayın Durumu</div><div class="clash-value">' + htmlEscape(story.tag) + '</div></div>',
    '          <div class="clash-vs">kaynak</div>',
    '          <div class="clash-side reply"><div class="clash-label">Doğrulama</div><div class="clash-value">' + story.sources.length + ' bağımsız yayın</div></div>',
    '        </div>',
    '        <p class="cover-visual-note mono">Kaynaklar: ' + htmlEscape(sourceNames) + '.</p>',
    '        <p class="cover-visual-note mono">Bu bir fotoğraf değildir. GOLHAT, lisanssız veya yapay zekâ ile üretilmiş haber fotoğrafı kullanmaz; tipografik yayın panelini kullanır.</p>',
    '      </div><div class="cover-secondary">',
    '        <dl class="fact-panel"><div class="fact-panel-title">Dosya Özeti</div>',
    '          <div class="fact-row"><dt>Kategori</dt><dd>' + htmlEscape(pageLabel) + '</dd></div>',
    '          <div class="fact-row"><dt>İçerik</dt><dd>' + htmlEscape(contentLabel) + '</dd></div>',
    '          <div class="fact-row"><dt>Durum</dt><dd>' + htmlEscape(story.tag) + '</dd></div>',
    '          <div class="fact-row"><dt>Önem puanı</dt><dd>' + story.importance + ' / 100</dd></div>',
    '          <div class="fact-row"><dt>Kaynak güveni</dt><dd>' + story.sources.length + ' farklı alan adı</dd></div>',
    '        </dl><div class="section-label" style="margin-top:16px;">Orijinal Kaynaklar</div>',
    sourceLinks,
    '      </div></div>',
    '    </article>'
  ].join('\n');
}

function upsertHeadlineStructuredData(html, stories) {
  if (!html.includes('</head>')) return html;
  const data = { '@context': 'https://schema.org', '@type': 'ItemList', name: 'GOLHAT Ana Sayfa Manşetleri', itemListElement: stories.map((item, index) => ({ '@type': 'ListItem', position: index + 1, url: 'https://golhat.com' + storyUrl(item), name: item.seoTitle || item.headline })) };
  const block = '<script id="headline-structured-data" type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\u003c') + '</script>';
  const pattern = /<script id="headline-structured-data"[\s\S]*?<\/script>/;
  return pattern.test(html) ? html.replace(pattern, block) : html.replace('</head>', block + '\n</head>');
}

function buildHomepageHtml(html, story, now, allStories = []) {
  assertEditorialLanguage(story.headline, story.summary);
  const headlineStories = selectHomepageStories(story, allStories, now);
  const slides = headlineStories.map((item, index) => renderHomepageSlide(item, index, now)).join('\n');
  const controls = headlineStories.map((item, index) => '      <button type="button" class="headline-control' + (index === 0 ? ' is-active' : '') + '" data-headline-target="' + index + '" aria-controls="headline-slide-' + (index + 1) + '" aria-pressed="' + (index === 0 ? 'true' : 'false') + '"><span>' + (index + 1) + '</span><b>' + htmlEscape(item.headline) + '</b></button>').join('\n');
  const hero = ['  <section class="frontpage" id="dosya" data-auto-story-id="' + htmlEscape(story.id) + '" data-headline-count="' + headlineStories.length + '" aria-label="GOLHAT ana manşetleri">', '    <div class="headline-track">', slides, '    </div>', '    <nav class="headline-controls" aria-label="Manşet seçimi">', controls, '      <button type="button" class="headline-pause" aria-pressed="false">Durdur</button>', '    </nav>', '  </section>'].join('\n');
  const heroPattern = /^[ \t]*<section class="frontpage" id="dosya"(?:\s+[^>]*)?>[\s\S]*?<\/section>/m;
  const breakdownPattern = /^[ \t]*<section class="breakdown" id="kirilma-ani"(?:\s+[^>]*)?>[\s\S]*?<\/section>/m;
  const sourcesPattern = /^[ \t]*<section class="voices-wrap"(?:\s+[^>]*)?>[\s\S]*?<\/section>/m;
  if (!heroPattern.test(html) || !breakdownPattern.test(html) || !sourcesPattern.test(html)) throw new Error('Ana sayfa manşet yapısı bulunamadı');
  let updated = html.replace(heroPattern, hero).replace(breakdownPattern, renderHomepageBreakdown(story)).replace(sourcesPattern, renderHomepageSources(story));
  const tickerPattern = /\{ cat:'SON DAKİKA', urgent:true,(?: storyId:'[^']*',)? text:'(?:\\.|[^'])*' \}/;
  const tickerText = story.headline.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replace(/\s+/g, ' ').trim();
  if (tickerPattern.test(updated)) updated = updated.replace(tickerPattern, "{ cat:'SON DAKİKA', urgent:true, storyId:'" + story.id + "', text:'" + tickerText + "' }");
  updated = updated.replace(/Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/, 'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(now)) + '</span>');
  updated = upsertHeadlineStructuredData(updated, headlineStories);
  assertHomepageIntegrity(updated, story);
  return updated;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
}

function storyJsonLd(story, absoluteUrl, now) {
  return JSON.stringify({ '@context': 'https://schema.org', '@type': ['analysis', 'dossier'].includes(story.contentType) ? 'AnalysisNewsArticle' : 'NewsArticle', headline: story.seoTitle || story.headline, description: story.seoDescription || story.summary, datePublished: story.publishedAt, dateModified: story.discoveredAt || now.toISOString(), mainEntityOfPage: absoluteUrl, inLanguage: 'tr-TR', author: { '@type': 'Organization', name: 'GOLHAT Haber Merkezi' }, publisher: { '@type': 'NewsMediaOrganization', name: 'GOLHAT', url: 'https://golhat.com/' }, isAccessibleForFree: true, keywords: [story.focusKeyword, PAGE_LABELS[story.page], story.tag].filter(Boolean).join(', ') }).replace(/</g, '\u003c');
}

function buildStoryPageHtml(story, now = new Date()) {
  assertEditorialLanguage(story.headline, story.summary, story.originalAngle || '');
  const relativeUrl = storyUrl(story);
  const absoluteUrl = 'https://golhat.com' + relativeUrl;
  const pageLabel = PAGE_LABELS[story.page] || story.page;
  const title = story.seoTitle || story.headline;
  const description = (story.seoDescription || story.summary).slice(0, 180);
  const findings = (story.keyFindings?.length ? story.keyFindings : [story.summary]).map((item) => '<li>' + htmlEscape(item) + '</li>').join('');
  const originalFindings = (story.originalFindings || []).map((item) => '<li>' + htmlEscape(item) + '</li>').join('');
  const originalContribution = originalFindings ? '<h2>GOLHAT’ın yeni bulguları</h2><ul class="findings original-findings">' + originalFindings + '</ul>' : '';
  const editorialReviewLabels = { tahkik: 'Tahkik', adalet: 'Adalet', musbet_hareket: 'Müsbet hareket', uhuvvet_sefkat: 'Uhuvvet ve şefkat', public_interest: 'Kamu yararı' };
  const editorialReviewItems = Object.entries(editorialReviewLabels).filter(([key]) => story.editorialReview?.[key]?.note).map(([key, label]) => '<li><b>' + htmlEscape(label) + ':</b> ' + htmlEscape(story.editorialReview[key].note) + '</li>').join('');
  const editorialReviewSection = editorialReviewItems ? '<h2>GOLHAT yayın süzgeci</h2><p class="meta">Tahkik · Adalet · Müsbet hareket · Uhuvvet ve şefkat · Kamu yararı</p><ul class="findings editorial-review">' + editorialReviewItems + '</ul>' : '';
  const sourceRoleLabels = { primary_evidence: 'Birincil kanıt', independent_verification: 'Bağımsız doğrulama', context: 'Bağlam' };
  const sources = story.sources.map((source, index) => '<li><span>' + (index + 1) + '</span><div><a href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">' + htmlEscape(source.publisher) + ' →</a><p>' + htmlEscape(source.title) + '</p><small>' + htmlEscape(sourceRoleLabels[source.sourceRole] || 'Kaynak') + '</small></div></li>').join('');
  const methodology = story.methodology || 'Olgular en az iki bağımsız kaynaktan çapraz doğrulandı; ortak doğrulanmayan ayrıntılar sonuç olarak sunulmadı.';
  const limitations = story.limitations || 'Açık kaynakların kapsamadığı ayrıntılar bu çalışmanın dışında bırakıldı.';
  const replyLabels = { not_applicable: 'Bu çalışma için ayrıca cevap hakkı gerektiren bir isnat bulunmuyor.', response_in_sources: 'İlgili tarafın yayımlanmış yanıtı kaynak zincirine dahil edildi.', required_before_publish: 'Cevap hakkı tamamlanmadan yayımlanamaz.' };
  const replyText = replyLabels[story.rightOfReplyStatus] || replyLabels.not_applicable;
  const typeLabel = story.contentType === 'exclusive' ? 'Özel Haber' : story.contentType === 'dossier' ? 'Araştırma Dosyası' : story.contentType === 'analysis' ? 'Analiz' : 'Doğrulanmış Haber';
  const css = `:root{--paper:#f1efe6;--ink:#101313;--night:#07100d;--red:#e21b2d;--line:rgba(16,19,19,.18)}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,serif;line-height:1.65}a{color:inherit}.wrap{width:min(980px,calc(100% - 32px));margin:auto}.top{background:var(--night);color:#fff;border-bottom:7px solid var(--red);padding:22px 0}.top .wrap{display:flex;justify-content:space-between;gap:18px;align-items:center}.brand{font:900 2rem/1 Impact,sans-serif;text-decoration:none}.brand span{color:var(--red)}nav{font:600 .72rem monospace;display:flex;gap:14px;flex-wrap:wrap}.article-head{padding:56px 0 30px;border-bottom:1px solid var(--line)}.kicker,.meta{font:600 .72rem monospace;letter-spacing:.08em;text-transform:uppercase}.kicker{color:var(--red)}h1{font:900 clamp(2.7rem,8vw,5.7rem)/.96 Impact,sans-serif;max-width:17ch;margin:15px 0}.standfirst{font-size:1.25rem;max-width:72ch}.meta{color:#626761}.grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:42px;padding:36px 0 70px}h2{font:800 2rem/1.1 Impact,sans-serif;margin-top:36px}.angle{border-left:5px solid var(--red);padding:18px 22px;background:#fff}.findings{padding-left:22px}.findings li{margin:12px 0}.method{padding:18px;border:1px solid var(--line);font:.78rem/1.6 monospace}.sources{list-style:none;padding:0}.sources li{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:14px 0;border-bottom:1px solid var(--line)}.sources span{font:700 .7rem monospace;color:var(--red)}.sources a{font-weight:700}.sources p{margin:4px 0;font-size:.9rem}.back{display:inline-block;margin-top:24px;font:600 .75rem monospace}@media(max-width:760px){.top .wrap{align-items:flex-start;flex-direction:column}.grid{grid-template-columns:1fr}.article-head{padding-top:34px}h1{font-size:clamp(2.5rem,13vw,4rem)}}`;
  return ['<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">', '<title>' + htmlEscape(title) + ' | GOLHAT</title>', '<meta name="description" content="' + htmlEscape(description) + '"><meta name="robots" content="index,follow,max-snippet:-1">', '<link rel="canonical" href="' + absoluteUrl + '"><meta property="og:type" content="article"><meta property="og:site_name" content="GOLHAT"><meta property="og:title" content="' + htmlEscape(title) + '"><meta property="og:description" content="' + htmlEscape(description) + '"><meta property="og:url" content="' + absoluteUrl + '"><meta property="og:image" content="https://golhat.com/og.png">', '<script type="application/ld+json">' + storyJsonLd(story, absoluteUrl, now) + '</script><style>' + css + '</style></head><body>', '<header class="top"><div class="wrap"><a class="brand" href="/">GOL<span>/</span>HAT</a><nav><a href="/">Ana Sayfa</a><a href="/ozel-haber.html">Araştırma Dosyaları</a><a href="/' + htmlEscape(story.page) + '">' + htmlEscape(pageLabel) + '</a></nav></div></header>', '<main class="wrap"><article><div class="article-head"><div class="kicker">' + htmlEscape(typeLabel) + ' · ' + htmlEscape(pageLabel) + '</div><h1>' + htmlEscape(story.headline) + '</h1><p class="standfirst">' + htmlEscape(story.summary) + '</p><p class="meta">GOLHAT Haber Merkezi · ' + htmlEscape(formatIstanbulDateTime(story.publishedAt)) + ' · ' + story.sources.length + ' bağımsız kaynak</p></div>', '<div class="grid"><div><h2>Dosyanın özgün açısı</h2><p class="angle">' + htmlEscape(story.originalAngle || story.summary) + '</p>' + originalContribution + '<h2>Doğrulanan bulgular</h2><ul class="findings">' + findings + '</ul>' + editorialReviewSection + '<h2>Ne anlama geliyor?</h2><p>' + htmlEscape(story.summary) + ' GOLHAT, kaynakların ortak doğrulamadığı ayrıntıları sonuç gibi sunmaz.</p><a class="back" href="/' + htmlEscape(story.page) + '">← ' + htmlEscape(pageLabel) + ' haber masasına dön</a></div>', '<aside><h2>Kaynak zinciri</h2><ol class="sources">' + sources + '</ol><p class="method"><b>Yöntem:</b> ' + htmlEscape(methodology) + '</p><p class="method"><b>Sınırlılıklar:</b> ' + htmlEscape(limitations) + '</p><p class="method"><b>Cevap hakkı:</b> ' + htmlEscape(replyText) + '</p><p class="method"><b>Etiket standardı:</b> Kaynak derlemesi özgün haber sayılmaz. “Özel Haber” yalnız insan muhabir kanıtı ve editör onayıyla kullanılır.</p></aside></div></article></main></body></html>', ''].join('\n');
}

function writeStoryPage(story, now = new Date()) {
  const file = path.join(REPO_ROOT, storyUrl(story).replace(/^\//, ''));
  const html = buildStoryPageHtml(story, now);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (original === html) return false;
  writeTextAtomic(file, html);
  return true;
}

function buildSitemapXml(stories, now = new Date()) {
  const entries = [''].concat(Object.keys(PAGE_LABELS)).map((page, index) => ({ url: 'https://golhat.com/' + page, lastmod: now.toISOString().slice(0, 10), frequency: index ? 'daily' : 'hourly', priority: index ? '0.8' : '1.0' }));
  const publishable = (stories || []).filter((story) => storyMatchesPage(story.page, story.headline, story.summary)).slice(0, 120);
  for (const story of publishable) entries.push({ url: 'https://golhat.com' + storyUrl(story), lastmod: new Date(story.discoveredAt || story.publishedAt).toISOString().slice(0, 10), frequency: 'weekly', priority: ['dossier', 'exclusive'].includes(story.contentType) ? '0.9' : '0.7' });
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...entries.map((entry) => '  <url><loc>' + htmlEscape(entry.url) + '</loc><lastmod>' + entry.lastmod + '</lastmod><changefreq>' + entry.frequency + '</changefreq><priority>' + entry.priority + '</priority></url>'), '</urlset>', ''].join('\n');
}

function writeStoryPages(stories, now = new Date()) {
  const publishable = (stories || []).filter((story) => storyMatchesPage(story.page, story.headline, story.summary)).slice(0, 120);
  let changed = 0;
  for (const story of publishable) if (writeStoryPage(story, now)) changed += 1;
  return changed;
}

function writeSitemap(stories, now = new Date()) {
  const file = path.join(REPO_ROOT, 'sitemap.xml');
  const updated = buildSitemapXml(stories, now);
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (updated === original) return false;
  writeTextAtomic(file, updated);
  return true;
}

async function requestOpenAI(body, apiKey, options = {}) {
  const attempts = options.attempts || 3;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 180_000);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      const requestId = response.headers.get('x-request-id') || 'yok';
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 700).replace(/\s+/g, ' ');
        const exhausted = response.status === 429 &&
          /(insufficient_quota|credit_balance_exhausted|no credits remaining)/i.test(detail);
        const error = new Error('OpenAI isteği başarısız: HTTP ' + response.status + ', request_id=' + requestId + ', ' + detail);
        error.retryable = !exhausted && (response.status === 429 || response.status >= 500);
        error.fatal = exhausted;
        throw error;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || error.retryable === false) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

function writeCategoryPage(page, stories, now) {
  const file = pagePath(page);
  const original = fs.readFileSync(file, 'utf8');
  const updated = buildCategoryHtml(original, page, stories, now);
  if (updated === original) return false;
  writeTextAtomic(file, updated);
  return true;
}

function writeHomepage(story, now, allStories = []) {
  const file = path.join(REPO_ROOT, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const updated = buildHomepageHtml(original, story, now, allStories);
  if (updated === original) return false;
  writeTextAtomic(file, updated);
  return true;
}
function writeHomepageArchive(story, archivedAt) {
  const file = path.join(REPO_ROOT, 'ozel-haber.html');
  const original = fs.readFileSync(file, 'utf8');
  const updated = buildHomepageArchiveHtml(original, story, archivedAt);
  if (updated === original) return false;
  writeTextAtomic(file, updated);
  return true;
}

module.exports = {
  REPO_ROOT,
  STATE_PATH,
  START_MARKER,
  END_MARKER,
  emptyState,
  loadState,
  saveState,
  htmlEscape,
  stripHtml,
  normalizeHeadline,
  storySlug,
  storyUrl,
  assertHomepageIntegrity,
  canonicalUrl,
  urlSignature,
  sourceDomain,
  collectCitedUrls,
  responseOutputText,
  parseStructuredResponse,
  headlineSimilarity,
  storyIsDuplicate,
  storyMatchesPage,
  assertStoryPageRelevance,
  validateStory,
  assertEditorialLanguage,
  existingHeadlines,
  formatIstanbulDate,
  formatIstanbulDateTime,
  renderArticle,
  buildCategoryHtml,
  buildHomepageArchiveHtml,
  buildHomepageHtml,
  selectHomepageStories,
  buildStoryPageHtml,
  buildSitemapXml,
  requestOpenAI,
  writeCategoryPage,
  writeStoryPage,
  writeStoryPages,
  writeSitemap,
  writeHomepageArchive,
  writeHomepage
};
