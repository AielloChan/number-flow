export function frames<F extends string | (number | null)>(
	durationMs: number,
	frame: (t: number) => F,
	fps = 30
) {
	const length = (durationMs / 1000) * fps
	return Array.from({ length }, (_, i) => frame(i / (length - 1)))
}

export type DiscreteKeyframeProps = {
	[property: `--${string}`]: string | number | null | undefined
}

// Makeshift solution for animating discrete properties (i.e. custom propeties)
// when @property isn't supported:
export function discreteFrames(
	durationMs: number,
	frame: (t: number) => DiscreteKeyframeProps,
	fps = 60
) {
	// If CSS.registerProperty is supported, assume they've been registered and do a normal animation
	// on them:
	if (typeof CSS?.registerProperty !== 'undefined') {
		return [frame(0), frame(1)]
	}

	// Discrete values change halfway between keyframes, so nudge everything over half a
	// frame, throw out the final one, and add another initial one:
	const length = Math.max((durationMs / 1000) * fps - 1, 0) // minus one frame
	const frames = Array.from(
		{ length },
		(_, f): Keyframe => ({
			...frame(f / length),
			offset: (f + 0.5) / length
		})
	)
	// add another initial frame
	frames.unshift({
		...frame(0),
		offset: 0
	})

	return frames
}

export const lerp = (min: number, max: number, weight: number) => min + (max - min) * weight
