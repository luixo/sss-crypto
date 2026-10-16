import fs from "node:fs/promises";

import chalk from "chalk";
import type React from "react";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";

import { face } from "~/faces/generate-shares";
import {
	PUBLIC_KEY_LENGTH,
	SHARE_LENGTH,
	SHARE_PREFIX_LENGTH,
} from "~/utils/consts";
import { sharesToPrivateKey } from "~/utils/converters";
import {
	decryptText,
	encryptText,
	generatePair,
	parsePublicKey,
} from "~/utils/crypto";
import { shareObjectSchema } from "~/utils/shares";
import { mapArgErrors, validate } from "~/utils/validation";

import { render } from "./utils/render";

type Props = React.ComponentProps<(typeof face)["Component"]>;

vi.mock(import("~/utils/crypto"), async (importActual) => {
	const actual = await importActual<typeof import("~/utils/crypto")>();
	return {
		...actual,
		generatePair: vi.fn<typeof actual.generatePair>(actual.generatePair),
	};
});

const renderGeneratedShares = async (props: Props) => {
	const controls = await render(<face.Component {...props} />);
	expect(generatePair).toHaveBeenCalledWith();
	await act(async () => {
		await Promise.all(
			vi.mocked(generatePair).mock.results.map(async (result) => {
				if (result.type !== "return") {
					throw new Error("Key generation did not return a promise");
				}
				return result.value;
			}),
		);
	});
	return controls;
};

const getWithValid = (override: Partial<Record<string, string>> = {}) => ({
	pubOutput: "pub.key",
	shares: "10",
	threshold: "2",
	...override,
});

describe("validation", () => {
	test("threshold", async () => {
		await expect(async () =>
			validate(face.schema, getWithValid({ threshold: "a" }), mapArgErrors),
		).rejects.toThrow(
			'Arg "threshold" error: Invalid input: expected number, received NaN',
		);
		await expect(
			validate(face.schema, getWithValid(), mapArgErrors),
		).resolves.toStrictEqual({
			pubKeyFilePath: "pub.key",
			shares: 10,
			threshold: 2,
		});
	});

	test("shares", async () => {
		await expect(async () =>
			validate(face.schema, getWithValid({ shares: "a" }), mapArgErrors),
		).rejects.toThrow(
			'Arg "shares" error: Invalid input: expected number, received NaN',
		);
		await expect(async () =>
			validate(
				face.schema,
				getWithValid({ shares: "3", threshold: "3" }),
				mapArgErrors,
			),
		).rejects.toThrow(`Arg "<root>" error: 'k' should be less than 'n'`);
		await expect(
			validate(face.schema, getWithValid({ shares: "3" }), mapArgErrors),
		).resolves.toStrictEqual({
			pubKeyFilePath: "pub.key",
			shares: 3,
			threshold: 2,
		});
	});

	test("public key output", async () => {
		const dirPath = "path/to/dir";
		await fs.mkdir(dirPath, { recursive: true });
		await expect(async () =>
			validate(face.schema, getWithValid({ pubOutput: dirPath }), mapArgErrors),
		).rejects.toThrow("Public key path should not be a directory.");
		const outsideDirPath = "../foo.key";
		await expect(async () =>
			validate(
				face.schema,
				getWithValid({ pubOutput: outsideDirPath }),
				mapArgErrors,
			),
		).rejects.toThrow("Public key only can be written in a current directory.");
		await fs.writeFile("pub2.key", "output");
		await expect(
			validate(
				face.schema,
				getWithValid({ pubOutput: "pub2.key" }),
				mapArgErrors,
			),
		).resolves.toStrictEqual({
			pubKeyFilePath: "pub2.key",
			shares: 10,
			threshold: 2,
		});
		await expect(
			validate(
				face.schema,
				getWithValid({ pubOutput: undefined }),
				mapArgErrors,
			),
		).resolves.toStrictEqual({
			pubKeyFilePath: undefined,
			shares: 10,
			threshold: 2,
		});
	});
});

describe("shares generation", () => {
	test.each([undefined, "delayed.key"])(
		"waits for slow key generation without act warnings (%s)",
		async (pubKeyFilePath) => {
			const pair = await generatePair();
			vi.mocked(generatePair).mockImplementationOnce(async () => {
				// Model crypto work that finishes after the initial render's act scope.
				// oxlint-disable-next-line promise/avoid-new
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 25);
				});
				return pair;
			});
			const consoleError = vi.spyOn(console, "error");
			try {
				const { lastFrameLines } = await renderGeneratedShares({
					pubKeyFilePath,
					shares: 5,
					threshold: 3,
				});
				expect(lastFrameLines("\n\n")).toHaveLength(7);
				expect(lastFrameLines("\n\n")[1]).toContain(
					pubKeyFilePath === undefined ? "BEGIN RSA PUBLIC KEY" : "saved to",
				);
				expect(
					consoleError.mock.calls.filter(
						([message]) =>
							typeof message === "string" &&
							message.includes("not wrapped in act"),
					),
				).toStrictEqual([]);
			} finally {
				consoleError.mockRestore();
			}
		},
	);

	test("no pub key file path", async () => {
		const sharesAmount = 5;
		const { lastFrameLines } = await renderGeneratedShares({
			shares: sharesAmount,
			threshold: 3,
		});
		await expect
			.poll(() => {
				const [warningBlock, publicKeyBlock, ...sharesBlock] =
					lastFrameLines("\n\n");
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const publicKeyLines = publicKeyBlock!.split("\n");
				const publicKeyLength = publicKeyLines
					.slice(2, -1)
					.reduce((acc, line) => acc + line.length, 0);
				return [
					warningBlock,
					[
						...publicKeyLines.slice(0, 2),
						publicKeyLength,
						...publicKeyLines.slice(-1),
					].join("\n"),
					...sharesBlock.map((shareBlock) => {
						const lines = shareBlock.split("\n");
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						if (lines[0]!.includes("Share #")) {
							return [
								...lines.slice(0, 1),
								`share: ${lines.slice(1).reduce((acc, line) => acc + line.length, 0)}`,
							];
						}
						return lines;
					}),
				];
			})
			.toStrictEqual([
				chalk.yellow(
					"! Save this data, it will be erased when you close the terminal !",
				),
				[
					chalk.cyan("Public key"),
					"-----BEGIN RSA PUBLIC KEY-----",
					PUBLIC_KEY_LENGTH,
					"-----END RSA PUBLIC KEY-----",
				].join("\n"),
				...Array.from({ length: sharesAmount }).map((_, index) => [
					chalk.green(`Share #${index + 1}`),
					`share: ${SHARE_LENGTH + SHARE_PREFIX_LENGTH}`,
				]),
			]);
	});

	test("with pub key file path", async () => {
		const pubKeyPath = "pub.key";
		const sharesAmount = 5;
		const { lastFrameLines } = await renderGeneratedShares({
			pubKeyFilePath: pubKeyPath,
			shares: sharesAmount,
			threshold: 3,
		});
		await expect
			.poll(() => {
				const [warningBlock, publicKeyBlock, ...sharesBlock] =
					lastFrameLines("\n\n");
				return [
					warningBlock,
					publicKeyBlock,
					...sharesBlock.map((shareBlock) => {
						const lines = shareBlock.split("\n");
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						if (lines[0]!.includes("Share #")) {
							return [
								...lines.slice(0, 1),
								`share: ${lines.slice(1).reduce((acc, line) => acc + line.length, 0)}`,
							];
						}
						return lines;
					}),
				];
			})
			.toStrictEqual([
				chalk.yellow(
					"! Save this data, it will be erased when you close the terminal !",
				),
				chalk.green(`Public key is saved to "${pubKeyPath}"`),
				...Array.from({ length: sharesAmount }).map((_, index) => [
					chalk.green(`Share #${index + 1}`),
					`share: ${SHARE_LENGTH + SHARE_PREFIX_LENGTH}`,
				]),
			]);
		const publicKeyBuffer = await fs.readFile("pub.key");
		const publicKeyResult = publicKeyBuffer.toString("utf8");
		const publicKey = publicKeyResult.split("\n").slice(1, -2);
		expect(publicKey.join("")).toHaveLength(PUBLIC_KEY_LENGTH);
		expect(publicKeyResult).toStrictEqual(
			[
				"-----BEGIN RSA PUBLIC KEY-----",
				...publicKey,
				"-----END RSA PUBLIC KEY-----",
				"",
			].join("\n"),
		);
	});

	test("verify shares can decrypt data", async () => {
		const sharesAmount = 5;
		const { lastFrameLines } = await renderGeneratedShares({
			shares: sharesAmount,
			threshold: 3,
		});

		await expect.poll(() => lastFrameLines("\n\n").length).toStrictEqual(7);
		const [, publicKeyBlock, ...sharesBlocks] = lastFrameLines("\n\n");
		const serializedShares = sharesBlocks.map((shareBlock) =>
			shareBlock.split("\n").slice(1).join(""),
		);

		const textToEncrypt = "Hello world\nNext line please";
		const encryptedData = encryptText(
			textToEncrypt,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			parsePublicKey(Buffer.from(publicKeyBlock!)),
		);
		const decryptedText = decryptText(
			encryptedData,
			sharesToPrivateKey(
				await Promise.all(
					serializedShares.map(async (share) =>
						validate(shareObjectSchema, share),
					),
				),
			),
		);
		expect(textToEncrypt).toStrictEqual(decryptedText);
	});
});
