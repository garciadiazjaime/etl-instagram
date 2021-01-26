const mongoose = require('mongoose')

const Schema = mongoose.Schema;

const UserSchema = new mongoose.Schema({
  id: { type: String },
  username: { type: String },
  fullName: { type: String },
  profilePicture: { type: String },
  followedBy: { type: String },
  postsCount: { type: String },
}, {
  timestamps: true
})

const AddressSchema = new mongoose.Schema({
  street: { type:String },
  zipCode: { type: String },
  city: { type: String },
  country: { type: String },
})

const LocationSchema = new mongoose.Schema({
  id: { type:String },
  name: { type: String },
  slug: { type: String },
  gps: {
    type: { type: String },
    coordinates: { type: [], default: undefined }
  },
  address: AddressSchema,
}, {
  timestamps: true
})

LocationSchema.index({ gps: "2dsphere" });

const PostSchema = new Schema({
  id: String,
  likeCount: Number,
  commentsCount: Number,
  permalink: String,
  caption: String,
  mediaUrl: String,
  mediaType: String,
  source: String,
  accessibility: String,

  user: UserSchema,
  location: LocationSchema,
}, {
  timestamps: true
});

const Post = mongoose.model('post', PostSchema);
const Location = mongoose.model('location', LocationSchema);
const User = mongoose.model('user', UserSchema);

module.exports = {
  Post,
  Location,
  User,
}
