/**
 * Fork seed construction over an exact source-event prefix.
 * @module @deepseek-ai/dsh-session/fork
 */
import type { SessionEvent, SessionSeq as SessionSeqType } from './types.ts';
/**
 * Copy an inclusive event prefix, mark its inherited cut, and close its open tail with forked results
 * and step/turn endings. Closed steps and turns are preserved unchanged.
 * The caller validates that the boundary is an existing contiguous event seq;
 * Session construction snapshots the borrowed events before publication.
 *
 * @param events - source log with contiguous seqs from zero.
 * @param boundary - inclusive source event seq the child inherits through.
 * @returns a new array retaining the source event objects, followed by synthetic
 *   closers outside the inherited prefix counted by `inheritedEventCount`.
 */
export declare function buildForkSeed(events: readonly SessionEvent[], boundary: SessionSeqType): SessionEvent[];
//# sourceMappingURL=fork.d.ts.map