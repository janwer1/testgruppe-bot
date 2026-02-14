export type JoinRequestErrorCode = "INVALID_STATE" | "VALIDATION_FAILED" | "ALREADY_PROCESSED";

export class JoinRequestError extends Error {
  constructor(
    public code: JoinRequestErrorCode,
    message: string,
    public cause?: unknown,
  ) {
    super(message);
    this.name = "JoinRequestError";
  }
}
