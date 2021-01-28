const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fetch = require('node-fetch');
const debug = require('debug')('app:main');

const hashtagETL = require('./module/hashtag');
const postETL = require('./module/post');
const loginETL = require('./module/login');
const { openDB } = require('./support/database');
const { getPage } = require('./support/fetch');
const config = require('./config');

const API_URL = config.get('api.url');
const PORT = config.get('port');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('combined'));

app.get('/', (req, res) => res.json({ msg: ':)' }));

function setupCron(page) {
  if (config.get('env') !== 'production') {
    return debug('CRON_NOT_SETUP');
  }

  cron.schedule('42 */4 * * *', async () => {
    await hashtagETL(page);
  });

  cron.schedule('50 */6 * * *', async () => {
    await postETL(page);
  });

  cron.schedule('*/20 * * * *', async () => {
    await fetch(API_URL);
  });

  return null;
}

app.listen(PORT, async () => {
  debug(`Listening on ${PORT}`);

  await openDB();
  debug('DB opened');

  const cookies = await loginETL();

  const page = await getPage(cookies);

  await postETL(page);

  setupCron(page);
});
