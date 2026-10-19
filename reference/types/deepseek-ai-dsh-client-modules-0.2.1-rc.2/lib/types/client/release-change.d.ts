/** Which Host graphs a page may apply: only graphs of the release the page booted from. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { WebBootRelease } from './manifest.ts';
/** The connected Host serves another release than the one this page booted from; plugin updates wait for a page reload. */
export interface ClientReleaseChange {
    /** Release this page booted from; every module the page runs belongs to it. */
    readonly page: WebBootRelease | undefined;
    /** Release the Host served before its latest release change. */
    readonly previous: WebBootRelease | undefined;
    /** Release of the connected Host. */
    readonly host: WebBootRelease | undefined;
}
/**
 * Tracks the connected Host's release against the page's boot release. The page applies graphs and
 * rebuilt frames only while both match, so every module it runs belongs to its boot release; another
 * release waits for a page reload. A mismatch is announced unless the page dismissed that Host release.
 */
export declare class ReleaseChangeGate {
    private readonly page;
    /** Prompt-worthy release change; undefined while the Host serves the boot release or a dismissed one. */
    readonly change: ObservableSnapshot<ClientReleaseChange | undefined>;
    private snapshot;
    private readonly listeners;
    private host;
    /** Host release the page last dismissed; a holder because an unpublished release is itself a value. */
    private dismissed;
    /**
     * Start with the Host that served the boot graph.
     * @param page - boot graph's release identity.
     */
    constructor(page: WebBootRelease | undefined);
    /** Whether the connected Host serves the page's boot release; graphs and rebuilt frames apply only then. */
    get matches(): boolean;
    /**
     * Record the release of a received Host graph and update the announced change.
     * @param release - release identity of the received graph.
     * @returns true when the graph belongs to the page's boot release and may be applied.
     */
    observe(release: WebBootRelease | undefined): boolean;
    /** Stop announcing the connected Host's release; the page keeps its boot release and still applies no other release. */
    dismiss(): void;
    private publish;
}
//# sourceMappingURL=release-change.d.ts.map