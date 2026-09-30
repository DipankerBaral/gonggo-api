# Small official Node image based on Alpine Linux
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Copy only the dependency files first. Docker caches each step, so as long as
# package*.json don't change, rebuilds skip the npm install and are much faster.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Now copy the app code (tests and dev tools stay out; see .dockerignore)
COPY src ./src

# Don't run as root inside the container: the node image ships a "node" user
USER node

EXPOSE 3000

# Docker checks this to decide if the container is healthy
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
