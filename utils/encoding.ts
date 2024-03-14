import { KeyObject } from "crypto";

export const sanitizeBase64 = (input: string) =>
  input.replaceAll(/[^A-Za-z0-9=+|/]/g, "");

export const keyToHex = (key: KeyObject) =>
  key.export({ format: "der", type: "pkcs1" }).toString("hex");

export const keyToPem = (key: KeyObject) =>
  key.export({ format: "pem", type: "pkcs1" }).toString("utf-8");
