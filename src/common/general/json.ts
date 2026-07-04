export function parseJson<TValue = unknown>(
    value: string | null | undefined,
    options: { label?: string } = {},
): TValue | null {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value) as TValue;
    } catch (error) {
        const subject = options.label ?? "JSON value";

        console.error(`Invalid ${subject}:`, error);
        return null;
    }
}
