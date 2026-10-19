import { ClientEntries } from './entries.ts';
import type { BootManifest, ClientModuleLoader, ClientModuleRecord, ClientModuleSystemOptions } from './manifest.ts';
/**
 * The client module system: state tables plus the arrival/materialization
 * machinery implementing {@link ClientModuleLoader} (whose members carry the
 * contract documentation). Construction indexes the boot rows, retains the
 * already-materialized bootstrap module, and switches the HTML-installed
 * loader facade from its pending queue to live registration.
 */
export declare class ClientModuleSystem implements ClientModuleLoader {
    readonly version = "client";
    manifest: BootManifest;
    readonly entries: ClientEntries;
    readonly loadCache: Map<string, ClientModuleRecord>;
    private readonly seed;
    private readonly factories;
    private readonly bootstrapIds;
    /** In-flight script transport per URL; every row in one batch shares it. */
    private readonly pendingArrival;
    /** Owner generation captured by in-flight chunk requests and advanced on invalidation. */
    private readonly generations;
    /** Single-resource combo URL selected by HMR after invalidating one row. */
    private readonly reloadTargets;
    /** Materialization re-entrancy guard: factory-form CJS cannot deliver partial exports, so a cycle is fatal. */
    private readonly materializing;
    private readonly graphRows;
    private readonly loadBundle;
    /** Last import or prefetch failure per graph row, cleared by a later success or invalidation. */
    private readonly importErrors;
    /** Batch URLs whose transport or execution already failed; rows still missing from them go straight to their one-resource URL. */
    private readonly failedBundleUrls;
    /** Every URL whose script has executed once; a batch among them is never requested again. */
    private readonly executedBundleUrls;
    /**
     * Build the module system over the parsed boot rows.
     * @param options - Parsed graph, platform seed, bootstrap module, registration facade, and transport.
     */
    constructor(options: ClientModuleSystemOptions);
    /** Register one bundle factory, rejecting a script that executes twice without invalidation. */
    private register;
    /** Run one bundle transport per URL; every row waiting on the same URL shares the in-flight request. */
    private loadShared;
    /**
     * Load one graph row so its factory is registered (idempotent per in-flight
     * arrival). A batch script is one classic script that registers every
     * package in sequence, and {@link register} rejects a second registration,
     * so the two failure kinds differ: a transport failure (`error` event, nothing
     * executed) is retried once on the same URL; a script that loaded without
     * registering this row (a parse error registered nothing, or a runtime throw
     * stopped it after registering others) is never re-executed, because a replay
     * would stop again at the first duplicate registration; that holds even when
     * the row that first imports from the batch is one it did register, because
     * every executed batch URL is remembered. Either way the row then falls back
     * to its own one-resource URL, which the Host serves for every package, so one
     * failed batch costs at most three requests per missing row and never fails
     * the rows that were registered.
     */
    private arrive;
    /** Register each injected package and unresolved dynamic request before its consumer. */
    private arriveGraphRow;
    /** Arrive one dependency, naming the consumer it failed for so a cascade reads as a chain, not as 44 unrelated failures. */
    private arriveDependency;
    /** Materialize a registered factory (synchronous; memoized in loadCache). */
    private materialize;
    /** Build the synchronous module-table require and its asynchronous chunk operation. */
    private makeRequire;
    /** Load, register, and materialize one package-local dynamic chunk. */
    private importChunk;
    import(specifier: string): Promise<unknown>;
    prefetch(id: string): Promise<void>;
    importError(id: string): Error | undefined;
    /**
     * Run one graph-row operation, recording its failure for the boot audit and
     * clearing the record on success. Arrival and materialization both run in
     * here, so a factory that throws is recorded as well as a bundle that never
     * arrived; the Loader only sees a missing fiber either way.
     */
    private recordingImportError;
    /** Refresh descriptors and unowned factory revisions before any entry imports its dependencies. */
    private updateManifest;
    /** Retain live Loader modules and their transitive requests before evicting unreferenced graph records. */
    private prune;
    invalidate(id: string, rev?: string): void;
}
//# sourceMappingURL=system.d.ts.map