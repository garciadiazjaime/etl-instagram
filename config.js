const convict = require('convict');

// Define a schema
const config = convict({
  env: {
    doc: 'The applicaton environment.',
    format: ['production', 'development', 'test'],
    default: 'development',
    env: 'NODE_ENV',
  },
  port: {
    doc: 'The applicaton port environment.',
    default: '3030',
    env: 'PORT',
  },
  db: {
    url: {
      doc: 'Database host name/IP',
      format: '*',
      default: 'mongodb://localhost:27017/rve',
      env: 'DB_URL',
    },
  },
  api: {
    url: {
      doc: 'API URL',
      format: String,
      default: 'http://127.0.0.1:3030',
      env: 'API_URL',
    },
  },
  instagram: {
    username: {
      env: 'INSTAGRAM_USERNAME',
      default: '',
    },
    password: {
      default: '',
      env: 'INSTAGRAM_USER_PASSWORD',
    },
    hashtags: {
      default: '',
      env: 'INSTAGRAM_HASHTAGS',
    },
  },
  sendgrid: {
    doc: 'Email app',
    default: '',
    env: 'SENDGRID_API_KEY',
  },
  aws: {
    key: {
      env: 'AWS_KEY',
      default: '',
    },
    secret: {
      default: '',
      env: 'AWS_SECRET',
    },
    region: {
      default: '',
      env: 'AWS_REGION',
    },
  },
});

// Perform validation
config.validate({ allowed: 'strict' });

module.exports = config;
