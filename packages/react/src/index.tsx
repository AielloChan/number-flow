'use client'

import * as React from 'react'
import {
	type Value,
	type Format,
	SLOTTED_TAG,
	SLOTTED_STYLES,
	partitionParts,
	type PartitionedParts,
	NumberFlowLite
} from 'number-flow'
export { DEFAULT_X_TIMING, DEFAULT_Y_TIMING } from 'number-flow'
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
	fadeTiming?: (typeof NumberFlowElement)['prototype']['fadeTiming']
	xTiming?: (typeof NumberFlowElement)['prototype']['xTiming']
	yTiming?: (typeof NumberFlowElement)['prototype']['yTiming']
}

type NumberFlowPrivProps = Omit<NumberFlowProps, 'value' | 'locales' | 'format'> & {
	innerRef: React.MutableRefObject<NumberFlowElement | undefined>
	parts: PartitionedParts
}

// You're supposed to cache these between uses:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
// Serialize to strings b/c React:
const formatters: Record<string, Intl.NumberFormat> = {}

// We need a class component to use getSnapshotBeforeUpdate:
class NumberFlowPriv extends React.Component<NumberFlowPrivProps> {
	constructor(props: NumberFlowPrivProps) {
		super(props)
		this.handleRef = this.handleRef.bind(this)
	}

	// Update the non-parts props to avoid JSON serialization
	// Parts needs to be set in render still:
	updateNonPartsProps() {
		if (this.#el) {
			if (this.props.fadeTiming) this.#el.fadeTiming = this.props.fadeTiming
			if (this.props.xTiming) this.#el.xTiming = this.props.xTiming
			if (this.props.yTiming) this.#el.yTiming = this.props.yTiming
		}
	}

	override componentDidMount() {
		this.updateNonPartsProps()
		if (this.#el) this.#el.manual = true
	}

	override getSnapshotBeforeUpdate() {
		this.updateNonPartsProps()
		this.#el?.willUpdate()
		return null
	}

	override componentDidUpdate() {
		this.#el?.didUpdate()
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
			// These are set in updateNonPartsProps, so ignore them here:
			fadeTiming,
			xTiming,
			yTiming,
			...rest
		} = this.props

		return (
			// @ts-expect-error missing types
			<number-flow
				ref={this.handleRef}
				// Have to rename this:
				class={className}
				{...rest}
				// Make sure parts are set last, everything else is updated:
				parts={JSON.stringify(parts)}
			>
				<SLOTTED_TAG style={SLOTTED_STYLES}>{parts.formatted}</SLOTTED_TAG>
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

	return <NumberFlowPriv {...props} parts={parts} innerRef={ref} />
})

export default NumberFlow
