export function createPublicWebUrl(
    baseUrl: string | null | undefined,
    pathSegments: string[],
): string | null {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

    if (!normalizedBaseUrl) {
        return null;
    }

    try {
        const url = new URL(normalizedBaseUrl);
        const basePath = url.pathname.replace(/\/+$/, "");
        const path = pathSegments
            .filter((segment) => segment.length > 0)
            .map((segment) => encodeURIComponent(segment))
            .join("/");

        url.pathname = [basePath, path].filter(Boolean).join("/");

        return url.toString();
    } catch {
        return null;
    }
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
    const trimmedBaseUrl = baseUrl?.trim();

    if (!trimmedBaseUrl) {
        return null;
    }

    return /^[a-z][a-z\d+.-]*:\/\//i.test(trimmedBaseUrl)
        ? trimmedBaseUrl
        : `https://${trimmedBaseUrl}`;
}
