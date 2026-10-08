FROM node:22-alpine

EXPOSE 3000

WORKDIR /app

COPY package.json package-lock.json* ./

# Dev dependencies are needed for the build, then pruned. Migrations at start
# use drizzle-orm's migrator (scripts/migrate.mjs), not drizzle-kit.
RUN npm ci --ignore-scripts

COPY . .

RUN npm run build && npm prune --omit=dev && npm cache clean --force

ENV NODE_ENV=production

CMD ["npm", "run", "docker-start"]
