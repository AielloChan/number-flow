import * as React from 'react'
import NumberFlowElement, { type Value, type Format, renderInnerHTML } from 'number-flow'
export type * from 'number-flow'

const NumberFlow = React.forwardRef<
	typeof NumberFlowElement,
	React.HTMLAttributes<typeof NumberFlowElement> & {
		value: Value
		locales?: Intl.LocalesArgument
		format?: Format
		dsd?: boolean
	}
>(function NumberFlow({ value, className, locales, format, dsd, ...rest }, ref) {
	return (
		// @ts-expect-error
		<number-flow
			ref={ref}
			class={className}
			{...rest}
			// Should be able to do value={[value,...]} in React 19:
			value={typeof window === 'undefined' ? undefined : JSON.stringify([value, locales, format])}
			suppressHydrationWarning
			dangerouslySetInnerHTML={
				typeof window === 'undefined'
					? { __html: renderInnerHTML(value, { locales, format, dsd }) }
					: undefined
			}
		/>
	)
})

export default NumberFlow
