/** Stateful reconstruction of historical tool definitions for request projection. */
import type { ToolHistory } from '@deepseek-ai/dsh-llm';
import type { SessionEvent } from './types.ts';
/** Folds committed headers and developer messages independently of model capability. */
export declare class ToolHistoryProjection {
    /** Historical declarations indexed by the header sequence referenced by additions. */
    private readonly headers;
    /** Definitions retained in the current declaration series, including removed tools. */
    private declared;
    /** Active definitions from the latest request header. */
    private active;
    /** Active names reconstructed from the baseline and recorded updates. */
    private available;
    /** Header that starts the current declaration series; absent before the first header. */
    private baselineSeq;
    /** Immutable request snapshot of the current baseline and resolved updates. */
    private history;
    /**
     * Consume the next committed event in log order.
     * @param event - a session event, including inherited events during restoration.
     */
    apply(event: SessionEvent): void;
    /**
     * Read an immutable snapshot; subsequent events do not mutate it.
     * @returns initial declarations and historically resolved additions for the current series.
     */
    snapshot(): ToolHistory;
}
//# sourceMappingURL=tool-history.d.ts.map