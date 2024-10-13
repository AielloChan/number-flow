import { defineConfig, envField } from 'astro/config'
import react from '@astrojs/react'
import pkg from '/../packages/number-flow/package.json'
import mdx from '@astrojs/mdx'
import vercel from '@astrojs/vercel/serverless'
import theme from './src/assets/shiki-theme'
// @ts-expect-error missing types
import sectionize from './remark-sectionize'

// https://astro.build/config
export default defineConfig({
	site: pkg.homepage,
	markdown: {
		shikiConfig: {
			theme
		},
		remarkPlugins: [sectionize]
	},
	vite: {
		ssr: {
			// Fixes build issue on macOS
			external: ['fsevents']
		}
	},
	experimental: {
		env: {
			schema: {
				GITHUB_TOKEN: envField.string({ context: 'server', access: 'secret' })
			}
		}
	},
	integrations: [
		react(),
		mdx(),
		{
			name: 'watch-shiki-theme',
			hooks: {
				'astro:config:setup'({ addWatchFile, config }) {
					addWatchFile(new URL('./highlighter-theme.json', config.root))
				}
			}
		}
	],
	output: 'hybrid',
	adapter: vercel({
		webAnalytics: {
			enabled: true
		}
	})
})
