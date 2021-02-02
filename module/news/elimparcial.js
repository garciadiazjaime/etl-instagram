const fetch = require('node-fetch');
const jsdom = require("jsdom");
const mapSeries = require('async/mapSeries');

const { waiter } = require('../../support/fetch');
const { News } = require('./models');
const debug = require('debug')('app:elimparcial');

const { JSDOM } = jsdom;

function getImageURL(imageURL, newsURL) {
  if (imageURL.includes('http')) {
    return imageURL
  }

  const url = new URL(newsURL)

  return `${url.origin}${imageURL}`
}

async function getNewsFromHomePage() {
  const url = 'https://www.elimparcial.com/tijuana/'
  const response = await fetch(url)

  const html = await response.text()

  const dom = new JSDOM(html);

  const items = dom.window.document.querySelectorAll(".news--box")

  const news = []

  items.forEach(item => {
    const article = new JSDOM(item.innerHTML)
    const button = article.window.document.querySelector('button') 

    news.push({
      image: getImageURL(button.dataset.image, url),
      source: 'elimparcial',
      title: button.dataset.title,
      url: button.dataset.url,
    })
  })

  return news
}

function getContentFromSelectors(dom, selectors) {
  if (!selectors) {
    return []
  }

  const items = dom.window.document.querySelectorAll(selectors[0])
  if (items.length) {
    return items
  }

  return getContentFromSelectors(dom, selectors.slice(1))
}

async function singleNewsETL(item) {
  debug(item.url)
  const response = await fetch(item.url)
  const html = await response.text()
  const dom = new JSDOM(html);

  if (dom.window.document.head.textContent.includes('Sign in ・ Cloudflare Access')) {
    debug(`sign_in_needed:${item.url}`)

    return item
  }

  const title = dom.window.document.querySelector("h1")
  const image = getContentFromSelectors(dom, ['.newsphotogallery__image img', '.ampstart-image-fullpage-hero amp-img'])
  const paragraphs = getContentFromSelectors(dom, ['.newsfull__body p', ".land-see-body-content p"])
  
  const description = []
  
  paragraphs.forEach(p => description.push(p.textContent))

  const news = {
    ...item,
    description,
    image: getImageURL(image[0].attributes.src.value, item.url),
    title: title.textContent,
  }

  return news
}

async function main() {
  const news = await getNewsFromHomePage()

  let count = 0

  await mapSeries(news, async (item) => {
    const result = await News.findOne({ url: item.url });

    count += 1

    if (result) {
      return debug(`news_found:${result._id}`);
    }

    const newsExtended = await singleNewsETL(item)
    
    await News.findOneAndUpdate({ url: newsExtended.url }, newsExtended, {
      upsert: true,
    });

    debug(`saved:${count}/${news.length}`)

    await waiter()
  })

  return debug('============ done ============');
}

module.exports = main;
