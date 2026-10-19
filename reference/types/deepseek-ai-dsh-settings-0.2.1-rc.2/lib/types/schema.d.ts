import z from '@deepseek-ai/schemastery';
/** Remove runtime references from a configuration snapshot.
 * @param value Parsed Config output.
 * @returns Detached ordinary values suitable for redaction and forms.
 */
export declare function plainConfig(value: unknown): unknown;
/** Select fields whose nearest volatile ancestor makes them editable without remounting.
 * @param schema The plugin's Config schema.
 * @returns A plain form schema, or undefined when no field is live.
 */
export declare function volatileForm(schema: z): z | undefined;
/** Project only schema-declared fields, excluding ordinary configuration.
 * @param schema The filtered form schema.
 * @param value Plain raw or resolved config.
 * @returns The fields visible to this form.
 */
export declare function projectForm(schema: z, value: unknown): unknown;
/** Check that a field path lies beneath a declared volatile node.
 * @param schema Complete plugin Config schema.
 * @param path Field path addressed by a form edit.
 * @returns Whether the path can be edited live.
 */
export declare function isVolatilePath(schema: z, path: readonly string[]): boolean;
//# sourceMappingURL=schema.d.ts.map