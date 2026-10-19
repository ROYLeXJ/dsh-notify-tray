/** Authenticated Remote operations for account UI consumers. */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AccountBonusBatch, AccountBonusOrderId, AccountClientMetadata, AccountDetails, AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types';
import type { AccountView, SignInAttemptId } from './types.ts';
/** Account commands and reconnect-safe state stream. */
export declare class AccountController extends TypertRemoteService {
    static inject: string[];
    /** @param ctx - Host with the account provider mounted. */
    constructor(ctx: Context);
    /**
     * Read the safe account projection.
     * @returns current account and attempt state.
     */
    getState(): Promise<AccountView>;
    /**
     * Query display-safe Platform profile data.
     * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
     * @returns profile outcome, or null when the account grant is absent or changed.
     */
    getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>;
    /**
     * Query Platform recharge-wallet balances.
     * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
     * @returns balance outcome, or null when the account grant is absent or changed.
     */
    getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>;
    /**
     * Query the granted bonuses Platform has not yet recorded as displayed.
     * @param client - identity of the requesting UI; its language selects the server-authored message.
     * @returns bonuses with their account, or null when the account grant is absent or changed.
     */
    getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null>;
    /**
     * Record one displayed bonus as notified for the account it belongs to.
     * @param accountId - account the notification was read for.
     * @param orderId - granted bonus order the user saw.
     * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
     * @returns true once Platform records the acknowledgement; false when the account is absent or changed.
     */
    ackBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId, client: AccountClientMetadata): Promise<boolean>;
    /**
     * Begin browser sign-in.
     * @param client - identity of the requesting UI, captured by a new attempt.
     * @param callbackOrigin - browser-accessible loopback HTTP origin.
     * @param loginSource - initiating UI, used to return from a failed exchange.
     * @returns a new or already-active login attempt.
     */
    startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView>;
    /**
     * Cancel the named local attempt.
     * @param attemptId - attempt to cancel.
     * @returns settled cancellation or commit state.
     */
    cancelSignIn(attemptId: SignInAttemptId): Promise<AccountView>;
    /**
     * Inspect the latest logged request providers of running tasks, including tools and retries.
     * @returns whether running work has a latest request context on the account route.
     */
    hasRunningAccountTasks(): boolean;
    /**
     * Remove the local account grant and revoke it through Platform in the background, without deleting API keys.
     * @param client - identity of the requesting UI, captured for the background revocation retries.
     * @returns state after removing the local account grant.
     */
    signOut(client: AccountClientMetadata): Promise<AccountView>;
    /**
     * Subscribe to credential expiry without replaying prior notifications.
     * @param signal - stream lifetime.
     * @returns notifications emitted while subscribed.
     */
    watchExpiry(signal: AbortSignal): AsyncIterable<'session-expired'>;
    /**
     * Stream the safe account projection.
     * @param signal - stream lifetime.
     * @returns initial snapshot and subsequent changes.
     */
    watch(signal: AbortSignal): AsyncIterable<AccountView>;
}
export default AccountController;
//# sourceMappingURL=index.d.ts.map