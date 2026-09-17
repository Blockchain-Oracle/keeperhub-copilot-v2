import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  {
    // Non-app trees stay out of lint scope (planning artifacts, reference checkouts).
    ignores: [
      "node_modules/**",
      ".next/**",
      "references/**",
      "_bmad/**",
      "_bmad-output/**",
      "design-artifacts/**",
      "docs/**",
      ".thoughts/**",
      ".claude/**",
      ".agents/**",
      ".playwright-mcp/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // Config lint: every env read goes through the typed loader (AD-1).
    // The syntax selectors close the obvious evasions of the property rule:
    // aliasing/destructuring process, globalThis.process.env, process["env"].
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read configuration through lib/config.ts (getConfig), never process.env directly.",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "VariableDeclarator[init.name='process']",
          message:
            "Do not alias or destructure process; read configuration through lib/config.ts (getConfig).",
        },
        {
          selector:
            "MemberExpression[object.object.name='globalThis'][object.property.name='process'][property.name='env']",
          message:
            "Read configuration through lib/config.ts (getConfig), never process.env directly.",
        },
        {
          selector:
            "MemberExpression[object.name='process'][property.value='env']",
          message:
            "Read configuration through lib/config.ts (getConfig), never process.env directly.",
        },
      ],
    },
  },
  {
    // The two sanctioned env readers: the typed loader and drizzle-kit's config.
    files: ["lib/config.ts", "drizzle.config.ts"],
    rules: {
      "no-restricted-properties": "off",
      "no-restricted-syntax": "off",
    },
  },
];

export default config;
