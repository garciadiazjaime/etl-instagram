const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const debug = require('debug')('app:extend-followers');

const isLoginRequired = require('./is-login-required');
const { waiter, getHTML } = require('../../support/fetch');
const config = require('../../config');
const { Follower } = require('./models');

const { JSDOM } = jsdom;
const isProduction = config.get('env') === 'production';
const limit = isProduction ? 20 : 1;

function getPostCaption(caption) {
  if (!caption || !Array.isArray(caption.edges) || !caption.edges.length) {
    return '';
  }

  return caption.edges[0].node && caption.edges[0].node.text;
}

function getPosts(media) {
  if (!media || !Array.isArray(media.edges) || !media.edges.length) {
    return [];
  }

  return media.edges.map(({ node: post }) => ({
    id: post.id,
    likeCount: post.edge_liked_by && post.edge_liked_by.count,
    commentsCount: post.edge_media_to_comment && post.edge_media_to_comment.count,
    permalink: `https://www.instagram.com/p/${post.shortcode}/`,
    shortcode: post.shortcode,
    caption: getPostCaption(post.edge_media_to_caption),
    mediaUrl: post.display_url,
    mediaType: post.__typename, //eslint-disable-line
    source: 'followers',
    accessibility: post.accessibility_caption,
  }));
}

async function getDataFromDOM(html) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      const { graphql } = dom.window.__initialData.data.entry_data.ProfilePage[0]; // eslint-disable-line

      if (!graphql || !graphql.user) {
        return null;
      }

      const { user } = graphql;

      const data = {
        biography: user.biography,
        category_name: user.category_name || user.business_category_name,
        following: user.edge_follow.count,
        followers: user.edge_followed_by.count,
        posts: user.edge_owner_to_timeline_media.count,
        is_business_account: user.is_business_account,
        is_professional_accountis_professional_account: user.is_professional_account,
        is_verified: user.is_verified,
        media: getPosts(user.edge_owner_to_timeline_media),
      };

      resolve(data);
    };
  });
}

async function extendFollowers(page) {
  const followers = await Follower.find({
    biography: {
      $exists: 0,
    },
  }).sort({
    updatedAt: -1,
  });

  let count = 1;

  debug(`proccesing ${limit} / ${followers.length}`);

  await mapSeries(followers.slice(0, limit), async (follower) => {
    const url = `https://www.instagram.com/${follower.username}/`;
    const html = await getHTML(url, page);
    if (!html) {
      return debug('NO_HTML');
    }

    const loginRequired = await isLoginRequired(html, page);
    if (loginRequired) {
      return debug('LOGIN_REQUIRED');
    }

    if (html.includes('Content Unavailable')) {
      debug(`NO_CONTENT:${follower.username}`);

      await Follower.deleteOne({ id: follower.id });

      return null;
    }

    const data = await getDataFromDOM(html);
    if (!data) {
      return debug('NO_DATA');
    }

    await Follower.findOneAndUpdate({ id: follower.id }, data, { // eslint-disable-line
      upsert: true,
    });

    debug(`${follower.id} [${count}/${limit}] updated`);
    count += 1;

    await waiter();

    return null;
  });
}

module.exports = extendFollowers;
