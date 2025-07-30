# frontend/Dockerfile

# 1) Use Node 20 so crypto.hash is available
FROM node:20-bullseye-slim

WORKDIR /app

# 2) Copy manifest & lockfile
COPY package.json package-lock.json ./

# 3) Install deps (including optional native bundles)
RUN npm ci --legacy-peer-deps

# 4) Copy source
COPY . .

# 5) Expose dev port
EXPOSE 3000

# 6) Run Vite in dev mode on all interfaces
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]