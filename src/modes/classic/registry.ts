import { PassDeflection } from "./states/pass-deflection";
import { Interception } from "./states/interception";
import { Kickoff } from "./states/kickoff";
import { KickoffInFlight } from "./states/kickoff-in-flight";
import { KickoffReturn } from "./states/kickoff-return";
import { SafetyKickInFlight } from "./states/safety-kick-in-flight";
import { SafetyKickReturn } from "./states/safety-kick-return";
import { Punt } from "./states/punt";
import { PuntInFlight } from "./states/punt-in-flight";
import { PuntReturn } from "./states/punt-return";
import { LiveBall } from "./states/live-ball";
import { QuarterbackRun } from "./states/quarterback-run";
import { Run } from "./states/run";
import { Presnap } from "./states/presnap";
import { Safety } from "./states/safety";
import { Snap } from "./states/snap";
import { SnapInFlight } from "./states/snap-in-flight";
import { BlockedPass } from "./states/blocked-pass";
import { InterceptionAttempt } from "./states/interception-attempt";
import { Blitz } from "./states/blitz";
import { FieldGoal } from "./states/field-goal";
import { FakeFieldGoal } from "./states/fake-field-goal";
import { FieldGoalInFlight } from "./states/field-goal-in-flight";
import { ExtraPoint } from "./states/extra-point";
import { ExtraPointRetry } from "./states/extra-point-retry";
import { ExtraPointKick } from "./states/extra-point-kick";
import { ExtraPointBlockedPass } from "./states/extra-point-blocked-pass";
import { ExtraPointPassDeflection } from "./states/extra-point-pass-deflection";
import { ExtraPointBlitz } from "./states/extra-point-blitz";
import { ExtraPointSnap } from "./states/extra-point-snap";
import { ExtraPointSnapInFlight } from "./states/extra-point-snap-in-flight";
import { ExtraPointRun } from "./states/extra-point-run";
import { ExtraPointQuarterbackRun } from "./states/extra-point-quarterback-run";
import { ExtraPointInterceptionAttempt } from "./states/extra-point-interception-attempt";

export { classicStadium as stadium } from "@modes/classic/stadium";

export const registry = {
    KICKOFF: Kickoff,
    KICKOFF_IN_FLIGHT: KickoffInFlight,
    KICKOFF_RETURN: KickoffReturn,
    SAFETY_KICK_IN_FLIGHT: SafetyKickInFlight,
    SAFETY_KICK_RETURN: SafetyKickReturn,
    PUNT: Punt,
    PUNT_IN_FLIGHT: PuntInFlight,
    PUNT_RETURN: PuntReturn,
    PRESNAP: Presnap,
    SNAP: Snap,
    SAFETY: Safety,
    SNAP_IN_FLIGHT: SnapInFlight,
    LIVE_BALL: LiveBall,
    QUARTERBACK_RUN: QuarterbackRun,
    RUN: Run,
    BLITZ: Blitz,
    PASS_DEFLECTION: PassDeflection,
    BLOCKED_PASS: BlockedPass,
    INTERCEPTION: Interception,
    INTERCEPTION_ATTEMPT: InterceptionAttempt,
    FIELD_GOAL: FieldGoal,
    FAKE_FIELD_GOAL: FakeFieldGoal,
    FIELD_GOAL_IN_FLIGHT: FieldGoalInFlight,
    EXTRA_POINT: ExtraPoint,
    EXTRA_POINT_RETRY: ExtraPointRetry,
    EXTRA_POINT_KICK: ExtraPointKick,
    EXTRA_POINT_BLOCKED_PASS: ExtraPointBlockedPass,
    EXTRA_POINT_PASS_DEFLECTION: ExtraPointPassDeflection,
    EXTRA_POINT_BLITZ: ExtraPointBlitz,
    EXTRA_POINT_SNAP: ExtraPointSnap,
    EXTRA_POINT_SNAP_IN_FLIGHT: ExtraPointSnapInFlight,
    EXTRA_POINT_RUN: ExtraPointRun,
    EXTRA_POINT_QUARTERBACK_RUN: ExtraPointQuarterbackRun,
    EXTRA_POINT_INTERCEPTION_ATTEMPT: ExtraPointInterceptionAttempt,
};
