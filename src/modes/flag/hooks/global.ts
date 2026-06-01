import { createGlobalHook } from "@runtime/runtime";
import { flagGlobalSchema } from "@modes/flag/global";

export const $global = createGlobalHook<typeof flagGlobalSchema>();
