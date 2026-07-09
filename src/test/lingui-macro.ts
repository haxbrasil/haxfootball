type PluralForms = Record<string, string>;

export function t(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
): string {
    return strings.reduce(
        (message, part, index) =>
            `${message}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
    );
}

export function plural(value: number, forms: PluralForms): string {
    if (value === 1 && forms["one"]) return forms["one"];
    if (value === 2 && forms["two"]) return forms["two"];
    if (value === 3 && forms["few"]) return forms["few"];

    return forms["other"] ?? String(value);
}
