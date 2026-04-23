import * as ConfigUtils from "@common/general/config";
import { t } from "@lingui/core/macro";

export const {
    defaultConfig,
    createConfig,
    getFlagNames: getConfigFlagNames,
    hasFlag: hasConfigFlag,
    getFlagDescription: getConfigFlagDescription,
    getFlagValue: getConfigFlagValue,
    setFlagValue: setConfigFlagValue,
} = ConfigUtils.createConfig({
    defaultConfig: {
        flags: {
            losBlocking: false,
            requireQb: true,
        },
    },
    flags: {
        LOS_BLOCKING: {
            description: t`Blocks player crossings over the LOS during presnap positioning.`,
            getValue: (config) => config.flags.losBlocking,
            setValue: (config, value) => {
                config.flags = {
                    ...config.flags,
                    losBlocking: value,
                };
            },
        },
        REQUIRE_QB: {
            description: t`Requires a selected quarterback before the offense can snap.`,
            getValue: (config) => config.flags.requireQb,
            setValue: (config, value) => {
                config.flags = {
                    ...config.flags,
                    requireQb: value,
                };
            },
        },
    },
    clone: (config) => ({
        ...config,
        flags: {
            ...config.flags,
        },
    }),
});

export type Config = ReturnType<typeof createConfig>;
export type ConfigFlagName = ReturnType<typeof getConfigFlagNames>[number];
