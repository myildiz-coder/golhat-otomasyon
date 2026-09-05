'use strict';

const SYNC_URL = 'https://golhat.com/api/golhat/sync';

async function syncPublication({ fetcher = fetch, attempts = 3, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(SYNC_URL, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) throw new Error('Yayın eşitleme HTTP ' + response.status);
      const result = await response.json();
      if (result.ok !== true || result.storageReady !== true || result.sourceReady !== true || !(result.articles > 0)) {
        throw new Error('Ortak yayın arşivi aktarımı doğrulanamadı');
      }
      console.log('GOLHAT ortak yayın arşivi doğrulandı: ' + result.articles + ' kayıt');
      return result;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await sleep(5000 * (attempt + 1));
    }
  }
  throw lastError;
}

if (require.main === module) syncPublication().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
module.exports = { SYNC_URL, syncPublication };
