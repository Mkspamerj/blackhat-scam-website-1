FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production 2>/dev/null || true
COPY . .
EXPOSE 80
ENV PORT=80
CMD ["node", "server.js"]
