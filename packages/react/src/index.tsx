'use client'

import * as React from 'react'
import {
	type Value,
	type Format,
	SlottedTag,
	slottedStyles,
	partitionParts,
	type PartitionedParts,
	NumberFlowLite,
	supportsLinear,
	prefersReducedMotion,
	canAnimate
} from 'number-flow'
export type * from 'number-flow'

// Can't wait to not have to do this in React 19:
const OBSERVED_ATTRIBUTES = ['parts'] as const
type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number]
export class NumberFlowElement extends NumberFlowLite {
	static observedAttributes = OBSERVED_ATTRIBUTES
	attributeChangedCallback(attr: ObservedAttribute, _oldValue: string, newValue: string) {
		this[attr] = JSON.parse(newValue)
	}
}

NumberFlowElement.define()

export type NumberFlowProps = React.HTMLAttributes<NumberFlowElement> & {
	value: Value
	locales?: Intl.LocalesArgument
	format?: Format
	isolate?: boolean
	animated?: boolean
	respectMotionPreference?: boolean
	willChange?: boolean
	// animateDependencies?: React.DependencyList
	onAnimationsStart?: () => void
	onAnimationsFinish?: () => void
	trend?: (typeof NumberFlowElement)['prototype']['trend']
	opacityTiming?: (typeof NumberFlowElement)['prototype']['opacityTiming']
	transformTiming?: (typeof NumberFlowElement)['prototype']['transformTiming']
	rotateTiming?: (typeof NumberFlowElement)['prototype']['rotateTiming']
}

type NumberFlowImplProps = Omit<NumberFlowProps, 'value' | 'locales' | 'format'> & {
	innerRef: React.MutableRefObject<NumberFlowElement | undefined>
	parts: PartitionedParts
}

// You're supposed to cache these between uses:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
// Serialize to strings b/c React:
const formatters: Record<string, Intl.NumberFormat> = {}

// We need a class component to use getSnapshotBeforeUpdate:
class NumberFlowImpl extends React.Component<NumberFlowImplProps> {
	constructor(props: NumberFlowImplProps) {
		super(props)
		this.handleRef = this.handleRef.bind(this)
	}

	// Update the non-parts props to avoid JSON serialization
	// Parts needs to be set in render still:
	updateNonPartsProps(prevProps?: Readonly<NumberFlowImplProps>) {
		if (!this.#el) return

		this.#el.manual = !this.props.isolate
		if (this.props.animated != null) this.#el.animated = this.props.animated
		if (this.props.respectMotionPreference != null)
			this.#el.respectMotionPreference = this.props.respectMotionPreference
		if (this.props.trend != null) this.#el.trend = this.props.trend
		if (this.props.opacityTiming) this.#el.opacityTiming = this.props.opacityTiming
		if (this.props.transformTiming) this.#el.transformTiming = this.props.transformTiming
		if (this.props.rotateTiming) this.#el.rotateTiming = this.props.rotateTiming

		if (prevProps?.onAnimationsStart)
			this.#el.removeEventListener('animationsstart', prevProps.onAnimationsStart)
		if (this.props.onAnimationsStart)
			this.#el.addEventListener('animationsstart', this.props.onAnimationsStart)

		if (prevProps?.onAnimationsFinish)
			this.#el.removeEventListener('animationsfinish', prevProps.onAnimationsFinish)
		if (this.props.onAnimationsFinish)
			this.#el.addEventListener('animationsfinish', this.props.onAnimationsFinish)
	}

	override componentDidMount() {
		this.updateNonPartsProps()
	}

	override getSnapshotBeforeUpdate(prevProps: Readonly<NumberFlowImplProps>) {
		this.updateNonPartsProps(prevProps)
		if (!this.props.isolate && prevProps.parts !== this.props.parts) this.#el?.willUpdate()
		return null
	}

	override componentDidUpdate(prevProps: Readonly<NumberFlowImplProps>) {
		if (!this.props.isolate && prevProps.parts !== this.props.parts) this.#el?.didUpdate()
	}

	#el?: NumberFlowElement

	handleRef(el: NumberFlowElement) {
		if (this.props.innerRef) this.props.innerRef.current = el
		this.#el = el
	}

	override render() {
		const {
			innerRef,
			className,
			parts,
			willChange,
			// These are set in updateNonPartsProps, so ignore them here:
			animated,
			respectMotionPreference,
			isolate,
			trend,
			opacityTiming,
			transformTiming,
			rotateTiming,
			...rest
		} = this.props

		return (
			// @ts-expect-error missing types
			<number-flow
				ref={this.handleRef}
				data-will-change={willChange ? '' : undefined}
				// Have to rename this:
				class={className}
				{...rest}
				// Make sure parts are set last, everything else is updated:
				parts={JSON.stringify(parts)}
			>
				<SlottedTag style={slottedStyles({ willChange })}>{parts.formatted}</SlottedTag>
				{/* @ts-expect-error missing types */}
			</number-flow>
		)
	}
}

const NumberFlow = React.forwardRef<NumberFlowElement, NumberFlowProps>(function NumberFlow(
	{ value, locales, format, ...props },
	_ref
) {
	React.useImperativeHandle(_ref, () => ref.current!, [])
	const ref = React.useRef<NumberFlowElement>()

	const localesString = React.useMemo(() => (locales ? JSON.stringify(locales) : ''), [locales])
	const formatString = React.useMemo(() => (format ? JSON.stringify(format) : ''), [format])
	const parts = React.useMemo(() => {
		const formatter = (formatters[`${localesString}:${formatString}`] ??= new Intl.NumberFormat(
			locales,
			format
		))
		return partitionParts(value, formatter)
	}, [value, localesString, formatString])

	return <NumberFlowImpl {...props} parts={parts} innerRef={ref} />
})

export default NumberFlow

// SSR-safe supportsLinear
export function useSupportsLinear() {
	const [supported, setSupported] = React.useState(false)

	React.useEffect(() => {
		setSupported(supportsLinear)
	}, [])

	return supported
}

export function useLinear<T = any>(linear: T, fallback: T): T {
	const supported = useSupportsLinear()
	return supported ? linear : fallback
}

export function useCanAnimate({
	respectMotionPreference = true
}: { respectMotionPreference?: boolean } = {}) {
	const [reducedMotion, setReducedMotion] = React.useState(false)
	React.useEffect(() => {
		const onChange = ({ matches }: MediaQueryListEvent) => {
			setReducedMotion(matches)
		}
		prefersReducedMotion?.addEventListener('change', onChange)
		return () => {
			prefersReducedMotion?.removeEventListener('change', onChange)
		}
	}, [])
	return canAnimate && (!respectMotionPreference || !reducedMotion)
}
