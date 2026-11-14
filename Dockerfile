FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production TRUST_PROXY=1 PORT=8787 DATA_DIR=/var/lib/sealed-paper
RUN mkdir -p /var/lib/sealed-paper && chown node:node /var/lib/sealed-paper
USER node
EXPOSE 8787
CMD ["node", "server/index.js"]
