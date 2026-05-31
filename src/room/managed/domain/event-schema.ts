import type { EventSchema } from "@haxbrasil/haxfootball-api-sdk";
import { api } from "@api/client";
import { EVENT_SCHEMA_NAME, eventSchemaDefinition } from "@modes/classic/stats";
import { sameEventSchemaDefinition } from "./event-schema-definition";

type EventSchemaReference = {
    id: string;
    version: string | number;
};

export async function ensureEventSchema(): Promise<EventSchemaReference | null> {
    const existing = await api.eventSchemas.list();
    if (existing.ok) {
        const schema = findLatestEventSchema(existing.data.items);

        if (schema) {
            return reconcileEventSchema(schema);
        }
    } else {
        console.error("Failed to list event schemas:", existing.error);
    }

    return createInitialEventSchema();
}

function findLatestEventSchema(schemas: EventSchema[]): EventSchema | null {
    return (
        schemas
            .filter((item) => item.name === EVENT_SCHEMA_NAME)
            .sort((left, right) => {
                if (left.isLatest !== right.isLatest) {
                    return left.isLatest ? -1 : 1;
                }

                return Number(right.version) - Number(left.version);
            })[0] ?? null
    );
}

async function reconcileEventSchema(
    schema: EventSchema,
): Promise<EventSchemaReference> {
    if (hasRoomEventSchemaDefinition(schema)) {
        return toEventSchemaReference(schema);
    }

    const updated = await api.eventSchemas.updateVersion(
        schema.id,
        Number(schema.version),
        {
            definition: eventSchemaDefinition,
        },
    );

    if (updated.ok) {
        return toEventSchemaReference(updated.data);
    }

    if (!requiresPublishedEventSchemaVersion(updated.error)) {
        console.error("Failed to update event schema:", updated.error);
        return toEventSchemaReference(schema);
    }

    const published = await api.eventSchemas.publishVersion(schema.id, {
        definition: eventSchemaDefinition,
    });

    if (published.ok) {
        return toEventSchemaReference(published.data);
    }

    console.error("Failed to publish event schema version:", {
        update: updated.error,
        publish: published.error,
    });

    return toEventSchemaReference(schema);
}

async function createInitialEventSchema(): Promise<EventSchemaReference | null> {
    const created = await api.eventSchemas.create({
        name: EVENT_SCHEMA_NAME,
        title: "HaxFootball",
        description: "Default HaxFootball room events.",
        definition: eventSchemaDefinition,
    });

    if (!created.ok) {
        console.error("Failed to create event schema:", created.error);
        return null;
    }

    return toEventSchemaReference(created.data);
}

function hasRoomEventSchemaDefinition(schema: EventSchema): boolean {
    return sameEventSchemaDefinition(schema.definition, eventSchemaDefinition);
}

function requiresPublishedEventSchemaVersion(error: {
    kind: string;
    status?: number;
}): boolean {
    return error.kind === "api" && error.status === 400;
}

function toEventSchemaReference(schema: EventSchema): EventSchemaReference {
    return { id: schema.id, version: schema.version };
}
