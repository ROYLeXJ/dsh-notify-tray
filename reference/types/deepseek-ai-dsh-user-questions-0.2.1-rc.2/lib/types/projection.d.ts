/** Fold of `ask_user_question` tool events into the answerable question set, and its Session projection. */
import { z } from 'zod';
import { SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { SessionEvent, SessionLogOffset as SessionLogOffsetType } from '@deepseek-ai/dsh-session';
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import type { AskUserQuestionItem, UserQuestionProjectionView } from './types.ts';
/**
 * The pure fold state: whether the request header in effect declares the
 * timed `ask_user_question` schema, and the question view that schema's
 * calls build. Calls made under the blocking legacy schema never enter it.
 */
export interface UserQuestionFold {
    readonly timed: boolean;
    readonly questions: UserQuestionProjectionView;
}
/** Host projection state; `questions` is the wire value, reused whenever an event changes nothing. */
export interface UserQuestionProjectionState extends UserQuestionFold {
    readonly inheritedEventCount: SessionLogOffsetType;
}
/** Tool whose calls this projection tracks. */
export declare const ASK_USER_QUESTION_TOOL = "ask_user_question";
/**
 * Model-facing parameter only the timed `ask_user_question` schema declares.
 * Its presence in the logged request header is what tells the fold that the
 * `ask_user_question` calls that follow can be continued past a timeout; the
 * blocking legacy schema never declares it.
 */
export declare const TIMED_WAIT_PARAMETER = "timeout";
/**
 * Whether one logged tool schema is the timed `ask_user_question` tool's.
 * @param tool - One entry of a request header's assembled tool schemas.
 * @returns True only for an `ask_user_question` schema whose parameters declare {@link TIMED_WAIT_PARAMETER}.
 */
export declare function isTimedAskUserQuestionSchema(tool: Pick<ToolSchema, 'name' | 'parameters'>): boolean;
/**
 * Read the question batch out of logged `ask_user_question` arguments.
 * @param argumentsText - Raw JSON arguments recorded on the `tool/call` event.
 * @returns The questions in service vocabulary, or null when the arguments are unreadable.
 */
export declare function questionsOf(argumentsText: string): readonly AskUserQuestionItem[] | null;
/**
 * Apply one Session event to this Session's question fold.
 * A `request/header` decides, from the assembled tool schemas it records,
 * whether the `ask_user_question` calls that follow are timed; a call made
 * under the blocking legacy schema is never tracked, so a Session that only
 * ever used that tool folds to the empty view. A tracked question stays
 * answerable as `continued` in exactly two cases: the tool returned the
 * pending payload, or Session resume repair appended the synthetic
 * `TOOL_OUTCOME_UNKNOWN` result for a call the process never finished. An
 * answer batch settles it with that batch; any failure drops it. A PTC
 * sub-call enters the fold when its recorded result is pending. A late reply
 * settles only when the agent admits its user message; queued inbox messages
 * can still be discarded before that point.
 * @param fold - Current fold state.
 * @param event - Next Session event in append order.
 * @returns The same fold when the event is unrelated, otherwise the updated one.
 */
export declare function applyUserQuestionEvent(fold: UserQuestionFold, event: SessionEvent): UserQuestionFold;
/**
 * Fold a whole Session log into its question state.
 * @param events - Session events in append order.
 * @returns Open and continued timed calls in ask order, and settled ones in settlement order.
 */
export declare function foldUserQuestions(events: readonly SessionEvent[]): UserQuestionProjectionView;
/** Session projection exposing open, continued, and settled timed questions to every Client. */
export declare const userQuestionProjectionDefinition: {
    key: "userQuestions";
    stateSchema: z.ZodObject<{
        inheritedEventCount: z.ZodPipe<z.ZodNumber, z.ZodTransform<SessionLogOffset, number>>;
        timed: z.ZodBoolean;
        questions: z.ZodType<UserQuestionProjectionView, unknown, z.core.$ZodTypeInternals<UserQuestionProjectionView, unknown>>;
    }, z.core.$strict>;
    init: (_header: import("@deepseek-ai/dsh-session").SessionHeader, inheritedEventCount: SessionLogOffset) => {
        timed: boolean;
        questions: UserQuestionProjectionView;
        inheritedEventCount: SessionLogOffset;
    };
    apply: (state: NoInfer<UserQuestionProjectionState>, event: SessionEvent) => UserQuestionProjectionState;
    wire: {
        viewSchema: z.ZodType<UserQuestionProjectionView, unknown, z.core.$ZodTypeInternals<UserQuestionProjectionView, unknown>>;
        view: (state: NoInfer<UserQuestionProjectionState>) => UserQuestionProjectionView;
    };
    stateVersion: number;
};
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        userQuestions: UserQuestionProjectionState;
    }
}
//# sourceMappingURL=projection.d.ts.map