const fetch = require('node-fetch');
const { RekognitionClient, DetectLabelsCommand } = require('@aws-sdk/client-rekognition');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const debug = require('debug')('app:labels');
const config = require('../../config');

const bucket = 'jaimeg4-food3';

function download(uri) {
  return fetch(uri).then((res) => {
    if (!res.ok) {
      return debug(`unexpected response ${res.statusText}`);
    }

    return res.buffer();
  });
}

async function uploadImage(post) {
  const { mediaUrl, id } = post;
  debug(mediaUrl);

  const buffer = await download(mediaUrl);
  if (!buffer) {
    return null;
  }

  const awsConfig = {
    region: config.get('aws.region'),
  };
  const s3Client = new S3Client(awsConfig);

  const filename = `${id}.jpg`;
  const params = {
    Bucket: bucket,
    Key: filename,
    Body: buffer,
  };
  const command = new PutObjectCommand(params);

  try {
    await s3Client.send(command);
    return filename;
  } catch (err) {
    debug(err);
  }

  return null;
}

async function extractLabels(filename) {
  const params = {
    Image: {
      S3Object: {
        Bucket: bucket,
        Name: filename,
      },
    },
    MaxLabels: 10,
  };
  const command = new DetectLabelsCommand(params);

  const awsConfig = {
    region: config.get('aws.region'),
  };
  const rekognitionClient = new RekognitionClient(awsConfig);

  try {
    return rekognitionClient.send(command);
  } catch (err) {
    debug(err);
  }

  return null;
}

async function getLabels(post) {
  const filename = await uploadImage(post);
  if (!filename) {
    return null;
  }

  return extractLabels(filename);
}

module.exports = {
  getLabels,
};
