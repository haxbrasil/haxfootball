import { describe, expect, it } from "vitest";
import {
    getPlayerPlayEligibility,
    type PlayerSession,
} from "./player-sessions";

describe("getPlayerPlayEligibility", () => {
    it("allows every local room session", () => {
        expect(
            eligibility({
                managedRoom: false,
                session: null,
            }),
        ).toEqual({ playable: true, playBlockedReason: "none" });
    });

    it("allows signed-in managed players", () => {
        expect(
            eligibility({
                session: signedInSession(),
            }),
        ).toEqual({ playable: true, playBlockedReason: "none" });
    });

    it("applies the guest-play policy independently", () => {
        expect(
            eligibility({
                allowGuestPlay: false,
                session: guestSession(),
            }),
        ).toEqual({ playable: false, playBlockedReason: "guest" });
        expect(
            eligibility({
                allowGuestPlay: true,
                session: guestSession(),
            }),
        ).toEqual({ playable: true, playBlockedReason: "none" });
    });

    it.each([
        ["resolving", resolvingSession(), "resolving"],
        ["signing in", signingInSession(), "signing-in"],
        ["missing", null, "resolving"],
    ] as const)("blocks %s managed sessions", (_name, session, reason) => {
        expect(
            eligibility({
                allowGuestPlay: true,
                session,
            }),
        ).toEqual({ playable: false, playBlockedReason: reason });
    });
});

function eligibility({
    allowGuestPlay = false,
    managedRoom = true,
    session,
}: {
    allowGuestPlay?: boolean;
    managedRoom?: boolean;
    session: PlayerSession | null;
}) {
    return getPlayerPlayEligibility({
        allowGuestPlay,
        managedRoom,
        session,
    });
}

function guestSession(): PlayerSession {
    return { kind: "guest", playerId: "guest" };
}

function signedInSession(): PlayerSession {
    return {
        kind: "signed-in",
        account: { name: "Player" },
        playerId: "signed-in",
    };
}

function resolvingSession(): PlayerSession {
    return { kind: "resolving", token: Symbol("resolving") };
}

function signingInSession(): PlayerSession {
    return {
        kind: "signing-in",
        account: { name: "Player" },
        playerId: "signing-in",
        timeout: setTimeout(() => undefined, 0),
    };
}
