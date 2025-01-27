const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  account: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String },
  type: { type: String, enum: ['imap', 'gmail', 'outlook'], required: true },
  state: { type: String, enum: ['init', 'connected', 'error'], required: true },
  path: [{ type: String }],
  subconnections: [{ type: String }],
  webhooks: { type: String },
  copy: { type: Boolean },
  logs: { type: Boolean, default: false },
  notifyFrom: { type: Date, default: Date.now },
  proxy: { type: String },
  smtpEhloName: { type: String },
  imapIndexer: { type: String, enum: ['full', 'fast'] },
  imap: {
    auth: {
      user: { type: String, required: true },
      pass: { type: String, required: true },
    },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, required: true },
  },
  smtp: {
    auth: {
      user: { type: String, required: true },
      pass: { type: String, required: true },
    },
    host: { type: String, required: true },
    port: { type: Number, required: true },
    secure: { type: Boolean, required: true },
  },
  oauth2: {
    clientId: { type: String },
    clientSecret: { type: String },
    redirectUri: { type: String },
    refreshToken: { type: String },
  },
  webhooksCustomHeaders: [
    {
      key: { type: String },
      value: { type: String },
    },
  ],
  locale: { type: String },
  tz: { type: String },
  accessToken: { type: String },
  refreshToken: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Account', accountSchema);