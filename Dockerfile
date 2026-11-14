FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=8787 DATA_DIR=/var/lib/appeal
RUN mkdir -p /var/lib/appeal && chown node:node /var/lib/appeal
USER node
EXPOSE 8787
CMD ["node", "server/index.js"]
