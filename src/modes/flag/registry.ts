import { Blitz } from "./states/blitz";
import { BlockedPass } from "./states/blocked-pass";
import { Interception } from "./states/interception";
import { InterceptionAttempt } from "./states/interception-attempt";
import { LiveBall } from "./states/live-ball";
import { PassDeflection } from "./states/pass-deflection";
import { Presnap } from "./states/presnap";
import { QuarterbackRun } from "./states/quarterback-run";
import { Snap } from "./states/snap";
import { SnapInFlight } from "./states/snap-in-flight";

export { flagStadium as stadium } from "@modes/flag/stadium";

export const registry = {
    PRESNAP: Presnap,
    SNAP: Snap,
    SNAP_IN_FLIGHT: SnapInFlight,
    LIVE_BALL: LiveBall,
    QUARTERBACK_RUN: QuarterbackRun,
    BLITZ: Blitz,
    PASS_DEFLECTION: PassDeflection,
    BLOCKED_PASS: BlockedPass,
    INTERCEPTION: Interception,
    INTERCEPTION_ATTEMPT: InterceptionAttempt,
};
