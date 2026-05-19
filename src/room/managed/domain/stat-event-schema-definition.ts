export function sameStatEventSchemaDefinition(
    left: unknown,
    right: unknown,
): boolean {
    return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
    return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortJson);
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([, child]) => child !== undefined)
            .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
            .map(([key, child]) => [key, sortJson(child)]),
    );
}
