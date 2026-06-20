export type GameStateInspection = {
    continuity:
        | "before-play-start"
        | "play-starting"
        | "play-started"
        | "play-ending";
};
