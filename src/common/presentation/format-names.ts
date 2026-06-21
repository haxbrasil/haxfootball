import { t } from "@lingui/core/macro";

type ObjectWithName = {
    name: string;
};

export function formatNames(players: readonly ObjectWithName[]): string {
    const names = players.map((player) => player.name).filter(Boolean);

    if (names.length === 0) return "";
    if (names.length === 1) return names[0] ?? "";
    if (names.length === 2) return t`${names[0] ?? ""} and ${names[1] ?? ""}`;

    return t`${names.slice(0, -1).join(", ")}, and ${names[names.length - 1] ?? ""}`;
}
