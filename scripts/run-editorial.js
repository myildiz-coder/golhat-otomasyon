'use strict';

const {
  PAGE_LABELS,
  EDITOR_ROLES,
  ALLOWED_TAGS,
  SOURCE_RULES,
  DEFAULT_MODEL,
  MAX_STORIES_PER_RUN,
  MAX_STORIES_PER_PAGE,
  HOMEPAGE_MIN_IMPORTANCE,
  HOMEPAGE_MAX_DAILY_CHANGES,
  HOMEPAGE_MIN_IMPROVEMENT,
  HOMEPAGE_HOLD_HOURS
} = require('./editorial-config');
const {
  loadState,
  saveState,
  collectCitedUrls,
  parseStructuredResponse,
  storyIsDuplicate,
  validateStory,
  existingHeadlines,
  formatIstanbulDate,
  requestOpenAI,
  writeCategoryPage,
  writeHomepage
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
        required: ['page', 'headline', 'summary', 'tag', 'published_at', 'importance', 'sources'],
        properties: {
          page: { type: 'string', enum: Object.keys(PAGE_LABELS) },
          headline: { type: 'string', minLength: 20, maxLength: 180 },
          summary: { type: 'string', minLength: 70, maxLength: 700 },
          tag: { type: 'string', enum: ALLOWED_TAGS },
          published_at: { type: 'string' },
          importance: { type: 'integer', minimum: 50, maximum: 100 },
          sources: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'publisher', 'url', 'published_at'],
              properties: {
                title: { type: 'string' },
                publisher: { type: 'string' },
                url: { type: 'string' },
                published_at: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }
};

const HEAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['decision', 'story_id', 'rationale'],
  properties: {
    decision: { type: 'string', enum: ['update', 'no_change'] },
    story_id: { type: 'string' },
    rationale: { type: 'string' }
  }
};

function parseArgs(argv) {
  const options = { all: false, role: null, head: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--all') options.all = true;
    else if (value === '--head') options.head = true;
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--role') options.role = argv[++index];
    else throw new Error('Bilinmeyen argüman: ' + value);
  }

  const modeCount = Number(options.all) + Number(Boolean(options.role)) + Number(options.head);
  if (modeCount !== 1) {
    throw new Error('--all, --role <ad> veya --head seçeneklerinden tam biri gerekli');
  }
  if (options.role && !Object.hasOwn(EDITOR_ROLES, options.role)) {
    throw new Error('Bilinmeyen editör rolü: ' + options.role);
  }
  return options;
}

function categoryRequest(role, now, model) {
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
      'importance puanını 50-100 ölçeğinde ver: 50 sınırlı, 70 güçlü, 82 ana sayfa adayı, 95 olağanüstü.',
      'Yeterince önemli ve doğrulanmış yeni gelişme yoksa decision=no_change ve stories=[] döndür.',
      SOURCE_RULES
    ].join('\n'),
    input: [
      'Editör: ' + role.label,
      'Şu an: ' + now.toISOString() + ' (Türkiye/İstanbul)',
      'Konu alanı: ' + role.topics,
      'İzinli hedef sayfalar:',
      pageSummary,
      'Son 36 saatteki önemli gelişmeleri araştır. En fazla üç haber seç.',
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
    max_output_tokens: 3500
  };
}

function headRequest(candidates, currentStory, now, model) {
  const candidateView = candidates.map((story) => ({
    id: story.id,
    headline: story.headline,
    summary: story.summary,
    tag: story.tag,
    importance: story.importance,
    publishedAt: story.publishedAt,
    page: story.page,
    sourceDomains: story.sources.map((source) => new URL(source.url).hostname)
  }));

  return {
    model,
    store: false,
    reasoning: { effort: 'low' },
    instructions: [
      'Sen GOLHAT Baş Editörüsün.',
      'Yalnızca verilen, daha önce doğrulanmış adaylardan ana sayfaya gerçekten manşet değeri taşıyan tek haberi seç.',
      'Yeni olgu, kaynak veya story_id üretme. Adaylar yeterince güçlü değilse no_change seç.',
      'Güncellik, kamu yararı, Türkiye futboluna etkisi ve kaynak gücünü birlikte değerlendir.',
      'Kararı Türkçe ve kısa gerekçelendir.'
    ].join('\n'),
    input: JSON.stringify({
      now: now.toISOString(),
      currentStory: currentStory ? {
        id: currentStory.id,
        headline: currentStory.headline,
        importance: currentStory.importance
      } : null,
      candidates: candidateView
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'golhat_head_editor_decision',
        strict: true,
        schema: HEAD_SCHEMA
      }
    },
    max_output_tokens: 700
  };
}

function mergeStories(state, accepted) {
  const byId = new Map(state.stories.map((story) => [story.id, story]));
  for (const story of accepted) byId.set(story.id, story);
  state.stories = [...byId.values()]
    .sort((left, right) => new Date(right.discoveredAt) - new Date(left.discoveredAt))
    .slice(0, 180);
}

async function runCategory(roleName, state, options, apiKey, model, now) {
  const role = EDITOR_ROLES[roleName];
  console.log('\n[' + role.label + '] araştırma başladı');
  const response = await requestOpenAI(categoryRequest(role, now, model), apiKey);
  const result = parseStructuredResponse(response);
  const citedUrls = collectCitedUrls(response);

  if (result.decision !== 'update' || result.stories.length === 0) {
    console.log('[' + role.label + '] değişiklik yok: ' + result.rationale);
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
    return 0;
  }

  console.log('[' + role.label + '] ' + accepted.length + ' doğrulanmış haber kabul edildi');
  if (options.dryRun) {
    for (const story of accepted) console.log('  - ' + story.page + ': ' + story.headline);
    return accepted.length;
  }

  mergeStories(state, accepted);
  for (const page of role.pages) {
    const pageStories = state.stories
      .filter((story) => story.page === page)
      .slice(0, MAX_STORIES_PER_PAGE);
    if (pageStories.length > 0) writeCategoryPage(page, pageStories, now);
  }
  state.updatedAt = now.toISOString();
  saveState(state);
  return accepted.length;
}

function istanbulDay(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

async function runHeadEditor(state, options, apiKey, model, now) {
  const today = istanbulDay(now);
  const todayChanges = state.homepage.changes.filter((change) => istanbulDay(change.at) === today);
  if (todayChanges.length >= HOMEPAGE_MAX_DAILY_CHANGES) {
    console.log('[Baş Editör] günlük manşet değişikliği sınırına ulaşıldı');
    return 0;
  }

  const recentThreshold = now.getTime() - 36 * 3_600_000;
  const currentStory = state.stories.find((story) => story.id === state.homepage.storyId) || null;
  let candidates = state.stories.filter((story) =>
    story.id !== state.homepage.storyId &&
    story.importance >= HOMEPAGE_MIN_IMPORTANCE &&
    new Date(story.publishedAt).getTime() >= recentThreshold
  );

  const lastChange = state.homepage.changes.at(-1);
  if (currentStory && lastChange) {
    const heldHours = (now.getTime() - new Date(lastChange.at).getTime()) / 3_600_000;
    if (heldHours < HOMEPAGE_HOLD_HOURS) {
      candidates = candidates.filter((story) =>
        story.importance >= currentStory.importance + HOMEPAGE_MIN_IMPROVEMENT
      );
    }
  }

  candidates = candidates
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 12);
  if (candidates.length === 0) {
    console.log('[Baş Editör] manşet eşiğini geçen yeni aday yok');
    return 0;
  }

  const response = await requestOpenAI(headRequest(candidates, currentStory, now, model), apiKey);
  const result = parseStructuredResponse(response);
  if (result.decision !== 'update') {
    console.log('[Baş Editör] değişiklik yok: ' + result.rationale);
    return 0;
  }

  const selected = candidates.find((story) => story.id === result.story_id);
  if (!selected) throw new Error('Baş Editör izinli adaylar dışında bir story_id döndürdü');
  console.log('[Baş Editör] seçilen manşet: ' + selected.headline);
  if (options.dryRun) return 1;

  writeHomepage(selected, now);
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
  if (!apiKey) throw new Error('OPENAI_API_KEY tanımlı değil');
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const now = new Date();
  const state = loadState();

  console.log(
    'GOLHAT otomasyonu | model=' + model +
    ' | tarih=' + formatIstanbulDate(now) +
    ' | dry_run=' + options.dryRun
  );

  if (options.head) {
    await runHeadEditor(state, options, apiKey, model, now);
    return;
  }

  const roles = options.all ? Object.keys(EDITOR_ROLES) : [options.role];
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
