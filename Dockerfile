FROM node:26-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV ENVIRONMENT=production
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV DATA_DIR=/tmp/agentauth

EXPOSE 8787
CMD ["npm", "run", "start:prod"]
