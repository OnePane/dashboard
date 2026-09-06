FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/accounts-service/package.json services/accounts-service/package.json
RUN npm install --omit=dev
COPY packages/contracts packages/contracts
COPY services/accounts-service services/accounts-service
EXPOSE 3001
CMD ["npm", "--workspace", "@onepane/accounts-service", "run", "start"]
