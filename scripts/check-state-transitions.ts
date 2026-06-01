import path from "node:path";
import ts from "typescript";

type ModeTransitionCheckConfig = {
    name: string;
    registryFile: string;
    sourceRoot: string;
};

type TransitionCheckDiagnostic = {
    file: string;
    line: number;
    column: number;
    message: string;
};

type StateTarget = {
    name: string;
    paramsType?: ts.Type;
};

type ValidationTarget = {
    functionName: "$checkpoint" | "$next" | "start";
    targetPropertyName: "state" | "to";
};

const rootDir = path.resolve(__dirname, "..");

const modes: ModeTransitionCheckConfig[] = [
    {
        name: "Classic",
        registryFile: path.join(rootDir, "src/modes/classic/registry.ts"),
        sourceRoot: path.join(rootDir, "src/modes/classic"),
    },
    {
        name: "Flag",
        registryFile: path.join(rootDir, "src/modes/flag/registry.ts"),
        sourceRoot: path.join(rootDir, "src/modes/flag"),
    },
    {
        name: "Training",
        registryFile: path.join(rootDir, "src/modes/training/registry.ts"),
        sourceRoot: path.join(rootDir, "src/modes/training"),
    },
];

const normalizeFilePath = (filePath: string): string =>
    path.resolve(filePath).split(path.sep).join("/");

const getNodeLocation = (
    sourceFile: ts.SourceFile,
    node: ts.Node,
): Pick<TransitionCheckDiagnostic, "column" | "line"> => {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    return {
        line: location.line + 1,
        column: location.character + 1,
    };
};

const createDiagnostic = (
    sourceFile: ts.SourceFile,
    node: ts.Node,
    message: string,
): TransitionCheckDiagnostic => ({
    file: sourceFile.fileName,
    ...getNodeLocation(sourceFile, node),
    message,
});

const getPropertyName = (
    checker: ts.TypeChecker,
    propertyName: ts.PropertyName,
): string | null => {
    if (
        ts.isIdentifier(propertyName) ||
        ts.isStringLiteral(propertyName) ||
        ts.isNumericLiteral(propertyName)
    ) {
        return propertyName.text;
    }

    if (ts.isComputedPropertyName(propertyName)) {
        return getStringLiteralValue(checker, propertyName.expression);
    }

    return null;
};

const getStringLiteralValue = (
    checker: ts.TypeChecker,
    expression: ts.Expression,
): string | null => {
    if (ts.isStringLiteralLike(expression)) {
        return expression.text;
    }

    const type = checker.getTypeAtLocation(expression);

    if (type.isStringLiteral()) {
        return type.value;
    }

    return null;
};

const findPropertyAssignment = (
    checker: ts.TypeChecker,
    objectLiteral: ts.ObjectLiteralExpression,
    propertyName: string,
): ts.PropertyAssignment | null => {
    for (const property of objectLiteral.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        if (getPropertyName(checker, property.name) === propertyName) {
            return property;
        }
    }

    return null;
};

const isEmptyObjectLiteral = (expression: ts.Expression): boolean =>
    ts.isObjectLiteralExpression(expression) &&
    expression.properties.length === 0;

const acceptsMissingParams = (
    checker: ts.TypeChecker,
    target: StateTarget,
): boolean => {
    if (!target.paramsType) return true;

    return checker
        .getPropertiesOfType(target.paramsType)
        .every((property) => !!(property.flags & ts.SymbolFlags.Optional));
};

const isOptionalProperty = (property: ts.Symbol): boolean =>
    !!(property.flags & ts.SymbolFlags.Optional);

const isTypeAssignableWithoutUndefined = (
    checker: ts.TypeChecker,
    providedType: ts.Type,
    targetType: ts.Type,
): boolean => {
    const parts = providedType.isUnion() ? providedType.types : [providedType];
    const nonUndefinedParts = parts.filter(
        (part) => !(part.flags & ts.TypeFlags.Undefined),
    );

    if (nonUndefinedParts.length === 0) return true;

    return nonUndefinedParts.every((part) =>
        checker.isTypeAssignableTo(part, targetType),
    );
};

const isPropertyValueAssignable = (
    checker: ts.TypeChecker,
    providedType: ts.Type,
    targetType: ts.Type,
    targetProperty: ts.Symbol,
): boolean => {
    if (checker.isTypeAssignableTo(providedType, targetType)) return true;

    if (!isOptionalProperty(targetProperty)) return false;

    return isTypeAssignableWithoutUndefined(checker, providedType, targetType);
};

const formatType = (checker: ts.TypeChecker, type: ts.Type): string =>
    checker.typeToString(
        type,
        undefined,
        ts.TypeFormatFlags.NoTruncation |
            ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope,
    );

const validateObjectLiteralParams = (
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    paramsExpression: ts.ObjectLiteralExpression,
    target: StateTarget,
): TransitionCheckDiagnostic[] => {
    const diagnostics: TransitionCheckDiagnostic[] = [];
    const targetProps = new Map(
        checker
            .getPropertiesOfType(target.paramsType!)
            .map((property) => [property.name, property] as const),
    );
    const providedPropNames = new Set<string>();

    paramsExpression.properties.forEach((property) => {
        if (ts.isSpreadAssignment(property)) {
            diagnostics.push(
                createDiagnostic(
                    sourceFile,
                    property,
                    `Params for state "${target.name}" must not use object spread.`,
                ),
            );
            return;
        }

        if (
            !ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property)
        ) {
            diagnostics.push(
                createDiagnostic(
                    sourceFile,
                    property,
                    `Params for state "${target.name}" must use property assignments.`,
                ),
            );
            return;
        }

        const propertyName = getPropertyName(checker, property.name);

        if (!propertyName) {
            diagnostics.push(
                createDiagnostic(
                    sourceFile,
                    property.name,
                    `Params for state "${target.name}" must use statically named properties.`,
                ),
            );
            return;
        }

        providedPropNames.add(propertyName);

        const targetProperty = targetProps.get(propertyName);

        if (!targetProperty) {
            diagnostics.push(
                createDiagnostic(
                    sourceFile,
                    property.name,
                    `State "${target.name}" does not accept param "${propertyName}".`,
                ),
            );
            return;
        }

        const valueExpression = ts.isShorthandPropertyAssignment(property)
            ? property.name
            : property.initializer;
        const providedType = checker.getTypeAtLocation(valueExpression);
        const targetType = checker.getTypeOfSymbolAtLocation(
            targetProperty,
            targetProperty.valueDeclaration ?? paramsExpression,
        );

        if (
            isPropertyValueAssignable(
                checker,
                providedType,
                targetType,
                targetProperty,
            )
        ) {
            return;
        }

        diagnostics.push(
            createDiagnostic(
                sourceFile,
                valueExpression,
                `Param "${propertyName}" for state "${target.name}" has type ${formatType(
                    checker,
                    providedType,
                )}, but ${formatType(checker, targetType)} is required.`,
            ),
        );
    });

    targetProps.forEach((property) => {
        if (
            providedPropNames.has(property.name) ||
            isOptionalProperty(property)
        ) {
            return;
        }

        diagnostics.push(
            createDiagnostic(
                sourceFile,
                paramsExpression,
                `State "${target.name}" requires param "${property.name}".`,
            ),
        );
    });

    return diagnostics;
};

const validateParams = (
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    paramsExpression: ts.Expression | null,
    target: StateTarget,
): TransitionCheckDiagnostic[] => {
    if (!target.paramsType) {
        if (!paramsExpression || isEmptyObjectLiteral(paramsExpression))
            return [];

        return [
            createDiagnostic(
                sourceFile,
                paramsExpression,
                `State "${target.name}" does not declare params, but params were provided.`,
            ),
        ];
    }

    if (!paramsExpression) {
        if (acceptsMissingParams(checker, target)) return [];

        return [
            createDiagnostic(
                sourceFile,
                node,
                `State "${target.name}" requires params of type ${formatType(
                    checker,
                    target.paramsType,
                )}.`,
            ),
        ];
    }

    if (ts.isObjectLiteralExpression(paramsExpression)) {
        return validateObjectLiteralParams(
            checker,
            sourceFile,
            paramsExpression,
            target,
        );
    }

    const providedType = checker.getTypeAtLocation(paramsExpression);

    if (checker.isTypeAssignableTo(providedType, target.paramsType)) return [];

    return [
        createDiagnostic(
            sourceFile,
            paramsExpression,
            `Params for state "${target.name}" have type ${formatType(
                checker,
                providedType,
            )}, but ${formatType(checker, target.paramsType)} is required.`,
        ),
    ];
};

const findRegistryObject = (
    sourceFile: ts.SourceFile,
): ts.ObjectLiteralExpression | null => {
    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) continue;

        for (const declaration of statement.declarationList.declarations) {
            if (
                ts.isIdentifier(declaration.name) &&
                declaration.name.text === "registry" &&
                declaration.initializer &&
                ts.isObjectLiteralExpression(declaration.initializer)
            ) {
                return declaration.initializer;
            }
        }
    }

    return null;
};

const collectRegistryTargets = (
    program: ts.Program,
    config: ModeTransitionCheckConfig,
): {
    diagnostics: TransitionCheckDiagnostic[];
    targets: Map<string, StateTarget>;
} => {
    const checker = program.getTypeChecker();
    const registryFile = program.getSourceFile(config.registryFile);
    const diagnostics: TransitionCheckDiagnostic[] = [];
    const targets = new Map<string, StateTarget>();

    if (!registryFile) {
        diagnostics.push({
            file: config.registryFile,
            line: 1,
            column: 1,
            message: `Could not find ${config.name} registry file.`,
        });

        return { diagnostics, targets };
    }

    const registryObject = findRegistryObject(registryFile);

    if (!registryObject) {
        diagnostics.push(
            createDiagnostic(
                registryFile,
                registryFile,
                `Could not find ${config.name} registry object.`,
            ),
        );

        return { diagnostics, targets };
    }

    registryObject.properties.forEach((property) => {
        if (
            !ts.isPropertyAssignment(property) &&
            !ts.isShorthandPropertyAssignment(property)
        ) {
            return;
        }

        const stateName = getPropertyName(checker, property.name);
        if (!stateName) {
            diagnostics.push(
                createDiagnostic(
                    registryFile,
                    property.name,
                    "Registry state names must resolve to string literals.",
                ),
            );
            return;
        }

        const factoryExpression = ts.isShorthandPropertyAssignment(property)
            ? property.name
            : property.initializer;
        const factoryType = checker.getTypeAtLocation(factoryExpression);
        const signature = factoryType.getCallSignatures()[0];
        const paramsSymbol = signature?.getParameters()[0];
        const paramsType = paramsSymbol
            ? checker.getTypeOfSymbolAtLocation(paramsSymbol, factoryExpression)
            : undefined;

        targets.set(
            stateName,
            paramsType ? { name: stateName, paramsType } : { name: stateName },
        );
    });

    return { diagnostics, targets };
};

const validateTransitionObject = (
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    objectLiteral: ts.ObjectLiteralExpression,
    targets: Map<string, StateTarget>,
    validationTarget: ValidationTarget,
): TransitionCheckDiagnostic[] => {
    const diagnostics: TransitionCheckDiagnostic[] = [];
    const targetProperty = findPropertyAssignment(
        checker,
        objectLiteral,
        validationTarget.targetPropertyName,
    );

    if (!targetProperty) {
        diagnostics.push(
            createDiagnostic(
                sourceFile,
                objectLiteral,
                `${validationTarget.functionName} transition is missing "${validationTarget.targetPropertyName}".`,
            ),
        );
        return diagnostics;
    }

    const stateName = getStringLiteralValue(
        checker,
        targetProperty.initializer,
    );

    if (!stateName) {
        diagnostics.push(
            createDiagnostic(
                sourceFile,
                targetProperty.initializer,
                `${validationTarget.functionName} target must resolve to a string literal.`,
            ),
        );
        return diagnostics;
    }

    const target = targets.get(stateName);

    if (!target) {
        diagnostics.push(
            createDiagnostic(
                sourceFile,
                targetProperty.initializer,
                `Unknown state "${stateName}".`,
            ),
        );
        return diagnostics;
    }

    const paramsProperty = findPropertyAssignment(
        checker,
        objectLiteral,
        "params",
    );

    diagnostics.push(
        ...validateParams(
            checker,
            sourceFile,
            objectLiteral,
            paramsProperty?.initializer ?? null,
            target,
        ),
    );

    return diagnostics;
};

const isTransitionCall = (
    node: ts.CallExpression,
): "$checkpoint" | "$next" | null => {
    if (!ts.isIdentifier(node.expression)) return null;
    if (
        node.expression.text !== "$checkpoint" &&
        node.expression.text !== "$next"
    ) {
        return null;
    }

    return node.expression.text;
};

const isStartDeclarationName = (name: ts.BindingName): boolean =>
    ts.isIdentifier(name) && name.text.endsWith("START");

const checkSourceFile = (
    checker: ts.TypeChecker,
    sourceFile: ts.SourceFile,
    targets: Map<string, StateTarget>,
): TransitionCheckDiagnostic[] => {
    const diagnostics: TransitionCheckDiagnostic[] = [];

    const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
            const functionName = isTransitionCall(node);

            if (functionName) {
                const arg = node.arguments[0];

                if (!arg || !ts.isObjectLiteralExpression(arg)) {
                    diagnostics.push(
                        createDiagnostic(
                            sourceFile,
                            node,
                            `${functionName} transition must use an object literal argument.`,
                        ),
                    );
                } else {
                    diagnostics.push(
                        ...validateTransitionObject(
                            checker,
                            sourceFile,
                            arg,
                            targets,
                            {
                                functionName,
                                targetPropertyName: "to",
                            },
                        ),
                    );
                }
            }
        }

        if (ts.isPropertyAssignment(node)) {
            const propertyName = getPropertyName(checker, node.name);

            if (
                propertyName === "start" &&
                ts.isObjectLiteralExpression(node.initializer) &&
                findPropertyAssignment(checker, node.initializer, "state")
            ) {
                diagnostics.push(
                    ...validateTransitionObject(
                        checker,
                        sourceFile,
                        node.initializer,
                        targets,
                        {
                            functionName: "start",
                            targetPropertyName: "state",
                        },
                    ),
                );
            }
        }

        if (
            ts.isVariableDeclaration(node) &&
            isStartDeclarationName(node.name) &&
            node.initializer &&
            ts.isObjectLiteralExpression(node.initializer) &&
            findPropertyAssignment(checker, node.initializer, "state")
        ) {
            diagnostics.push(
                ...validateTransitionObject(
                    checker,
                    sourceFile,
                    node.initializer,
                    targets,
                    {
                        functionName: "start",
                        targetPropertyName: "state",
                    },
                ),
            );
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return diagnostics;
};

function checkStateTransitions(
    program: ts.Program,
    configs: ModeTransitionCheckConfig[],
): TransitionCheckDiagnostic[] {
    const checker = program.getTypeChecker();
    const diagnostics: TransitionCheckDiagnostic[] = [];

    configs.forEach((config) => {
        const { diagnostics: registryDiagnostics, targets } =
            collectRegistryTargets(program, config);

        diagnostics.push(...registryDiagnostics);

        if (targets.size === 0) return;

        const sourceRoot = normalizeFilePath(config.sourceRoot);

        program.getSourceFiles().forEach((sourceFile) => {
            if (sourceFile.isDeclarationFile) return;

            const sourceFilePath = normalizeFilePath(sourceFile.fileName);
            if (!sourceFilePath.startsWith(`${sourceRoot}/`)) return;

            diagnostics.push(...checkSourceFile(checker, sourceFile, targets));
        });
    });

    return diagnostics;
}

function createProgramFromTsConfig(tsconfigPath: string): ts.Program {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

    if (configFile.error) {
        throw new Error(
            ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
        );
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(tsconfigPath),
    );

    return ts.createProgram({
        rootNames: parsedConfig.fileNames,
        options: parsedConfig.options,
    });
}

const program = createProgramFromTsConfig(path.join(rootDir, "tsconfig.json"));
const diagnostics = checkStateTransitions(program, modes);

if (diagnostics.length > 0) {
    diagnostics.forEach((diagnostic) => {
        const relativeFile = path.relative(rootDir, diagnostic.file);
        console.error(
            `${relativeFile}:${diagnostic.line}:${diagnostic.column} - ${diagnostic.message}`,
        );
    });

    process.exit(1);
}

console.log("State transitions are valid.");
