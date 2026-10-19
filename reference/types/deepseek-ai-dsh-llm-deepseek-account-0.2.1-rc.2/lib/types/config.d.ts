/** Account route configuration: Messages settings, the model-listing endpoint, and per-model overrides. */
import type { Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import type { Config as ProtocolConfig, DeepSeekCatalogModel, Options as ProtocolOptions, ResolvedDeepSeekOptions } from '@deepseek-ai/dsh-llm-deepseek';
/** Default deadline of one model-listing request and of a first-use wait. */
export declare const DEFAULT_MODELS_TIMEOUT_MS = 5000;
/** Default listing age after which the next access refreshes it in the background. */
export declare const DEFAULT_MODELS_MAX_AGE_MS = 600000;
/** Field overrides for one model; unset fields and empty lists inherit the underlying entry. */
export type ModelOverride = Omit<DeepSeekCatalogModel, 'id'>;
/** Account route configuration; authentication comes exclusively from the account service. */
export interface Config extends Omit<ProtocolConfig, 'models'> {
    /** Deadline of one listing request, which also bounds a first-use wait (default five seconds). */
    modelsTimeoutMs: Volatile<number>;
    /**
     * Listing age after which the next access refreshes it in the background;
     * a failed load retries after the same age (default ten minutes).
     */
    modelsMaxAgeMs: Volatile<number>;
    /** Field overrides by model id, layered over the account listing and the built-in catalog. */
    modelOverrides: Volatile<Record<string, ModelOverride>>;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    modelsTimeoutMs: z<number, number, "volatile-defined">;
    modelsMaxAgeMs: z<number, number, "volatile-defined">;
    modelOverrides: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<ModelOverride, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<ModelOverride, string>>, "volatile-defined">;
    baseURL: z<string, string, "volatile">;
    thinking: z<"enabled" | "disabled", "enabled" | "disabled", "volatile">;
    reasoningEffort: z<"low" | "off" | "high" | "max", "low" | "off" | "high" | "max", "volatile">;
    maxTokens: z<number, number, "volatile-defined">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    maxRequestFilesBytes: z<number, number, "volatile-defined">;
    maxInlineRequestImageBytes: z<number, number, "volatile-defined">;
    maxImagesPerRequest: z<number, number, "volatile-defined">;
    imageOffloadByteQuantum: z<number, number, "volatile-defined">;
    inlineImageOffloadByteQuantum: z<number, number, "volatile-defined">;
    imageOffloadCountQuantum: z<number, number, "volatile-defined">;
    filesApiTimeoutMs: z<number, number, "volatile-defined">;
    fileExpiresAfterSeconds: z<number, number, "volatile-defined">;
    fileRefreshMarginSeconds: z<number, number, "volatile-defined">;
    fileQuotaCleanupBatch: z<number, number, "volatile-defined">;
    retryPolicy: z<NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, "volatile">;
}>>, Schemastery.ObjectT<NoInfer<{
    modelsTimeoutMs: z<number, number, "volatile-defined">;
    modelsMaxAgeMs: z<number, number, "volatile-defined">;
    modelOverrides: z<NoInfer<import("@deepseek-ai/cosmokit").Dict<ModelOverride, string>>, NoInfer<import("@deepseek-ai/cosmokit").Dict<ModelOverride, string>>, "volatile-defined">;
    baseURL: z<string, string, "volatile">;
    thinking: z<"enabled" | "disabled", "enabled" | "disabled", "volatile">;
    reasoningEffort: z<"low" | "off" | "high" | "max", "low" | "off" | "high" | "max", "volatile">;
    maxTokens: z<number, number, "volatile-defined">;
    defaultContextWindow: z<number, number, "volatile-defined">;
    streamIdleTimeoutMs: z<number, number, "volatile-defined">;
    maxRequestFilesBytes: z<number, number, "volatile-defined">;
    maxInlineRequestImageBytes: z<number, number, "volatile-defined">;
    maxImagesPerRequest: z<number, number, "volatile-defined">;
    imageOffloadByteQuantum: z<number, number, "volatile-defined">;
    inlineImageOffloadByteQuantum: z<number, number, "volatile-defined">;
    imageOffloadCountQuantum: z<number, number, "volatile-defined">;
    filesApiTimeoutMs: z<number, number, "volatile-defined">;
    fileExpiresAfterSeconds: z<number, number, "volatile-defined">;
    fileRefreshMarginSeconds: z<number, number, "volatile-defined">;
    fileQuotaCleanupBatch: z<number, number, "volatile-defined">;
    retryPolicy: z<NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, NoInfer<import("@deepseek-ai/dsh-llm").RetryPolicyConfig>, "volatile">;
}>>, "plain">;
/** Plain account options accepted by {@link resolveAccountOptions}. */
export type AccountOptions = Omit<ProtocolOptions, 'models'> & {
    modelsTimeoutMs?: number;
    modelsMaxAgeMs?: number;
    modelOverrides?: Record<string, ModelOverride>;
};
/** Model-listing endpoint and cache timing of one configuration generation. */
export interface CatalogSettings {
    /** Listing endpoint; it always shares the Messages origin. */
    readonly url: string;
    /** Deadline of one listing request. */
    readonly timeoutMs: number;
    /** Listing age after which the next access refreshes it. */
    readonly maxAgeMs: number;
}
/** One validated configuration generation of the account route. */
export interface ResolvedAccountOptions {
    /** Messages settings; request resolution replaces `models` with the resolved account catalog. */
    readonly protocol: ResolvedDeepSeekOptions;
    /** Listing endpoint and cache timing. */
    readonly catalog: CatalogSettings;
    /** Overrides by model id, holding only the fields each one declares. */
    readonly modelOverrides: Readonly<Record<string, ModelOverride>>;
}
/**
 * Read the current value behind every reference of a validated Config.
 * @param config - parsed plugin Config.
 * @returns plain options for {@link resolveAccountOptions}.
 */
export declare function plainAccountOptions(config: Config): AccountOptions;
/**
 * The one explicit resolve step from raw account settings to validated facts.
 * Settings updates can reach it without schema validation, so every bound is judged here.
 * @param options - plain account options.
 * @param environment - this run's environment layers, or `undefined` outside the product CLI.
 * @returns Messages settings, listing settings, and validated overrides.
 */
export declare function resolveAccountOptions(options: AccountOptions, environment?: LaunchEnvironmentSnapshot): ResolvedAccountOptions;
//# sourceMappingURL=config.d.ts.map