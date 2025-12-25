require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'inboxengine',
      script: './src/server.js',
      instances: 'max',  // Use all CPU cores
      exec_mode: 'cluster',  // Cluster mode for load balancing
      watch: false,
      max_memory_restart: '1G',
      instance_var: 'INSTANCE_ID',  // Unique ID per instance
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3000,
        MONGO_URI: process.env.MONGO_URI,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
        JWT_SECRET: process.env.JWT_SECRET,
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: process.env.PORT || 3000,
        MONGO_URI: process.env.MONGO_URI,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
        MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
        MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
        MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
        JWT_SECRET: process.env.JWT_SECRET,
      },
      node_args: '--inspect=9229',  // Debug port (PM2 auto-increments per instance)
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};

