import type * as crypto from "node:crypto";

import { parsePrivateKey } from "./crypto";
import { keyToHex } from "./encoding";
import type { ShareObject, SharesOptions } from "./shares";
import { combineShares, generateShares } from "./shares";

export const sharesToPrivateKey = (shares: ShareObject[]): crypto.KeyObject => {
	try {
		return parsePrivateKey(Buffer.from(combineShares(shares), "hex"));
	} catch (error) {
		if (
			typeof error === "object" &&
			error &&
			"code" in error &&
			error.code === "ERR_OSSL_UNSUPPORTED"
		) {
			throw new Error("Can't combine shares, probably shares are corrupted", {
				cause: error,
			});
		}
		throw error;
	}
};

export const generateSharesFromKey = (
	privateKey: crypto.KeyObject,
	options: SharesOptions,
): ShareObject[] => generateShares(keyToHex(privateKey), options);
