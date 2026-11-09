FROM node:24.22.2-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY server.js .

USER node
EXPOSE 8080
CMD ["node", "server.js"]
