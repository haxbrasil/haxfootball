import { z } from "zod";

type RuntimeEnv = Record<string, unknown>;

type EnvSchema = z.ZodRawShape | z.ZodType;
type ParsedEnv<TSchema extends EnvSchema> = TSchema extends z.ZodRawShape
    ? z.output<z.ZodObject<TSchema>>
    : TSchema extends z.ZodType
      ? z.output<TSchema>
      : never;

type CreateEnvOptions<TSchema extends EnvSchema> = {
    schema: TSchema;
    runtimeEnv: RuntimeEnv;
    emptyStringAsUndefined?: boolean;
};

export class EnvironmentValidationError extends Error {
    public readonly issues: z.ZodIssue[];

    public constructor(issues: z.ZodIssue[]) {
        super(formatEnvironmentIssues(issues));
        this.name = "EnvironmentValidationError";
        this.issues = issues;
    }
}

export function createEnv<TSchema extends EnvSchema>(
    options: CreateEnvOptions<TSchema>,
): ParsedEnv<TSchema>;
export function createEnv<TSchema extends EnvSchema, TOutput>(
    options: CreateEnvOptions<TSchema>,
    transform: (env: ParsedEnv<TSchema>) => TOutput,
): TOutput;
export function createEnv<TSchema extends EnvSchema, TOutput>(
    {
        schema,
        runtimeEnv,
        emptyStringAsUndefined = false,
    }: CreateEnvOptions<TSchema>,
    transform?: (env: ParsedEnv<TSchema>) => TOutput,
): ParsedEnv<TSchema> | TOutput {
    const parser = (
        isZodSchema(schema) ? schema : z.object(schema)
    ) as z.ZodType<ParsedEnv<TSchema>>;
    const result = parser.safeParse(
        emptyStringAsUndefined ? normalizeEmptyStrings(runtimeEnv) : runtimeEnv,
    );

    if (!result.success) {
        throw new EnvironmentValidationError(result.error.issues);
    }

    return transform ? transform(result.data) : result.data;
}

function isZodSchema(schema: EnvSchema): schema is z.ZodType {
    return "safeParse" in schema;
}

function normalizeEmptyStrings(runtimeEnv: RuntimeEnv): RuntimeEnv {
    const normalized: RuntimeEnv = {};

    for (const [key, value] of Object.entries(runtimeEnv)) {
        if (value === "") {
            normalized[key] = undefined;
            continue;
        }

        normalized[key] = value;
    }

    return normalized;
}

function formatEnvironmentIssues(issues: z.ZodIssue[]): string {
    const details = issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join(".") : "env";

            return `${path}: ${issue.message}`;
        })
        .join("; ");

    return `Invalid environment: ${details}`;
}
