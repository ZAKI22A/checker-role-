module.exports = {
  apps: [
    {
      name: "Kiliua-Bot",
      script: "bot.js",
      watch: false,
      restart_delay: 5000,
      env: { NODE_ENV: "production" }
    },
    {
      name: "Kiliua-Checker",
      script: "checker.js",
      watch: false,
      restart_delay: 5000,
      env: { NODE_ENV: "production" }
    }
  ]
};