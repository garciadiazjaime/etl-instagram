const fs = require('fs');
const mapSeries = require('async/mapSeries');
const jsdom = require('jsdom');
const debug = require('debug')('app:post');

const locationETL = require('./location')
const { Post } = require('../models/instagram')
const { openDB } = require('../support/database')
const { waiter, getHTML } = require('../support/fetch');
const config = require('../config');

const { JSDOM } = jsdom;

const isProduction = config.get('env') === 'production'
const stubShortcode = 'CKfDyQDgl6W'

async function extract(cookies, permalink) {
  if (!isProduction) {
    return fs.readFileSync('./stubs/instagram-post.html', 'utf8');
  }

  return getHTML(permalink, cookies);
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
    }
  }

  if (data.location) {
    response.location = {
      id: data.location.id,
      name: data.location.name,
      slug: data.location.slug,
      hasPublicPage: data.location.has_public_page,
      address: data.location.address_json,
    }
  }

  return response
}

async function transform(html, shortcode) {
  return new Promise((resolve) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable' });

    dom.window.onload = () => {
      
      const response = getPostUpdated(dom.window.__additionalData[`/p/${shortcode}/`].data.graphql.shortcode_media)

      resolve(response);
    };
  });
}

async function main(cookies) {
  await openDB()

  const limit = 40
  const posts = await Post.find({user: { $exists: 0}}).limit(limit)

  debug(`processing ${posts.length}`)

  await mapSeries(posts.slice(0, 1), async (post) => {
    const html = await extract(cookies, post.permalink)

    const shortcode = !isProduction ? stubShortcode : post.shortcode 

    const data = await transform(html, shortcode)

    if (data.location) {
      const locationExtra = await locationETL(cookies, data.location)

      data.location = {
        ...data.location,
        ...locationExtra
      }
    }

    await Post.findOneAndUpdate({ id: data.id }, data, {
      upsert: true,
    })

    await waiter()
  })
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  });
}

module.exports = main;
