FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /app/dist/ ./
RUN mkdir -p /app/data && chown node:node /app/data
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/leadloom.sqlite
USER node
EXPOSE 3000
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "src/main.mjs"]
