const mongoose = require('mongoose');
const { validateAccountBeforeSave, verifyAccountCallback } = require('../callbacks/accountCallback');
const { sendEmailFromGoogle} = require('../util/sendEmail');

const accountSchema = new mongoose.Schema({
  account: { type: String },
  name: { type: String, required: true },
  email: { type: String },
  type: { type: String, enum: ['imap', 'gmail', 'outlook'], required: true },
  state: { type: String, enum: ['init', 'connected', 'error'] },
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
      user: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: 'IMAP auth.user is required when oauth2.authorize is false',
        },
      },
      pass: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: 'IMAP auth.pass is required when oauth2.authorize is false',
        },
      },
    },
    host: {
      type: String,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: 'IMAP host is required when oauth2.authorize is false',
      },
    },
    port: {
      type: Number,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: 'IMAP port is required when oauth2.authorize is false',
      },
    },
    secure: {
      type: Boolean,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || value !== undefined;
        },
        message: 'IMAP secure is required when oauth2.authorize is false',
      },
    },
  },
  smtp: {
    auth: {
      user: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: 'SMTP auth.user is required when oauth2.authorize is false',
        },
      },
      pass: {
        type: String,
        validate: {
          validator: function (value) {
            return this.oauth2.authorize !== true || !!value;
          },
          message: 'SMTP auth.pass is required when oauth2.authorize is false',
        },
      },
    },
    host: {
      type: String,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: 'SMTP host is required when oauth2.authorize is false',
      },
    },
    port: {
      type: Number,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || !!value;
        },
        message: 'SMTP port is required when oauth2.authorize is false',
      },
    },
    secure: {
      type: Boolean,
      validate: {
        validator: function (value) {
          return this.oauth2.authorize !== true || value !== undefined;
        },
        message: 'SMTP secure is required when oauth2.authorize is false',
      },
    },
  },
  oauth2: {
    authorize: { type: Boolean },
    clientId: { type: String },
    clientSecret: { type: String },
    redirectUri: { type: String },
    tokens: { type: Object },
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

// module.exports = mongoose.model('Account', accountSchema);



accountSchema.pre('save', async function (next) {
  // throw new Error('something went wrong');



  try {
    const result = await verifyAccountCallback(this);

    if (result.success) {
      this.state = 'connected';
    } else {
      this.state = 'error';
      this.smtpEhloName = result.message; // Store error message in `smtpEhloName`
    }

    next();
  } catch (err) {
    next(err);
  }

});

accountSchema.post("save", async function (account) {
  try {
    if (account.type == "gmail" || account.type == "outlook") {
      await sendEmailFromGoogle(
        account.oauth2.tokens?.access_token,
        account.email,
        "muskantomar48@gmail.com"
      );
    } else {
      await sendEmailWithSMTP(account, "muskantomar48@gmail.com");
    }
  
  } catch (error) {
   
  }
});



module.exports = mongoose.model('Account', accountSchema);