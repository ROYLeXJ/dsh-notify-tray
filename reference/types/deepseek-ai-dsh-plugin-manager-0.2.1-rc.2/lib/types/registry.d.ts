/**
 * Which registries one package operation asks, in order, and what a failed
 * attempt could not reach. A registry is asked with pnpm's `--registry`;
 * `null` is the one pnpm's own configuration names. This module runs in the
 * browser too, through the package's `./registry` entry, so the dialog and
 * the Host follow one rule.
 * @module @deepseek-ai/dsh-plugin-manager/registry
 */
import type { ParsedInstallSpec } from './install-spec.ts';
import type { PluginInstallFailureKind, PluginRegistries, Registry } from './types.ts';
/** npm's own registry: what pnpm names without any configuration, and the one public registry a plan trusts as such. */
export declare const OFFICIAL_NPM_REGISTRY = "https://registry.npmjs.org/";
/** Public npmmirror URL shared by the fallback configuration and public-registry comparison. */
export declare const NPMMIRROR_REGISTRY = "https://registry.npmmirror.com/";
/** An http(s) URL, as pnpm's `--registry` takes it. */
export declare const REGISTRY_URL: RegExp;
/**
 * Parse a registry URL into the form pnpm compares registries in: lower-case host, trailing slash.
 * @param url - the registry as configured or requested.
 * @returns the normalized URL.
 * @throws {Error} for anything but an http(s) URL.
 */
export declare function normalizeRegistry(url: string): string;
/**
 * The registries one operation asks, first to last.
 *
 * The configured set is the configured first registry and the fallbacks; a
 * requested registry is asked first when it is one of them, alone otherwise,
 * so a private registry never falls through to a public one. pnpm's own
 * registry (`null`) belongs to the set only when what it names is known to
 * be public: npm's own registry or one of the configured fallbacks. While it
 * names anything else, or is unknown, it is asked alone, and a public
 * registry asked instead never falls back into it. A registry pnpm's own
 * configuration already names is asked once.
 * @param requested - the caller's registry; undefined defers to the configured first one.
 * @param configured - the configured first registry, the fallbacks after it, and what pnpm's own configuration names.
 * @returns the registries to ask, in order; never empty.
 */
export declare function registryPlan(requested: Registry | undefined, configured: PluginRegistries): Registry[];
/**
 * What a failed attempt could not reach or get an answer from.
 * @param kind - how the attempt failed.
 * @param log - what the attempt printed.
 * @param spec - the spec the attempt installed.
 * @returns `registry` for a failure another registry can change; `spec-host` when an error line names the host a git
 * or tarball spec is fetched from, which no registry stands in for; `other` for a failure neither explains.
 */
export declare function attributeFailure(kind: PluginInstallFailureKind, log: string, spec: ParsedInstallSpec): 'registry' | 'spec-host' | 'other';
//# sourceMappingURL=registry.d.ts.map