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
  blurb: { type: String },
}, {
  timestamps: true,
});

LocationSchema.index({ gps: '2dsphere' });

const LabelSchema = new Schema({
  confidence: Number,
  name: String,
});

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
  labels: [LabelSchema],
  topics: [LabelSchema],

  user: UserSchema,
  location: LocationSchema,
}, {
  timestamps: true,
});

const FollowerSchema = new mongoose.Schema({
  id: { type: String },
  username: { type: String },
  fullName: { type: String },
  profilePicture: { type: String },

  biography: { type: String },
  category_name: { type: String },
  following: { type: Number },
  followers: { type: Number },
  posts: { type: Number },
  is_business_account: { type: Boolean },
  is_professional_account: { type: Boolean },
  is_verified: { type: Boolean },
  media: [PostSchema],
}, {
  timestamps: true,
});

const Post = mongoose.model('post', PostSchema);
const Location = mongoose.model('location', LocationSchema);
const User = mongoose.model('user', UserSchema);
const Follower = mongoose.model('follower', FollowerSchema);

module.exports = {
  Post,
  Location,
  User,
  Follower,
};
