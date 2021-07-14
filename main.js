const express = require('express');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fetch = require('node-fetch');
const debug = require('debug')('app:main');

const hashtagETL = require('./module/instagram/posts-from-hashtags');
const elimparcial = require('./module/news/elimparcial');
const eldolar = require('./module/dolar/eldolar');
const loginETL = require('./module/instagram/login');
const { openDB } = require('./support/database');
const { getPage } = require('./support/fetch');
const config = require('./config');

const API_URL = config.get('api.url');
const PORT = config.get('port');

const isProduction = config.get('env') === 'production';

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('combined'));
app.use(express.static('public'));

app.get('/', (req, res) => res.json({ msg: ':)' }));

function setupCron(page) {
  if (!isProduction) {
    return debug('CRON_NOT_SETUP');
  }

  cron.schedule('42 */2 * * *', async () => {
    await hashtagETL(page);

    await eldolar();
  });

  cron.schedule('42 */4 * * *', async () => {
    await elimparcial();
  });

  cron.schedule('*/20 * * * *', async () => {
    await fetch(API_URL);
  });

  return debug('CRON_SETUP');
}

app.listen(PORT, async () => {
  debug(`Listening on ${PORT}`);

  await openDB();
  debug('DB opened');

  const cookies = isProduction ? await loginETL() : {};
  if (!cookies) {
    return debug('NO_COOKIES');
  }

  const page = await getPage(cookies);

  setupCron(page);

  await hashtagETL(page);

  // await elimparcial();

  // await eldolar()
});
