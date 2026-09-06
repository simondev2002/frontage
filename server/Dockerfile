FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PORT=5150 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 5150
CMD ["node", "src/index.js"]
