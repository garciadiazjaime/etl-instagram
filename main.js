const cron = require('node-cron');

const etl = require('./module/hashtag')

async function main() {
  cron.schedule('42 */4 * * *', async () => {
    await etl();
  });
}

main()
