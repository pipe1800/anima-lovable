import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/integrations/supabase/types.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      // TODO: project still uses `any` widely; track via warnings until full typing pass lands
      "@typescript-eslint/no-explicit-any": "warn",
      // Disallow importing the raw integrations supabase client anywhere except db/client.ts
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/integrations/supabase/client",
              message: "Import supabase from '@/db/client' to ensure centralization.",
            },
          ],
          patterns: [],
        },
      ],
    },
  }
  ,
  {
    files: ["src/db/client.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  }
);
