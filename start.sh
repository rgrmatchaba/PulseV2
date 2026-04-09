#!/bin/bash
set -e

echo "Starting Atlassian MCP server..."
uvx mcp-atlassian \
  --transport streamable-http \
  --port 8080 &

# Wait for MCP server to be ready
echo "Waiting for MCP server on port 8080..."
until curl -sf http://localhost:8080/health > /dev/null 2>&1; do
  sleep 1
done
echo "MCP server ready."

echo "Starting Next.js..."
exec npm start
