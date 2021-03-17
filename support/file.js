const fs = require('fs')

function getPublicPath() {
  const path = './public';

  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }

  return path
}

module.exports = {
  getPublicPath
}
