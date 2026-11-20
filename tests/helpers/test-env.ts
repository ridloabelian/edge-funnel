import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync, type BindParam } from 'node:sqlite';
import type { Env } from '../../src/types';
import { sha256Hex } from '../../src/utils/crypto';

/**
 * Lightweight in-memory Cloudflare D1Database adapter backed by Node 22 built-in `node:sqlite`.
 * Enforces D1 bind behavior (rejects `undefined`) and supports `.prepare().bind().first/all/run`
 * as well as `db.batch()`.
 */
export class MockD1Database {
  public readonly sqlite: DatabaseSync;

  constructor(sqlite: DatabaseSync) {
    this.sqlite = sqlite;
  }

  prepare(query: string): D1PreparedStatement {
    return new MockD1PreparedStatement(this.sqlite, query) as unknown as D1PreparedStatement;
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result<T>[] = [];
    for (const stmt of statements) {
      results.push((await stmt.all<T>()) as D1Result<T>);
    }
    return results;
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sqlite.exec(query);
    return { count: 1, duration: 0 };
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }

  withSession(): D1DatabaseSession {
    return this as unknown as D1DatabaseSession;
  }
}

class MockD1PreparedStatement {
  private params: BindParam[] = [];

  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): MockD1PreparedStatement {
    const next = new MockD1PreparedStatement(this.sqlite, this.query);
    next.params = values.map((v, idx) => {
      if (v === undefined) {
        throw new Error(`D1_TYPE_ERROR: bind parameter #${idx + 1} is undefined`);
      }
      if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
        return v;
      }
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (v instanceof Uint8Array) return v;
      return String(v);
    });
    return next;
  }

  private createMeta(changes: number, lastRowId: number): D1Result['meta'] {
    return {
      duration: 0,
      size_after: 0,
      rows_read: 0,
      rows_written: changes,
      last_row_id: lastRowId,
      changed_db: changes > 0,
      changes,
    };
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const stmt = this.sqlite.prepare(this.query);
    const row = stmt.get(...this.params);
    if (!row) return null;
    if (colName) {
      return (row[colName] as T) ?? null;
    }
    return row as T;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const stmt = this.sqlite.prepare(this.query);
    const trimmed = this.query.trim().toUpperCase();
    if (
      trimmed.startsWith('SELECT') ||
      trimmed.startsWith('WITH') ||
      trimmed.includes('RETURNING')
    ) {
      const rows = stmt.all(...this.params) as T[];
      return {
        results: rows,
        success: true,
        meta: this.createMeta(0, 0),
      };
    }
    const info = stmt.run(...this.params);
    return {
      results: [] as T[],
      success: true,
      meta: this.createMeta(Number(info.changes), Number(info.lastInsertRowid)),
    };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    const res = await this.all<Record<string, unknown>>();
    return res.results.map((r) => Object.values(r)) as T[];
  }

  async run(): Promise<D1Result> {
    const stmt = this.sqlite.prepare(this.query);
    const info = stmt.run(...this.params);
    return {
      results: [],
      success: true,
      meta: this.createMeta(Number(info.changes), Number(info.lastInsertRowid)),
    };
  }
}

export class TestExecutionContext {
  public readonly promises: Promise<unknown>[] = [];
  public readonly props: Record<string, unknown> = {};

  waitUntil(promise: Promise<unknown>): void {
    this.promises.push(promise);
  }

  passThroughOnException(): void {
    // no-op
  }

  async flush(): Promise<void> {
    await Promise.all(this.promises);
  }
}

export function createTestEnv(overrides?: Partial<Env>): {
  env: Env;
  sqlite: DatabaseSync;
  ctx: TestExecutionContext;
} {
  const sqlite = new DatabaseSync(':memory:');
  const migrationSql = readFileSync(resolve(process.cwd(), 'migrations/0001_init.sql'), 'utf8');
  sqlite.exec(migrationSql);

  const db = new MockD1Database(sqlite) as unknown as D1Database;
  const env: Env = {
    DB: db,
    DEFAULT_WORKSPACE_SLUG: 'saif-growth',
    USD_TO_IDR_RATE: '16000',
    ...overrides,
  };
  return { env, sqlite, ctx: new TestExecutionContext() };
}

export async function seedTestWorkspace(
  db: D1Database,
  opts: {
    id: string;
    slug: string;
    name: string;
    apiKey: string;
    webhookSecret: string;
    settings?: Record<string, string>;
  }
): Promise<void> {
  const apiKeyHash = await sha256Hex(opts.apiKey);
  await db
    .prepare(
      `INSERT INTO workspaces (
        id, slug, name, api_key_hash, webhook_secret, settings_json
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.id,
      opts.slug,
      opts.name,
      apiKeyHash,
      opts.webhookSecret,
      JSON.stringify(opts.settings ?? {})
    )
    .run();
}
