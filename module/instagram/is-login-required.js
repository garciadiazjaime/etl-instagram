const { getPublicPath } = require('../../support/file');
const { sendEmail } = require('../../support/email');
const config = require('../../config');

const isProduction = config.get('env') === 'production';

async function isLoginRequired(html, page) {
  if (html.includes('Login • Instagram')) {
    if (isProduction) {
      await page.screenshot({ path: `${getPublicPath()}/hashtag-login.png` });
      await sendEmail('LOGIN_REQUIRED');
    }

    return true;
  }

  return false;
}

module.exports = isLoginRequired;
