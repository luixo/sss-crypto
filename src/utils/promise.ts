export const sequence = async (...fns: (() => Promise<void>)[]) => {
	for (const fn of fns) {
		await fn();
	}
};
