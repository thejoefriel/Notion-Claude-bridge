// PM2 ecosystem file (alternative to systemd)
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: "notion-bridge",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "256M",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
