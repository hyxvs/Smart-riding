FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm config set registry https://registry.npmmirror.com && npm install --only=production

COPY . .

EXPOSE 3002

CMD ["npm", "start"]