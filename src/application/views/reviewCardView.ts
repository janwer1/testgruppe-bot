import { InlineKeyboard } from "grammy";
import { formatReviewCardMessage, formatUpdatedReviewCardMessage } from "../../templates/reviewCard";
import type { ReviewCardData } from "../services/reviewCard";

export type ReviewCardStatus = "pending" | "approved" | "declined";

export interface ReviewCardViewInput extends ReviewCardData {
  status: ReviewCardStatus;
  adminName?: string;
}

export interface ReviewCardViewOutput {
  text: string;
  keyboard?: InlineKeyboard;
}

export function createReviewCardKeyboard(requestId: string): InlineKeyboard {
  return new InlineKeyboard().text("✅ Approve", `approve_${requestId}`).text("❌ Decline", `decline_${requestId}`);
}

export function renderReviewCard(input: ReviewCardViewInput, timezone: string): ReviewCardViewOutput {
  if (input.status === "approved" || input.status === "declined") {
    return {
      text: formatUpdatedReviewCardMessage(input, input.status, input.adminName || "Unknown", timezone),
    };
  }

  return {
    text: formatReviewCardMessage(input, timezone),
    keyboard: createReviewCardKeyboard(input.requestId),
  };
}
