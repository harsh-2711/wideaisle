FROM node:22-alpine

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# drizzle-kit runs migrations at start, so dev dependencies stay installed
# until the build is done, then are pruned.
RUN npm ci --ignore-scripts && npm cache clean --force

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
