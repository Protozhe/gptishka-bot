FROM node:20-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/config/package.json packages/config/package.json
RUN npm install
COPY . .
RUN npm run build -w @gptishka/shared && npm run build -w @gptishka/config && npm run prisma:generate -w @gptishka/api && npm run build -w @gptishka/api

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app /app
EXPOSE 8080
CMD ["npm", "run", "start", "-w", "@gptishka/api"]
