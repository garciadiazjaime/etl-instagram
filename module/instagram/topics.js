const debug = require('debug')('app:topics');

const LDA = require('./lda');

function getTopics(post) {
  const terms = 7;
  const {
    caption,
    accessibility,
    user,
    id,
    location,
  } = post;

  const content = [caption || ''];

  if (accessibility) {
    content.push(accessibility);
  }

  if (user && user.fullName) {
    content.push(user.fullName);
  }

  if (location && location.name) {
    content.push(`${location.name}.`);
  }

  const documents = content.join('.').match(/[^\.!\?]+[\.!\?]+/g);
  const [topics] = LDA(documents, 1, terms, ['es']);

  if (!topics) {
    debug(`NO_TOPICS:${id}`);
    return [];
  }

  return topics.reduce((accu, {
    term,
    probability,
  }) => {
    accu.push({
      confidence: probability * 100,
      name: term,
    });

    return accu;
  }, []);
}

module.exports = {
  getTopics,
};
