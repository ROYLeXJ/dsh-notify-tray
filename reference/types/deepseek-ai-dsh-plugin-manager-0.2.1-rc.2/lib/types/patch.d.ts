import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader';
import { type ProfileContext } from '@deepseek-ai/dsh-app-boot';
/** Flatten only the groups addressable by the profile's patch composer.
 * @param rows Composed top-level entries.
 * @returns Entries in depth-first order.
 */
export declare function flatten(rows: EntryOptions[]): EntryOptions[];
/** Replace the last matching override or append one after existing insertions. An override that holds only `id` and
 * `disabled`, without anchors, is removed, or not appended, when the bundle layers and the remaining profile patches
 * already give the entry the requested literal `disabled` value; home patches and launch overlays are not consulted.
 * @param profile Profile whose patch file is edited and whose selected bundles supply the compared composition.
 * @param id Unique composition entry id.
 * @param name Module name used to match name-qualified overrides.
 * @param enabled Desired entry enablement.
 * @returns Whether the file changed.
 */
export declare function writePluginEnabled(profile: ProfileContext, id: string, name: string, enabled: boolean): Promise<boolean>;
//# sourceMappingURL=patch.d.ts.map