import type { ModelModality } from '@deepseek-ai/dsh-llm';
/** Code of a listing deadline's timeout reason; {@link requestModelListing} reports it as `TIMEOUT`. */
export declare const LISTING_TIMEOUT = "MODEL_LISTING_TIMEOUT";
/** The requirement one listing entry declares under this client's product token. */
export type ClientRequirement = {
    readonly kind: 'none';
} | {
    readonly kind: 'min-version';
    readonly version: string;
} | {
    readonly kind: 'invalid';
};
/** Capabilities a usable listing entry declares, in catalog vocabulary. */
export interface ListedFacts {
    /** Accepted request modalities this build sends. */
    readonly inputModalities: readonly ModelModality[];
    /** Combined request and response context, when declared. */
    readonly contextWindow?: number;
    /** Output capability, when declared. */
    readonly maxOutputTokens?: number;
    /** Messages system prompt mode, when declared; any value other than `in-history` reads as `leading-only`. */
    readonly systemPromptUpdate?: 'in-history' | 'leading-only';
}
/** Declared capabilities, or why the Messages transport cannot drive the model. */
export type ListedCapabilities = {
    readonly usable: true;
    readonly facts: ListedFacts;
} | {
    readonly usable: false;
    readonly reason: string;
};
/** One decoded listing entry; unusable capabilities never hide its id, name, or requirement. */
export interface ListingEntry {
    /** Wire model id. */
    readonly id: string;
    /** Display name, when the entry declares a non-empty one. */
    readonly name?: string;
    /** Requirement declared under `client_requirements[APP_IDENTITY.product]`. */
    readonly requirement: ClientRequirement;
    /** Declared capabilities. */
    readonly capabilities: ListedCapabilities;
}
/** A decoded listing with at least one entry. */
export interface ModelListing {
    /** Entries in listing order. */
    readonly entries: readonly ListingEntry[];
    /** Rows without a usable id, and repeated ids. */
    readonly skipped: number;
}
/**
 * Decode one `/models` body entry by entry.
 * @param body - parsed JSON response.
 * @returns the entries with a usable id, in listing order.
 * @throws LlmError `INVALID_RESPONSE` when the body has no `data` array or no usable entry.
 */
export declare function parseModelListing(body: unknown): ModelListing;
/**
 * Request and decode one model listing. Redirects fail, so credentials stay on the requested origin.
 * @param url - listing endpoint.
 * @param headers - authentication headers for this endpoint.
 * @param signal - cancellation and deadline of the whole exchange.
 * @returns the decoded listing.
 * @throws LlmError `TIMEOUT` when a {@link LISTING_TIMEOUT} deadline elapses before a complete body, `ABORTED` for
 *   another abort, `TRANSPORT` for a network failure, `HTTP_<status>` for a non-2xx answer,
 *   and `INVALID_RESPONSE` for a body that is not a JSON listing.
 */
export declare function requestModelListing(url: string, headers: Readonly<Record<string, string>>, signal: AbortSignal): Promise<ModelListing>;
//# sourceMappingURL=listing.d.ts.map