/**
 * Service Definition for the user-questions capability seam (`ctx.userQuestions`): a UI-backed service for
 * pausing an agent tool call until the human answers a question. The model-
 * facing tool lives in `@deepseek-ai/dsh-tool-ask-user`; UI packages compose
 * answerers on the Agent-scoped Cordis waterfall.
 *
 * @module @deepseek-ai/dsh-user-questions
 */
import { Context } from '@deepseek-ai/cordis';
import { HarnessError, type ToolCallId } from '@deepseek-ai/dsh-llm';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Agent } from '@deepseek-ai/dsh-agent';
import z from '@deepseek-ai/schemastery';
declare module '@deepseek-ai/cordis' {
    interface Context {
        userQuestions: UserQuestionService;
    }
}
import type { AskUserQuestionAnswer, AskUserQuestionRequestEvent } from './types.ts';
export type { AskUserQuestionAnswer, AskUserQuestionAnswerItem, AskUserQuestionIntent, AskUserQuestionItem, AskUserQuestionOption, PendingUserQuestion, SettledUserQuestion, UserQuestionProjectionView, UserQuestionState, } from './types.ts';
export { isTimedAskUserQuestionSchema, TIMED_WAIT_PARAMETER } from './projection.ts';
/** Request for a human answer. */
export interface AskUserQuestionRequest extends AskUserQuestionRequestEvent {
}
/** Timed ask result returned when the foreground answer window closes. */
export type TimedUserQuestionResult = AskUserQuestionAnswer | {
    pending: true;
    callId: ToolCallId;
};
/** Stable error taxonomy for user-questions failures. */
export declare class UserQuestionError extends HarnessError {
    constructor(message: string, code: string, options?: ErrorOptions);
}
/** `ctx.userQuestions`: validation plus the scoped answerer waterfall. */
export declare class UserQuestionService extends TypertRemoteService {
    static Config: z<Schemastery.ObjectS<{}>, Schemastery.ObjectT<{}>, "plain">;
    private readonly waits;
    private readonly queuedReplies;
    constructor(ctx: Context);
    private releaseReply;
    private assertLiveRoot;
    private continued;
    /**
     * Answer a continued question. The reply is steered into the agent as a
     * user message whose source names the call; that message is also the
     * record that closes the question in the projection.
     * @param agent - Live root agent for the owning Session.
     * @param callId - Continued question identity.
     * @param answer - Complete structured answer batch, one item per question of the call.
     * @returns Whether the question is still continued; an accepted reply stays
     *   queued until the agent admits its user message.
     * @throws {UserQuestionError} `BAD_ANSWER` when the batch does not name each
     *   question of the call exactly once, or `REPLY_QUEUED` when a reply is
     *   already waiting for admission.
     */
    answer(agent: Agent, callId: ToolCallId, answer: AskUserQuestionAnswer): boolean;
    /**
     * Let one answer UI hold a live timed wait. Closing the stream releases its claim.
     * @param agent - Live root agent owning the question.
     * @param callId - Foreground tool call to attach to.
     * @param signal - Remote stream cancellation, including Client disconnect.
     * @returns One Host-computed remaining duration, or no frames once the wait ended.
     */
    attachWait(agent: Agent, callId: ToolCallId, signal: AbortSignal): AsyncIterable<{
        remainingMs: number;
    }>;
    /**
     * Foreground wait whose first settlement the Client decides: the Client
     * rejects with `ASK_TIMED_OUT` when its countdown ends, and this method maps
     * that code to the pending result.
     * @param request - Questions, live owner agent, and abort signal.
     * @param callId - Tool call identity the Client card is keyed by.
     * @param timeoutMs - Positive foreground wait in milliseconds.
     * @returns The answer when it arrives inside the window, otherwise a pending
     *   result, also when no connected Client claimed the request by the deadline.
     * @throws {UserQuestionError} `BAD_TIMEOUT` for a non-integer, non-positive,
     *   or oversized wait.
     */
    askTimed(request: AskUserQuestionRequest & {
        agent: Agent;
    }, callId: ToolCallId, timeoutMs: number): Promise<TimedUserQuestionResult>;
    /**
     * Ask the scoped answerer waterfall and wait for the user's answer.
     *
     * When a caller supplies an agent, human interaction is valid only for the
     * exact live runtime root. Runtime ownership, not durable session lineage,
     * decides this boundary: an owned child has no human answerer and would
     * block forever, while a lineage-bearing session resumed as a new runtime
     * root may ask normally.
     *
     * @param request Questions, owner agent, and abort signal.
     * @returns The answer chosen or typed by the human.
     * @throws {UserQuestionError} code `ASK_ABORTED` when the supplied signal
     *   is already or becomes aborted, `CALLER_NOT_LIVE` when a supplied agent
     *   is not the registry's exact live instance, or `DELEGATED_CALLER` when
     *   that live agent is owned by another agent.
     */
    ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>;
}
export default UserQuestionService;
//# sourceMappingURL=index.d.ts.map