import { createElement, offset, replaceChildren, type HTMLProps, type Justify } from './util/dom'
import { forEach } from './util/iterable'
import {
	type KeyedDigitPart,
	type KeyedNumberPart,
	type KeyedSymbolPart,
	type NumberPartKey,
	type PartitionedParts
} from './formatter'
import { ServerSafeHTMLElement } from './ssr'
import styles, {
	maskHeight,
	opacityDeltaVar,
	supportsAnimationComposition,
	supportsLinear
} from './styles'
import { getDuration, frames, lerp } from './util/animate'
import { BROWSER } from 'esm-env'

export { SlottedTag, slottedStyles, supportsAnimationComposition, supportsLinear } from './styles'
export * from './formatter'

enum Trend {
	UP = 1,
	DOWN = -1,
	NONE = 0
}

const getTrend = (val: number | bigint, prev?: number | bigint) => {
	if (!prev) return
	if (val > prev) return Trend.UP
	if (val < prev) return Trend.DOWN
	return Trend.NONE
}

export const defaultFadeTiming: EffectTiming = { duration: 500, easing: 'ease-out' }
export const defaultXTiming: EffectTiming = supportsLinear
	? {
			duration: 900,
			easing:
				'linear(0,.005,.019,.039,.066,.096,.129,.165,.202,.24,.278,.316,.354,.39,.426,.461,.494,.526,.557,.586,.614,.64,.665,.689,.711,.731,.751,.769,.786,.802,.817,.831,.844,.856,.867,.877,.887,.896,.904,.912,.919,.925,.931,.937,.942,.947,.951,.955,.959,.962,.965,.968,.971,.973,.976,.978,.98,.981,.983,.984,.986,.987,.988,.989,.99,.991,.992,.992,.993,.994,.994,.995,.995,.996,.996,.9963,.9967,.9969,.9972,.9975,.9977,.9979,.9981,.9982,.9984,.9985,.9987,.9988,.9989,1)'
		}
	: {
			duration: 900,
			// Spring-like cubic-bezier stolen from Vaul: https://vaul.emilkowal.ski/
			easing: `cubic-bezier(.32,.72,0,1)`
		}
export const defaultSpinTiming = defaultXTiming

let styleSheet: CSSStyleSheet | undefined

type AnimationsFinishedListener = () => void
type OffAnimationsFinished = () => void

// This one is used internally for framework wrappers, and
// doesn't include things like i.e. attribute support:
export class NumberFlowLite extends ServerSafeHTMLElement {
	static define() {
		if (BROWSER) customElements.define('number-flow', this)
	}

	xTiming = defaultXTiming
	spinTiming = defaultSpinTiming
	fadeTiming = defaultFadeTiming
	root = false
	manual = false

	#created = false
	#pre?: SymbolSection
	#integer?: NumberSection
	#fraction?: NumberSection
	#post?: SymbolSection

	trend: boolean | 'increasing' | 'decreasing' = true
	#computedTrend?: Trend

	getComputedTrend() {
		return this.#computedTrend
	}

	#prevVal?: number | bigint

	set parts(newVal: PartitionedParts | undefined) {
		if (newVal == null) {
			return
		}

		const { pre, integer, fraction, post, value } = newVal

		// Initialize if needed
		if (!this.#created) {
			// Don't check for declarative shadow DOM because we'll recreate it anyway:
			this.attachShadow({ mode: 'open' })

			// Add stylesheet
			if (typeof CSSStyleSheet !== 'undefined' && this.shadowRoot!.adoptedStyleSheets) {
				if (!styleSheet) {
					styleSheet = new CSSStyleSheet()
					styleSheet.replaceSync(styles)
				}
				this.shadowRoot!.adoptedStyleSheets = [styleSheet]
			} else {
				const style = document.createElement('style')
				style.textContent = styles
				this.shadowRoot!.appendChild(style)
			}

			this.shadowRoot!.appendChild(createElement('slot'))

			this.#pre = new SymbolSection(this, pre, {
				// part: 'pre',
				inert: true,
				ariaHidden: 'true',
				justify: 'right'
			})
			this.shadowRoot!.appendChild(this.#pre.el)
			this.#integer = new NumberSection(this, integer, {
				// part: 'integer',
				inert: true,
				ariaHidden: 'true',
				justify: 'right'
			})
			this.shadowRoot!.appendChild(this.#integer.el)
			this.#fraction = new NumberSection(this, fraction, {
				// part: 'fraction',
				inert: true,
				ariaHidden: 'true',
				justify: 'left'
			})
			this.shadowRoot!.appendChild(this.#fraction.el)
			this.#post = new SymbolSection(this, post, {
				// part: 'post',
				inert: true,
				ariaHidden: 'true',
				justify: 'left'
			})
			this.shadowRoot!.appendChild(this.#post.el)
		} else {
			// Compute trend
			if (this.trend === true) {
				this.#computedTrend = getTrend(value, this.#prevVal)
			} else if (this.trend === 'increasing') {
				this.#computedTrend = Trend.UP
			} else if (this.trend === 'decreasing') {
				this.#computedTrend = Trend.DOWN
			} else this.#computedTrend = Trend.NONE

			if (!this.manual) this.willUpdate()

			this.#pre!.update(pre)
			this.#integer!.update(integer)
			this.#fraction!.update(fraction)
			this.#post!.update(post)

			if (!this.manual) this.didUpdate()
		}

		this.#created = true
		this.#prevVal = value
	}

	willUpdate() {
		const rect = this.root ? this.getBoundingClientRect() : new DOMRect()
		this.#pre!.willUpdate(rect)
		this.#integer!.willUpdate(rect)
		this.#fraction!.willUpdate(rect)
		this.#post!.willUpdate(rect)
	}

	#abortAnimationsFinished?: AbortController
	#animationsFinishedListeners = new Set<AnimationsFinishedListener>()
	onAnimationsFinished(fn: AnimationsFinishedListener) {
		this.#animationsFinishedListeners.add(fn)
		return () => {
			this.#animationsFinishedListeners.delete(fn)
		}
	}

	#handleAnimationsFinished = () => {
		this.#animationsFinishedListeners.forEach((l) => l())
		this.#animationsFinishedListeners.clear()
	}

	didUpdate() {
		const rect = this.root ? this.getBoundingClientRect() : new DOMRect()
		this.#pre!.didUpdate(rect)
		this.#integer!.didUpdate(rect)
		this.#fraction!.didUpdate(rect)
		this.#post!.didUpdate(rect)

		// Every update, abort any existing animations finished promise.all, then create a new one:
		this.#abortAnimationsFinished?.abort()
		const controller = new AbortController()
		Promise.all(this.shadowRoot!.getAnimations().map((a) => a.finished)).then(() => {
			if (!controller.signal.aborted) this.#handleAnimationsFinished()
		})
		this.#abortAnimationsFinished = controller
	}
}

type SectionProps = { justify: Justify } & HTMLProps<'span'>

abstract class Section {
	readonly el: HTMLSpanElement
	readonly justify: Justify

	// All children in the DOM:
	protected children = new Map<NumberPartKey, Char>()

	constructor(
		readonly flow: NumberFlowLite,
		parts: KeyedNumberPart[],
		{ justify, className, ...opts }: SectionProps,
		children?: (chars: Node[]) => Node[]
	) {
		this.justify = justify
		const chars = parts.map<Node>((p) => this.addChar(p).el)
		// Add zero-width space to prevent height from collapsing when empty:
		// Can't use :empty because technically popped digits are still in the DOM, just
		// absolutely positioned
		chars.push(createElement('span', { className: 'empty', textContent: '\u200B' }))

		this.el = createElement(
			'span',
			{
				...opts,
				className: `section section--justify-${justify} ${className ?? ''}`
			},
			children ? children(chars) : chars
		)
	}

	protected addChar(
		part: KeyedNumberPart,
		{
			startDigitsAtZero = false,
			...props
		}: { startDigitsAtZero?: boolean } & Pick<AnimatePresenceProps, 'animateIn'> = {}
	) {
		const comp =
			part.type === 'integer' || part.type === 'fraction'
				? new Digit(this, part.type, startDigitsAtZero ? 0 : part.value, {
						...props,
						onRemove: this.onCharRemove(part.key)
					})
				: new Sym(this, part.type, part.value, {
						...props,
						onRemove: this.onCharRemove(part.key)
					})
		this.children.set(part.key, comp)
		return comp
	}

	private onCharRemove =
		(key: NumberPartKey): OnRemove =>
		() => {
			this.children.delete(key)
		}

	protected unpop(char: Char) {
		char.el.classList.remove('section__exiting')
		char.el.style[this.justify] = ''
	}

	protected pop(chars: Map<any, Char>) {
		// Calculate offsets for removed before popping, to avoid layout thrashing:
		chars.forEach((char) => {
			char.el.style[this.justify] = `${offset(char.el, this.justify)}px`
		})
		chars.forEach((char) => {
			char.el.classList.add('section__exiting')
			char.present = false
		})
	}

	protected addNewAndUpdateExisting(parts: KeyedNumberPart[], parent: HTMLElement = this.el) {
		const added = new Map<KeyedNumberPart, Char>()
		const updated = new Map<KeyedNumberPart, Char>()

		// Add new parts before any other updates, so we can save their position correctly:
		const reverse = this.justify === 'left'
		const op = reverse ? 'prepend' : 'append'
		forEach(
			parts,
			(part) => {
				let comp: Char
				// Already exists/needs update, so set aside for now
				if (this.children.has(part.key)) {
					comp = this.children.get(part.key)!
					updated.set(part, comp)
					this.unpop(comp)
					comp.present = true
				} else {
					// New part
					comp = this.addChar(part, { startDigitsAtZero: true, animateIn: true })
					added.set(part, comp)
				}
				parent[op](comp.el)
			},
			{ reverse }
		)

		const rect = parent.getBoundingClientRect() // this should only cause a layout if there were added children
		added.forEach((comp) => {
			comp.willUpdate(rect)
		})
		// Update added children to their initial value (we start them at 0)
		added.forEach((comp, part) => {
			comp.update(part.value)
		})

		// Update any updated children
		updated.forEach((comp, part) => {
			comp.update(part.value)
		})
	}
}

class NumberSection extends Section {
	readonly #inner: HTMLSpanElement

	constructor(
		flow: NumberFlowLite,
		parts: KeyedNumberPart[],
		{ className, ...props }: SectionProps
	) {
		let inner: HTMLSpanElement
		super(
			flow,
			parts,
			{
				...props,
				className: `${className ?? ''} section--masked`
			},
			(parts) => [
				(inner = createElement(
					'span',
					{
						className: 'section__inner'
					},
					parts
				))
			]
		)

		// @ts-expect-error TS doesn't know the cb is invoked immediately
		this.#inner = inner
	}

	#prevWidth?: number
	#prevOffset?: number

	willUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()
		this.#prevWidth = rect.width
		this.#prevOffset = rect[this.justify] - parentRect[this.justify]

		const innerRect = this.#inner.getBoundingClientRect()
		this.children.forEach((comp) => comp.willUpdate(innerRect))
	}

	update(parts: KeyedNumberPart[]) {
		const removed = new Map<NumberPartKey, Char>()

		this.children.forEach((comp, key) => {
			// Keep track of removed children:
			if (!parts.find((p) => p.key === key)) {
				removed.set(key, comp)
			}
			// Put everything back into the flow briefly, to recompute offsets:
			this.unpop(comp)
		})

		this.addNewAndUpdateExisting(parts, this.#inner)

		// Set all removed digits to 0, for mathematical correctness:
		removed.forEach((comp) => {
			if (comp instanceof Digit) comp.update(0)
		})

		// Then end with them popped out again:
		this.pop(removed)
	}

	didUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()
		const offset = rect[this.justify] - parentRect[this.justify]

		const dx = this.#prevOffset! - offset
		const scale = Math.max(this.#prevWidth!, 0.01) / Math.max(rect.width, 0.01) // can't properly compute scale if width is 0

		// Make sure to pass this in before starting to animate:
		const innerRect = this.#inner.getBoundingClientRect()
		this.children.forEach((comp) => comp.didUpdate(innerRect))

		this.el.animate(
			{
				transform: [`translateX(${dx}px)`, 'none']
			},
			{
				...this.flow.xTiming,
				composite: 'accumulate' // important, accumulate onto pre-scaled instead of add to scaled
			}
		)

		this.el.animate(
			{
				transform: [`scaleX(${scale})`, 'none']
			},
			{
				...this.flow.xTiming,
				composite: 'add' // important
			}
		)

		const duration = getDuration(this.flow.xTiming)

		this.#inner.animate(
			{
				// 1/x isn't linear so we need to sample:
				transform: frames(duration, (t) => `scaleX(${1 / lerp(scale, 1, t)})`)
			},
			{
				...this.flow.xTiming,
				composite: 'add' // important
			}
		)
	}
}

class SymbolSection extends Section {
	#prevOffset?: number

	willUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()
		this.#prevOffset = rect[this.justify] - parentRect[this.justify]

		this.children.forEach((comp) => comp.willUpdate(rect))
	}

	update(parts: KeyedNumberPart[]) {
		const removed = new Map<NumberPartKey, Char>()

		this.children.forEach((comp, key) => {
			// Keep track of removed children:
			if (!parts.find((p) => p.key === key)) {
				removed.set(key, comp)
			}
		})

		// Pop them, before any additions
		this.pop(removed)

		this.addNewAndUpdateExisting(parts)
	}

	didUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()
		const offset = rect[this.justify] - parentRect[this.justify]

		// Make sure to pass this in before starting to animate:
		this.children.forEach((comp) => comp.didUpdate(rect))

		this.el.animate(
			{
				transform: [`translateX(${this.#prevOffset! - offset}px)`, 'none']
			},
			{
				...this.flow.xTiming,
				composite: 'accumulate'
			}
		)
	}
}

type OnRemove = () => void
interface AnimatePresenceProps {
	onRemove?: OnRemove
	animateIn?: boolean
}

class AnimatePresence {
	#present = true
	#onRemove?: OnRemove

	constructor(
		readonly flow: NumberFlowLite,
		readonly el: HTMLElement,
		{ onRemove, animateIn = false }: AnimatePresenceProps = {}
	) {
		this.el.classList.add('animate-presence')
		// This craziness is the only way I could figure out how to get the opacity
		// accumulation to work in all browsers. Accumulating -1 onto opacity directly
		// failed in both FF and Safari, and setting a delta to -1 still failed in FF
		if (animateIn) {
			this.el.animate(
				{
					[opacityDeltaVar]: [-0.9999, 0]
				},
				{
					...this.flow.fadeTiming,
					composite: 'accumulate'
				}
			)
		}

		this.#onRemove = onRemove
	}

	get present() {
		return this.#present
	}

	#offRootAnimationsFinished?: OffAnimationsFinished

	#handleRootAnimationsFinished = () => {
		this.el.remove()
		this.#onRemove?.()
	}

	set present(val) {
		if (this.#present === val) return
		this.el.style.setProperty('--_number-flow-d-opacity', val ? '0' : '-.999')
		this.el.animate(
			{
				[opacityDeltaVar]: val ? [-0.9999, 0] : [0.999, 0]
			},
			{
				...this.flow.fadeTiming,
				composite: 'accumulate'
			}
		)

		// If making present, remove any root animations finished listener:
		if (val) this.#offRootAnimationsFinished?.()
		else
			this.#offRootAnimationsFinished = this.flow.onAnimationsFinished(
				this.#handleRootAnimationsFinished
			)
		this.#present = val
	}
}

interface CharOptions extends AnimatePresenceProps {}

abstract class Char<P extends KeyedNumberPart = KeyedNumberPart> extends AnimatePresence {
	constructor(
		readonly section: Section,
		protected value: P['value'],
		override readonly el: HTMLSpanElement,
		options?: AnimatePresenceProps
	) {
		super(section.flow, el, options)
	}

	abstract willUpdate(parentRect: DOMRect): void
	abstract update(value: P['value']): void
	abstract didUpdate(parentRect: DOMRect): void
}

class Digit extends Char<KeyedDigitPart> {
	#roll: HTMLSpanElement
	#numbers: HTMLSpanElement[]

	constructor(
		section: Section,
		_: KeyedDigitPart['type'],
		value: KeyedDigitPart['value'],
		opts?: CharOptions
	) {
		const numbers = Array.from({ length: 10 }).map((_, i) => {
			const num = createElement(
				'span',
				{ className: `digit__num${i === value ? ' current' : ''}` },
				[document.createTextNode(String(i))]
			)
			num.style.setProperty('--i', String(i))
			return num
		})
		const roll = createElement(
			'span',
			{
				className: `digit__roll`
			},
			numbers
		)
		const el = createElement(
			'span',
			{
				className: `digit`
			},
			[roll]
		)
		el.style.setProperty('--c', String(value))

		super(section, value, el, opts)

		this.#roll = roll
		this.#numbers = numbers
	}

	#prevValue?: KeyedDigitPart['value']

	get trend() {
		const rootTrend = this.flow.getComputedTrend()
		if (rootTrend === Trend.NONE) {
			return getTrend(this.value, this.#prevValue)
		}
		return rootTrend
	}

	// Relative to parent:
	#prevCenter?: number

	willUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()

		const prevOffset = rect[this.section.justify] - parentRect[this.section.justify]
		const halfWidth = rect.width / 2
		this.#prevCenter =
			this.section.justify === 'left' ? prevOffset + halfWidth : prevOffset - halfWidth
	}

	update(value: KeyedDigitPart['value']) {
		// Keep this here not in willUpdate because it's not transition related:
		this.#prevValue = this.value
		this.#numbers[this.#prevValue]?.classList.remove('current')
		this.el.style.setProperty('--c', String(value))
		this.#numbers[value]?.classList.add('current')
		this.value = value
	}

	didUpdate(parentRect: DOMRect) {
		const rect = this.el.getBoundingClientRect()
		const offset = rect[this.section.justify] - parentRect[this.section.justify]
		const halfWidth = rect.width / 2
		const center = this.section.justify === 'left' ? offset + halfWidth : offset - halfWidth

		this.el.animate(
			{
				transform: [`translateX(${this.#prevCenter! - center}px)`, 'none']
			},
			{
				...this.flow.xTiming,
				composite: 'accumulate'
			}
		)

		const trend = this.trend
		let diff = this.value - this.#prevValue!
		// Loop around if need be:
		if (trend === Trend.DOWN && this.value > this.#prevValue!)
			diff = this.value - 10 - this.#prevValue!
		if (trend === Trend.UP && this.value < this.#prevValue!)
			diff = 10 - this.#prevValue! + this.value

		this.#roll.animate(
			{
				transform: [`rotateX(${diff * 36}deg)`, 'none']
			},
			{
				...this.flow.spinTiming,
				composite: 'accumulate'
			}
		)
	}
}

class Sym extends Char<KeyedSymbolPart> {
	constructor(
		section: Section,
		private type: KeyedSymbolPart['type'],
		value: KeyedSymbolPart['value'],
		opts?: CharOptions
	) {
		const val = createElement('span', {
			className: 'symbol__value',
			textContent: value
		})
		super(
			section,
			value,
			createElement(
				'span',
				{
					className: `symbol`
				},
				[val]
			),
			opts
		)
		this.#children.set(
			value,
			new AnimatePresence(this.flow, val, {
				onRemove: this.#onChildRemove(value)
			})
		)
	}

	#children = new Map<KeyedSymbolPart['value'], AnimatePresence>()

	#prevOffset?: number

	willUpdate(parentRect: DOMRect) {
		if (this.type === 'decimal') return // decimal never needs animation b/c it's the first in a left aligned section and never moves

		const rect = this.el.getBoundingClientRect()
		this.#prevOffset = rect[this.section.justify] - parentRect[this.section.justify]
	}

	#onChildRemove =
		(key: KeyedSymbolPart['value']): OnRemove =>
		() => {
			this.#children.delete(key)
		}

	update(value: KeyedSymbolPart['value']) {
		if (this.value !== value) {
			// Pop the current value:
			const current = this.#children.get(this.value)!
			current.present = false
			current.el.classList.add('symbol__exiting')

			// If we already have the new value and it hasn't finished removing, reclaim it:
			if (this.#children.has(value)) {
				const prev = this.#children.get(value)!
				prev.present = true
				prev.el.classList.remove('symbol__exiting')
			} else {
				// Otherwise, create a new one:
				const newVal = createElement('span', {
					className: 'symbol__value',
					textContent: value
				})
				this.el.appendChild(newVal)
				this.#children.set(
					value,
					new AnimatePresence(this.flow, newVal, {
						animateIn: true,
						onRemove: this.#onChildRemove(value)
					})
				)
			}
		}
		this.value = value
	}

	didUpdate(parentRect: DOMRect) {
		if (this.type === 'decimal') return

		const rect = this.el.getBoundingClientRect()
		const offset = rect[this.section.justify] - parentRect[this.section.justify]

		this.el.animate(
			{
				transform: [`translateX(${this.#prevOffset! - offset}px)`, 'none']
			},
			{ ...this.flow.xTiming, composite: 'accumulate' }
		)
	}
}
