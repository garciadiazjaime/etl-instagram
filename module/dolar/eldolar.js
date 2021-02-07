const fetch = require('node-fetch');
const jsdom = require('jsdom');

const debug = require('debug')('app:eldolar');
const { Rate } = require('./models');

const { JSDOM } = jsdom;

async function exchangeETL() {
  const url = 'https://www.eldolar.info/en/mexico/dia/hoy';
  const response = await fetch(url);

  const html = await response.text();

  const dom = new JSDOM(html);

  const items = dom.window.document.querySelectorAll('#dllsTable tbody tr');

  const rates = [];

  const createdAt = new Date()

  items.forEach(item => {
    const child = new JSDOM(`<table><tr>${item.innerHTML}</tr></table>`);
    const anchor = child.window.document.querySelector('a');
    const rate = child.window.document.querySelectorAll('.xTimes')

    rates.push({
      entity: anchor.firstChild.title,
      url: anchor.href.replace(/^\/\//, ''),
      buy: rate[0].textContent,
      sell: rate[1] ? rate[1].textContent : rate[0].textContent,
      source: 'eldolar',
      createdAt,
    })
  });

  const promises = rates.map(async (item) => Rate(item).save())

  await Promise.all(promises)

  debug(`rates saved: ${promises.length}`)
}

async function main() {
  await exchangeETL();

  return debug('============ done ============');
}

module.exports = main;
