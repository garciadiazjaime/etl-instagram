const fs = require('fs');
const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const fetch = require('node-fetch');
const debug = require('debug')('app:hastag');

const { Post, Location, User } = require('../models/instagram');
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const postInfoFromQueryStub = require('../stubs/instagram-query-post.json')
const isProduction = config.get('env') === 'production'

const { JSDOM } = jsdom;

function getRecentPosts(html, hashtag) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      debug(`${hashtag}:onload`);
      const { graphql } = dom.window._sharedData.entry_data.TagPage[0]; // eslint-disable-line
      const { edges } = graphql.hashtag.edge_hashtag_to_media

      if (!Array.isArray(edges) || !response.edges) {
        return null;
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

      return resolve(response);
    };
  });
}

async function getPostInfoFromQuery(post) {
  if (!isProduction) {
    return postInfoFromQueryStub
  }

  debug(`query:${post.shortcode}`)
  const queryURL = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22%3A%22${post.shortcode}%22%2C%22child_comment_count%22%3A3%2C%22fetch_comment_count%22%3A40%2C%22parent_comment_count%22%3A24%2C%22has_threaded_comments%22%3Atrue%7D`

  const response = await fetch(queryURL)
  const data = await response.json()
  debug(data)

  return data
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

async function getLocation(data) {
  const location = await Location.findOne({ id: data.id });

  if (location) {
    return location;
  }

  const queryURL = `https://www.instagram.com/explore/locations/${data.id}/${data.slug}/?__a=1`
  debug(`location:${data.id}/${data.slug}`)

  const response = await fetch(queryURL)

  const locationResponse = await response.json()

  const item = locationResponse.graphql.location

  const newLocation = {
    ...data,
    phone: item.phone,
    aliasOnFB: item.primary_alias_on_fb,
    website: item.website,
    blurb: item.blurb
  };

  if (item.lat && item.lng) {
    newLocation.gps = {
      type: 'Point',
      coordinates: [item.lng, item.lat],
    };
  }

  await Location(newLocation).save();

  return newLocation
}

async function main(page) {
  const hashtags = config.get('instagram.hashtags').split(',');

  const posts = [];

  await mapSeries(hashtags, async (hashtag) => {
    const html = await getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, page);
    const data = await getRecentPosts(html, hashtag);
    debug(`${hashtag}: ${data.length}`);

    posts.push(...data);

    await waiter();
  });

  await mapSeries(posts, async (item) => {
    const response = await getPostInfoFromQuery(item)

    const postUpdated = getPostUpdated(response.data.shortcode_media)
    debug(postUpdated)

    if (postUpdated.user) {
      await User.findOneAndUpdate({ id: postUpdated.user.id }, postUpdated.user, {
        upsert: true,
      });
    } 

    if (postUpdated.location) {
      postUpdated.location = await getLocation(postUpdated.location);
    }

    const post = {
      ...item,
      ...postUpdated,
    }

    posts.push(post)

    await waiter();
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
