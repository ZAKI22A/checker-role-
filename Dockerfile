FROM node:20-bookworm-slim

# Install system dependencies required for canvas and native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./

# Install npm dependencies
RUN npm ci --omit=dev || npm install --omit=dev

# Copy application files
COPY . .

# Expose checker port
EXPOSE 4567

# Start index.js (runs both checker and bot)
CMD ["node", "index.js"]
