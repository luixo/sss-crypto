import secrets from "secrets.js";
import { parseNumber } from "./number";

export type ShareObject = {
  threshold: number;
  bits: number;
  id: number;
  data: string;
};

export const serializeShare = ({
  bits,
  id,
  data,
  threshold,
}: ShareObject): string =>
  [threshold, bits.toString(36), id.toString(16), data].join("|");

export const deserializeShare = (input: string): ShareObject => {
  const [thresholdRaw, bitsBase36, idHex, data] = input.split("|");
  const threshold = parseNumber(thresholdRaw, "threshold", {
    min: 2,
  });
  const bits = parseNumber(bitsBase36, "Galois field bit", {
    min: 3,
    max: 20,
    type: "base36",
  });
  const id = parseNumber(idHex, "id", {
    type: "hex",
    min: 1,
    max: 2 ** (bits - 1),
  });
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data,
    )
  ) {
    throw new Error("Expected to have base64 for a share body");
  }
  return { threshold, bits, id, data };
};

export type SharesOptions = {
  threshold: number;
  shares: number;
};

export const createShares = (
  message: string,
  options: SharesOptions,
): ShareObject[] =>
  secrets.share(message, options.shares, options.threshold).map((share) => {
    // see https://github.com/grempe/secrets.js?tab=readme-ov-file#share-format
    const { bits, id, data } = secrets.extractShareComponents(share);
    return {
      bits,
      id,
      threshold: options.threshold,
      data: Buffer.from(data, "hex").toString("base64"),
    };
  });

export const combineShares = (shares: ShareObject[]): string =>
  secrets.combine(
    shares.map((share) =>
      // eslint-disable-next-line no-underscore-dangle
      secrets._constructPublicShareString(
        share.bits.toString(10),
        share.id.toString(10),
        Buffer.from(share.data, "base64").toString("hex"),
      ),
    ),
  );
