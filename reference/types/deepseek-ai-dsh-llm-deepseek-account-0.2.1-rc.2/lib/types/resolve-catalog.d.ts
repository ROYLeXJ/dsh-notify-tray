import type { DeepSeekCatalogModel } from '@deepseek-ai/dsh-llm-deepseek';
import type { ModelOverride } from './config.ts';
import type { ListingEntry } from './listing.ts';
/** Why this build refuses one listed model before network I/O. */
export type CatalogRefusal = {
    readonly kind: 'upgrade-required';
    readonly requiredVersion: string;
} | {
    readonly kind: 'unsupported';
};
/** Inputs of one catalog resolution. */
export interface AccountCatalogInput {
    /** Entries of the last successful listing, or `undefined` before one succeeds. */
    readonly listing: readonly ListingEntry[] | undefined;
    /** Validated models this build supports, carrying its client-side knowledge. */
    readonly supported: readonly DeepSeekCatalogModel[];
    /** Overrides by model id, holding only the fields each one declares. */
    readonly overrides: Readonly<Record<string, ModelOverride>>;
    /** Route output cap that a listed output capability bounds. */
    readonly routeMaxTokens: number;
    /** This build's semantic version. */
    readonly clientVersion: string;
}
/** One resolved account catalog. */
export interface AccountCatalog {
    /** Selectable models in listing order, or this build's models when no listing succeeded. */
    readonly offered: readonly DeepSeekCatalogModel[];
    /** Entries request resolution consults: offered models, then supported models the listing does not offer. */
    readonly resolution: readonly DeepSeekCatalogModel[];
    /** Listed models refused before network I/O, by id. */
    readonly refusals: ReadonlyMap<string, CatalogRefusal>;
    /** Listing entries hidden because their declarations are unreadable or unusable. */
    readonly problems: readonly string[];
    /** Configuration diagnostics for `modelOverrides`. */
    readonly overrideErrors: readonly string[];
}
/**
 * Resolve the account catalog. A declared minimum client version decides a
 * listed model's availability; without one, only models this build supports
 * are offered and the other listed models stay hidden.
 * @param input - listing, supported models, overrides, route cap, and this build's version.
 * @returns offered models, request-resolution entries, refusals, and diagnostics.
 */
export declare function resolveAccountCatalog(input: AccountCatalogInput): AccountCatalog;
//# sourceMappingURL=resolve-catalog.d.ts.map