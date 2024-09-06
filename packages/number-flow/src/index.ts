import { createElement, ServerSafeHTMLElement } from './dom'
import { formatToParts, type NumberFormatOptions, type Value } from './formatter'

const OBSERVED_ATTRIBUTES = ['value', 'transition'] as const
type ObservedAttribute = (typeof OBSERVED_ATTRIBUTES)[number]

const DEFAULT_TRANSITION: KeyframeAnimationOptions = {
	duration: 1
}

type Args = Value | [Value, locales?: Intl.LocalesArgument, format?: NumberFormatOptions]

class NumberFlow extends ServerSafeHTMLElement {
	static observedAttributes = OBSERVED_ATTRIBUTES

	transition = DEFAULT_TRANSITION
	#formatted?: string

	attributeChangedCallback(attr: ObservedAttribute, _: string, newValue: string) {
		this[attr] = JSON.parse(newValue)
	}

	get value(): string | undefined {
		return this.#formatted
	}

	set value(newVal: Args | undefined) {
		if (newVal == null) {
			this.#formatted = undefined
			return
		}
		const { pre, integer, fraction, post, formatted } = Array.isArray(newVal)
			? formatToParts(...newVal)
			: formatToParts(newVal)

		this.#formatted = formatted
	}

	constructor() {
		super()
		// Don't check for declarative shadow DOM because we'll recreate it anyway:
		this.attachShadow({ mode: 'open' })
	}

	connectedCallback() {
		const pre = new Section(this)
		this.shadowRoot!.appendChild(pre.el)
	}
}

class Section {
	readonly el: HTMLDivElement

	constructor(private flow: NumberFlow) {
		this.el = createElement('div', { part: 'pre' })
	}
}

export default NumberFlow

if (NumberFlow && typeof window !== 'undefined' && !window.customElements.get('number-flow')) {
	customElements.define('number-flow', NumberFlow)
}
