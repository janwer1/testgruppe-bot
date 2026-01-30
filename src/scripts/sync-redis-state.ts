import "dotenv/config";

/**
 * Sync script to fix stuck join requests in Redis
 *
 * This script:
 * 1. Scans recent requests in 'awaitingReview' state
 * 2. Checks actual Telegram chat membership for each user
 * 3. Updates Redis to match reality:
 *    - If user is a member → mark as approved
 *    - If user is not found/left → optionally mark as declined
 *    - If still not in chat → leave as-is (still pending)
 */

async function syncRedisState() {
  const { parseEnv } = await import("../env");
  const { createConfigFromEnv } = await import("../config");
  const { createBot } = await import("../bot");
  const { createStateStore } = await import("../services/state");
  const { JoinRequestRepository } = await import("../repositories/JoinRequestRepository");

  const env = parseEnv();
  const config = createConfigFromEnv(env);
  const store = createStateStore(config);
  const repo = new JoinRequestRepository(store, config);
  const bot = createBot(config, repo);

  const dryRun = process.argv.includes("--dry-run");
  const limit = process.argv.includes("--all") ? 100 : 20;

  console.log(`\n🔄 Syncing Redis state with Telegram reality...\n`);
  console.log("=".repeat(60));
  console.log(`Mode:         ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`Scan limit:   ${limit} recent requests`);
  console.log("=".repeat(60));

  // Get recent requests
  const recentRequests = await repo.findRecent(limit);
  const pendingRequests = recentRequests.filter((req) => req.getState() === "awaitingReview");

  console.log(`\n📊 Found ${pendingRequests.length} pending requests out of ${recentRequests.length} total\n`);

  if (pendingRequests.length === 0) {
    console.log("✅ No pending requests to sync!\n");
    return;
  }

  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const request of pendingRequests) {
    const context = request.getContext();
    const userId = context.userId;
    const requestId = context.requestId;

    console.log("─".repeat(60));
    console.log(`Processing: ${context.displayName} (${userId})`);
    console.log(`Request ID: ${requestId}`);
    console.log(`Created:    ${new Date(context.timestamp).toISOString()}`);

    try {
      // Check if user is in the chat
      const member = await bot.api.getChatMember(context.targetChatId, userId);

      if (member.status === "member" || member.status === "administrator" || member.status === "creator") {
        console.log(`✅ User is ${member.status} in chat → marking as APPROVED`);

        if (!dryRun) {
          const result = request.approve(0, "System (Auto-Sync)");
          if (result.success) {
            await repo.save(request);
            console.log("   💾 Redis updated");

            // Update the admin review card to reflect the approval
            if (context.adminMsgId) {
              try {
                const { updateReviewCard } = await import("../services/reviewCard");
                await updateReviewCard(
                  bot,
                  context.adminMsgId,
                  "approved",
                  "System (Auto-Sync)",
                  {
                    userId: context.userId,
                    displayName: context.displayName,
                    username: context.username,
                    reason: context.reason || "",
                    timestamp: new Date(context.timestamp),
                    requestId: context.requestId,
                    additionalMessages: context.additionalMessages,
                  },
                  config,
                );
                console.log("   🔄 Admin card updated");
              } catch (cardError) {
                console.log(`   ⚠️  Failed to update admin card: ${cardError}`);
              }
            }
          } else {
            console.log(`   ❌ Failed to update: ${result.error}`);
            errorCount++;
            continue;
          }
        }
        syncedCount++;
      } else if (member.status === "left" || member.status === "kicked") {
        console.log(`⚠️  User has status: ${member.status} → could mark as DECLINED`);
        // For now, we'll skip these - admin can manually decline
        skippedCount++;
      } else {
        console.log(`⚠️  User has unexpected status: ${member.status} → skipping`);
        skippedCount++;
      }
    } catch (error: unknown) {
      const err = error as { description?: string };
      if (err.description?.includes("user not found") || err.description?.includes("USER_NOT_PARTICIPANT")) {
        console.log(`ℹ️  User not in chat (no join request pending) → skipping`);
        skippedCount++;
      } else {
        console.log(`❌ Error checking user: ${err.description || error}`);
        errorCount++;
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📈 Summary:");
  console.log(`   Synced:   ${syncedCount}`);
  console.log(`   Skipped:  ${skippedCount}`);
  console.log(`   Errors:   ${errorCount}`);

  if (dryRun) {
    console.log("\n⚠️  This was a DRY RUN. No changes were made.");
    console.log("   Run without --dry-run to apply changes.\n");
  } else {
    console.log("\n✅ Sync complete!\n");
  }
}

syncRedisState().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
