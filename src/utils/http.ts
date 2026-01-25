/**
 * Returns a standard HTTP 200 OK response indicating the service is running.
 * Used for health checks and root path handlers.
 */
export const createHealthCheckResponse = (): Response => {
    return new Response("Bot is running", { status: 200 });
};
