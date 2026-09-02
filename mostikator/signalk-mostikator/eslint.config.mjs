import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    ".next-esp/**",
    "out/**",
    "out-esp/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
