# Backend Fastify (rodado via tsx, sem etapa de build)
FROM node:22-alpine

WORKDIR /app

# Instala dependências (inclui devDeps: o runtime usa tsx e o entrypoint usa drizzle-kit)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Código-fonte + migrations
COPY . .

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

RUN chmod +x docker-entrypoint.sh
ENTRYPOINT ["./docker-entrypoint.sh"]
