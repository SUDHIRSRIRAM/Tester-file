module.exports = {
  apps: [{
    name: "bgremoval",
    script: "vite",
    args: "--port 8080",
    instances: "max",
    exec_mode: "cluster",
    watch: false,
    env: {
      NODE_ENV: "production",
      VITE_COMPRESSION_ENABLED: "true",
      VITE_MAX_WORKERS: "4"
    }
  }]
};
