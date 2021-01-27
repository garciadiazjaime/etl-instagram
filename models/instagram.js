const mongoose = require('mongoose');

const { Schema } = mongoose;

const UserSchema = new mongoose.Schema({
  id: { type: String },
  username: { type: String },
  fullName: { type: String },
  profilePicture: { type: String },
  followedBy: { type: String },
  postsCount: { type: String },
}, {
  timestamps: true,
});

const LocationSchema = new mongoose.Schema({
  id: { type: String },
  name: { type: String },
  slug: { type: String },
  hasPublicPage: { type: String },
  gps: {
    type: { type: String },
    coordinates: { type: [], default: undefined },
  },
  address: { type: String },
  phone: { type: String },
  aliasOnFB: { type: String },
  website: { type: String },
}, {
  timestamps: true,
});

LocationSchema.index({ gps: '2dsphere' });

const PostSchema = new Schema({
  id: String,
  likeCount: Number,
  commentsCount: Number,
  permalink: String,
  shortcode: String,
  caption: String,
  mediaUrl: String,
  mediaType: String,
  source: String,
  accessibility: String,

  user: UserSchema,
  location: LocationSchema,
}, {
  timestamps: true,
});

const Post = mongoose.model('post', PostSchema);
const Location = mongoose.model('location', LocationSchema);
const User = mongoose.model('user', UserSchema);

module.exports = {
  Post,
  Location,
  User,
};
