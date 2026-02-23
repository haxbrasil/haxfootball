import { type FieldTeam, isFieldTeam, Team } from "@runtime/models";

export function parseIntegerInRange(
    value: string | undefined,
    min: number,
    max: number,
): number | null {
    if (!value) return null;

    const parsedValue = Number(value);

    if (!Number.isInteger(parsedValue)) {
        return null;
    }

    if (parsedValue < min || parsedValue > max) {
        return null;
    }

    return parsedValue;
}

export function parseTeamSide(value: string | undefined): FieldTeam | null {
    const normalizedValue = value?.trim().toLowerCase();

    if (!normalizedValue) {
        return null;
    }

    const teamBySide = {
        red: Team.RED,
        blue: Team.BLUE,
    } as const;

    const parsedTeam =
        teamBySide[normalizedValue as keyof typeof teamBySide] ?? null;

    return parsedTeam !== null && isFieldTeam(parsedTeam) ? parsedTeam : null;
}
