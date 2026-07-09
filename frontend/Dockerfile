# Etapa 1: build do SPA (Vite)
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# URL da API embutida no bundle. Padrão "/api": mesma origem, servida pelo
# nginx desta imagem que faz proxy para o backend (evita CORS).
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Etapa 2: nginx servindo os estáticos + proxy /api -> backend
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
