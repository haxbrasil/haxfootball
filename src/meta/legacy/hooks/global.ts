import type { FieldTeam } from "@runtime/models";
import { createGlobalHook } from "@runtime/runtime";
import { legacyGlobalSchema } from "@meta/legacy/global";

export const $global = createGlobalHook<typeof legacyGlobalSchema>();

type PossessionQuarterbackPlayer = Pick<PlayerObject, "id" | "team">;

export function $syncPossessionQuarterbackSelection({
    team,
    players,
}: {
    team: FieldTeam;
    players: PossessionQuarterbackPlayer[];
}): number | null {
    const { possessionQuarterback } = $global();

    if (!possessionQuarterback) {
        return null;
    }

    if (possessionQuarterback.team !== team) {
        $global((state) => state.clearPossessionQuarterback());
        return null;
    }

    const selectedQuarterback = players.find(
        (player) =>
            player.id === possessionQuarterback.playerId &&
            player.team === team,
    );

    if (!selectedQuarterback) {
        $global((state) => state.clearPossessionQuarterback());
        return null;
    }

    return selectedQuarterback.id;
}
