const debug = require('debug')('app:login');

const { getPage } = require('../support/fetch');
const config = require('../config');

async function main() {
  const url = 'https://www.instagram.com/accounts/login';

  const page = await getPage();

  debug(url)

  await page.goto(url);

  await page.content();

  await page.waitForSelector('form', { timeout: 1000 * 3 });

  await page.type('input[name="username"]', config.get('instagram.username'));
  await page.type('input[name="password"]', config.get('instagram.password'));

  await page.click('button[type="submit"]');

  await page.waitForNavigation();

  const cookies = await page.cookies();
  debug(`cookies:${!!cookies}`);

  return cookies;
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  });
}

module.exports = main;
