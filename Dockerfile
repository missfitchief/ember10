FROM node:24.17.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
USER node
EXPOSE 4310
CMD ["npm", "run", "api"]
