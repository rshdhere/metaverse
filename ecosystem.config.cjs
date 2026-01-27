module.exports = {
  apps: [
    {
      name: "metaverse-client",
      cwd: "./apps/client",
      script: "bun",
      args: "run start -- -p 3001",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
      },
      autorestart: true,
      watch: false,
    },

    {
      name: "metaverse-server",
      cwd: "./apps/server",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        BACKEND_PORT: "8082",
      },
      autorestart: true,
      watch: false,
    },
  ],
};

