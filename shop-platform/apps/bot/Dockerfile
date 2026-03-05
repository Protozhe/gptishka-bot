FROM node:20-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/bot/package.json apps/bot/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm install
COPY . .
RUN npm run build -w @gptishka/config && npm run build -w @gptishka/bot

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app /app
CMD ["npm", "run", "start", "-w", "@gptishka/bot"]
