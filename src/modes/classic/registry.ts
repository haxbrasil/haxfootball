import { ExtraPoint } from "./states/extra-point/extra-point";
import { ExtraPointBlitz } from "./states/extra-point/extra-point-blitz";
import { ExtraPointBlockedPass } from "./states/extra-point/extra-point-blocked-pass";
import { ExtraPointInterceptionAttempt } from "./states/extra-point/extra-point-interception-attempt";
import { ExtraPointKick } from "./states/extra-point/extra-point-kick";
import { ExtraPointPassDeflection } from "./states/extra-point/extra-point-pass-deflection";
import { ExtraPointQuarterbackRun } from "./states/extra-point/extra-point-quarterback-run";
import { ExtraPointRetry } from "./states/extra-point/extra-point-retry";
import { ExtraPointRun } from "./states/extra-point/extra-point-run";
import { ExtraPointSnap } from "./states/extra-point/extra-point-snap";
import { ExtraPointSnapInFlight } from "./states/extra-point/extra-point-snap-in-flight";
import { FieldGoal } from "./states/kicking/field-goal";
import { FieldGoalInFlight } from "./states/kicking/field-goal-in-flight";
import { Kickoff } from "./states/kicking/kickoff";
import { KickoffInFlight } from "./states/kicking/kickoff-in-flight";
import { KickoffReturn } from "./states/kicking/kickoff-return";
import { Punt } from "./states/kicking/punt";
import { PuntInFlight } from "./states/kicking/punt-in-flight";
import { PuntReturn } from "./states/kicking/punt-return";
import { Safety } from "./states/kicking/safety";
import { SafetyKickInFlight } from "./states/kicking/safety-kick-in-flight";
import { SafetyKickReturn } from "./states/kicking/safety-kick-return";
import { Blitz } from "./states/scrimmage/blitz";
import { BlockedPass } from "./states/scrimmage/blocked-pass";
import { Interception } from "./states/scrimmage/interception";
import { InterceptionAttempt } from "./states/scrimmage/interception-attempt";
import { LiveBall } from "./states/scrimmage/live-ball";
import { PassDeflection } from "./states/scrimmage/pass-deflection";
import { Presnap } from "./states/scrimmage/presnap";
import { QuarterbackRun } from "./states/scrimmage/quarterback-run";
import { Run } from "./states/scrimmage/run";
import { Snap } from "./states/scrimmage/snap";
import { SnapInFlight } from "./states/scrimmage/snap-in-flight";
import { FakeFieldGoal } from "./states/trick/fake-field-goal";

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
