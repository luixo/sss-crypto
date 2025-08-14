import type * as crypto from "node:crypto";
import { parsePrivateKey } from "./crypto";
import type { ShareObject, SharesOptions } from "./shares";
import { combineShares, generateShares } from "./shares";
import { keyToHex } from "./encoding";

export const sharesToPrivateKey = (shares: ShareObject[]): crypto.KeyObject => {
  try {
    return parsePrivateKey(Buffer.from(combineShares(shares), "hex"));
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      e.code === "ERR_OSSL_UNSUPPORTED"
    ) {
      throw new Error("Can't combine shares, probably shares are corrupted");
      /* c8 ignore next 3 */
    }
    throw e;
  }
};

export const generateSharesFromKey = (
  privateKey: crypto.KeyObject,
  options: SharesOptions,
): ShareObject[] => generateShares(keyToHex(privateKey), options);
