import type { ParsedInstallSpec } from './install-spec.ts';
import type { PackageResult } from './types.ts';
/** Deadline, diagnostics and cancellation for one read-only GitHub check. */
export interface GithubConnectionOptions {
    timeoutMs: number;
    outputBytes: number;
    signal: AbortSignal;
    /** The application-owned package manager's environment, also used by its Git children. */
    env?: Readonly<Record<string, string>>;
}
/**
 * Check a GitHub repository before pnpm starts, without downloading or building its package.
 * Git reads the profile's Git and proxy configuration without invoking credential helpers or prompting.
 * Timeout and cancellation terminate its descendants too; pnpm owns authentication and transport fallback.
 * @param spec The parsed installation address; npm packages, local paths and other hosts are not checked.
 * @param dir The profile directory where installation runs.
 * @param options The connection deadline, output bound and operation cancellation.
 * @returns A failed check with bounded output and a complete log at logPath, or undefined for a reachable repository or an unhandled spec.
 */
export declare function checkGithubConnection(spec: ParsedInstallSpec, dir: string, options: GithubConnectionOptions): Promise<PackageResult | undefined>;
//# sourceMappingURL=github-connection.d.ts.map