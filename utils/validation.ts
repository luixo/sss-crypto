import type { StandardSchemaV1 } from "@standard-schema/spec";

export const validate = async <T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
): Promise<StandardSchemaV1.InferOutput<T>> => {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    result = await result;
  }
  if (result.issues) {
    throw new Error(
      result.issues
        .map(
          (issue) =>
            `At "${issue.path && issue.path.length !== 0 ? issue.path.join(".") : "<root>"}": ${issue.message}`,
        )
        .join("\n"),
    );
  }
  return result.value;
};
