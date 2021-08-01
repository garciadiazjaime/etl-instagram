const fetch = require('node-fetch');
const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');

const debug = require('debug')('app:elimparcial');
const { waiter } = require('../../support/fetch');
const { News } = require('./models');

const { JSDOM } = jsdom;

function getImageURL(imageURL, newsURL) {
  if (imageURL.includes('http')) {
    return imageURL;
  }

  const url = new URL(newsURL);

  return `${url.origin}${imageURL}`;
}

async function getNewsFromHomePage() {
  const url = 'https://www.elimparcial.com/tijuana/';
  const response = await fetch(url);

  const html = await response.text();

  const dom = new JSDOM(html);

  const items = dom.window.document.querySelectorAll('.news--box');

  const news = [];

  items.forEach((item) => {
    const article = new JSDOM(item.innerHTML);
    const button = article.window.document.querySelector('button');

    news.push({
      description: [],
      image: getImageURL(button.dataset.image, url),
      source: 'elimparcial',
      title: button.dataset.title,
      url: button.dataset.url,
    });
  });

  return news;
}

function getContentFromSelectors(dom, selectors) {
  if (!selectors.length) {
    return [];
  }

  const items = dom.window.document.querySelectorAll(selectors[0]);
  if (items.length) {
    return items;
  }

  return getContentFromSelectors(dom, selectors.slice(1));
}

async function singleNewsETL(item) {
  debug(item.url);

  const response = await fetch(item.url);
  const html = await response.text();
  const dom = new JSDOM(html);

  if (dom.window.document.head.textContent.includes('Sign in ・ Cloudflare Access')) {
    debug(`sign_in_needed:${item.url}`);

    return item;
  }

  const title = dom.window.document.querySelector('h1');
  const image = getContentFromSelectors(dom, ['.newsphotogallery__image img', '.ampstart-image-fullpage-hero amp-img']);

  if (!image.length) {
    debug(`no_image:${item.url}`);
    debug(item);
    return item;
  }

  const paragraphs = getContentFromSelectors(dom, ['.newsfull__body p', '.land-see-body-content p']);

  const description = [];

  paragraphs.forEach((p) => description.push(p.textContent));

  return {
    ...item,
    description,
    image: getImageURL(image[0].attributes.src.value, item.url),
    title: title.textContent,
  };
}

async function main() {
  const items = await getNewsFromHomePage();

  let count = 0;

  await mapSeries(items, async (item) => {
    const result = await News.findOne({ url: item.url });

    count += 1;

    if (result) {
      return debug('news_found');
    }

    const news = await singleNewsETL(item);

    await News.findOneAndUpdate({ url: news.url }, news, {
      upsert: true,
    });

    await waiter();

    return debug(`saved:${count}/${items.length}`);
  });

  return debug('============ done ============');
}

module.exports = main;
