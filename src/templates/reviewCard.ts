import type { ReviewCardData } from "../services/reviewCard";
import { formatDateWithTimezone } from "../utils/date";

export function formatReviewCardMessage(data: ReviewCardData, timezone: string): string {
  const dateStr = formatDateWithTimezone(new Date(data.timestamp), timezone);
  const userHandle = data.username ? ` (@${data.username})` : "";

  let additionalStr = "";
  if (data.additionalMessages && data.additionalMessages.length > 0) {
    additionalStr = `\n\n${data.additionalMessages.join("\n\n")}`;
  }

  return `
📋 Neue Beitrittsanfrage - Bitte prüfen

👤 Nutzer: ${data.userName}${userHandle}
🆔 ID: ${data.userId}
🕐 Zeitpunkt: ${dateStr}

📝 Begründung:
${data.reason}${additionalStr}
`.trim();
}

export function formatUpdatedReviewCardMessage(
  data: ReviewCardData,
  status: "approved" | "declined",
  adminName: string,
  _timezone: string,
): string {
  const statusHeader = status === "approved" ? "✅ GENEHMIGT" : "❌ ABGELEHNT";
  const userHandle = data.username ? ` (@${data.username})` : "";
  const statusFooter = status === "approved" ? "GENEHMIGT" : "ABGELEHNT";

  return `
${statusHeader}

👤 Nutzer: ${data.userName}${userHandle}
🆔 ID: ${data.userId}

📝 Begründung:
${data.reason}

---
${statusFooter} von: ${adminName}
`.trim();
}
