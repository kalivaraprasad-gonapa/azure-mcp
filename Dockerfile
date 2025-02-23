#Build stage
FROM node:18-alpine AS build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install -g typescript && \
    npm install --include=dev

# Copy source files
COPY . .

# Use npx explicitly to run the TypeScript compiler
RUN tsc

RUN ls -li

#Production stage
FROM node:18-alpine AS production

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY --from=build /app/dist ./dist

CMD ["node", "dist/launcher.js"]