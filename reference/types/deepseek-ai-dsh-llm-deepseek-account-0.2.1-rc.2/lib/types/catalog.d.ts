import type { CatalogSettings } from './config.ts';
import type { ModelListing } from './listing.ts';
/** Host-owned inputs of one catalog instance. */
export interface CatalogDependencies {
    /** Current endpoint settings, re-read on every access. */
    readonly settings: () => CatalogSettings;
    /** The account token allowed for `url`, or `undefined` while signed out. */
    readonly token: (url: string) => Promise<string | undefined>;
    /** Perform one listing request authenticated with `token`; `signal` carries the {@link LISTING_TIMEOUT} request deadline. */
    readonly load: (url: string, token: string, signal: AbortSignal) => Promise<ModelListing>;
    /** Wall clock used for listing age. */
    readonly now: () => number;
    /** Report a loaded listing. */
    readonly info: (message: string) => void;
    /** Report the first failure of a failing streak. */
    readonly warn: (message: string) => void;
}
/** What request resolution reads. */
export interface CatalogView {
    /** Whether an account token is available for the listing endpoint. */
    readonly signedIn: boolean;
    /** Last successful listing for this credential and endpoint; `undefined` until one succeeds. */
    readonly listing: ModelListing | undefined;
}
/** One account route's listing cache; each endpoint and credential pair has its own scope. */
export declare class AccountModelCatalog {
    private readonly dependencies;
    private scope;
    private listing;
    /** Settle time of the latest load in this scope; `undefined` before the first one settles. */
    private settledAt;
    private inflight;
    private request;
    private generation;
    private failing;
    private closed;
    /** @param dependencies - settings, credential, transport, clock, and diagnostic callbacks. */
    constructor(dependencies: CatalogDependencies);
    /**
     * The last published view, without I/O.
     * @returns the signed-in state and listing of the current scope.
     */
    current(): CatalogView;
    /**
     * Resolve the view for the current credential. The first access of a scope
     * waits for its load, which the request deadline bounds; later accesses
     * return at once and refresh a stale listing in the background.
     * @param signal - abandons this wait only; the shared load continues.
     * @returns the view after any first load of the scope settles.
     */
    view(signal?: AbortSignal): Promise<CatalogView>;
    /** Abort in-flight loads; later results and accesses change nothing. */
    dispose(): void;
    private rescope;
    private start;
}
//# sourceMappingURL=catalog.d.ts.map