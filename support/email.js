const sgMail = require('@sendgrid/mail')

const config = require('../config');

sgMail.setApiKey(config.get('sendgrid'))

const params = {
  to: 'info@mintitmedia.com', // Change to your recipient
  from: 'info@mintitmedia.com', // Change to your verified sender
  subject: 'etl-instagram',
  text: '',
  html: '',
}


async function sendEmail (msg) {
  return sgMail.send({
    ...params,
    text: msg,
    html: msg,
  })
}


module.exports = {
  sendEmail
}
