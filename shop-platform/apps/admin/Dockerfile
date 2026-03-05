FROM node:20-alpine AS base
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY apps/admin/package.json apps/admin/package.json
RUN npm install
COPY . .
RUN npm run build -w @gptishka/admin

FROM node:20-alpine
WORKDIR /app
COPY --from=base /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@gptishka/admin"]
