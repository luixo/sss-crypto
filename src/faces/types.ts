/* c8 ignore start */
import type { StandardSchemaV1 } from "@standard-schema/spec";

export type Face<P extends object, I extends object> = {
  Component: React.FC<P>;
  schema: StandardSchemaV1<I, P>;
};
