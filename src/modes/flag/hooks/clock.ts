import { $effect } from "@runtime/runtime";

export function $stopGameClock(team: Exclude<TeamID, 0>) {
    $effect(($) => {
        $.stopGameClock(team);
    });
}

export function $startGameClock() {
    $effect(($) => {
        $.startGameClock();
    });
}
