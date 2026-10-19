import type { Loader } from '@deepseek-ai/cordis-plugin-loader';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { BootManifest, ClientModuleLoader } from './manifest.ts';
import { type ClientReleaseChange } from './release-change.ts';
/** Page-local failures do not change the Host's bundle enablement. */
export interface ClientEntryState {
    /** True while a snapshot, retry or code replacement is being applied. */
    readonly syncing: boolean;
    /** Package ids and errors from the latest reconciliation. */
    readonly failures: readonly {
        readonly id: string;
        readonly message: string;
    }[];
}
/** Module-table capabilities used within serialized entry operations. */
interface ModuleIndex {
    update(manifest: BootManifest, managed: Iterable<string>): void;
    invalidateForReplacement(id: string, rev: string): void;
    prune(roots: Iterable<string>): void;
}
/** Manages only entries created from the Host manifest; other Loader contributors retain ownership. */
export declare class ClientEntries {
    private readonly modules;
    private readonly index;
    /** Stable observable consumed by page diagnostics through the renderer's injected hook. */
    readonly state: ObservableSnapshot<ClientEntryState>;
    private snapshot;
    private readonly listeners;
    /** Admits only Host graphs of the page's boot release. */
    private readonly release;
    private readonly managed;
    private readonly revisions;
    private loader;
    private queue;
    private desired;
    private generation;
    private stopped;
    /**
     * Construct the page controller before Cordis boot.
     * @param modules - Module arrival and materialization owner.
     * @param index - Private descriptor replacement and unused-module cleanup.
     */
    constructor(modules: ClientModuleLoader, index: ModuleIndex);
    /** Host release change to announce; undefined while the Host serves the page's boot release or a dismissed one. */
    get releaseChange(): ObservableSnapshot<ClientReleaseChange | undefined>;
    /** Stop announcing the connected Host's release; updates stay paused until the Host returns to the boot release or the page reloads. */
    dismissRelease(): void;
    /**
     * Create the initial roster and retain its entry identities for subsequent reconciliation.
     * @param loader - Page Loader, already configured with the module system.
     * @param manifest - Initial roster audited by the boot caller.
     * @returns after initial entries and their activation settle; boot owns its activation audit.
     */
    start(loader: Loader, manifest: BootManifest): Promise<void>;
    /**
     * Validate and apply the latest full Host graph. Changed targets cancel obsolete mounts; identical targets share pending loads.
     * The release is compared before the rest of the graph is validated: a graph of another release, including one whose
     * format this page cannot read, is not applied and {@link releaseChange} announces it.
     * @param graph - JSON-decoded graph received from the Host.
     * @returns after the queued reconciliation, or at once for another release; per-package failures remain available in {@link state}.
     */
    sync(graph: unknown): Promise<void>;
    /**
     * Retry failed entries against the latest graph, including an unchanged revision.
     * @returns after retry settlement, with remaining errors in {@link state}.
     */
    retry(): Promise<void>;
    /**
     * Replace one entry's code in the same queue as graph updates; duplicate revisions are ignored.
     * Entries missing after a failed import are reconciled; bootstrap replacement fails before teardown.
     * Ignored while the connected Host serves another release than the page's boot release.
     * @param id - Package id from a rebuilt frame.
     * @param rev - Opaque revision selecting the rebuilt artifact.
     * @returns after queued work; replacement errors reject, while per-package reconciliation errors remain in {@link state}.
     */
    reload(id: string, rev: string): Promise<void>;
    private publish;
    private enqueue;
    private current;
    /** Keep ownership even when Loader rejects a module's plugin exports after inserting its entry. */
    private create;
    private replace;
    private reconcile;
}
export {};
//# sourceMappingURL=entries.d.ts.map