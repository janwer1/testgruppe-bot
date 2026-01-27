import "dotenv/config";

async function getWebhook() {
    const { createBot } = await import("../bot");
    const bot = createBot();

    console.log("🔍 Fetching webhook info from Telegram...");
    const info = await bot.api.getWebhookInfo();

    console.log("\n--- Webhook Status ---");
    console.log(JSON.stringify(info, null, 2));
    console.log("----------------------\n");

    if (info.url) {
        console.log(`✅ Webhook is ACTIVE: ${info.url}`);
    } else {
        console.log("ℹ️  No webhook set (using long polling or inactive)");
    }
}

async function setupWebhook(force = false) {
    const { env } = await import("../env");
    const isCI = process.env.CI === "true" || process.env.CF_PAGES === "1";

    if (!isCI && !force) {
        console.log("ℹ️ Skipping webhook setup (not running in CI). Use --force to override.");
        return;
    }

    if (!env.BOT_TOKEN) {
        throw new Error("BOT_TOKEN is missing from environment");
    }

    const baseUrl = env.PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error("PUBLIC_BASE_URL is missing. Cannot set webhook. Example: https://bot.example.com");
    }

    const { createBot } = await import("../bot");
    const bot = createBot();
    const webhookUrl = `${baseUrl}${env.WEBHOOK_PATH}`;

    console.log(`🚀 Setting webhook to: ${webhookUrl}`);

    const result = await bot.api.setWebhook(webhookUrl, {
        secret_token: env.WEBHOOK_SECRET_TOKEN,
        drop_pending_updates: true,
    });

    if (result) {
        console.log(`✅ Webhook set successfully!`);
        const info = await bot.api.getWebhookInfo();
        console.log("\n--- Telegram Webhook Info ---");
        console.log(JSON.stringify(info, null, 2));
        console.log("-----------------------------\n");
    } else {
        throw new Error("Telegram API returned false for setWebhook");
    }
}

async function testWebhook() {
    const { env } = await import("../env");
    const baseUrl = env.PUBLIC_BASE_URL || "http://localhost:8787";
    const url = `${baseUrl}${env.WEBHOOK_PATH}`;

    console.log(`🚀 Simulating Telegram webhook call to: ${url}`);
    if (!env.WEBHOOK_SECRET_TOKEN) {
        console.warn("⚠️  Warning: WEBHOOK_SECRET_TOKEN is not set in env");
    }

    const payload = {
        update_id: Math.floor(Math.random() * 1000000),
        message: {
            message_id: 123,
            from: { id: 123456789, is_bot: false, first_name: "Test", username: "testuser" },
            chat: { id: 123456789, type: "private", first_name: "Test" },
            date: Math.floor(Date.now() / 1000),
            text: "/start"
        }
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": env.WEBHOOK_SECRET_TOKEN || "",
        },
        body: JSON.stringify(payload),
    });

    console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log("Response Body:", text || "(empty)");

    if (response.ok) {
        console.log("\n✅ Webhook processed successfully!");
    } else {
        throw new Error("Webhook failed!");
    }
}

async function main() {
    const command = process.argv[2];
    const force = process.argv.includes("--force");

    try {
        switch (command) {
            case "get":
                await getWebhook();
                break;
            case "setup":
                await setupWebhook(force);
                break;
            case "test":
                await testWebhook();
                break;
            default:
                console.log("Usage: bun src/scripts/webhook.ts [get|setup|test] [--force]");
                process.exit(1);
        }
    } catch (error: any) {
        console.error(`❌ Error in ${command}:`, error.message || error);
        process.exit(1);
    }
}

main();
