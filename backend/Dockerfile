FROM node:20-alpine

# Install build tools needed for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy dependency manifests first (layer caching)
COPY package*.json ./

# Install all dependencies (including devDeps needed for tsx/build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript → JS
RUN npm run build

# Create data directory for SQLite persistence
RUN mkdir -p /data

# Expose the port Railway will assign (via PORT env var)
EXPOSE 3001

# Run the compiled backend
CMD ["node", "dist/index.js"]
