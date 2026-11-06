# Development image for the API (used by docker-compose.yml)
FROM node:22-bookworm-slim

# Prisma's query engine needs OpenSSL; the build tools let bcrypt compile
# its native module if no prebuilt binary can be downloaded
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3001

# Apply any pending migrations, then start with auto-reload
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
