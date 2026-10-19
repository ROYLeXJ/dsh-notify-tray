/** Account sign-out policy over the latest logged request route. */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/**
 * Identify running work whose latest bound request used the account route.
 * @param agent - live Agent with its durable request context.
 * @returns whether account sign-out should interrupt this task.
 */
export declare function isRunningAccountTask(agent: Pick<Agent, 'status' | 'session'>): boolean;
/**
 * Cancel signed-out account tasks and publish sign-in guidance for rejected requests.
 * @param ctx - account provider lifetime; Agents may attach later.
 */
export declare function installAccountTaskCancellation(ctx: Context): void;
//# sourceMappingURL=account-tasks.d.ts.map