import base from "@repo/eslint-config/base";

export default [
  ...base,
  {
    languageOptions: {
      globals: {
        Bun: "readonly",
      },
    },
  },
];
