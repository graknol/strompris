FROM node:alpine
WORKDIR /app
COPY package.json /app
RUN npm install 2>&1
COPY . /app
CMD ["node","main.js"]