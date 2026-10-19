/**
 * Workspace entity registry (`ctx.workspaceRegistry`): durable workspace records,
 * stable registry order, and header-validated session membership over the
 * domain data form.
 * @module @deepseek-ai/dsh-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session';
export { WorkspaceMoveInvalidError } from './entity.ts';
import type { SessionActivity, Workspace, WorkspaceId as WorkspaceIdBrand } from './types.ts';
export type { SessionActivity, SessionActivityItem, SessionActivityKind, SessionActivityKindMap, Workspace, } from './types.ts';
export { workspaceDomainState, workspaceRecord, workspaceDomainSpec } from './spec.ts';
export type { WorkspaceDomainState, WorkspaceRecord } from './spec.ts';
export { realpathNormalize } from './paths.ts';
/** Identifies one workspace record (see `src/types.ts` for the brand rationale). */
export type WorkspaceId = WorkspaceIdBrand;
/**
 * Brand a string as a {@link WorkspaceId}.
 * @param id - Raw workspace id string.
 * @returns the same string, branded at compile time.
 */
export declare function WorkspaceId(id: string): WorkspaceId;
/**
 * An archiveSession or pinSession request named a session neither live nor in
 * session persistence — a definite miss only; storage faults propagate as
 * themselves.
 */
export declare class WorkspaceUnknownSessionError extends Error {
    readonly sessionId: SessionId;
    /**
     * @param sessionId - The unknown session id.
     * @param verb - The registry operation that named the session.
     */
    constructor(sessionId: SessionId, verb: 'archive' | 'pin');
}
/**
 * An archiveSession request named a session that at least one
 * `workspace/session-activity` listener reported active. Nothing was written;
 * `activity` names what must stop before the session can be archived.
 */
export declare class WorkspaceActiveSessionError extends Error {
    readonly sessionId: SessionId;
    readonly activity: readonly SessionActivity[];
    /**
     * @param sessionId - The active session id.
     * @param activity - The reported activity, in listener order.
     */
    constructor(sessionId: SessionId, activity: readonly SessionActivity[]);
}
/** A pinSession request named a session currently in the archive set; pinning and archival are mutually exclusive. */
export declare class WorkspaceArchivedSessionPinError extends Error {
    readonly sessionId: SessionId;
    /**
     * @param sessionId - The archived session id.
     */
    constructor(sessionId: SessionId);
}
/** A workspace reorder named a source or anchor absent from the durable registry order. */
export declare class WorkspaceOrderInvalidError extends Error {
    readonly workspaceId: WorkspaceId;
    /**
     * @param workspaceId - Missing source or anchor id.
     */
    constructor(workspaceId: WorkspaceId);
}
/** The session an archive request is about to write into the archive set. */
export interface SessionActivityRequest {
    readonly sessionId: SessionId;
}
/** Caller choices for {@link WorkspaceRegistry.archiveSession}. */
export interface ArchiveSessionOptions {
    /**
     * Ask the composed providers to stop the session's running work instead of
     * refusing the archive because of it. The archive is written first, then
     * the stops are requested; running work is never awaited to settlement, and
     * a provider failure is logged without undoing the archive.
     */
    readonly stopActivity?: boolean;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        workspaceRegistry: WorkspaceRegistry;
    }
    interface Events {
        /**
         * Ask the composed providers what still runs for a session before it is
         * archived. A listener prepends its own {@link SessionActivity} entries to
         * the result of `next()`; the registry's innermost callback returns an
         * empty list, so a composition without providers archives freely. Any
         * non-empty result refuses the archive without a write.
         * @param request - the session about to be archived.
         * @param next - delegate to the remaining providers.
         * @mode waterfall
         */
        'workspace/session-activity'(request: SessionActivityRequest, next: () => Promise<readonly SessionActivity[]>): Promise<readonly SessionActivity[]>;
        /**
         * Stop a session's running work because the caller archived it with
         * `stopActivity`; the archive set is durable when this dispatches. Each
         * provider stops its own families — cancelling a turn, its subagent
         * descendants, owned jobs, or active schedules — through the same cancel
         * paths the user's own stop actions use, so the session log ends every
         * open turn regularly and a later unarchive can continue the
         * conversation. Listeners issue their stop requests without waiting for
         * running work to settle; a listener may await its own durability
         * barrier. A rejection is logged by the registry and does not undo the
         * archive.
         * @param request - the session being archived.
         * @mode parallel
         */
        'workspace/session-stop'(request: SessionActivityRequest): Promise<void> | void;
    }
}
/**
 * Durable workspace registry. Startup waits for `sessionPersistence`, builds
 * one canonical-cwd header index, and completes the one-time history
 * bootstrap before the service becomes active. The persistence dependency is
 * mandatory so an unavailable peer can never be mistaken for an empty
 * history and commit the initialized marker.
 */
export declare class WorkspaceRegistry extends Service {
    static inject: string[];
    private table?;
    private global?;
    private state?;
    private readonly entities;
    private readonly headers;
    private readonly sessionPaths;
    private readonly missingSessionPaths;
    private readonly invalidSessionPaths;
    private operationTail;
    private readonly host;
    constructor(ctx: Context);
    /** Open the domain, finish bootstrap when required, and rebuild the ordered cache. */
    protected [Service.init](): Promise<void>;
    /**
     * Create or reuse a workspace for an existing directory. The fully qualified
     * path is canonicalized through `fs.realpath`; a relative, nonexistent, or
     * non-directory path rejects. Repeated calls for the same canonical path
     * return the existing entity without changing its title.
     * A newly created workspace is prepended to the durable registry order.
     * Different canonical paths may share a display title.
     * @param path - Existing directory to own, in a fully qualified path spelling.
     * @param title - Display title used only when a new record is created.
     * @returns the existing or newly durable workspace.
     */
    create(path: string, title?: string): Promise<Workspace>;
    /**
     * Initialize the default Workspace only while both the registry and Session
     * history are empty. Repeated requests reuse its durable identity; deleting
     * that registration permanently disables automatic creation.
     * @param resolveDirectory - resolve the absolute directory; called only for
     * eligible creation, inside the registry mutation queue. Missing directories
     * are created recursively before registration, and the initial title is the
     * requested directory's own final segment — not the canonical one, so a
     * symlink at that path does not retitle the Workspace after its target.
     * After resolution, caller cancellation does not roll back creation or registration.
     * @returns the initialized Workspace, or undefined when automatic creation is ineligible.
     */
    initializeDefault(resolveDirectory: () => Promise<string>): Promise<Workspace | undefined>;
    /**
     * Look up a workspace by id.
     * @param id - Workspace id.
     * @returns the workspace, or `undefined` when unknown.
     */
    get(id: WorkspaceId): Workspace | undefined;
    /**
     * Synchronous workspace projection in durable registry order. Every
     * entity's `sessionIds` getter is already filtered by the startup/live
     * canonical-cwd header index; this method performs no persistence reads.
     * @returns a fresh ordered array of workspace entities.
     */
    list(): Workspace[];
    /**
     * Delete one workspace registration while retaining its directory and every
     * session log. The durable order is updated before the table deletion; a
     * failed table write restores the prior order and keeps the entity
     * published. Unknown ids are an idempotent no-op for domain callers.
     * @param id - Workspace registration to remove.
     * @returns `true` when a record was deleted, `false` when it was unknown.
     */
    delete(id: WorkspaceId): Promise<boolean>;
    /**
     * Move one workspace within the durable display order, DOM-insertBefore-like.
     * With an anchor it lands before that workspace; without one it appends.
     * @param id - Workspace to move.
     * @param beforeId - Workspace anchor; omitted appends.
     * @returns the complete committed workspace order.
     */
    insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>;
    /**
     * The registry-global archive set: sessions hidden from every grouping
     * surface. Archiving never touches workspace accounting — an archived
     * session keeps its `sessionIds` slot so unarchiving restores its position.
     * @returns the archived session ids in archive order.
     */
    get archivedSessionIds(): readonly SessionId[];
    /**
     * Archive one session durably. The session must exist (live or in session
     * persistence); its workspace accounting — or lack of one — is irrelevant.
     * Without `stopActivity` the session must also be inactive: the
     * `workspace/session-activity` waterfall is asked once, and any reported
     * activity rejects with {@link WorkspaceActiveSessionError} before anything
     * is written. With `stopActivity` the archive is written without an
     * activity check, and the `workspace/session-stop` providers are then asked
     * to stop the session's work: the durable archive set is what a provider's
     * `agent/pre-step` gate reads, so every wake the stops induce is already
     * blocked. Archiving drops the session's pin in the same durable write
     * (pinning and archival are mutually exclusive). An already archived id
     * resolves without writing, asking, or stopping.
     * @param sessionId - The session to archive.
     * @param options - Whether running work is stopped instead of refusing.
     * @returns resolution after durability and, with `stopActivity`, after every stop request was issued.
     */
    archiveSession(sessionId: SessionId, options?: ArchiveSessionOptions): Promise<void>;
    /**
     * Unarchive one session durably by dropping it from the registry-global
     * archive set; the accounting slot was never touched, so the session
     * returns to its recorded position. Unarchiving runs no session-existence
     * check because removing an id cannot introduce an unknown one, so an
     * entry whose session is gone still resolves. An id that is not archived
     * resolves without writing.
     * @param sessionId - The session to unarchive.
     * @returns resolution after durability.
     */
    unarchiveSession(sessionId: SessionId): Promise<void>;
    /**
     * The registry-global pin set: sessions surfaced ahead of every unpinned
     * session on grouping surfaces. Pinning never touches workspace accounting.
     * @returns Session ids in pin order (most recently pinned first).
     */
    get pinnedSessionIds(): readonly SessionId[];
    /**
     * Pin one session durably, prepending it to the registry-global pin set.
     * The session must exist (live or in session persistence) and must not be
     * archived. An already pinned id resolves without writing or reordering.
     * @param sessionId - The session to pin.
     * @returns resolution after durability.
     */
    pinSession(sessionId: SessionId): Promise<void>;
    /**
     * Unpin one session durably by dropping it from the registry-global pin
     * set. Unpinning runs no session-existence check because removing an id
     * cannot introduce an unknown one, so an entry whose session is gone still
     * resolves. An id that is not pinned resolves without writing.
     * @param sessionId - The session to unpin.
     * @returns resolution after durability.
     */
    unpinSession(sessionId: SessionId): Promise<void>;
    /**
     * Whether a session is live, header-indexed, or present in a fresh
     * persistence listing. Only a definite miss returns false — a failing
     * `sessionPersistence.list()` propagates so storage faults never
     * masquerade as an unknown session.
     */
    private sessionKnown;
    /** Request every provider's stop; a failing provider is logged, never a reason to keep the session visible. */
    private stopSessionActivity;
    /**
     * Resolve by canonical directory path without creating or mutating a
     * workspace. A missing path rejects during `realpath`; an existing unowned
     * directory returns `undefined`.
     * @param path - Existing directory path in a fully qualified spelling.
     * @returns the workspace owning the canonical path, when one exists.
     */
    resolveByPath(path: string): Promise<Workspace | undefined>;
    private createCanonical;
    private deleteKnown;
    /**
     * Complete the one mutation explicitly named by durable state. Unexplained
     * order/table divergence still reaches {@link validateStoredState} and
     * fails loud; this path never guesses which operation created a row from its shape alone.
     */
    private recoverPendingMutation;
    private bootstrap;
    private validateStoredState;
    private rebuildEntities;
    private replaceHeaderIndex;
    private indexHeaders;
    private indexHeader;
    /** Every stored session's header, projected from the persistence snapshot listing. */
    private listStoredHeaders;
    private indexLiveSessions;
    private reportFilteredCandidates;
    private readSessionHeader;
    private requireTable;
    private requireState;
    private setState;
    private enqueueOperation;
}
export default WorkspaceRegistry;
//# sourceMappingURL=index.d.ts.map