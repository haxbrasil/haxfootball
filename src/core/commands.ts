export const COMMAND_PREFIX = "!";

export type CommandSpec = {
    prefix: string;
    name: string;
    args: string[];
    raw: string;
};

export type CommandParseSpec = {
    prefix: string;
};

export type CommandDefinition = {
    name: string;
    aliases?: string[];
    category?: string;
    description?: string;
};

export type CommandDeclaration = string | CommandDefinition;

export type CommandConfig = {
    spec: CommandParseSpec;
    commands: CommandDeclaration[];
};

export type NormalizedCommandEntry = {
    name: string;
    aliases: Set<string>;
    category: string;
    description?: string;
};

export type NormalizedCommandConfig = {
    spec: CommandParseSpec;
    entries: Map<string, NormalizedCommandEntry>;
    tokens: Map<string, string>;
};

export type CommandCatalogEntry = {
    name: string;
    aliases: string[];
    category: string;
    description?: string;
};

export type CommandCatalog = {
    tokens: Map<string, string>;
    commands: CommandCatalogEntry[];
};

export type CommandHandleResult = {
    handled: boolean;
};

export type CommandResponse = {
    hideMessage?: boolean;
};

const GENERAL_COMMAND_CATEGORY = "general";

export const normalizeCommandToken = (value: string): string =>
    value.trim().toLowerCase();

const normalizeCommandDefinition = (
    declaration: CommandDeclaration,
): CommandDefinition => {
    if (typeof declaration === "string") {
        return {
            name: declaration,
        };
    }

    return declaration;
};

export function normalizeCommandConfig(
    config: CommandConfig,
): NormalizedCommandConfig {
    const entries = new Map<string, NormalizedCommandEntry>();
    const tokens = new Map<string, string>();

    config.commands.forEach((declaration) => {
        const normalized = normalizeCommandDefinition(declaration);
        const name = normalizeCommandToken(normalized.name);

        if (!name) {
            throw new Error("Command name cannot be empty.");
        }

        const category =
            (normalized.category ?? GENERAL_COMMAND_CATEGORY).trim() ||
            GENERAL_COMMAND_CATEGORY;
        const description = normalized.description?.trim() || undefined;
        const aliases = (normalized.aliases ?? [])
            .map((alias) => normalizeCommandToken(alias))
            .filter((alias) => alias.length > 0 && alias !== name);

        const existingEntry = entries.get(name);

        if (existingEntry && existingEntry.category !== category) {
            throw new Error(
                `Command "${name}" has conflicting categories: "${existingEntry.category}" vs "${category}".`,
            );
        }

        if (
            existingEntry &&
            existingEntry.description &&
            description &&
            existingEntry.description !== description
        ) {
            throw new Error(`Command "${name}" has conflicting descriptions.`);
        }

        const entry: NormalizedCommandEntry = existingEntry ?? {
            name,
            aliases: new Set<string>(),
            category,
            ...(description ? { description } : {}),
        };

        aliases.forEach((alias) => {
            entry.aliases.add(alias);
        });

        if (!entry.description && description) {
            entry.description = description;
        }

        entries.set(name, entry);

        const tokensForEntry = [name, ...Array.from(entry.aliases)];

        tokensForEntry.forEach((token) => {
            const existingOwner = tokens.get(token);

            if (existingOwner && existingOwner !== name) {
                throw new Error(
                    `Command token "${token}" is already mapped to "${existingOwner}".`,
                );
            }

            tokens.set(token, name);
        });
    });

    return {
        spec: config.spec,
        entries,
        tokens,
    };
}

type CommandCatalogDraft = {
    name: string;
    aliases: Set<string>;
    category: string;
    description?: string;
};

export function buildCommandCatalog(
    commandConfigs: NormalizedCommandConfig[],
): CommandCatalog {
    const tokens = new Map<string, string>();
    const commandDrafts = new Map<string, CommandCatalogDraft>();

    commandConfigs.forEach((config) => {
        config.entries.forEach((entry) => {
            const existingCommand = commandDrafts.get(entry.name);

            if (
                existingCommand &&
                existingCommand.category !== entry.category
            ) {
                throw new Error(
                    `Command "${entry.name}" has conflicting categories across modules: "${existingCommand.category}" vs "${entry.category}".`,
                );
            }

            const commandDraft: CommandCatalogDraft = existingCommand ?? {
                name: entry.name,
                aliases: new Set<string>(),
                category: entry.category,
            };

            entry.aliases.forEach((alias) => {
                commandDraft.aliases.add(alias);
            });

            if (!commandDraft.description && entry.description) {
                commandDraft.description = entry.description;
            }

            commandDrafts.set(entry.name, commandDraft);
        });

        config.tokens.forEach((commandName, token) => {
            const existingOwner = tokens.get(token);

            if (existingOwner && existingOwner !== commandName) {
                throw new Error(
                    `Command token "${token}" is mapped to both "${existingOwner}" and "${commandName}".`,
                );
            }

            tokens.set(token, commandName);
        });
    });

    const commands = Array.from(commandDrafts.values())
        .map((commandDraft): CommandCatalogEntry => {
            return {
                name: commandDraft.name,
                aliases: Array.from(commandDraft.aliases).sort(),
                category: commandDraft.category,
                ...(commandDraft.description
                    ? { description: commandDraft.description }
                    : {}),
            };
        })
        .sort((left, right) => left.name.localeCompare(right.name));

    return {
        tokens,
        commands,
    };
}

export function parseCommandMessage({
    message,
    spec,
    tokens,
}: {
    message: string;
    spec: CommandParseSpec | null;
    tokens: ReadonlyMap<string, string>;
}): CommandSpec | null {
    if (!spec || tokens.size === 0) return null;

    const raw = message.trim();

    if (!raw.startsWith(spec.prefix)) return null;

    const withoutPrefix = raw.slice(spec.prefix.length).trim();
    if (withoutPrefix.length === 0) return null;

    const parts = withoutPrefix.split(/\s+/);
    const token = parts[0] ? normalizeCommandToken(parts[0]) : "";

    if (!token) return null;

    const name = tokens.get(token);

    if (!name) return null;

    const args = parts.slice(1);

    return {
        prefix: spec.prefix,
        name,
        args,
        raw,
    };
}
