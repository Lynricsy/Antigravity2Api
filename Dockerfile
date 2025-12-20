# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

# Optional deps for proxy support (see src/utils/proxy.js)
RUN npm install --no-save --no-package-lock undici node-fetch https-proxy-agent socks-proxy-agent

COPY src ./src
COPY README*.md ./

RUN mkdir -p /app/auths /app/log

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/server.js"]

