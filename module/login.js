const debug = require('debug')('app:login');

const { getBrowser } = require('../support/fetch');
const config = require('../config');

async function main() {
  const url = 'https://www.instagram.com/accounts/login';

  const browser = await getBrowser();

  const page = await browser.newPage();
  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4152.0 Safari/537.36';
  await page.setUserAgent(userAgent);

  await page.goto(url);

  await page.waitForSelector('form', { timeout: 1000 * 3 });

  await page.type('input[name="username"]', config.get('instagram.username'));
  await page.type('input[name="password"]', config.get('instagram.password'));

  await page.click('button[type="submit"]');

  await page.waitForNavigation();

  const cookies = await page.cookies();
  debug(`cookies:${!!cookies}`);

  await browser.close();

  return cookies;
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  });
}

module.exports = main;
