import base from "@repo/eslint-config/base";
import reactInternal from "@repo/eslint-config/react-internal";
import next from "@repo/eslint-config/next";

export default [...base, ...reactInternal, ...next];
