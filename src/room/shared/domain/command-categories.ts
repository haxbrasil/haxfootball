export const CommandCategory = {
    Admin: "admin",
    Game: "game",
    Room: "room",
    Hidden: "disabled",
} as const;

export type CommandCategory =
    (typeof CommandCategory)[keyof typeof CommandCategory];
