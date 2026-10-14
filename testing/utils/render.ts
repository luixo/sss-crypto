import { render as originalRender } from "ink-testing-library";
import { act as actRaw } from "react";

type RenderControls = {
	stdin: {
		write: (data: string) => Promise<void>;
		writeLn: (data: string) => Promise<void>;
		enter: () => Promise<void>;
		backspace: (amount?: number) => Promise<void>;
		leftArrow: () => Promise<void>;
		rightArrow: () => Promise<void>;
	};
	lastFrameLines: (delimiter?: string) => string[];
} & Pick<ReturnType<typeof originalRender>, "stdout">;

// oxlint-disable-next-line typescript/require-await
const act = (fn: () => void) => actRaw(async () => fn());

export const render = async (
	...args: Parameters<typeof originalRender>
): Promise<RenderControls> => {
	// oxlint-disable-next-line init-declarations
	let controls!: ReturnType<typeof originalRender>;
	await act(() => {
		controls = originalRender(...args);
	});
	const { stdin: originalStdin, lastFrame, stdout } = controls;
	const write = async (data: string) => act(() => originalStdin.write(data));
	const enter = async () => write("\r");
	const backspace = async (amount = 1) =>
		act(() => {
			for (let i = 0; i < amount; i += 1) {
				originalStdin.write("\b");
			}
		});
	const leftArrow = async () => write("\u001B[D");
	const rightArrow = async () => write("\u001B[C");
	const writeLn = async (data: string) => {
		await write(data);
		await enter();
	};
	return {
		lastFrameLines: (delimiter = "\n") => {
			/* c8 ignore next */
			const frame = lastFrame() ?? "";
			return frame
				.split(delimiter)
				.map((line) => line.trim())
				.filter(Boolean);
		},
		stdin: { backspace, enter, leftArrow, rightArrow, write, writeLn },
		stdout,
	};
};
