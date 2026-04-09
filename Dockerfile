FROM node:20-slim

# Install system deps
RUN apt-get update && apt-get install -y curl python3 python3-pip ca-certificates && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install uv (which gives you uvx)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

WORKDIR /app

# Install Node deps
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]
