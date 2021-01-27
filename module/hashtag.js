const fs = require('fs');
const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const debug = require('debug')('app:hastag');

const { Post } = require('../models/instagram')
const { openDB } = require('../support/database')
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const { JSDOM } = jsdom;

async function extract(cookies, hashtag) {
  if (config.get('env') !== 'production') {
    return fs.readFileSync('./stubs/instagram-hashtag.html', 'utf8');
  }

  return getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, cookies);
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
    mediaType: post.__typename,
    source: hashtag,
  }));
}

function transform(html, hashtag) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      const recentPosts = getRecentPosts(dom.window._sharedData.entry_data.TagPage[0].graphql.hashtag.edge_hashtag_to_media.edges, hashtag)

      resolve(recentPosts);
    };
  });
}

async function main(cookies) {
  const hashtags = ['valledeguadalupe'];
  const posts = [];

  await mapSeries(hashtags, async (hashtag) => {
    const html = await extract(cookies, hashtag);
    const data = await transform(html, hashtag);

    posts.push(...data);

    await waiter();
  });

  debug(posts.length);

  if (!posts.length) {
    return null
  }

  await openDB()

  const promises = await mapSeries(posts, async (data) => Post.findOneAndUpdate({ id: data.id }, data, {
    upsert: true,
  }));

  debug(`new: ${promises.filter(item => item === null).length}`)
}

if (require.main === module) {
  main().then(() => process.exit(0)); // eslint-disable-line
}

module.exports = main;
