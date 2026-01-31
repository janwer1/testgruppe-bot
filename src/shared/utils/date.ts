interface DateFormatOptions {
  includeYear?: boolean;
  includeTimeZoneName?: boolean;
}

/**
 * Format date with timezone
 * @param date - Date object or timestamp
 * @param timezone - IANA timezone string (e.g., "Europe/Berlin")
 * @param options - Format options
 */
export function formatDate(date: Date | number, timezone: string, options: DateFormatOptions = {}): string {
  const { includeYear = false, includeTimeZoneName = false } = options;
  const dateObj = date instanceof Date ? date : new Date(date);

  try {
    return dateObj.toLocaleString("de-DE", {
      timeZone: timezone,
      ...(includeYear && { year: "numeric" }),
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      ...(includeTimeZoneName && { timeZoneName: "short" }),
    });
  } catch (_error) {
    return dateObj.toISOString();
  }
}
