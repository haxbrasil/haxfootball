import { i18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import { DownState } from "./down";
import { FieldPosition, type ScoreState } from "@common/game/game";
import { FieldTeam, Team } from "@runtime/models";
import { RED_ZONE_FOUL_LIMIT } from "./penalty";

export const DIV = t`•`;

export function formatTeamName(team: FieldTeam): string {
    return team === Team.RED ? t`Red` : t`Blue`;
}

export function stringifyFieldPosition(fieldPos: FieldPosition): string {
    const teamName = formatTeamName(fieldPos.side);
    return t`${teamName} ${fieldPos.yards}`;
}

export function stringifyRedZoneFouls(redZoneFouls: number): string {
    return t`${redZoneFouls}/${RED_ZONE_FOUL_LIMIT} ${plural(redZoneFouls, {
        one: "foul",
        other: "fouls",
    })} for automatic touchdown`;
}

type ObjectWithName = { name: string };

type ListFormatCtor = new (
    locales?: string | string[],
    options?: {
        localeMatcher?: "lookup" | "best fit";
        type?: "conjunction" | "disjunction" | "unit";
        style?: "long" | "short" | "narrow";
    },
) => { format: (list: string[]) => string };

export function formatNames(players: ObjectWithName[]): string {
    const names = players.map((player) => player.name).filter((name) => name);

    if (names.length === 0) return "";

    const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor })
        .ListFormat;

    if (ListFormat) {
        try {
            return new ListFormat(i18n.locale, {
                style: "long",
                type: "conjunction",
            }).format(names);
        } catch {
            // Fall back to a simple English list below.
        }
    }

    if (names.length === 1) return names[0] ?? "";
    if (names.length === 2) return t`${names[0]!} and ${names[1]!}`;

    return t`${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]!}`;
}

export function stringifyDownState(downState: DownState): string {
    const downText = t`${plural(downState.downAndDistance.down, {
        one: "1st",
        two: "2nd",
        few: "3rd",
        other: `${downState.downAndDistance.down}th`,
    })} & ${downState.downAndDistance.distance} @ ${stringifyFieldPosition(
        downState.fieldPos,
    )}`;

    return downState.redZoneFouls > 0
        ? cn(downText, stringifyRedZoneFouls(downState.redZoneFouls))
        : downText;
}

export function stringifyScoreState(scoreState: ScoreState): string {
    const redTeam = formatTeamName(Team.RED);
    const blueTeam = formatTeamName(Team.BLUE);

    return t`${redTeam} ${scoreState[Team.RED]} × ${scoreState[Team.BLUE]} ${blueTeam}`;
}

function isDownState(value: unknown): value is DownState {
    return (
        typeof value === "object" &&
        value !== null &&
        "downAndDistance" in value &&
        "fieldPos" in value
    );
}

function isScoreState(value: unknown): value is ScoreState {
    if (typeof value !== "object" || value === null) return false;

    const scoreRecord = value as Record<number, unknown>;

    return (
        typeof scoreRecord[Team.RED] === "number" &&
        typeof scoreRecord[Team.BLUE] === "number"
    );
}

function hasAscii(text: string): boolean {
    return /[\x00-\x7F]/.test(text);
}

export function cn(
    ...strings: (number | string | DownState | ScoreState)[]
): string {
    const parts = strings
        .filter((s) => s !== "")
        .map((s) => {
            if (typeof s === "number") {
                return {
                    text: s.toString(),
                    isState: false,
                };
            }

            if (typeof s === "string") {
                return {
                    text: s,
                    isState: false,
                };
            }

            if (isDownState(s)) {
                return {
                    text: stringifyDownState(s),
                    isState: true,
                };
            }

            if (isScoreState(s)) {
                return {
                    text: stringifyScoreState(s),
                    isState: true,
                };
            }

            return {
                text: "",
                isState: false,
            };
        });

    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0]?.text ?? "";

    return parts.reduce((message, currentPart, index) => {
        if (index === 0) return currentPart.text;

        const previousPart = parts[index - 1];
        const previousHasAscii = hasAscii(previousPart?.text ?? "");
        const separator =
            currentPart.isState && !previousHasAscii ? " " : ` ${DIV} `;

        return `${message}${separator}${currentPart.text}`;
    }, "");
}
