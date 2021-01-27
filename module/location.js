const fs = require('fs');
const mapSeries = require('async/mapSeries');
const jsdom = require('jsdom');

const { Post } = require('../models/instagram')
const { openDB } = require('../support/database')
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const { JSDOM } = jsdom;

const isProduction = config.get('env') === 'production'
const stubShortcode = 'CKfDyQDgl6W'

async function extract(cookies, permalink) {
  if (!isProduction) {
    return fs.readFileSync('./stubs/instagram-location.html', 'utf8');
  }

  return getHTML(permalink, cookies);
}

function getLocation(data) {
  const response = {
    phone: data.phone,
    aliasOnFB: data.primary_alias_on_fb,
    website: data.website,
  }

  if (data.lat && data.lng) {
    response.gps = {
      type: 'Point',
      coordinates: [data.lng, data.lat]
    }
  }

  return response
}

async function transform(html, shortcode) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      
      const response = getLocation(dom.window._sharedData.entry_data.LocationsPage[0].graphql.location)

      resolve(response);
    };
  });
}

async function main(cookies, location) {
  const locationURL = `https://www.instagram.com/explore/locations/${location.id}/${location.slug}/`

  const html = await extract(cookies, locationURL)

  const data = await transform(html)

  return data
}

module.exports = main;
