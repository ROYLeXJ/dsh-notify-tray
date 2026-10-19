/** Loader lifecycle operations shared by live graph reconciliation and code replacement. */
import type { Entry } from '@deepseek-ai/cordis-plugin-loader';
/**
 * Release a runtime before clearing its entry fiber so Loader refresh can import new code.
 * Registry deletion prevents Loader from treating replacement as a user disable.
 * @param entry - Entry retained for code replacement.
 */
export declare function tearDownEntryFiber(entry: Entry): Promise<void>;
/**
 * Remove styles after their plugin's effect cleanup has settled.
 * @param id - Package whose factory owns the style tags.
 */
export declare function removeOwnedStyles(id: string): void;
//# sourceMappingURL=entry-lifecycle.d.ts.map