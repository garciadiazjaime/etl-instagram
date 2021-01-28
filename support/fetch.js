const fs = require('fs');
const puppeteer = require('puppeteer');

const debug = require('debug')('app:fetch');

const config = require('../config');

const secondsToWait = 1000 * (config.get('env') === 'production' ? 10 : 1);

async function waiter() {
  return new Promise((resolve) => {
    setInterval(() => {
      resolve();
    }, secondsToWait);
  });
}

async function getBrowser() {
  debug(fs.existsSync('/app/node_modules/puppeteer/.local-chromium/linux-818858/chrome-linux/chrome'))
  const opts = {
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--headless',
    ],
  };

  const browser = await puppeteer.launch(opts);

  return browser;
}

async function getHTML(url, cookies) {
  debug(url);
  const browser = await getBrowser();
  const page = await browser.newPage();

  if (Array.isArray(cookies) && cookies.length) {
    await page.setCookie(...cookies);
  }

  const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4152.0 Safari/537.36';
  await page.setUserAgent(userAgent);

  try {
    await page.goto(url);
  } catch (error) {
    debug(error);
  }

  const html = await page.content();
  await browser.close();

  debug(html)

  return html;
}

module.exports = {
  waiter,
  getHTML,
};
