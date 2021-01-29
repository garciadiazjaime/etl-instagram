const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const fetch = require('node-fetch');
const debug = require('debug')('app:hastag');

const { Post, Location, User } = require('../models/instagram');
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const isProduction = config.get('env') === 'production';

const { JSDOM } = jsdom;

async function hashtagETL(hashtag, page) {
  const html = await getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, page);

  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      const { graphql } = dom.window._sharedData.entry_data.TagPage[0]; // eslint-disable-line
      const { edges } = graphql.hashtag.edge_hashtag_to_media;

      if (!Array.isArray(edges) || !edges) {
        debug((`${hashtag}:NO_EDGES`));
        return resolve([]);
      }

      const response = edges.map(({ node: post }) => ({
        id: post.id,
        likeCount: post.edge_media_preview_like.count,
        commentsCount: post.edge_media_to_comment.count,
        permalink: `https://www.instagram.com/p/${post.shortcode}/`,
        shortcode: post.shortcode,
        caption: post.edge_media_to_caption.edges[0].node.text,
        mediaUrl: post.thumbnail_src,
        accessibility: post.accessibility_caption,
        mediaType: post.__typename, // eslint-disable-line no-underscore-dangle
        source: hashtag,
      }));

      debug(`${hashtag}:${response.length}`);

      return resolve(response);
    };
  });
}

async function getPostsFromHashtags(hashtags, page) {
  const response = [];

  await mapSeries(isProduction ? hashtags : hashtags.slice(0, 1), async (hashtag) => {
    const posts = await hashtagETL(hashtag, page);

    response.push(...posts);

    await waiter();
  });

  debug(`getPostsFromHashtags:${response.length}`);

  return response;
}

async function locationETL(rawLocation) {
  const result = await Location.findOne({ id: rawLocation.id });

  if (result) {
    debug(`location_found:${rawLocation.slug}`)
    return result;
  }

  await waiter();

  debug(`location:${rawLocation.id}/${rawLocation.slug}`);
  const locationURL = `https://www.instagram.com/explore/locations/${rawLocation.id}/${rawLocation.slug}/?__a=1`;

  const response = await fetch(locationURL);
  const json = await response.json();

  const { location: rawLocationExtended } = json.graphql;

  const location = {
    id: rawLocation.id,
    name: rawLocation.name,
    slug: rawLocation.slug,
    hasPublicPage: rawLocation.has_public_page,
    address: rawLocation.address_json,

    phone: rawLocationExtended.phone,
    aliasOnFB: rawLocationExtended.primary_alias_on_fb,
    website: rawLocationExtended.website,
    blurb: rawLocationExtended.blurb,
  };

  if (rawLocationExtended.lat && rawLocationExtended.lng) {
    location.gps = {
      type: 'Point',
      coordinates: [rawLocationExtended.lng, rawLocationExtended.lat],
    };
  }

  await Location(location).save();

  return location;
}

async function postETL(post, page) {
  debug(`query:${post.shortcode}`);
  const postURL = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22%3A%22${post.shortcode}%22%2C%22child_comment_count%22%3A3%2C%22fetch_comment_count%22%3A40%2C%22parent_comment_count%22%3A24%2C%22has_threaded_comments%22%3Atrue%7D`;
  const response = await getHTML(postURL, page);
  if (response.includes('Login • Instagram')) {
    debug('LOGIN');
    return {}
  }

  const rawData = await page.evaluate(() =>  {
    return JSON.parse(document.querySelector("body").innerText); 
  });

  const { shortcode_media: data } = rawData.data;

  const postExtended = {
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
    const location = await locationETL(data.location);

    postExtended.location = location;
  }

  return postExtended;
}

async function getPostsExtended(posts, page) {
  const response = [];

  await mapSeries(isProduction ? posts : posts.slice(0, 1), async (post) => {
    const { user, location } = await postETL(post, page);

    if (!user) {
      return null
    }

    await User.findOneAndUpdate({ id: user.id }, user, {
      upsert: true,
    });

    const postExtended = {
      ...post,
      user,
    };

    if (location) {
      postExtended.location = location;
    }

    posts.push(postExtended);

    await waiter();
  });

  debug(`getPostsExtended:${response.length}`);

  return response;
}

async function savePosts(posts) {
  const promises = await mapSeries(posts, async (data) => Post.findOneAndUpdate({ id: data.id }, data, { // eslint-disable-line
    upsert: true,
  }));

  debug(`new: ${promises.filter((item) => item === null).length}`);
}

async function main(page) {
  const hashtags = config.get('instagram.hashtags').split(',');

  const postsFromHashtags = await getPostsFromHashtags(hashtags.slice(0, 1), page);

  const posts = await getPostsExtended(postsFromHashtags, page);

  await savePosts(posts);
}

module.exports = main;
