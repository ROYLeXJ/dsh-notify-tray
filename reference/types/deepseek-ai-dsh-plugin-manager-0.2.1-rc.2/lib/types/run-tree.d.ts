/** Waiting for one package run's process tree to disappear before its caller touches the profile. */
/** The process (or process group) one run occupies. */
export interface RunTree {
    /** The run's process id, when its spawn published one. */
    pid: number | undefined;
    /** Whether the run leads its own process group, which is what a POSIX group probe addresses. */
    grouped: boolean;
}
/** Injectable process operations, so every platform's probing is testable on any host. */
export interface RunTreeInternals {
    /** Host platform override for target decisions. */
    platform?: NodeJS.Platform;
    /** Liveness probe override, defaulting to `process.kill(target, 0)`. */
    alive?: (target: number) => boolean;
    /** Wait bound override, defaulting to the tree wait constant. */
    waitMs?: number;
}
/**
 * Whether one run leads its own process group, which is the target a POSIX
 * liveness probe addresses for the whole tree. A run that captures output is
 * spawned as its own group leader, because its tree is terminated as a unit; a
 * run that inherits the caller's descriptors keeps the caller's group, so an
 * interrupt still reaches it.
 * @param execution Whether the run captures output or inherits the caller's descriptors.
 * @param platform Host platform deciding how a tree is addressed.
 * @returns True when the run leads its own process group.
 */
export declare function leadsOwnGroup(execution: 'cli' | 'service', platform?: NodeJS.Platform): boolean;
/**
 * Whether any member of a run's tree is still alive.
 * @param tree The run's process id and whether it leads its own group.
 * @param internals Injectable process operations.
 * @returns True while the probe finds the process or a group member.
 */
export declare function treeAlive(tree: RunTree, internals?: RunTreeInternals): boolean;
/**
 * Wait until a terminated run's tree is gone, so the caller restores and
 * unlocks the profile only after the scripts it started stopped writing.
 * @param tree The run's process id and whether it leads its own group.
 * @param internals Injectable process operations.
 * @returns Fulfillment once no member remains, or the wait bound elapsed.
 */
export declare function awaitTreeGone(tree: RunTree, internals?: RunTreeInternals): Promise<void>;
//# sourceMappingURL=run-tree.d.ts.map