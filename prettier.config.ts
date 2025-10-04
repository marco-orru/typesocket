import type { Config } from "prettier";

const config: Config = {
  semi: true,
  singleQuote: true,
  quoteProps: "consistent",
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  printWidth: 180,
  tabWidth: 2,
  useTabs: true,
  endOfLine: "lf",
  proseWrap: "preserve",
  embeddedLanguageFormatting: "auto",
  htmlWhitespaceSensitivity: "css",
};

export default config;
