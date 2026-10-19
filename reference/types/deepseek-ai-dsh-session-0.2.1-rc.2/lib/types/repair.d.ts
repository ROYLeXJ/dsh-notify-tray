/**
 * Pending tool-result recovery shared by failed live steps, interrupted logs,
 * and fork seeds. Tail repair preserves closed steps and supplies only missing
 * tool results and lifecycle boundaries, with cause-specific retry guidance.
 * @module @deepseek-ai/dsh-session/repair
 */
import type { SessionEvent } from './types.ts';
/** Recovery code for an assistant tool request that never reached a recorded call start. */
export declare const TOOL_NOT_STARTED = "TOOL_NOT_STARTED";
/** Recovery code for a recorded tool call whose completed outcome was not durably recorded. */
export declare const TOOL_OUTCOME_UNKNOWN = "TOOL_OUTCOME_UNKNOWN";
/**
 * Why an open tail turn is closed with synthetic events: `interrupted` is
 * crash recovery over a persisted log; `forked` is a fork seed cut inside the
 * source's open turn. The cause selects the synthetic `turn/end` reason, the
 * model-visible wording of synthetic error tool results, and the
 * deterministic synthetic message-id prefix. The error codes
 * ({@link TOOL_NOT_STARTED} / {@link TOOL_OUTCOME_UNKNOWN}) are shared: both
 * causes state the same fact about the call's recorded lifecycle.
 */
export type OpenTurnCloseCause = {
    readonly kind: 'interrupted';
} | {
    readonly kind: 'forked';
};
/**
 * Return deterministic synthetic events that close an open tail turn. Unmatched
 * calls receive error results first, followed by an open `step/end` and a
 * cause-specific `turn/end`; sequences continue the log and timestamps reuse the
 * last real event. A balanced or empty log returns no events.
 *
 * @param events - the loaded durable log to scan (a valid committed prefix, possibly with a crash tail).
 * @param cause - the owning close operation: selects result wording and the turn-ending reason.
 * @returns the synthetic closer events to append after `events`, in order; empty when the log is already balanced.
 */
export declare function openTurnClosers(events: readonly SessionEvent[], cause: OpenTurnCloseCause): SessionEvent[];
/**
 * Track unanswered assistant tool requests from one Session's committed events.
 * Observe from the start of the owned step or replay prefix, and recover before
 * its step closes. This state retains pending identities, not event history.
 */
export declare class ToolCallRecovery {
    private readonly cause;
    private readonly pendingCalls;
    private last;
    /** @param cause - defaults to interrupted live/crash recovery; fork-seed construction supplies its own cause. */
    constructor(cause?: OpenTurnCloseCause);
    /**
     * Consume the next committed event; closed steps and turn boundaries discard pending requests.
     * @param event - the next event from the same Session, in sequence order.
     */
    observe(event: SessionEvent): void;
    /**
     * Build conservative error results in assistant order without changing tracked state.
     * Sequences follow the latest observed event and timestamps reuse its time.
     * Callers commit the results and observe those commits before recovering again.
     * @returns pending tool-result events, empty when no request remains unanswered.
     */
    results(): SessionEvent<'tool/result'>[];
}
/**
 * Crash-recovery entry point: synthetic closers that balance a persisted log
 * whose tail turn was interrupted. Used by crash-recovery callers; fork
 * seeds receive their `forked`-cause closers through `buildForkSeed` in
 * `./fork.ts`.
 *
 * @param events - the persisted log to scan, possibly ending inside an open turn.
 * @returns the synthetic `interrupted` closer events to append after `events`; empty when the log is already balanced.
 */
export declare function interruptedTurnClosers(events: readonly SessionEvent[]): SessionEvent[];
//# sourceMappingURL=repair.d.ts.map