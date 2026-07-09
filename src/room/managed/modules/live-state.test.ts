import { describe, expect, it } from "vitest";
import type { Room } from "@core/room";
import { createPlayerSessionStore } from "@room/shared/domain/player-sessions";
import { buildManagedLiveStateSnapshot } from "./live-state";

describe("managed live-state guest eligibility", () => {
    it.each([
        [false, false, "guest"],
        [true, true, null],
    ] as const)(
        "reports guest play policy when allowGuestPlay is %s",
        (allowGuestPlay, playable, playBlockedReason) => {
            const player = {
                id: 1,
                name: "Guest",
                team: 0,
                admin: false,
            } as PlayerObject;
            const sessionStore = createPlayerSessionStore();
            sessionStore.set(player.id, {
                kind: "guest",
                playerId: "guest",
            });

            const snapshot = buildManagedLiveStateSnapshot({
                allowGuestPlay,
                documentProvider: undefined,
                desyncedPlayerIds: new Set(),
                getPlayerSession: sessionStore.get,
                liveStateContract: null,
                room: {
                    getGameStatus: () => "stopped",
                    getPlayerList: () => [player],
                    getScores: () => null,
                } as unknown as Room,
                roomName: "Test room",
                revision: 1,
            });

            expect(snapshot.players[0]).toMatchObject({
                playable,
                playBlockedReason,
                sessionKind: "guest",
            });
        },
    );
});
