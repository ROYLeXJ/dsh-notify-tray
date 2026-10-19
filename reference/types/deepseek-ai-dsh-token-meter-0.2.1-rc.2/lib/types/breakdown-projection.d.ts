/**
 * Heuristic composition of the current retained surface, independent of route
 * image pricing and provider usage. The state keeps the surviving system
 * prompts in surface order and one running surface total; every other node is
 * priced only as a delta, so state size follows the system prompts, not the
 * message count.
 */
import { z } from 'zod';
import { SessionSeq } from '@deepseek-ai/dsh-session';
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        contextBreakdown: ContextBreakdownState;
    }
}
/** Plain-JSON checkpoint: surviving system prompts in surface order, the surface total, and an armed claim. */
declare const contextBreakdownStateSchema: z.ZodObject<{
    systems: z.ZodArray<z.ZodObject<{
        seq: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
        tokens: z.ZodNumber;
    }, z.core.$strict>>;
    surfaceTokens: z.ZodNumber;
    claim: z.ZodOptional<z.ZodObject<{
        start: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
        end: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
        tokens: z.ZodNumber;
        systemSeqs: z.ZodArray<z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>>;
    }, z.core.$strict>>;
    breakdown: z.ZodObject<{
        systemTokens: z.ZodNumber;
        toolsTokens: z.ZodNumber;
        messageTokens: z.ZodNumber;
    }, z.core.$strict>;
}, z.core.$strict>;
type ContextBreakdownState = z.infer<typeof contextBreakdownStateSchema>;
/**
 * Context composition with the last nonempty surviving system in surface
 * order classified as system tokens; all other visible prices are messages.
 * Appends add their price; a replacement subtracts the shadow price of the
 * adjacent `compaction/summary` or `compaction/prune` event, whose
 * `shadowedSeqs` also name the system prompts it removes, and a system-prompt
 * rewrite subtracts the retained price of the system node it replaces. Tools
 * are priced from the latest request header. No route pricing applies.
 */
export declare const contextBreakdownProjectionDefinition: {
    key: "contextBreakdown";
    stateVersion: number;
    stateSchema: z.ZodObject<{
        systems: z.ZodArray<z.ZodObject<{
            seq: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
            tokens: z.ZodNumber;
        }, z.core.$strict>>;
        surfaceTokens: z.ZodNumber;
        claim: z.ZodOptional<z.ZodObject<{
            start: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
            end: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>;
            tokens: z.ZodNumber;
            systemSeqs: z.ZodArray<z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionSeq, number>>>;
        }, z.core.$strict>>;
        breakdown: z.ZodObject<{
            systemTokens: z.ZodNumber;
            toolsTokens: z.ZodNumber;
            messageTokens: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strict>;
    init: () => ContextBreakdownState;
    apply: (state: NoInfer<{
        systems: {
            seq: SessionSeq;
            tokens: number;
        }[];
        surfaceTokens: number;
        breakdown: {
            systemTokens: number;
            toolsTokens: number;
            messageTokens: number;
        };
        claim?: {
            start: SessionSeq;
            end: SessionSeq;
            tokens: number;
            systemSeqs: SessionSeq[];
        } | undefined;
    }>, event: import("@deepseek-ai/dsh-session").SessionEvent) => {
        systems: {
            seq: SessionSeq;
            tokens: number;
        }[];
        surfaceTokens: number;
        breakdown: {
            systemTokens: number;
            toolsTokens: number;
            messageTokens: number;
        };
        claim?: {
            start: SessionSeq;
            end: SessionSeq;
            tokens: number;
            systemSeqs: SessionSeq[];
        } | undefined;
    };
    wire: {
        viewSchema: z.ZodObject<{
            systemTokens: z.ZodNumber;
            toolsTokens: z.ZodNumber;
            messageTokens: z.ZodNumber;
        }, z.core.$strict>;
        view: (state: NoInfer<{
            systems: {
                seq: SessionSeq;
                tokens: number;
            }[];
            surfaceTokens: number;
            breakdown: {
                systemTokens: number;
                toolsTokens: number;
                messageTokens: number;
            };
            claim?: {
                start: SessionSeq;
                end: SessionSeq;
                tokens: number;
                systemSeqs: SessionSeq[];
            } | undefined;
        }>) => {
            systemTokens: number;
            toolsTokens: number;
            messageTokens: number;
        };
    };
};
export {};
//# sourceMappingURL=breakdown-projection.d.ts.map