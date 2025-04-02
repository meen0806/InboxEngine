const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const accountRoutes = require('./routes/accountRoutes');
// const accountRoutes = require('./routes/accountRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../swagger.json'); // Import Swagger config
const oauthRoutes = require('./routes/oauthRoutes'); // Import OAuth routes
const mailboxRoutes = require('./routes/mailboxRoutes'); // Import OAuth routes
const outlookRoutes=require("./routes/outlookRoutes")
const cors=require("cors")
const app = express();
const cronJob=require('./util/cronJob')


// Middleware
app.use(express.json());
app.use(morgan('dev'));

app.use(cors())
// Routes
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/accounts', accountRoutes);
app.use('/api/accounts', mailboxRoutes);
app.use('/api/oauth', oauthRoutes);
app.use("/api/outlook",outlookRoutes)

module.exports = app;