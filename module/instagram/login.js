const debug = require('debug')('app:login');

const { getPage } = require('../../support/fetch');
const { getPublicPath } = require('../../support/file')
const { sendEmail } = require('../../support/email')
const config = require('../../config');

async function main() {
  let url = 'https://www.instagram.com/accounts/login/';

  const page = await getPage();

  debug(url);

  await page.goto(url);

  let html = await page.content();
  debug(html.slice(0, 1000))

  if (html.includes('Page Not Found • Instagram')) {
    url = 'https://www.instagram.com/'
    debug(url);
    await page.goto(url);

    const html = await page.content();
    debug(html.slice(0, 1000))
  }

  await page.waitForSelector('form', { timeout: 1000 * 3 });

  await page.type('input[name="username"]', config.get('instagram.username'));
  await page.type('input[name="password"]', config.get('instagram.password'));

  await page.click('button[type="submit"]');

  await page.screenshot({ path: `${getPublicPath()}/login-before.png` });

  await page.waitForNavigation();

  await page.screenshot({ path: `${getPublicPath()}/login-after.png` });

  if (html.includes('Suspicious Login Attempt')) {
    await sendEmail('SUSPICIOUS_ATTEMPT')
    return null
  }

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
