const express = require('express')
const morgan = require('morgan')
const bodyParser = require('body-parser');
const cron = require('node-cron');
const fetch = require('node-fetch');
const debug = require('debug')('app:main');

const hashtagETL = require('./module/hashtag')
const postETL = require('./module/post')
const config = require('./config');

const API_URL = config.get('api.url')
const PORT = config.get('port')

let app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('combined'))

app.get('/', (req, res) => {
  return res.json({ msg: ':)' })
})

function setupCron() {
  if (config.get('env') !== 'production') {
    return debug('CRON_NOT_SETUP')
  }

  cron.schedule('42 */4 * * *', async () => {
    await hashtagETL();
  });

  cron.schedule('50 */6 * * *', async () => {
    await postETL();
  });

  cron.schedule('*/20 * * * *', async () => {
    await fetch(API_URL);
  });
}

app.listen(PORT, async () => {
  debug(`Listening on ${ PORT }`)

  setupCron()
})
