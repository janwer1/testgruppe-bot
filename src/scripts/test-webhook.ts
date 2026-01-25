import "dotenv/config";
import { env } from "../env";

async function main() {
    // Use config from env or defaults
    const baseUrl = env.PUBLIC_BASE_URL || "http://localhost:3000";
    const webhookPath = env.WEBHOOK_PATH || "/api/bot";
    const url = `${baseUrl}${webhookPath}`;

    const secretToken = env.WEBHOOK_SECRET_TOKEN;

    console.log(`🚀 Simulating Telegram webhook call to: ${url}`);
    if (!secretToken) {
        console.warn("⚠️  Warning: WEBHOOK_SECRET_TOKEN is not set in env");
    } else {
        console.log("🔒 Using secret token from env");
    }

    // Sample Update payload (Message)
    const payload = {
        update_id: Math.floor(Math.random() * 1000000),
        message: {
            message_id: 123,
            from: {
                id: 123456789,
                is_bot: false,
                first_name: "Test",
                last_name: "User",
                username: "testuser",
                language_code: "en"
            },
            chat: {
                id: 123456789,
                first_name: "Test",
                last_name: "User",
                username: "testuser",
                type: "private"
            },
            date: Math.floor(Date.now() / 1000),
            text: "/start"
        }
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Telegram-Bot-Api-Secret-Token": secretToken || "",
            },
            body: JSON.stringify(payload),
        });

        console.log(`\nResponse Status: ${response.status} ${response.statusText}`);
        const text = await response.text();
        console.log("Response Body:", text || "(empty)");

        if (response.ok) {
            console.log("\n✅ Webhook processed successfully!");
        } else {
            console.error("\n❌ Webhook failed!");
        }

    } catch (error) {
        console.error("\n❌ Failed to send request:", error);
        console.log("Check if the server is running and accessible.");
    }
}

main();
