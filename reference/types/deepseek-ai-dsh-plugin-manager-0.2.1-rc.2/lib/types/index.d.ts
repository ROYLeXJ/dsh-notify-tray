import { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { BundleInfo, ChangeResult, InspectOptions, InstallBundleOptions, PluginEntryId, PluginInfo, PluginInstallCancellation, PluginInstallRequestId, PluginRegistries, PluginSpecInspection } from './types.ts';
export type * from './types.ts';
export { classifyInstallFailure, type InstallFailureFacts } from './install-failure.ts';
export { InvalidInstallSpecError, parseInstallSpec, type ParsedInstallSpec } from './install-spec.ts';
/** The pnpm executable, registries, and limits for diagnostics, lookups and connection checks. */
export interface Config {
    /** The pnpm executable name or path; resolved through `PATH` like the `dsh plugin` command. */
    pnpmCommand?: string;
    /** Maximum retained package-operation diagnostic bytes. */
    outputBytes?: number;
    /** Maximum time to wait for another process's profile package operation. */
    lockWaitMs?: number;
    /** Bound on one registry lookup an inspection runs, in milliseconds. */
    inspectTimeoutMs?: number;
    /** Maximum duration of the GitHub repository connection check before installation, in milliseconds. */
    githubConnectionTimeoutMs?: number;
    /** Maximum time one captured package run may print nothing before the manager terminates it, in milliseconds. */
    idleTimeoutMs?: number;
    /** The registry lookups and installations ask first, as an http(s) URL; absent, the one pnpm's own configuration names. */
    registry?: string;
    /**
     * Registries asked in turn, as http(s) URLs, while the one before is unreachable or holds no copy of the package.
     * A registry outside this set and `registry` is asked alone, and so is the one pnpm's own configuration names
     * unless that is npm's own registry or one of these.
     */
    fallbackRegistries?: string[];
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Persistent management of the current profile's composition and packages. */
        pluginManager: PluginManager;
    }
}
/** Manage profile files and apply their declared reload lifecycle. */
export declare class PluginManager extends TypertRemoteService {
    static inject: string[];
    static Config: z<Config>;
    /** Management bundles remain protected if their files become unreadable. */
    private readonly managementBundles;
    /**
     * The registry each package was last installed from by this manager in this process. pnpm verifies lockfile tarball
     * URLs against its default registry unless they belong to a named registry, so a later removal names it again.
     */
    private readonly installedFrom;
    private readonly ownerEntryId;
    private readonly packageOperations;
    private readonly profile;
    private readonly outputBytes;
    private readonly lockWaitMs;
    private readonly inspectTimeoutMs;
    private readonly githubConnectionTimeoutMs;
    private readonly idleTimeoutMs;
    private readonly pnpmCommand;
    private readonly configuredRegistries;
    private readonly ownerContext;
    private readonly abort;
    /** Installations by request id, from their call until it settles. */
    private readonly installs;
    constructor(ctx: Context, config: Config);
    /** Read exact plugin-version exemptions saved in this profile.
     * @returns Accepted package-name@version keys with the runtime versions they may run on, and any
     * record or file problem the reader rejected, which the caller reports instead of failing.
     */
    listVersionExemptions(): {
        exemptions: Record<string, string[]>;
        warnings: string[];
    };
    /** Grant or revoke one exact plugin/runtime exemption and reevaluate live plugins.
     * @param packageVersion Exact manifest package name followed by @ and its version; never an installation spec or alias.
     * @param runtimeVersion Exact current DSH version for grants; revocation may name a previous runtime.
     * @param enabled Whether to grant rather than revoke the exemption.
     * @param acceptRisk Required true for grants after the user accepts possible crashes and data loss.
     * @returns Saved and runtime outcomes. Startup-only profiles require restart.
     */
    setVersionExemption(packageVersion: string, runtimeVersion: string, enabled: boolean, acceptRisk?: boolean): Promise<ChangeResult>;
    /** Read current plugins, including why a row cannot be changed through the profile patch.
     * @returns Current runtime entries with persistent patch targets.
     */
    listPlugins(): Promise<PluginInfo[]>;
    /** Read installed, installation-provided, and offline Official catalog bundles, plus selected non-bundle names.
     * A dependency without a bundle patch is listed, as a `not-bundle` problem, only while it is selected.
     * @returns Package versions, manifest descriptions, the installable spec of profile dependencies, rows, optional
     * display metadata, activation selections, whether the installation offers the bundle, and removal availability.
     */
    listBundles(): Promise<BundleInfo[]>;
    /** Read the registries this manager asks: the configured first one, its fallbacks in order, and what pnpm's own configuration names.
     * @returns The registries in pnpm's comparison form; null is the one pnpm's own configuration names, `resolved` as pnpm reads it now.
     */
    registries(): Promise<PluginRegistries>;
    /** Read what a spec names before installing it.
     * @param spec One package spec: a registry name, an absolute path, a git address, or a tarball.
     * @param options The registry asked first.
     * @param signal Ends a registry lookup early.
     * @returns The package the spec names, or why it is refused.
     */
    inspect(spec: string, options?: InspectOptions, signal?: AbortSignal): Promise<PluginSpecInspection>;
    /** Persist a plugin entry's desired enablement and apply it on live profiles.
     * @param id Loader entry identity returned by listPlugins.
     * @param enabled Whether the plugin should run.
     * @returns Saved and runtime outcomes, including higher-priority overrides.
     */
    setPluginEnabled(id: PluginEntryId, enabled: boolean): Promise<ChangeResult>;
    /** Select or remove a bundle layer while retaining installed dependencies.
     * @param name Bundle package name.
     * @param enabled Whether the bundle contributes its patch layer.
     * @returns Persisted and runtime outcomes.
     */
    setBundleEnabled(name: string, enabled: boolean): Promise<ChangeResult>;
    /**
     * Install a package using the same pnpm implementation as dsh plugin. GitHub
     * repositories get a connection check bounded by githubConnectionTimeoutMs before pnpm starts;
     * only network failures or timeouts stop installation, while pnpm owns authentication and transport fallback. A run
     * that fails, is cancelled, or adds a package without a bundle patch restores
     * `package.json` and `pnpm-lock.yaml` as they were; downloaded files can stay.
     * @param spec One package spec, including local paths relative to the invocation directory.
     * @param options Whether to activate the installed bundle (defaults to true), the request id a cancellation names,
     * the pending build scripts to allow, whether to save an exact dependency, and the registry asked first.
     * @returns Package-manager diagnostics, the registries asked, and the observed activation outcome.
     */
    installBundle(spec: string, options?: InstallBundleOptions): Promise<ChangeResult>;
    /** Recover the result of an active installation without cancelling it.
     * @param requestId The id supplied when installation started.
     * @returns The installation's outcome after it settles, or null if no active request has that id.
     * Completed results are not retained; null establishes neither success nor cancellation.
     */
    waitForInstall(requestId: PluginInstallRequestId): Promise<ChangeResult | null>;
    /** Stop an installation this manager owns and wait until its files are back.
     * @param requestId The id the installation was started with.
     * @returns `cancelled` once the Git check or pnpm exited and the files are restored, `too-late` once the bundle is being
     * applied, `not-running` for any other id.
     */
    cancelInstall(requestId: PluginInstallRequestId): Promise<PluginInstallCancellation>;
    /** Unload and remove a profile-owned bundle dependency through dsh plugin's pnpm path; a selected name no
     * dependency holds is only deselected.
     * @param name Installed dependency or selected bundle name.
     * @returns Removal diagnostics and the remaining profile state.
     */
    removeBundle(name: string): Promise<ChangeResult>;
    /** The rows a bundle's patch inserts and the existing rows it changes; an unreadable patch throws. */
    private declaredRows;
    /** Run one pnpm command in the profile, streaming its output as install-log chunks. */
    private runPnpm;
    /** The profile files an installation may rewrite, as they are now; absent files read as undefined. */
    private readRestoredFiles;
    /** Put the profile files back; pnpm has exited by the time this runs. */
    private restoreFiles;
    private selectBundle;
    private bundleRows;
    private protectsManager;
    private configure;
    /**
     * Publish the profile's runtime resolution without HMR, unless a deselected startup bundle still runs and needs the
     * current table. A publication that needs a restart waits for the restart the result already reports.
     */
    private refreshPackages;
    /**
     * Apply a package change: without HMR, publish the runtime resolution when that is safe, then {@link reload}.
     * @param requiredIds Entry ids that must start.
     * @returns The reload's outcome.
     */
    private publishAndReload;
    /**
     * Apply the saved profile; with HMR it recomposes live, including the runtime resolution.
     * @param requiredIds Entry ids that must start.
     * @returns Warnings about entries that were already inactive, and why the change waits for a restart, if it does.
     */
    private reload;
    private change;
    private diskState;
}
export default PluginManager;
//# sourceMappingURL=index.d.ts.map