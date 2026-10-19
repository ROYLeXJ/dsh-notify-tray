import { type ProfileManifest } from '@deepseek-ai/dsh-app-boot';
import type { PackageResult, Registry } from './types.ts';
export { setProfileVersionExemption, readProfileVersionExemptions } from '@deepseek-ai/dsh-app-boot';
/** Profile and invocation locations supplied by the launcher. */
export interface PackageOperationContext {
    profile: string;
    /** Explicit directory for an application-owned profile; named CLI profiles resolve under home. */
    dir?: string;
    installAnchor: string;
    cwd: string;
    home?: string;
}
/** Output and cancellation policy for one pnpm operation. */
export interface PackageOperationOptions {
    /** The pnpm executable name or path; resolved through `PATH` like the `dsh plugin` command. Defaults to `pnpm`. */
    command?: string;
    /** Prefix arguments for an application-owned executable. */
    args?: readonly string[];
    /** Application runtime environment, applied only to this package operation. */
    env?: Readonly<Record<string, string>>;
    /** CLI inherits authentication and terminal descriptors; service scrubs secrets and captures output. */
    execution: 'cli' | 'service';
    signal?: AbortSignal;
    outputBytes: number;
    onOutput?: (text: string, stream: 'stdout' | 'stderr') => void;
    activateNewBundles?: boolean;
    lockWaitMs?: number;
    /**
     * Terminate the run once its captured output has been silent for this long, in
     * milliseconds. A run stopped this way reports `timedOut`; without a bound, a
     * child that stops progressing without exiting holds its caller forever. A run
     * with inherited descriptors captures nothing and is never bound.
     */
    idleTimeoutMs?: number;
    /** Bound on the pre-install registry lookup, in milliseconds; without one a fixed bound applies. */
    lookupTimeoutMs?: number;
}
/** Resolve relative package specs against the caller's directory.
 * @param argument One pnpm argument.
 * @param cwd Invocation directory, never the profile directory.
 * @returns Anchored argument.
 */
export declare function anchorPathSpec(argument: string, cwd: string): string;
/** Read bundle metadata without loading its JavaScript.
 * @param name Installed dependency or installation-owned package name.
 * @param dir Profile directory.
 * @param anchor Installation manifest.
 * @returns Resolved metadata, or undefined for packages without bundle metadata.
 */
export declare function bundleManifest(name: string, dir: string, anchor: string): ProfileManifest | undefined;
/** Atomically save a profile manifest while retaining unrelated fields.
 * @param dir Profile directory.
 * @param manifest Updated document.
 */
export declare function saveManifest(dir: string, manifest: ProfileManifest): Promise<void>;
/** Execute pnpm inside a profile whose caller already holds the profile write lock.
 * Newly installed or updated direct dependencies are checked even when activation is disabled;
 * an untouched dependency never blocks an unrelated operation and stays denied at startup.
 * Compatibility denial restores the profile manifest and lockfile, but leaves downloaded modules on disk.
 * @param context Launcher-owned profile and resolution locations.
 * @param args Pnpm arguments, before relative path anchoring.
 * @param options Output, activation and cancellation policy.
 * @returns Exit status, whether the silence bound stopped the run, and the diagnostic path.
 * A compatibility denial returns exit code 1. Service output is bounded; CLI output uses inherited descriptors.
 * The diagnostic file is closed on return or rejection, including preparation and spawn failures.
 */
export declare function runProfilePnpm(context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions): Promise<PackageResult>;
/** Initialize and run the dsh plugin command with the same write lock as the service.
 * @param context Launcher-owned locations.
 * @param args Pnpm arguments.
 * @param options Output and cancellation policy.
 * @returns Completed package-manager result.
 */
export declare function runPluginCommand(context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions): Promise<PackageResult>;
/** What one registry lookup answered. */
export interface PackageViewResult {
    /** pnpm's exit code, null when it ended without one or never started. */
    exitCode: number | null;
    stdout: string;
    stderr: string;
    /** The lookup ran past its bound and was killed. */
    timedOut: boolean;
    /** The failure of starting pnpm at all, when that is what happened. */
    cause?: unknown;
}
/** Bounds of one registry lookup. */
export interface PackageViewOptions {
    /** The pnpm executable name or path. Defaults to `pnpm`. */
    command?: string;
    /** Prefix arguments for an application-owned executable. */
    args?: readonly string[];
    /** Application runtime environment, applied only to this package operation. */
    env?: Readonly<Record<string, string>>;
    /** Ends the lookup early; the caller's signal, when it has one. */
    signal?: AbortSignal;
    /** Bound on the lookup, in milliseconds. */
    timeoutMs: number;
    /** The registry asked; null asks the one pnpm's own configuration names. */
    registry?: Registry;
}
/**
 * Read the registry pnpm's own configuration names in the profile: its `.npmrc` chain and workspace settings,
 * as `pnpm config get registry` resolves them.
 * @param dir Profile directory.
 * @param options The pnpm executable and the time bound.
 * @returns The registry URL as pnpm printed it, or null when pnpm did not answer with one.
 */
export declare function readProfileRegistry(dir: string, options: {
    command?: string;
    args?: readonly string[];
    env?: Readonly<Record<string, string>>;
    timeoutMs: number;
}): Promise<string | null>;
/**
 * The argument that sends one pnpm command to a registry.
 * @param registry - the registry, or null for the one pnpm's own configuration names.
 * @returns `--registry=<url>` for a URL; nothing for null.
 */
export declare function registryArguments(registry: Registry): string[];
/**
 * Ask the registry what a spec names through `pnpm view`, run in the profile
 * directory so the registry, proxy, and authentication settings of an install
 * apply. The lookup makes one request without pnpm's own retries: a registry
 * that does not answer is reported within `timeoutMs`, and the registries
 * configured after it are the retry.
 * @param dir Profile directory.
 * @param spec One registry spec: a package name with an optional range.
 * @param options The registry, cancellation, and the time bound.
 * @returns pnpm's exit, output, and how the lookup ended.
 */
export declare function viewProfilePackage(dir: string, spec: string, options: PackageViewOptions): Promise<PackageViewResult>;
//# sourceMappingURL=operations.d.ts.map