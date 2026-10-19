/**
 * Browser half (the standard `./client` export): the module-system class and
 * wire contract, plus the enrollment plugin face. The module system itself is
 * built by the shell kernel BEFORE cordis exists (the bootstrap exception —
 * the mechanism that loads plugins cannot arrive through itself). The host
 * parser-preloads this ordinary client bundle into the pending registration
 * queue. The HTML-installed loader facade materializes this bundle and calls
 * its bootstrap export, which constructs the system and retains the same
 * exports for this package's graph row. The plugin face enrolls the module
 * system attached to its own Loader as `ctx.modules`.
 * @module @deepseek-ai/dsh-client-modules/client
 */
import type { Context } from '@deepseek-ai/cordis';
import { ClientModuleSystem } from './system.ts';
import type { ClientBootstrapModule, ClientModuleCreateOptions, ClientModuleLoaderTarget } from './manifest.ts';
export { ClientModuleSystem };
export { tearDownEntryFiber } from './entry-lifecycle.ts';
export type { ClientReleaseChange } from './release-change.ts';
export type { ClientEntries, ClientEntryState } from './entries.ts';
export { exactPackageSpecifier, parseBootManifest, parseDshClient, stripClientSuffix } from './manifest.ts';
export type { BootManifest, BootModuleRow, BootPluginRow, ClientBootstrapModule, ClientBundleRegistration, ClientModuleCreateOptions, ClientModuleLoader, ClientModuleLoaderTarget, ClientModuleRecord, ClientModuleSystemOptions, DshWindow, WebBootEntry, WebBootGraph, WebBootRelease, } from './manifest.ts';
/**
 * Build the live module system from the HTML facade's materialized modules bundle.
 * @param target - Stable registration facade whose pending queue becomes the live sink.
 * @param bootstrapModule - This bundle's id and already-materialized exports.
 * @param options - Raw boot graph, platform seed, and optional bundle transport.
 * @returns The created module system.
 */
export declare function createClientModuleSystem(target: ClientModuleLoaderTarget, bootstrapModule: ClientBootstrapModule, options: ClientModuleCreateOptions): ClientModuleSystem;
/** Required service: the Loader whose internal module system this plugin publishes. */
export declare const inject: string[];
/**
 * Enroll the kernel-built module system as `ctx.modules`.
 * @param ctx - client root context.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map