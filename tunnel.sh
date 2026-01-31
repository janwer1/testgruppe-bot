#!/usr/bin/env bash

# Start cloudflared and pipe output to extract the URL
# We use a while loop to keep the output visible and react to the URL line
cloudflared tunnel --url http://localhost:8787 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ $line =~ (https://[a-z0-9-]+\.trycloudflare\.com) ]]; then
        url="${BASH_REMATCH[1]}"
        echo "Updating .env with new tunnel URL: $url"
        sed -i '' "s|LOCAL_TUNNEL_URL=.*|LOCAL_TUNNEL_URL=$url|" .env
    fi
done
