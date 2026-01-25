#!/bin/bash
source .env
curl      -F "url=https://testgruppe-bot.vercel.app/api/bot" \
     -F "secret=$WEBHOOK_SECRET_TOKEN" \
     "https://api.telegram.org/bot$BOT_TOKEN/setWebhook"
