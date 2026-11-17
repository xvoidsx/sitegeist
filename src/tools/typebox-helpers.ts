import { Type } from "@sinclair/typebox";

/**
 * Creates a string enum schema compatible with Google's API and other providers
 * that don't support anyOf/const patterns.
 *
 * Local copy of pi-ai's StringEnum: pi-ai builds its helper on the `typebox`
 * 1.x package, whose TUnsafe is not assignable to this repo's
 * @sinclair/typebox 0.34 TSchema, so the pi-ai helper cannot be used inside
 * Type.Object here. The emitted JSON schema is identical.
 *
 * @example
 * const OperationSchema = StringEnum(["add", "subtract"], {
 *   description: "The operation to perform"
 * });
 *
 * type Operation = Static<typeof OperationSchema>; // "add" | "subtract"
 */
export function StringEnum<T extends readonly string[]>(
	values: T,
	options?: { description?: string; default?: T[number] },
) {
	return Type.Unsafe<T[number]>({
		type: "string",
		enum: values,
		...(options?.description && { description: options.description }),
		...(options?.default && { default: options.default }),
	});
}
