import { defineConfig, globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";

export default defineConfig([
    globalIgnores(["dist/**/*"]),
    {
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 6,
            sourceType: "module",
        },
        files: [
            '**/*.ts'
        ],
        rules: {
            semi: "error",
            eqeqeq: "error",
        },
    }
]);
