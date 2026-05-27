import type { GameStatePlayer } from "@runtime/engine";
import { findCatchers } from "@common/game/game";
import { type FieldTeam } from "@runtime/models";
import { calculateDirectionalGain } from "@modes/classic/shared/stadium";

export const DEFAULT_PUSHING_CONTACT_DISTANCE = 1.5;
export const DEFAULT_PUSHING_MIN_BACKFIELD_STEP = 0.01;

export type PushingFoul = {
    defender: GameStatePlayer;
    pushers: GameStatePlayer[];
};

type PushingDetectionArgs = {
    currentPlayers: GameStatePlayer[];
    previousPlayers: GameStatePlayer[];
    offensiveTeam: FieldTeam;
    quarterbackId: number;
    lineOfScrimmageX: number;
    isBlitzAllowed: boolean;
    pushingContactDistance: number;
    minBackfieldStep: number;
};

type PushingCandidate = {
    attacker: GameStatePlayer;
    defender: GameStatePlayer;
};

type OffsideDefenderCheckArgs = {
    defender: GameStatePlayer;
    offensiveTeam: FieldTeam;
    lineOfScrimmageX: number;
};

type ValidPushingCandidateArgs = {
    candidate: PushingCandidate;
    previousPlayersById: Map<number, GameStatePlayer>;
    offensiveTeam: FieldTeam;
    lineOfScrimmageX: number;
    minBackfieldStep: number;
};

type PushingForDefenderArgs = {
    defender: GameStatePlayer;
    offensivePlayers: GameStatePlayer[];
    previousPlayersById: Map<number, GameStatePlayer>;
    offensiveTeam: FieldTeam;
    lineOfScrimmageX: number;
    pushingContactDistance: number;
    minBackfieldStep: number;
};

type BackfieldMovementArgs = {
    offensiveTeam: FieldTeam;
    deltaX: number;
};

const calculateBackfieldMovement = ({
    offensiveTeam,
    deltaX,
}: BackfieldMovementArgs) => -calculateDirectionalGain(offensiveTeam, deltaX);

const isOffsideDefender = ({
    defender,
    offensiveTeam,
    lineOfScrimmageX,
}: OffsideDefenderCheckArgs) =>
    calculateDirectionalGain(offensiveTeam, defender.x - lineOfScrimmageX) < 0;

const isValidPushingCandidate = ({
    candidate,
    previousPlayersById,
    offensiveTeam,
    lineOfScrimmageX,
    minBackfieldStep,
}: ValidPushingCandidateArgs) => {
    const previousDefender = previousPlayersById.get(candidate.defender.id);
    const previousAttacker = previousPlayersById.get(candidate.attacker.id);

    if (!previousDefender || !previousAttacker) return false;

    const defenderWasOnside =
        calculateDirectionalGain(
            offensiveTeam,
            previousDefender.x - lineOfScrimmageX,
        ) >= 0;

    const defenderMovedIntoBackfield =
        calculateBackfieldMovement({
            offensiveTeam,
            deltaX: candidate.defender.x - previousDefender.x,
        }) > minBackfieldStep;

    const attackerMovedIntoBackfield =
        calculateBackfieldMovement({
            offensiveTeam,
            deltaX: candidate.attacker.x - previousAttacker.x,
        }) > minBackfieldStep;

    const attackerIsInFrontOfDefenderInOffensiveDirection =
        calculateDirectionalGain(
            offensiveTeam,
            candidate.attacker.x - candidate.defender.x,
        ) > 0;

    return (
        defenderWasOnside &&
        defenderMovedIntoBackfield &&
        attackerMovedIntoBackfield &&
        attackerIsInFrontOfDefenderInOffensiveDirection
    );
};

const getPushingForDefender = ({
    defender,
    offensivePlayers,
    previousPlayersById,
    offensiveTeam,
    lineOfScrimmageX,
    pushingContactDistance,
    minBackfieldStep,
}: PushingForDefenderArgs): PushingFoul | null => {
    const pushers = findCatchers(
        defender,
        offensivePlayers,
        pushingContactDistance,
    ).filter((attacker) =>
        isValidPushingCandidate({
            candidate: { attacker, defender },
            previousPlayersById,
            offensiveTeam,
            lineOfScrimmageX,
            minBackfieldStep,
        }),
    );

    return pushers.length > 0 ? { defender, pushers } : null;
};

export function detectPushingFoul({
    currentPlayers,
    previousPlayers,
    offensiveTeam,
    quarterbackId,
    lineOfScrimmageX,
    isBlitzAllowed,
    pushingContactDistance,
    minBackfieldStep,
}: PushingDetectionArgs): PushingFoul | null {
    if (isBlitzAllowed) return null;

    const quarterback = currentPlayers.find((p) => p.id === quarterbackId);
    if (!quarterback || quarterback.isKickingBall) return null;

    const defenders = currentPlayers.filter(
        (player) => player.team !== offensiveTeam,
    );

    const offsideDefenders = defenders.filter((defender) =>
        isOffsideDefender({
            defender,
            offensiveTeam,
            lineOfScrimmageX,
        }),
    );

    if (offsideDefenders.length === 0) return null;

    const offensivePlayers = currentPlayers.filter(
        (player) =>
            player.team === offensiveTeam && player.id !== quarterbackId,
    );

    const previousPlayersById = new Map(
        previousPlayers.map((player) => [player.id, player]),
    );

    return (
        offsideDefenders
            .map((defender) =>
                getPushingForDefender({
                    defender,
                    offensivePlayers,
                    previousPlayersById,
                    offensiveTeam,
                    lineOfScrimmageX,
                    pushingContactDistance,
                    minBackfieldStep,
                }),
            )
            .find((foul): foul is PushingFoul => foul !== null) ?? null
    );
}
