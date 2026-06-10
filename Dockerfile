############################
# Stage 1: Build
############################
FROM node:20-slim AS builder

# Install build tools required by better-sqlite3 (native module)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend package manifests
COPY backend/package*.json ./

# Install all deps (including devDeps for TypeScript build)
RUN npm install

# Copy backend source
COPY backend/ .

# Compile TypeScript
RUN npm run build

############################
# Stage 2: Production image
############################
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /data

ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "dist/index.js"]
