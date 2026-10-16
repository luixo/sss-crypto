import { Text } from "ink";
import { expect, test, vi } from "vitest";

import { useResetKey } from "~/hooks/use-reset-key";
import { sequence } from "~/utils/promise";

import { render } from "./utils/render";

const ResetProbe = ({
	active,
	onReset,
}: {
	active?: boolean;
	onReset?: () => void;
}) => {
	const key = useResetKey({ isActive: active, onReset });
	return <Text>{key}</Text>;
};

test("reset handles consecutive Enter presses without a delay or callback", async () => {
	const { stdin, lastFrameLines } = await render(<ResetProbe />);
	await stdin.write("x");
	expect(lastFrameLines()).toStrictEqual(["0"]);
	await sequence(
		...Array.from({ length: 20 }, (_, index) => async () => {
			await stdin.enter();
			expect(lastFrameLines()).toStrictEqual([String(index + 1)]);
		}),
	);
});

test("inactive reset ignores Enter", async () => {
	const onReset = vi.fn<() => void>();
	const { stdin, lastFrameLines } = await render(
		<ResetProbe active={false} onReset={onReset} />,
	);
	await stdin.enter();
	expect(lastFrameLines()).toStrictEqual(["0"]);
	expect(onReset).not.toHaveBeenCalled();
});

test("active reset calls its callback once per Enter", async () => {
	const onReset = vi.fn<() => void>();
	const { stdin, lastFrameLines } = await render(
		<ResetProbe onReset={onReset} />,
	);
	await stdin.enter();
	expect(lastFrameLines()).toStrictEqual(["1"]);
	expect(onReset).toHaveBeenCalledExactlyOnceWith();
});
