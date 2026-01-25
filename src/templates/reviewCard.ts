import { FluentBundle, FluentResource } from "@fluent/bundle";
import { ReviewCardData } from "../services/reviewCard";

const ftlContent = `
review-card =
  📋 Neue Beitrittsanfrage - Bitte prüfen

  👤 Nutzer: { $userName }{ $username ->
      *[none] ""
       [some]  (@{ $usernameValue })
  }
  🆔 ID: { $userId }
  🕐 Zeitpunkt: { $formattedDate }

  📝 Begründung:
  { $reason }
  { $additionalMessagesValue }

review-card-updated =
  { $status ->
      [approved] ✅ GENEHMIGT
     *[declined] ❌ ABGELEHNT
  }

  👤 Nutzer: { $userName }{ $username ->
      *[none] ""
       [some]  (@{ $usernameValue })
  }
  🆔 ID: { $userId }

  📝 Begründung:
  { $reason }

  ---
  { $status ->
      [approved] GENEHMIGT von: { $adminName }
      *[declined] ABGELEHNT von: { $adminName }
  }
`;

// Load and parse the Fluent template
let bundle: FluentBundle | null = null;

function getBundle(): FluentBundle {
  if (!bundle) {
    try {
      const resource = new FluentResource(ftlContent);
      bundle = new FluentBundle("de", { useIsolating: false });

      const errors = bundle.addResource(resource);
      if (errors.length > 0) {
        console.error("[Template] Fluent parsing errors:", errors);
        // Log detailed error information
        errors.forEach((error: any) => {
          console.error("[Template] Error details:", {
            code: error.code,
            message: error.message,
            line: error.line,
            column: error.column,
          });
        });
      } else {
        // Verify messages exist
        const reviewCardMsg = bundle.getMessage("review-card");
        if (!reviewCardMsg) {
          console.error("[Template] review-card message not found! Available messages:", Array.from(bundle._messages.keys()));
        }
      }
    } catch (error) {
      console.error(`[Template] Error loading Fluent template:`, error);
      throw error;
    }
  }
  return bundle;
}

export function formatReviewCardMessage(
  data: ReviewCardData,
  timezone: string = "Europe/Berlin"
): string {
  const bundle = getBundle();

  // Format timestamp with timezone
  const date = new Date(data.timestamp);
  const formattedDate = formatDateWithTimezone(date, timezone);

  const messageObj = bundle.getMessage("review-card");
  if (!messageObj?.value) {
    console.error("[Template] review-card not found in Fluent bundle");
    return "";
  }

  // Fluent select expressions match on variable values
  // We pass "none" or "some" as the username value for the select expression
  // But we also need the actual username string for interpolation
  // So we pass both: usernameVariant for the select, and usernameValue for the text
  const usernameVariant = data.username ? "some" : "none";
  const usernameValue = data.username || "";

  // Format additional messages if any
  const hasAdditionalMessages = data.additionalMessages && data.additionalMessages.length > 0;
  const additionalMessagesText = hasAdditionalMessages
    ? `\n\n${data.additionalMessages!.join("\n\n")}`
    : "";

  // No escaping needed - sending as plain text (no parse_mode)
  const message = bundle.formatPattern(messageObj.value, {
    userName: data.userName,
    username: usernameVariant, // For select expression matching
    usernameValue: usernameValue, // For actual username text
    userId: data.userId.toString(),
    formattedDate,
    reason: data.reason,
    additionalMessagesValue: additionalMessagesText, // For actual text content (empty string or formatted messages)
  });

  return message || "";
}

export function formatUpdatedReviewCardMessage(
  data: ReviewCardData,
  status: "approved" | "declined",
  adminName: string,
  timezone: string = "Europe/Berlin"
): string {
  const bundle = getBundle();

  const messageObj = bundle.getMessage("review-card-updated");
  if (!messageObj?.value) {
    console.error("[Template] review-card-updated not found in Fluent bundle");
    return "";
  }

  // Fluent select expressions match on variable values
  // We pass "none" or "some" as the username value for the select expression
  // But we also need the actual username string for interpolation
  const usernameVariant = data.username ? "some" : "none";
  const usernameValue = data.username || "";

  const message = bundle.formatPattern(messageObj.value, {
    userName: data.userName,
    username: usernameVariant, // For select expression matching
    usernameValue: usernameValue, // For actual username text
    userId: data.userId.toString(),
    reason: data.reason,
    status,
    adminName,
  });

  return message || "";
}

function formatDateWithTimezone(date: Date, timezone: string): string {
  try {
    // Use Intl.DateTimeFormat for timezone-aware formatting
    const formatter = new Intl.DateTimeFormat("de-DE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });

    return formatter.format(date);
  } catch (error) {
    // Fallback to ISO string if timezone is invalid
    console.warn(`[Template] Invalid timezone "${timezone}", using UTC:`, error);
    return date.toISOString();
  }
}
