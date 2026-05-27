import type { StatEventSchema } from "@haxbrasil/haxfootball-api-sdk";
import { api } from "@api/client";
import {
    STAT_SCHEMA_NAME,
    statEventSchemaDefinition,
} from "@modes/classic/stats";
import { sameStatEventSchemaDefinition } from "./stat-event-schema-definition";

type StatEventSchemaReference = {
    id: string;
    version: string | number;
};

export async function ensureStatEventSchema(): Promise<StatEventSchemaReference | null> {
    const existing = await api.statEventSchemas.list();
    if (existing.ok) {
        const schema = findLatestStatEventSchema(existing.data.items);

        if (schema) {
            return reconcileStatEventSchema(schema);
        }
    } else {
        console.error("Failed to list stat event schemas:", existing.error);
    }

    return createInitialStatEventSchema();
}

function findLatestStatEventSchema(
    schemas: StatEventSchema[],
): StatEventSchema | null {
    return (
        schemas
            .filter((item) => item.name === STAT_SCHEMA_NAME)
            .sort((left, right) => {
                if (left.isLatest !== right.isLatest) {
                    return left.isLatest ? -1 : 1;
                }

                return Number(right.version) - Number(left.version);
            })[0] ?? null
    );
}

async function reconcileStatEventSchema(
    schema: StatEventSchema,
): Promise<StatEventSchemaReference> {
    if (hasRoomStatEventSchemaDefinition(schema)) {
        return toStatEventSchemaReference(schema);
    }

    const updated = await api.statEventSchemas.updateVersion(
        schema.id,
        Number(schema.version),
        {
            definition: statEventSchemaDefinition,
        },
    );

    if (updated.ok) {
        return toStatEventSchemaReference(updated.data);
    }

    if (!requiresPublishedStatEventSchemaVersion(updated.error)) {
        console.error("Failed to update stat event schema:", updated.error);
        return toStatEventSchemaReference(schema);
    }

    const published = await api.statEventSchemas.publishVersion(schema.id, {
        definition: statEventSchemaDefinition,
    });

    if (published.ok) {
        return toStatEventSchemaReference(published.data);
    }

    console.error("Failed to publish stat event schema version:", {
        update: updated.error,
        publish: published.error,
    });

    return toStatEventSchemaReference(schema);
}

async function createInitialStatEventSchema(): Promise<StatEventSchemaReference | null> {
    const created = await api.statEventSchemas.create({
        name: STAT_SCHEMA_NAME,
        title: "HaxFootball",
        description: "Default HaxFootball room stat events.",
        definition: statEventSchemaDefinition,
    });

    if (!created.ok) {
        console.error("Failed to create stat event schema:", created.error);
        return null;
    }

    return toStatEventSchemaReference(created.data);
}

function hasRoomStatEventSchemaDefinition(schema: StatEventSchema): boolean {
    return sameStatEventSchemaDefinition(
        schema.definition,
        statEventSchemaDefinition,
    );
}

function requiresPublishedStatEventSchemaVersion(error: {
    kind: string;
    status?: number;
}): boolean {
    return error.kind === "api" && error.status === 400;
}

function toStatEventSchemaReference(
    schema: StatEventSchema,
): StatEventSchemaReference {
    return { id: schema.id, version: schema.version };
}
