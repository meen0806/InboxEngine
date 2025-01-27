require('dotenv').config(); // Load .env variables
const app = require('./app');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;

mongoose.connect('mongodb+srv://yogesh:MmXBBQFpxwBSqV7K@inboxengine.nlhqp.mongodb.net/?retryWrites=true&w=majority&appName=InboxEngine', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
  });