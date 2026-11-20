declare module 'node:sqlite' {
  export type BindParam = string | number | bigint | null | Uint8Array;

  export interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    run(...params: BindParam[]): RunResult;
    get(...params: BindParam[]): Record<string, unknown> | undefined;
    all(...params: BindParam[]): Array<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
}

declare const process: {
  cwd(): string;
};
