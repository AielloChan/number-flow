export function getDuration(timing: EffectTiming) {
	if (typeof timing.duration !== 'number')
		throw new Error('NumberFlow timing duration must be a number')
	return timing.duration ?? 0
}

export function frames<F extends string | (number | null)>(
	durationMs: number,
	frame: (t: number) => F,
	fps = 60
) {
	const length = Math.trunc((durationMs / 1000) * fps)
	return Array.from({ length }, (_, i) => frame(i / (length - 1)))
}

export const lerp = (min: number, max: number, weight: number) => min + (max - min) * weight

// "Ignores" all animations on an element by pausing them, saving their current time,
// scrubbing them to end, then returning a fn that resumes them at the saved time
export function ignoreAnimations(el: HTMLElement) {
	const animations = el.getAnimations()
	const resumeFns = animations.map((a) => {
		// I think the duration types are wrong in TS for this:
		const duration = a.effect?.getComputedTiming().duration as number | undefined
		if (duration == null) return

		const time = a.currentTime
		// a.pause()
		a.currentTime = duration - 0.1 // don't know if this matters but try not to trigger complete event
		return () => {
			a.currentTime = time
			// a.play()
		}
	})
	return () => {
		resumeFns.forEach((r) => r?.())
	}
}

export type UnignoreAnimationsFn = ReturnType<typeof ignoreAnimations>
