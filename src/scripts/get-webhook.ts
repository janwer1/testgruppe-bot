import "dotenv/config";

async function main() {
    try {
        const { env } = await import("../env");
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
    } catch (error: any) {
        if (error?.name === "ZodError" || error?.message?.includes("environment variables")) {
            console.warn("⚠️  Environment validation failed. Please check your .env file.");
        } else {
            console.error("❌ Error fetching webhook info:", error);
        }
        process.exit(1);
    }
}

main();
