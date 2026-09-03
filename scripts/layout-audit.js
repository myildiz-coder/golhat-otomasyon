'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'mobile', width: 390, height: 844, mobile: true }),
  Object.freeze({ name: 'desktop', width: 1440, height: 1000, mobile: false }),
  Object.freeze({ name: 'wide', width: 2560, height: 1080, mobile: false })
]);
const LAYOUT_LIMITS = Object.freeze({
  mobile: Object.freeze({ h1: 56, h2: 60, h3: 50, body: 26, maximumHeadlineLines: 8 }),
  desktop: Object.freeze({ h1: 88, h2: 92, h3: 72, body: 30, maximumHeadlineLines: 4 }),
  wide: Object.freeze({ h1: 96, h2: 112, h3: 82, body: 34, maximumHeadlineLines: 4 }),
  minimumBodyText: 9,
  minimumBodyLineHeightRatio: 1.18,
  minimumWideShellRatio: 0.52,
  minimumWideStoryRatio: 0.44,
  horizontalTolerance: 2
});

function parseArgs(argv) {
  const options = {
    includeStories: false,
    report: path.join(REPO_ROOT, 'layout-report.json'),
    screenshots: path.join(REPO_ROOT, 'layout-artifacts'),
    page: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--all') options.includeStories = true;
    else if (value === '--root-only') options.includeStories = false;
    else if (value === '--report') options.report = path.resolve(argv[++index]);
    else if (value === '--screenshots') options.screenshots = path.resolve(argv[++index]);
    else if (value === '--page') options.page = String(argv[++index] || '').replaceAll('\\', '/').replace(/^\//, '');
    else throw new Error('Bilinmeyen seçenek: ' + value);
  }
  return options;
}

function discoverPages(root = REPO_ROOT, includeStories = false) {
  const pages = fs.readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .sort();
  if (includeStories) {
    const storyDir = path.join(root, 'haber');
    if (fs.existsSync(storyDir)) {
      pages.push(...fs.readdirSync(storyDir)
        .filter((name) => name.endsWith('.html'))
        .sort()
        .map((name) => 'haber/' + name));
    }
  }
  return pages;
}

function findBrowser() {
  const explicit = process.env.GOLHAT_BROWSER_PATH || process.env.CHROME_PATH;
  const fileCandidates = [
    explicit,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  for (const candidate of fileCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  for (const command of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim().split(/\r?\n/)[0];
  }
  throw new Error('Chrome veya Edge bulunamadı; GOLHAT_BROWSER_PATH tanımlayın');
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.css')) return 'text/css; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  if (file.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

async function startStaticServer(root = REPO_ROOT) {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(root, relative);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(resolved, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
        return;
      }
      response.setHeader('Content-Type', contentType(resolved));
      response.setHeader('Cache-Control', 'no-store');
      response.end(data);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, port: server.address().port };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Tarayıcı denetim bağlantısı açılamadı: ' + (lastError?.message || url));
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.waiters = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
        return;
      }
      const queue = this.waiters.get(message.method);
      if (queue?.length) queue.shift()(message.params || {});
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitFor(method, timeoutMs = 12_000) {
    return new Promise((resolve, reject) => {
      const queue = this.waiters.get(method) || [];
      let timer;
      const done = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      queue.push(done);
      this.waiters.set(method, queue);
      timer = setTimeout(() => {
        const current = this.waiters.get(method) || [];
        const index = current.indexOf(done);
        if (index >= 0) current.splice(index, 1);
        reject(new Error(method + ' olayı zaman aşımına uğradı'));
      }, timeoutMs);
    });
  }

  close() {
    this.socket.close();
  }
}

function browserAudit(page, viewport, limits) {
  const tolerance = limits.horizontalTolerance;
  const root = document.documentElement;
  const issues = [];

  function visible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
  }

  function selector(element) {
    if (element.id) return '#' + CSS.escape(element.id);
    const classes = [...element.classList].slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
    return element.tagName.toLowerCase() + classes;
  }

  function insideHorizontalScroller(element) {
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (['auto', 'scroll'].includes(style.overflowX) && current.scrollWidth > current.clientWidth + tolerance) return true;
    }
    return false;
  }

  if (root.scrollWidth > root.clientWidth + tolerance || document.body.scrollWidth > root.clientWidth + tolerance) {
    const suspects = [...document.body.querySelectorAll('*')]
      .filter((element) => visible(element) && !insideHorizontalScroller(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector: selector(element),
          left: Number(rect.left.toFixed(1)),
          right: Number(rect.right.toFixed(1)),
          width: Number(rect.width.toFixed(1)),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth
        };
      })
      .filter((item) => item.left < -tolerance || item.right > root.clientWidth + tolerance || item.scrollWidth > item.clientWidth + tolerance)
      .sort((left, right) => Math.max(right.right - root.clientWidth, right.scrollWidth - right.clientWidth) - Math.max(left.right - root.clientWidth, left.scrollWidth - left.clientWidth))
      .slice(0, 8);
    issues.push({
      code: 'horizontal-overflow',
      message: 'Sayfa viewport dışına yatay taşıyor',
      selector: 'html',
      value: Math.max(root.scrollWidth, document.body.scrollWidth),
      limit: root.clientWidth,
      suspects
    });
  }

  if (viewport.name === 'wide') {
    const shell = document.querySelector('main.wrap');
    if (shell && visible(shell)) {
      const ratio = shell.getBoundingClientRect().width / root.clientWidth;
      const minimumRatio = page.startsWith('haber/') ? limits.minimumWideStoryRatio : limits.minimumWideShellRatio;
      if (ratio < minimumRatio) {
        issues.push({
          code: 'content-too-narrow',
          message: 'Ana yayın alanı geniş ekranı yeterince kullanmıyor',
          selector: 'main.wrap',
          value: Number(ratio.toFixed(3)),
          limit: minimumRatio
        });
      }
    }
  }

  const textSelector = 'h1,h2,h3,p,li,td,th,.dispatch-headline,.dispatch-dek,.standfirst';
  for (const element of document.querySelectorAll(textSelector)) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const fontSize = Number.parseFloat(style.fontSize);
    const lineHeight = style.lineHeight === 'normal' ? null : Number.parseFloat(style.lineHeight);
    const tag = element.tagName.toLowerCase();
    const maximum = tag === 'h1' ? limits[viewport.name].h1
      : tag === 'h2' ? limits[viewport.name].h2
        : tag === 'h3' || element.classList.contains('dispatch-headline') ? limits[viewport.name].h3
          : limits[viewport.name].body;

    if ((rect.left < -tolerance || rect.right > root.clientWidth + tolerance) && !insideHorizontalScroller(element)) {
      issues.push({ code: 'element-outside-viewport', message: 'Metin alanı ekranın dışında kalıyor', selector: selector(element), left: rect.left, right: rect.right, viewport: root.clientWidth });
    }
    if (fontSize > maximum + 0.1) {
      issues.push({ code: 'font-too-large', message: 'Yazı boyutu bu viewport için fazla büyük', selector: selector(element), value: fontSize, limit: maximum });
    }
    if (tag === 'h1' && lineHeight) {
      const lineCount = Math.round(rect.height / lineHeight);
      if (lineCount > limits[viewport.name].maximumHeadlineLines) {
        issues.push({ code: 'headline-too-many-lines', message: 'Ana başlık bu viewport için fazla satıra bölünüyor', selector: selector(element), value: lineCount, limit: limits[viewport.name].maximumHeadlineLines });
      }
    }
    if (!['h1', 'h2', 'h3'].includes(tag) && fontSize < limits.minimumBodyText - 0.1 && element.textContent.trim().length > 20) {
      issues.push({ code: 'font-too-small', message: 'Gövde yazısı okunabilirlik sınırının altında', selector: selector(element), value: fontSize, limit: limits.minimumBodyText });
    }
    if (!['h1', 'h2', 'h3'].includes(tag) && lineHeight && lineHeight / fontSize < limits.minimumBodyLineHeightRatio) {
      issues.push({ code: 'line-height-tight', message: 'Satır aralığı yazı boyutuna göre sıkışık', selector: selector(element), value: Number((lineHeight / fontSize).toFixed(2)), limit: limits.minimumBodyLineHeightRatio });
    }
    if (['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + tolerance && element.textContent.trim()) {
      issues.push({ code: 'text-clipped', message: 'Metin kapsayıcı içinde sağdan kesiliyor', selector: selector(element), value: element.scrollWidth, limit: element.clientWidth });
    }
  }

  return {
    page,
    viewport,
    title: document.title,
    url: location.href,
    measuredAt: new Date().toISOString(),
    metrics: {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      documentHeight: Math.max(root.scrollHeight, document.body.scrollHeight)
    },
    issues
  };
}

async function createTarget(debugPort) {
  const response = await fetch('http://127.0.0.1:' + debugPort + '/json/new?about%3Ablank', { method: 'PUT' });
  if (!response.ok) throw new Error('Yeni tarayıcı sekmesi açılamadı: HTTP ' + response.status);
  return response.json();
}

async function auditPage(session, baseUrl, page, viewport) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
  const loaded = session.waitFor('Page.loadEventFired');
  await session.send('Page.navigate', { url: baseUrl + '/' + page });
  await loaded;
  await session.send('Runtime.evaluate', {
    expression: 'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true',
    awaitPromise: true,
    returnByValue: true
  });
  const expression = '(' + browserAudit.toString() + ')(' + [page, viewport, LAYOUT_LIMITS]
    .map((value) => JSON.stringify(value))
    .join(',') + ')';
  const result = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return result.result.value;
}

async function captureFailure(session, file) {
  const screenshot = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false
  });
  fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 2000))
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

async function run(options) {
  const pages = options.page ? [options.page] : discoverPages(REPO_ROOT, options.includeStories);
  for (const page of pages) {
    if (!fs.existsSync(path.join(REPO_ROOT, page))) throw new Error('Denetlenecek sayfa bulunamadı: ' + page);
  }

  const browserPath = findBrowser();
  const { server, port: sitePort } = await startStaticServer(REPO_ROOT);
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'golhat-mizanpaj-'));
  fs.mkdirSync(options.screenshots, { recursive: true });
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--no-sandbox',
    '--hide-scrollbars',
    '--disable-features=msEdgeSync,msEdgeSignin,msEdgeFirstRunExperience',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let browserError = '';
  browser.stderr.on('data', (chunk) => { browserError += chunk.toString(); });

  const report = {
    editor: 'GOLHAT Mizanpaj Editörü',
    generatedAt: new Date().toISOString(),
    browser: browserPath,
    pageCount: pages.length,
    viewports: DEFAULT_VIEWPORTS,
    results: [],
    summary: null
  };

  let session;
  try {
    await waitForJson('http://127.0.0.1:' + debugPort + '/json/version');
    const target = await createTarget(debugPort);
    session = new CdpSession(target.webSocketDebuggerUrl);
    await session.open();
    await session.send('Page.enable');

    for (const page of pages) {
      for (const viewport of DEFAULT_VIEWPORTS) {
        process.stdout.write('[Mizanpaj] ' + viewport.name + ' · ' + page + ' ... ');
        try {
          const result = await auditPage(session, 'http://127.0.0.1:' + sitePort, page, viewport);
          report.results.push(result);
          if (result.issues.length) {
            const safeName = (page + '-' + viewport.name).replace(/[^a-z0-9.-]+/gi, '-').replace(/\.html-/i, '-');
            await captureFailure(session, path.join(options.screenshots, safeName + '.png'));
            console.log(result.issues.length + ' sorun');
          } else {
            console.log('temiz');
          }
        } catch (error) {
          report.results.push({ page, viewport, issues: [{ code: 'audit-error', message: error.message }] });
          console.log('hata: ' + error.message);
        }
      }
    }
  } finally {
    session?.close();
    await stopProcess(browser);
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }

  const issueCount = report.results.reduce((total, result) => total + result.issues.length, 0);
  const affectedPages = new Set(report.results.filter((result) => result.issues.length).map((result) => result.page));
  report.summary = {
    checks: report.results.length,
    issueCount,
    affectedPages: [...affectedPages]
  };
  fs.mkdirSync(path.dirname(options.report), { recursive: true });
  fs.writeFileSync(options.report, JSON.stringify(report, null, 2) + '\n');

  console.log('\n[Mizanpaj] ' + report.results.length + ' görünüm kontrol edildi; ' + issueCount + ' sorun, ' + affectedPages.size + ' etkilenen sayfa.');
  if (issueCount) {
    console.error('[Mizanpaj] Rapor: ' + options.report);
    process.exitCode = 1;
  }
  if (browserError && process.env.DEBUG_LAYOUT_AUDIT === '1') console.error(browserError);
  return report;
}

if (require.main === module) {
  run(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error('::error title=GOLHAT Mizanpaj Editörü::' + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_VIEWPORTS,
  LAYOUT_LIMITS,
  parseArgs,
  discoverPages,
  findBrowser,
  browserAudit,
  run
};
