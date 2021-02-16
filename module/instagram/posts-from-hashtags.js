const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const fetch = require('node-fetch');
const debug = require('debug')('app:hastag');

const { Post, Location, User } = require('./models');
const { waiter, getHTML } = require('../../support/fetch');
const config = require('../../config');

const isProduction = config.get('env') === 'production';

const { JSDOM } = jsdom;

async function hashtagETL(hashtag, page) {
  const html = await getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, page);
  debug(html.slice(0, 1000))

  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      debug(`_sharedData: ${!!dom.window._sharedData}`)
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

      return resolve(response);
    };
  });
}

async function locationETL(rawLocation, page) {
  const result = await Location.findOne({ id: rawLocation.id });

  if (result) {
    debug(`location_found:${rawLocation.slug}`);
    return result;
  }

  await waiter();

  const locationURL = `https://www.instagram.com/explore/locations/${rawLocation.id}/${rawLocation.slug}/?__a=1`;

  const response = await getHTML(locationURL, page);
  if (response.includes('Login • Instagram')) {
    debug('LOGIN');
    return null;
  }

  const rawData = await page.evaluate(() => JSON.parse(document.querySelector('body').innerText));

  const { location: rawLocationExtended } = rawData.graphql;

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
  const postURL = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22%3A%22${post.shortcode}%22%2C%22child_comment_count%22%3A3%2C%22fetch_comment_count%22%3A40%2C%22parent_comment_count%22%3A24%2C%22has_threaded_comments%22%3Atrue%7D`;
  const response = await getHTML(postURL, page);
  if (response.includes('Login • Instagram')) {
    debug('LOGIN');
    return {};
  }

  const rawData = await page.evaluate(() => JSON.parse(document.querySelector('body').innerText));

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
    const location = await locationETL(data.location, page);


    postExtended.location = location;
  }

  return postExtended;
}

async function extendPostsAndSave(posts, page, hashtag) {
  let count = 0;

  await mapSeries(posts, async (post) => {
    const result = await Post.findOne({ id: post.id });

    if (result) {
      debug(`${hashtag}:post_found:${post.id}`);
      return null;
    }

    const { user, location } = await postETL(post, page);

    if (!user) {
      debug(`${hashtag}:user_not_found:${post.permalink}`);
      return null;
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

    if (!isProduction) {
      debug(postExtended)
    }

    count += 1;

    await Post.findOneAndUpdate({ id: postExtended.id }, postExtended, { // eslint-disable-line
      upsert: true,
    });

    debug(`${hashtag}:post_saved:${post.shortcode}:${count}/${posts.length}`);

    await waiter();

    return null;
  });
}

async function main(page) {
  const data = config.get('instagram.hashtags').split(',');
  const hashtags = isProduction ? data : data.slice(0, 1);

  await mapSeries(hashtags, async (hashtag) => {
    const postsFromHashtag = await hashtagETL(hashtag, page);
    await waiter();

    debug(`${hashtag}:postsFromHashtag:${postsFromHashtag.length}`);

    const posts = isProduction ? postsFromHashtag : postsFromHashtag.slice(0, 1)
    await extendPostsAndSave(posts, page, hashtag);
  });

  debug('============ done ============');
}

module.exports = main;
