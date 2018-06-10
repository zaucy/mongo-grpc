FROM node:8

WORKDIR /mongo-grpc

COPY package.json yarn.lock ./
RUN yarn --pure-lockfile --production
COPY ./ ./
RUN chmod +x /mongo-grpc/node/cli.js

ENTRYPOINT ["/mongo-grpc/node/cli.js"]
