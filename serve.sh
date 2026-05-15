#!/bin/bash
cd /home/z/my-project

# Start Next.js
node node_modules/.bin/next dev -p 3001 &
NEXT_PID=$!

# Wait for it to be ready
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:3001/ 2>/dev/null; then
    break
  fi
  sleep 1
done

# Start proxy
node ipv4-proxy.mjs &

# Wait for all background jobs
wait
