const fs = require('fs');
const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const fetch = require('node-fetch');
const debug = require('debug')('app:hastag');

const { Post, Location, User } = require('../models/instagram');
const { waiter, getHTML } = require('../support/fetch');
const locationETL = require('./location');
const config = require('../config');

const postInfoFromQueryStub = require('../stubs/instagram-query-post.json')
const isProduction = config.get('env') === 'production'

const { JSDOM } = jsdom;

async function extract(hashtag, page) {
  if (!isProduction) {
    return fs.readFileSync('./stubs/instagram-hashtag.html', 'utf8');
  }

  return getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, page);
}

function getRecentPosts(recentPosts, hashtag) {
  if (!Array.isArray(recentPosts) || !recentPosts.length) {
    return null;
  }

  return recentPosts.map(({ node: post }) => ({
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
}

function transform(html, hashtag) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      debug(`${hashtag}:onload`);
      const { graphql } = dom.window._sharedData.entry_data.TagPage[0]; // eslint-disable-line
      const recentPosts = getRecentPosts(graphql.hashtag.edge_hashtag_to_media.edges, hashtag);

      resolve(recentPosts);
    };
  });
}

async function getPostInfoFromQuery(post) {
  if (!isProduction) {
    return postInfoFromQueryStub
  }

  const queryURL = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22%3A%22${post.shortcode}%22%2C%22child_comment_count%22%3A3%2C%22fetch_comment_count%22%3A40%2C%22parent_comment_count%22%3A24%2C%22has_threaded_comments%22%3Atrue%7D`
  debug(queryURL)

  const response = await fetch(queryURL)

  return response.json()
}

function getPostUpdated(data) {
  const response = {
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

async function getLocation(data, page) {
  const location = await Location.findOne({ id: data.id });

  if (location) {
    return location;
  }

  const locationExtra = await locationETL(data, page);

  const newLocation = {
    ...data,
    ...locationExtra,
  };

  await Location(newLocation).save();

  return newLocation;
}

async function main(page) {
  const hashtags = config.get('instagram.hashtags').split(',');

  const posts = [];

  await mapSeries(hashtags.slice(0, 1), async (hashtag) => {
    const html = await extract(hashtag, page);
    const data = await transform(html, hashtag);
    debug(`${hashtag}: ${data.length}`);

    posts.push(...data);

    await waiter();
  });

  await mapSeries(posts.slice(0, 1), async (item) => {
    const response = await getPostInfoFromQuery(item)

    const postUpdated = getPostUpdated(response.data.shortcode_media)

    if (postUpdated.user) {
      await User.findOneAndUpdate({ id: postUpdated.user.id }, postUpdated.user, {
        upsert: true,
      });
    } 

    if (postUpdated.location) {
      postUpdated.location = await getLocation(postUpdated.location, page);
    }

    const post = {
      ...item,
      ...postUpdated,
    }

    debug(post)

    posts.push(post)
  })

  debug(posts.length);

  if (!posts.length) {
    return null;
  }

  const promises = await mapSeries(posts, async (data) => Post.findOneAndUpdate({ id: data.id }, data, { // eslint-disable-line
    upsert: true,
  }));

  return debug(`new: ${promises.filter((item) => item === null).length}`);
}

if (require.main === module) {
  main().then(() => process.exit(0)); // eslint-disable-line
}

module.exports = main;
