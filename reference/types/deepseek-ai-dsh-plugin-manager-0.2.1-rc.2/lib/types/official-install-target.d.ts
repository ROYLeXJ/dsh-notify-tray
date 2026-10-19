/**
 * Offer a source checkout link or an exact published package version. Source installations are
 * identified by the real CLI manifest and its unpacked workspace dependencies, including Desktop's
 * development symlink. An incomplete checkout is an error, never a registry fallback.
 * @param name - Official catalog package name.
 * @param installAnchor - Running application's DSH package.json, possibly reached through a symlink.
 * @param version - Running DSH version used by its release family.
 * @returns An ordinary package-manager spec and its package version.
 * @throws when a source installation lacks its workspace package, bundle patch, or built runtime.
 */
export declare function officialBundleInstallTarget(name: string, installAnchor: string, version: string): {
    spec: string;
    version: string;
};
//# sourceMappingURL=official-install-target.d.ts.map