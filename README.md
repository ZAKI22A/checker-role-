# Kiliua Checker

Discord security intelligence platform — permission checker, staff tracker & voice intelligence bot.

## Features

- **Staff Permission Scanner** — Scans Discord servers for staff/admin permissions using slash commands and selfbot API
- **Voice State Tracking** — Real-time voice channel monitoring and intelligence
- **Role Auditor** — Tracks role changes, auto-strips dangerous roles from new members
- **Dashboard** — Web-based dashboard for monitoring and configuration
- **Multi-Bot Support** — Manage multiple Discord bots from a single instance
- **Webhook Scanner** — Python-based webhook scanning utility

## Tech Stack

- **Backend**: Node.js (Express)
- **Discord**: discord.js v14 + discord.js-selfbot-v13
- **Process Manager**: PM2

## Setup

### Prerequisites

- Node.js v16+
- npm
- A Discord bot token
- A Discord user token (for selfbot scanner)

### Installation

```bash
# Clone the repository
git clone https://github.com/ZAKI22A/checker-role-.git
cd checker-role-

# Install dependencies
npm install

# Configure your settings
# Copy .env.example to .env and fill in your tokens securely:
cp .env.example .env
# Or edit config.json with your settings
```

### Configuration (.env or config.json)

You can configure the bot using a `.env` file (recommended, never committed to git) or `config.json`:

```env
MAIN_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
MAIN_BOT_ID=YOUR_BOT_ID_HERE
CHECKER_USER_TOKEN=YOUR_CHECKER_USER_TOKEN_HERE
FALLBACK_USER_TOKEN=YOUR_FALLBACK_USER_TOKEN_HERE
CHECKER_USER_ID=YOUR_CHECKER_USER_ID_HERE
OWNER_IDS=YOUR_DISCORD_USER_ID
PORT=4567
```

### Running & Hosting

```bash
# Start both bot and checker
npm start

# Or using PM2 for VPS / 24/7 background hosting
pm2 start ecosystem.config.js

# Or using Docker
docker-compose up -d --build
```

> 📖 **Full Hosting Guide**: Check [HOSTING.md](HOSTING.md) for detailed instructions on deploying to **Railway**, **Render**, **Docker**, and **Linux VPS**.

## Project Structure

```
├── bot.js              # Main Discord bot (commands, embeds, tracking)
├── checker.js          # Express API server (scanner engine)
├── index.js            # Launcher
├── config.json         # Configuration (tokens, IDs, settings)
├── database.json       # Runtime database (user tokens, roles)
├── ecosystem.config.js # PM2 process manager config
├── webhook_scanner/
│   └── scanner.py      # Python webhook scanner
└── custom_emojis/
    └── emojis.json     # Custom emoji mappings
```

## Commands

| Command | Description |
|---------|-------------|
| `+staff <server_id>` | Scan server for staff permissions |
| `+cr <@user\|id>` | Check user roles and permissions |
| `+stafftrack <server_id>` | Start tracking server staff changes |
| `+voice <@user\|id>` | Check user voice state |
| `+perms <server_id> <@user\|id>` | Check user permissions |
| `+servers` | List linked servers |
| `+addbot <token>` | Add a bot for management |
| `+help` | Show all commands |

## Important Notes

- **Selfbot Usage**: This project uses `discord.js-selfbot-v13` for user token-based scanning. This is against Discord's Terms of Service and may result in account termination. Use at your own risk.
- **Security**: Never share your tokens. The config files in this repo are sanitized with placeholder values.
- **Environment**: Set `NODE_ENV=production` for production deployments.

## License

Private — All rights reserved.
