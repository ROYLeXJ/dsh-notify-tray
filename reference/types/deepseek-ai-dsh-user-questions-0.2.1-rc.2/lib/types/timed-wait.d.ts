/** Foreground question lifetime and Client claims; durable question state stays in the projection. */
/** One live foreground wait, counted by the Host only while no answer UI holds it. */
export declare class TimedQuestionWait {
    readonly deadline: number;
    private readonly parent;
    private readonly timeout;
    private readonly controller;
    private readonly completion;
    private readonly claims;
    private timer;
    /**
     * @param deadline - Host-clock deadline used while no Client holds the wait.
     * @param parent - Calling Turn's cancellation signal.
     * @param timeout - Business error used to settle an unattended wait.
     */
    constructor(deadline: number, parent: AbortSignal | undefined, timeout: Error);
    /** Cancellation shared with the foreground waterfall, not with the calling Turn. */
    get signal(): AbortSignal;
    /** Settles when the wait is cancelled, expires, or is disposed. */
    get done(): Promise<void>;
    private readonly parentAborted;
    private schedule;
    /**
     * Hold the wait for one answer UI until its stream closes or the question settles.
     * @param signal - This business stream's cancellation lifetime.
     * @returns One remaining-duration frame; completion releases the claim.
     */
    attach(signal: AbortSignal): AsyncIterable<{
        remainingMs: number;
    }>;
    /**
     * Release timers, parent cancellation, and all Client claims.
     * @param reason - Cancellation delivered to the foreground waterfall.
     */
    close(reason: unknown): void;
}
//# sourceMappingURL=timed-wait.d.ts.map