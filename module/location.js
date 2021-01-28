const fs = require('fs');
const jsdom = require('jsdom');

const { getHTML } = require('../support/fetch');
const config = require('../config');

const { JSDOM } = jsdom;

const isProduction = config.get('env') === 'production';

async function extract(permalink, page) {
  if (!isProduction) {
    return fs.readFileSync('./stubs/instagram-location.html', 'utf8');
  }

  return getHTML(permalink, page);
}

function getLocation(data) {
  const response = {
    phone: data.phone,
    aliasOnFB: data.primary_alias_on_fb,
    website: data.website,
  };

  if (data.lat && data.lng) {
    response.gps = {
      type: 'Point',
      coordinates: [data.lng, data.lat],
    };
  }

  return response;
}

async function transform(html) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      const response = getLocation(dom.window._sharedData.entry_data.LocationsPage[0].graphql.location); // eslint-disable-line

      resolve(response);
    };
  });
}

async function main(location, page) {
  const locationURL = `https://www.instagram.com/explore/locations/${location.id}/${location.slug}/`;

  const html = await extract(locationURL, page);

  const data = await transform(html);

  return data;
}

module.exports = main;
