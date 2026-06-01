import { hasConfigFlag, type ConfigFlagName } from "@modes/flag/config";

const TRUE_FLAG_VALUES = new Set([
    "1",
    "true",
    "on",
    "yes",
    "enabled",
    "enable",
]);

const FALSE_FLAG_VALUES = new Set([
    "0",
    "false",
    "off",
    "no",
    "disabled",
    "disable",
]);

export const parseFlagName = (
    name: string | undefined,
): ConfigFlagName | null => {
    if (!name) return null;

    const normalizedName = name
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");

    if (!hasConfigFlag(normalizedName)) {
        return null;
    }

    return normalizedName;
};

export const parseFlagValue = (value: string | undefined): boolean | null => {
    if (!value) return null;

    const normalizedValue = value.trim().toLowerCase();

    if (TRUE_FLAG_VALUES.has(normalizedValue)) {
        return true;
    }

    if (FALSE_FLAG_VALUES.has(normalizedValue)) {
        return false;
    }

    return null;
};

export const toFlagState = (value: boolean): "ON" | "OFF" => {
    return value ? "ON" : "OFF";
};
