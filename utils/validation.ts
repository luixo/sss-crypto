import type { StandardSchemaV1 } from "@standard-schema/spec";

export type MapErrors = (issues: readonly StandardSchemaV1.Issue[]) => string;

export const mapMessages: MapErrors = (issues) =>
  issues.map((issue) => issue.message).join("\n");

export const mapArgErrors: MapErrors = (issues) =>
  issues
    .map((issue) => {
      const path =
        !issue.path || issue.path.length === 0 ? ["<root>"] : issue.path;
      return `Arg "${path.join(".")}" error: ${issue.message}`;
    })
    .join("\n");

export const validate = async <T extends StandardSchemaV1>(
  schema: T,
  input: StandardSchemaV1.InferInput<T>,
  mapErrors: MapErrors = mapMessages,
): Promise<StandardSchemaV1.InferOutput<T>> => {
  let result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    result = await result;
  }
  if (result.issues) {
    throw new Error(mapErrors(result.issues));
  }
  return result.value;
};
