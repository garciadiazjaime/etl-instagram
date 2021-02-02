const mongoose = require('mongoose');

const { Schema } = mongoose;

const NewsSchema = new Schema({
  description: [],
  image: String,
  source: { type: String, required: true },
  title: { type: String, required: true },
  url: { type: String, required: true, unique: true },
}, {
  timestamps: true,
});

const News = mongoose.model('news', NewsSchema);

module.exports = {
  News,
};
