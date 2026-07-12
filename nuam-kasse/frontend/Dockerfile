FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html .
COPY public ./public
COPY src ./src
COPY tests ./tests
COPY tsconfig.json tsconfig.node.json vite.config.ts ./

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_APP_VERSION=0.7.0
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
