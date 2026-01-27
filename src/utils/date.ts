export function formatDateWithTimezone(date: Date, timezone: string): string {
    try {
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
        return date.toISOString();
    }
}
