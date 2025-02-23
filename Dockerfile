# Use a Node.js image as the base image
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install TypeScript globally first, then install all dependencies
RUN npm install -g typescript && \
    npm install --include=dev

# Copy the rest of the application code
COPY . .


# Build the TypeScript code
RUN tsc

# Use a Node.js image for running the application
FROM node:18-alpine AS runner

# Set the working directory
WORKDIR /app

# Copy package files and install ALL dependencies (including tsx for running TS files)
COPY package*.json ./
RUN npm install --include=dev

# Copy the build output and source
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src

# Set the entrypoint to start the server
CMD ["npx", "tsx", "src/launcher.ts"]