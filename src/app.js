const express = require('express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const accountRoutes = require('./routes/accountRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('../swagger.json'); // Import Swagger config
const app = express();

// Middleware
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/api/accounts', accountRoutes);

module.exports = app;