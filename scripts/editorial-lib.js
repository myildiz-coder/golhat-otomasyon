'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  ALLOWED_TAGS,
  MAX_STORIES_PER_PAGE,
  MAX_STORY_AGE_HOURS,
  PAGE_LABELS
} = require('./editorial-config');

const REPO_ROOT = path.resolve(__dirname, '..');
const STATE_PATH = path.join(REPO_ROOT, 'data', 'editorial', 'state.json');
const START_MARKER = '  <!-- GOLHAT:AUTO_EDITOR:START -->';
const END_MARKER = '  <!-- GOLHAT:AUTO_EDITOR:END -->';
const HOMEPAGE_ARCHIVE_START = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE:START -->';
const HOMEPAGE_ARCHIVE_END = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE:END -->';
const HOMEPAGE_ARCHIVE_INDEX_START = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE_INDEX:START -->';
const HOMEPAGE_ARCHIVE_INDEX_END = '    <!-- GOLHAT:HOMEPAGE_ARCHIVE_INDEX:END -->';
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src'
]);
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

function validateStory(raw, context) {
  const now = context.now || new Date();
  if (!raw || typeof raw !== 'object') throw new Error('Haber nesnesi geçersiz');
  if (!context.allowedPages.includes(raw.page)) throw new Error('Hedef sayfa izinli değil');

  const headline = String(raw.headline || '').trim();
  const summary = String(raw.summary || '').trim();
  const tag = String(raw.tag || '').trim();
  const importance = Number(raw.importance);

  assertEditorialLanguage(headline, summary);
  if (headline.length < 20 || headline.length > 180) {
    throw new Error('Manşet uzunluğu 20-180 karakter aralığında olmalı');
  }
  if (summary.length < 70 || summary.length > 700) {
    throw new Error('Özet uzunluğu 70-700 karakter aralığında olmalı');
  }
  if (!ALLOWED_TAGS.includes(tag)) throw new Error('Haber etiketi izinli değil');
  if (!Number.isInteger(importance) || importance < 50 || importance > 100) {
    throw new Error('Yayınlanabilir haberin önem puanı 50-100 aralığında tam sayı olmalı');
  }

  const publishedAt = new Date(raw.published_at);
  if (Number.isNaN(publishedAt.getTime())) throw new Error('Haber tarihi geçersiz');
  const ageHours = (now.getTime() - publishedAt.getTime()) / 3_600_000;
  if (ageHours < -2 || ageHours > MAX_STORY_AGE_HOURS) {
    throw new Error('Haber yayın penceresinin dışında');
  }

  if (!Array.isArray(raw.sources) || raw.sources.length < 2 || raw.sources.length > 4) {
    throw new Error('En az iki, en fazla dört kaynak gerekli');
  }

  const sources = raw.sources.map((source) => {
    const url = canonicalUrl(source.url);
    const signature = urlSignature(url);
    if (!context.citedUrls.has(signature)) {
      throw new Error('Kaynak URL web araması sonuçlarında bulunmuyor');
    }

    const title = String(source.title || '').trim();
    const publisher = String(source.publisher || '').trim();
    if (title.length < 3 || publisher.length < 2) {
      throw new Error('Kaynak başlığı veya yayıncı adı eksik');
    }

    return {
      title,
      publisher,
      url,
      publishedAt: String(source.published_at || '').trim()
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
    '        <h3 class="dispatch-headline">' + htmlEscape(story.headline) + '</h3>',
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
function buildCategoryHtml(html, page, stories, now) {
  const pageStories = stories
    .filter((story) => story.page === page)
    .sort((a, b) => new Date(b.discoveredAt) - new Date(a.discoveredAt))
    .slice(0, MAX_STORIES_PER_PAGE);

  if (!pageStories.length && !html.includes(START_MARKER)) return html;

  if (!html.includes('<section class="single-desk">')) {
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
    if (!pageHeroPattern.test(html)) throw new Error(page + ' içinde page-hero bulunamadı');

    let updated = html.replace(pageHeroPattern, '$1\n' + wrapper + '\n');
    updated = updated.replace(
      /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
      'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(now)) + '</span>'
    );
    return updated;
  }

  const articles = pageStories.map(renderArticle).join('\n\n');
  const block = [START_MARKER, articles, END_MARKER].filter(Boolean).join('\n');

  let updated = html;
  if (updated.includes(START_MARKER) && updated.includes(END_MARKER)) {
    const markerPattern = new RegExp(escapeRegExp(START_MARKER) + '[\\s\\S]*?' + escapeRegExp(END_MARKER));
    updated = updated.replace(markerPattern, block);
  } else {
    const headingPattern = /(<div class="desk-heading">[\s\S]*?<\/div>\r?\n?)/;
    if (!headingPattern.test(updated)) throw new Error(page + ' içinde desk-heading bulunamadı');
    updated = updated.replace(headingPattern, '$1' + block + '\n');
  }

  const sectionPattern = /(<section class="single-desk">)([\s\S]*?)(\s*<\/section>)/;
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

function buildHomepageHtml(html, story, now) {
  const pageLabel = PAGE_LABELS[story.page] || story.page;
  assertEditorialLanguage(story.headline, story.summary);
  const sourceLinks = story.sources.slice(0, 3).map((source) => [
    '        <a class="cover-secondary-item" href="' + htmlEscape(source.url) + '" target="_blank" rel="noopener">',
    '          <span class="tag tag-desk">' + htmlEscape(source.publisher) + '</span>',
    '          <h3>' + htmlEscape(source.title) + '</h3>',
    '          <span class="dateline">Orijinal kaynağı aç →</span>',
    '        </a>'
  ].join('\n')).join('\n');

  const sourceNames = story.sources.map((source) => source.publisher).join(' · ');
  const hero = [
    '  <section class="frontpage" id="dosya" data-auto-story-id="' + htmlEscape(story.id) + '">',
    '    <span class="frontpage-kicker">Günün Dosyası · ' + htmlEscape(pageLabel) + '</span>',
    '    <h2 class="frontpage-headline">' + htmlEscape(story.headline.toLocaleUpperCase('tr-TR')) + '</h2>',
    '    <p class="frontpage-standfirst">' + htmlEscape(story.summary) + '</p>',
    '    <p class="byline frontpage-byline mono">GOLHAT · ' + htmlEscape(formatIstanbulDateTime(now)) + ' · ' + story.sources.length + ' bağımsız kaynakla doğrulandı</p>',
    '',
    '    <div class="cover-grid">',
    '      <div class="cover-visual">',
    '        <div class="cover-clash" role="img" aria-label="' + htmlEscape(story.tag + ': ' + story.headline) + '">',
    '          <div class="clash-side claim">',
    '            <div class="clash-label">Yayın Durumu</div>',
    '            <div class="clash-value">' + htmlEscape(story.tag) + '</div>',
    '          </div>',
    '          <div class="clash-vs">kaynak</div>',
    '          <div class="clash-side reply">',
    '            <div class="clash-label">Doğrulama</div>',
    '            <div class="clash-value">' + story.sources.length + ' bağımsız yayın</div>',
    '          </div>',
    '        </div>',
    '        <p class="cover-visual-note mono">Kaynaklar: ' + htmlEscape(sourceNames) + '.</p>',
    '        <p class="cover-visual-note mono">Bu bir fotoğraf değildir. GOLHAT, lisanssız veya yapay zekâ ile üretilmiş haber fotoğrafı kullanmaz; tipografik yayın panelini kullanır.</p>',
    '      </div>',
    '',
    '      <div class="cover-secondary">',
    '        <dl class="fact-panel">',
    '          <div class="fact-panel-title">Dosya Özeti</div>',
    '          <div class="fact-row"><dt>Kategori</dt><dd>' + htmlEscape(pageLabel) + '</dd></div>',
    '          <div class="fact-row"><dt>Durum</dt><dd>' + htmlEscape(story.tag) + '</dd></div>',
    '          <div class="fact-row"><dt>Önem puanı</dt><dd>' + story.importance + ' / 100</dd></div>',
    '          <div class="fact-row"><dt>Kaynak güveni</dt><dd>' + story.sources.length + ' farklı alan adı</dd></div>',
    '          <div class="fact-row"><dt>Son güncelleme</dt><dd>' + htmlEscape(formatIstanbulDateTime(now)) + ' (TR)</dd></div>',
    '        </dl>',
    '        <div class="section-label" style="margin-top:16px;">Orijinal Kaynaklar</div>',
    sourceLinks,
    '      </div>',
    '    </div>',
    '  </section>'
  ].join('\n');
  const breakdown = renderHomepageBreakdown(story);
  const sourcesAndVerdict = renderHomepageSources(story);

  const heroPattern = /  <section class="frontpage" id="dosya"(?:\s+[^>]*)?>[\s\S]*?  <\/section>/;
  if (!heroPattern.test(html)) throw new Error('index.html içinde frontpage bölümü bulunamadı');
  const breakdownPattern = /  <section class="breakdown" id="kirilma-ani"(?:\s+[^>]*)?>[\s\S]*?  <\/section>/;
  if (!breakdownPattern.test(html)) {
    throw new Error('index.html içinde manşet analiz bölümü bulunamadı');
  }
  const sourcesPattern = /  <section class="voices-wrap"(?:\s+[^>]*)?>[\s\S]*?  <\/section>/;
  if (!sourcesPattern.test(html)) {
    throw new Error('index.html içinde manşet kaynak ve karar bölümü bulunamadı');
  }

  let updated = html
    .replace(heroPattern, hero)
    .replace(breakdownPattern, breakdown)
    .replace(sourcesPattern, sourcesAndVerdict);
  const tickerPattern = /\{ cat:'SON DAKİKA', urgent:true,(?: storyId:'[^']*',)? text:'(?:\\.|[^'])*' \}/;
  const tickerText = story.headline
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replace(/\s+/g, ' ')
    .trim();

  if (tickerPattern.test(updated)) {
    updated = updated.replace(
      tickerPattern,
      "{ cat:'SON DAKİKA', urgent:true, storyId:'" + story.id + "', text:'" + tickerText + "' }"
    );
  }

  updated = updated.replace(
    /Son tarama:\s*<span id="foot-updated">[^<]*<\/span>/,
    'Son tarama: <span id="foot-updated">' + htmlEscape(formatIstanbulDate(now)) + '</span>'
  );

  assertHomepageIntegrity(updated, story);
  return updated;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
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

function writeHomepage(story, now) {
  const file = path.join(REPO_ROOT, 'index.html');
  const original = fs.readFileSync(file, 'utf8');
  const updated = buildHomepageHtml(original, story, now);
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
  assertHomepageIntegrity,
  canonicalUrl,
  urlSignature,
  sourceDomain,
  collectCitedUrls,
  responseOutputText,
  parseStructuredResponse,
  headlineSimilarity,
  storyIsDuplicate,
  validateStory,
  assertEditorialLanguage,
  existingHeadlines,
  formatIstanbulDate,
  formatIstanbulDateTime,
  renderArticle,
  buildCategoryHtml,
  buildHomepageArchiveHtml,
  buildHomepageHtml,
  requestOpenAI,
  writeCategoryPage,
  writeHomepageArchive,
  writeHomepage
};
