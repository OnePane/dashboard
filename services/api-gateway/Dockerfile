FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
RUN npm install --omit=dev
COPY packages/contracts packages/contracts
COPY services/api-gateway services/api-gateway
EXPOSE 3000
CMD ["npm", "--workspace", "@onepane/api-gateway", "run", "start"]
