const fs = require('fs');
const mapSeries = require('async/mapSeries');
const jsdom = require('jsdom');
const debug = require('debug')('app:post');

const locationETL = require('./location');
const { Post, Location, User } = require('../models/instagram');
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const { JSDOM } = jsdom;

const isProduction = config.get('env') === 'production';
const stubShortcode = 'CKfDyQDgl6W';

async function extract(permalink, page) {
  if (!isProduction) {
    return fs.readFileSync('./stubs/instagram-post.html', 'utf8');
  }

  return getHTML(permalink, page);
}

function getPostUpdated(data) {
  const response = {
    id: data.id,
    likeCount: data.edge_media_preview_like.count,
    commentsCount: data.edge_media_preview_comment.count,
    user: {
      id: data.owner.id,
      username: data.owner.username,
      fullName: data.owner.full_name,
      profilePicture: data.owner.profile_pic_url,
      followedBy: data.owner.edge_followed_by.count,
      postsCount: data.owner.edge_owner_to_timeline_media.count,
    },
  };

  if (data.location) {
    response.location = {
      id: data.location.id,
      name: data.location.name,
      slug: data.location.slug,
      hasPublicPage: data.location.has_public_page,
      address: data.location.address_json,
    };
  }

  return response;
}

async function transform(html, shortcode) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      debug(`transform:${shortcode}`)
      const { graphql } = dom.window.__additionalData[`/p/${shortcode}/`].data; // eslint-disable-line
      const response = getPostUpdated(graphql.shortcode_media);

      resolve(response);
    };
  });
}

async function getLocation(data, page) {
  const location = await Location.findOne({ id: data.id });

  if (location) {
    return location;
  }

  const locationExtra = await locationETL(data, page);

  const newLocation = {
    ...data,
    locationExtra,
  };

  await Location(newLocation).save();

  return newLocation;
}

async function main(page) {
  const posts = await Post.find({ user: { $exists: 0 } }).limit(40);

  debug(`processing ${posts.length}`);

  await mapSeries(posts, async (post) => {
    const html = await extract(post.permalink, page);

    const shortcode = !isProduction ? stubShortcode : post.shortcode;

    const data = await transform(html, shortcode);

    if (data.location) {
      data.location = await getLocation(data.location, page);
    }

    await User.findOneAndUpdate({ id: data.user.id }, data.user, {
      upsert: true,
    });

    await Post.findOneAndUpdate({ id: data.id }, data, {
      upsert: true,
    });

    debug(`updated: ${post.id}`);

    await waiter();
  });
}

if (require.main === module) {
  main().then(() => process.exit(0)); // eslint-disable-line
}

module.exports = main;
