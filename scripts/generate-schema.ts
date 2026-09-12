/**
 * Embeds the SQL files into a TypeScript module.
 *
 * The deployed app runs its own migration, and a serverless bundle does not
 * reliably carry loose .sql files. The .sql files stay the source of truth;
 * this generates the module and a test keeps the two in step.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/0001_init.sql";
const SEED = "supabase/seed.sql";
export const OUTPUT = "src/lib/setup/schema.generated.ts";

function quote(text: string): string {
  return "`" + text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
}

export function render(): string {
  const migration = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");
  const seed = readFileSync(resolve(process.cwd(), SEED), "utf8");

  return `// GENERATED FILE - do not edit.
// Run \`npm run generate:schema\` after changing the SQL under supabase/.
// Source: ${MIGRATION} and ${SEED}

export const MIGRATION_SQL = ${quote(migration)};

export const SEED_SQL = ${quote(seed)};
`;
}

if (process.argv[1]?.endsWith("generate-schema.ts")) {
  writeFileSync(resolve(process.cwd(), OUTPUT), render());
  console.log(`wrote ${OUTPUT}`);
}
