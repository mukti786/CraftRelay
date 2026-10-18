import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat";

export default defineConfig([
  ...expoConfig,
  {
    rules: {
      // Enforce explicit return types on exported functions
      "@typescript-eslint/explicit-function-return-type": "off",
      // Allow unused vars prefixed with _
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    ignores: [
      "node_modules/",
      ".expo/",
      "dist/",
      "android/",
      "ios/",
    ],
  },
]);
