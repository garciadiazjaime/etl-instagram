const mongoose = require('mongoose');

const { Schema } = mongoose;

const RateSchema = new Schema({
  entity: { type: String, required: true },
  url: { type: String, required: true },
  buy: { type: Number, required: true },
  sell: { type: Number, required: true },
  source: { type: String, required: true },
  createdAt: { type: Date, required: true }
});

const Rate = mongoose.model('rate', RateSchema);

module.exports = {
  Rate,
};
