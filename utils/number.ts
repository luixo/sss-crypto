type InputNumberType = "dec" | "hex" | "base36";
const getBase = (type: InputNumberType) => {
  switch (type) {
    case "base36":
      return 36;
    case "hex":
      return 16;
    case "dec":
      return 10;
  }
};
/* c8 ignore start */
const getTypePostfix = (type: InputNumberType) => {
  switch (type) {
    case "base36":
      return " in base36";
    case "hex":
      return " in hex";
    case "dec":
      return "";
  }
};
const getConstraintPostfix = (min: number, max: number) => {
  if (min === -Infinity && max === Infinity) {
    return "";
  }
  if (min === -Infinity) {
    return ` less than ${max}`;
  }
  if (max === Infinity) {
    return ` more than ${min}`;
  }
  return ` between ${min} and ${max}`;
};
/* c8 ignore stop */
type ParseOptions = {
  min?: number;
  max?: number;
  type?: InputNumberType;
};
export const parseNumber = (
  input: string,
  name: string,
  options: ParseOptions = {},
) => {
  const type = options.type || "dec";
  /* c8 ignore next 2 */
  const min = options.min === undefined ? -Infinity : options.min;
  const max = options.max === undefined ? Infinity : options.max;
  const parsed = Number.parseInt(input, getBase(type));
  /* c8 ignore start */
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Expected ${name} to be a number${getTypePostfix(
        type,
      )}${getConstraintPostfix(min, max)}`,
    );
  }
  /* c8 ignore stop */
  return parsed;
};
