# =============================================================================
# Dockerfile — Vogo Chatbot (Node.js + Express)
# =============================================================================
FROM node:20-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files first (Docker layer caching optimization)
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev --no-audit --no-fund

# Copy application source
COPY config/       ./config/
COPY server/       ./server/
COPY public/       ./public/
COPY publicuploads/ ./publicuploads/
COPY chatbot.ini   ./
COPY model.nlp     ./

# Create required directories
RUN mkdir -p public/uploads logs

# Expose chatbot port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the server
CMD ["node", "server/server.js"]
