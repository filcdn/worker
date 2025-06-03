/// <reference types="vite/client" />

/** @param {Env} env */
export async function applyMigrations(env) {
  const modules = import.meta.glob('./migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  })

  const migrations = Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, sql]) => /** @type {string} */ (sql))

  for (const sql of migrations) {
    const statements = sql
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)

    for (const stmt of statements) {
      await env.DB.prepare(stmt).run()
    }
  }
}
