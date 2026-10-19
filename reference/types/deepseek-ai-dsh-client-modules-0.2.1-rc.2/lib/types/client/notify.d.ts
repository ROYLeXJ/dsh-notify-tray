/** Subscriber notification for the page controller's observable sources. */
/**
 * Call every subscriber; one throwing subscriber must not skip the rest.
 * @param listeners - current subscribers; copied before dispatch.
 * @param label - diagnostic owner named in the error log.
 */
export declare function notifySubscribers(listeners: ReadonlySet<() => void>, label: string): void;
//# sourceMappingURL=notify.d.ts.map