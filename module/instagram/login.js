const fs = require('fs')
const debug = require('debug')('app:login');

const { getPage } = require('../../support/fetch');
const config = require('../../config');

async function main() {
  let url = 'https://www.instagram.com/accounts/login/';

  const page = await getPage();

  debug(url);

  await page.goto(url);

  let html = await page.content();
  debug(html.slice(0, 1000))

  const path = './public';
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }

  await page.screenshot({ path: `${path}/login_first.png` });
  debug(`print_saved:${fs.existsSync(`${path}/login_first.png`)}`)

  if (html.includes('Page Not Found • Instagram')) {
    url = 'https://www.instagram.com/'
    debug(url);
    await page.goto(url);

    const html = await page.content();
    debug(html.slice(0, 1000))

    await page.screenshot({ path: `${path}/login_second.png` });
  }

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
