const jsdom = require('jsdom');
const mapSeries = require('async/mapSeries');
const debug = require('debug')('app:hashtag');

const isLoginRequired = require('./is-login-required');
const { Post, Location, User } = require('./models');
const { waiter, getHTML } = require('../../support/fetch');
const { getPublicPath } = require('../../support/file');
const { getLabels } = require('./labels');
const { getTopics } = require('./topics');
const config = require('../../config');

const isProduction = config.get('env') === 'production';
let hasLoginNotificationSent = false;

const { JSDOM } = jsdom;

function getImage(media) {
  if (media.image_versions2
      && Array.isArray(media.image_versions2.candidates)
      && media.image_versions2.candidates.length) {
    return media.image_versions2.candidates[0].url;
  }

  if (media.carousel_media
      && Array.isArray(media.carousel_media)
      && Array.isArray(media.carousel_media[0].image_versions2.candidates)) {
    return media.carousel_media[0].image_versions2.candidates[0].url;
  }

  return null;
}

function getPostsFromData({ recent }, hashtag) {
  if (!Array.isArray(recent.sections) || !recent.sections.length) {
    return null;
  }

  const items = recent.sections.reduce((accu, item) => {
    item.layout_content.medias.forEach(({ media }) => {
      accu.push({
        id: media.id,
        likeCount: media.like_count,
        commentsCount: media.comment_count,
        permalink: `https://www.instagram.com/p/${media.code}/`,
        shortcode: media.code,
        caption: media.caption ? media.caption.text : '',
        mediaUrl: getImage(media),
        source: hashtag,
      });
    });

    return accu;
  }, []);

  return items;
}

function getPostsFromGraphql(graphql, hashtag) {
  const { edges } = graphql.hashtag.edge_hashtag_to_media;

  if (!Array.isArray(edges) || !edges) {
    debug((`${hashtag}:NO_EDGES`));
    return [];
  }

  return edges.map(({ node: post }) => ({
    id: post.id,
    likeCount: post.edge_media_preview_like.count,
    commentsCount: post.edge_media_to_comment.count,
    permalink: `https://www.instagram.com/p/${post.shortcode}/`,
    shortcode: post.shortcode,
    caption: post.edge_media_to_caption.edges[0] && post.edge_media_to_caption.edges[0].node.text,
    mediaUrl: post.thumbnail_src,
    accessibility: post.accessibility_caption,
    mediaType: post.__typename, // eslint-disable-line no-underscore-dangle
    source: hashtag,
  }));
}

async function hashtagETL(hashtag, page) {
  const html = await getHTML(`https://www.instagram.com/explore/tags/${hashtag}/`, page);
  if (!html) {
    debug('NO_HTML');
    return [];
  }

  debug(html.slice(0, 500));

  if (html.includes('Oops, an error occurred')) {
    debug('ERROR');
    await page.screenshot({ path: `${getPublicPath()}/hashtag-error.png` });

    return [];
  }

  const loginRequired = await isLoginRequired(html, page);
  if (loginRequired) {
    debug(html.slice(0, 500));
    hasLoginNotificationSent = true;
    debug('LOGIN_REQUIRED');
    return [];
  }

  if (html.includes('Content Unavailable') || html.includes('Page Not Found • Instagram')) {
    await page.screenshot({ path: `${getPublicPath()}/hashtag-no-content.png` });

    return [];
  }

  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      const { graphql, data } = dom.window._sharedData.entry_data.TagPage[0]; // eslint-disable-line

      if (!graphql) {
        debug('NO_GRAPHQL');
      }

      const response = graphql
        ? getPostsFromGraphql(graphql, hashtag) : getPostsFromData(data, hashtag);

      debug(`posts: ${response.length}`);

      return resolve(response);
    };
  });
}

function getLocationExtended(data) {
  if (data.graphql) {
    return data.graphql.location;
  }

  if (data.native_location_data && data.native_location_data.location_info) {
    return data.native_location_data.location_info;
  }

  return false;
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
  if (!response) {
    debug('URL_ERROR');
    return null;
  }

  if (response.includes('Login • Instagram')) {
    debug('LOGIN');
    return null;
  }

  const rawData = await page.evaluate(() => JSON.parse(document.querySelector('body').innerText));

  const rawLocationExtended = getLocationExtended(rawData);

  const location = {
    id: rawLocation.id,
    name: rawLocation.name,
    slug: rawLocation.slug,
    hasPublicPage: rawLocation.has_public_page,
    address: rawLocation.address_json,
  };

  if (rawLocationExtended) {
    location.phone = rawLocationExtended.phone;
    location.aliasOnFB = rawLocationExtended.primary_alias_on_fb;
    location.website = rawLocationExtended.website;
    location.blurb = rawLocationExtended.blurb;

    if (rawLocationExtended.lat && rawLocationExtended.lng) {
      location.gps = {
        type: 'Point',
        coordinates: [rawLocationExtended.lng, rawLocationExtended.lat],
      };
    }
  }

  await Location(location).save();

  return location;
}

async function postETL(post, page) {
  const postURL = `https://www.instagram.com/graphql/query/?query_hash=2c4c2e343a8f64c625ba02b2aa12c7f8&variables=%7B%22shortcode%22%3A%22${post.shortcode}%22%2C%22child_comment_count%22%3A3%2C%22fetch_comment_count%22%3A40%2C%22parent_comment_count%22%3A24%2C%22has_threaded_comments%22%3Atrue%7D`;
  const response = await getHTML(postURL, page);
  if (!response) {
    debug('URL_ERROR');
    return {};
  }

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

    if (location) {
      postExtended.location = location;
    }
  }

  return postExtended;
}

const blockedUsers = [
  'sal35r',
  'feedmetj',
  'gomez_bc',
  'petcornn',
  'nenny_luv',
  'muz_greens',
  'gochimusic',
  'geekchictj',
  'arianneglr',
  'xeniaodette',
  'tegajewelry',
  've_que_rico',
  'abbas_house',
  'depasaditasm',
  'nutrifittt92',
  'chefmexicana',
  'foodiesalvaje',
  'aguaselcamino',
  'bajamarklaser',
  'davebaptiste_',
  'mexicalicious',
  'cocina_garivez',
  '_yanetsalgado_',
  'elmakeupdemama',
  'yosoyangelomar',
  'clubtengohambre',
  'isabel__dlvga__',
  'fina_reposteria_',
  'el.pulgas.treats',
  'lizethbajaestate',
  'better_call_pepe',
  'nedelkamartinsen',
  'constanzafregoso',
  'dentaldrcoronado',
  'damianreyes_price',
  'rosariocano_drums',
  'mcpublicrelations',
  'lash_extencioness',
  'marsanchez_studio',
  'productos_rosarito',
  'abbaswellnessmarket',
  'machobarbershop.spa',
  'ninas-house-spa-deli',
  'nutri_foodies_tijuana',
  'trendyshoponline_tijuana',
  'nutriologajoselinalvarez',
  'victoria.joyeria.mexicana',
  'alansalas_marketingdigital',
];

function isUserBlocked(username) {
  return blockedUsers.includes(username);
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

    if (isUserBlocked(user.username)) {
      debug(`${hashtag}:user_not_allowed:${user.username}`);
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

    const labels = await getLabels(post);
    if (labels && Array.isArray(labels.Labels) && labels.Labels.length) {
      postExtended.labels = labels.Labels.map(({ Confidence, Name }) => ({
        confidence: Confidence,
        name: Name,
      }));
    }

    const topics = getTopics(post);
    if (Array.isArray(topics) && topics.length) {
      postExtended.topics = topics;
    }

    if (!isProduction) {
      debug(postExtended);
    }

    count += 1;

    await Post.findOneAndUpdate({ id: postExtended.id }, postExtended, { // eslint-disable-line
      upsert: true,
    });

    debug(`${hashtag}:post_saved:${post.id}:${count}/${posts.length}`);

    await waiter();

    return null;
  });
}

async function main(page) {
  debug('============ start ============');

  if (hasLoginNotificationSent) {
    return debug('SKIP_RUN_:(');
  }

  const data = config.get('instagram.hashtags').split(',');
  const hashtags = isProduction ? data : data.slice(0, 1);

  await mapSeries(hashtags, async (hashtag) => {
    if (hasLoginNotificationSent) {
      return debug('SKIP_RUN_:(');
    }
    const postsFromHashtag = await hashtagETL(hashtag, page);
    await waiter();

    debug(`${hashtag}:postsFromHashtag:${postsFromHashtag.length}`);

    const posts = isProduction ? postsFromHashtag : postsFromHashtag.slice(0, 1);
    await extendPostsAndSave(posts, page, hashtag);
  });

  return debug('============ done ============');
}

module.exports = main;
