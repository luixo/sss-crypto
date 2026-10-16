import { expect, test, vi } from "vitest";
import { z } from "zod";

import { face } from "~/faces/decrypt";
import { generateSharesFromKey, sharesToPrivateKey } from "~/utils/converters";
import {
	decryptText,
	encryptText,
	generatePair,
	parsePrivateKey,
} from "~/utils/crypto";
import { sequence } from "~/utils/promise";
import { publicKeyTransform } from "~/utils/schemas";
import { serializeShare } from "~/utils/shares";
import { validate } from "~/utils/validation";

import { render } from "./utils/render";

vi.mock(import("~/utils/crypto"), async (importActual) => {
	const actual = await importActual();
	return {
		...actual,
		decryptText: vi.fn<typeof actual.decryptText>(actual.decryptText),
		parsePrivateKey: vi.fn<typeof actual.parsePrivateKey>(
			actual.parsePrivateKey,
		),
	};
});

test("unexpected private-key errors propagate unchanged", async () => {
	const { privateKey } = await generatePair();
	const shares = generateSharesFromKey(privateKey, { shares: 3, threshold: 2 });
	const failure = new Error("Unexpected private-key failure");
	vi.mocked(parsePrivateKey).mockImplementationOnce(() => {
		throw failure;
	});
	expect(() => sharesToPrivateKey(shares)).toThrow(failure);
});

test("public-key validation preserves ASN.1 errors", async () => {
	const schema = z.instanceof(Buffer).transform(publicKeyTransform);
	const malformedKey = Buffer.from(
		"-----BEGIN PUBLIC KEY-----\nMAA=\n-----END PUBLIC KEY-----",
	);
	await expect(validate(schema, malformedKey)).rejects.toThrow(/asn1/iu);
});

test.each([
	new Error("Unexpected decryption failure"),
	"Unexpected decryption failure",
])(
	"unexpected decryption errors are displayed and can be reset (%s)",
	async (failure) => {
		const { privateKey, publicKey } = await generatePair();
		const encryptedData = encryptText("message", publicKey);
		const shares = generateSharesFromKey(privateKey, {
			shares: 3,
			threshold: 2,
		});
		vi.mocked(decryptText).mockImplementationOnce(() => {
			// oxlint-disable-next-line typescript/only-throw-error -- Exercise the non-Error failure handler.
			throw failure;
		});
		const { stdin, lastFrameLines } = await render(
			<face.Component encryptedData={encryptedData} />,
		);
		await sequence(
			...shares
				.slice(0, 2)
				.map((share) => async () => stdin.writeLn(serializeShare(share))),
		);
		expect(lastFrameLines()).toStrictEqual([
			"Fatal error:",
			"Unexpected decryption failure",
			'Press "Enter" to restart',
		]);
		await stdin.enter();
		expect(lastFrameLines()).toStrictEqual([
			"Please input share #1",
			"(no input)",
		]);
	},
);
