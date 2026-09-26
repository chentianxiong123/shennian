import { defineConfig } from 'vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import mathjax3 from 'markdown-it-mathjax3'
import { getPosts, getNotesSidebar } from './theme/serverUtils'
import { buildBlogRSS } from './theme/rss'
import type { Post, NoteCategory } from './theme/serverUtils'

// Extend VitePress DefaultTheme.Config with custom blog fields
interface BlogThemeConfig {
  logo: string
  avator: string
  search: { provider: string }
  docsDir: string
  posts: Post[]
  pageSize: number
  postLength: number
  notesSidebar: NoteCategory[]
  nav: { text: string; link: string }[]
  socialLinks: (
    | { icon: string; link: string; ariaLabel: string }
    | { icon: { svg: string }; link: string; ariaLabel: string }
  )[]
  aside: boolean
  showFireworksAnimation: boolean
}

const EMAIL_ICON_SVG = `<svg role="img" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20">
  <path d="M874.666667 375.189333V746.666667a64 64 0 0 1-64 64H213.333333a64 64 0 0 1-64-64V375.189333l266.090667 225.6a149.333333 149.333333 0 0 0 193.152 0L874.666667 375.189333zM810.666667 213.333333a64.789333 64.789333 0 0 1 22.826666 4.181334 63.616 63.616 0 0 1 26.794667 19.413333 64.32 64.32 0 0 1 9.344 15.466667c2.773333 6.570667 4.48 13.696 4.906667 21.184L874.666667 277.333333v21.333334L553.536 572.586667a64 64 0 0 1-79.893333 2.538666l-3.178667-2.56L149.333333 298.666667v-21.333334a63.786667 63.786667 0 0 1 35.136-57.130666A63.872 63.872 0 0 1 213.333333 213.333333h597.333334z" />
</svg>`

const RSS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20">
  <path fill="currentColor" d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1Z"/>
</svg>`

const GITEE_ICON_SVG = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20">
  <path fill="currentColor" d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm6.09 5.333c.328 0 .593.266.593.593v1.482a.594.594 0 0 1-.593.593H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.593.593.593h5.63a.594.594 0 0 0 .593-.593v-1.481a.593.593 0 0 0-.593-.594H9.777v-.148h7.333c.328 0 .593.266.593.593v1.481a.593.593 0 0 1-.593.593h.148v.148c0 1.482-.96 2.667-2.074 2.667H9.185c-.982 0-1.778-.796-1.778-1.778V9.185c0-2.37 1.926-4.296 4.296-4.296h6.37z" />
</svg>`

const CSDN_ICON_SVG = `<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20">
  <path fill="currentColor" d="M21.6 13.1c-.1-.3-.3-.6-.6-.8-.2-.2-.5-.3-.8-.4l1.5-2.4c.4-.7.3-1.5-.3-2-.7-.5-1.6-.3-2.2.4l-1.6 2.3c-1.1-.3-2.3-.5-3.6-.5h-2.5c-.1 0-.1 0-.2.1l-1.2-3c-.2-.5-.7-.8-1.3-.8H5.4c-.7 0-1.3.5-1.4 1.2L2.1 13.3c-.1.5.3.9.7 1 .6.2.8.9.6 1.5l-.4 1c-.2.6.2 1.2.8 1.2h1.6c.2 0 .4-.1.6-.2.5-.4 1.2-.6 1.9-.6.8 0 1.5.3 2 .7.2.2.5.3.8.3h4.9c1.2 0 2.3-.8 2.5-2l.4-3c.1-.5 0-.9-.3-1.1zm-13 4.2c-.7 0-1.3-.1-1.9-.4v2h-1v-5.1c.6-.3 1.2-.5 1.9-.5.9 0 1.5.6 1.5 1.3 0 .5-.3.9-.8 1.1.3.1.6.4.6.8 0 .5-.3.8-1.2.8zm5.3-.3c-.3.3-.7.5-1.2.5h-2.6v-1.5c-.5-.5-.9-1.2-.9-2 0-.8.3-1.6.9-2.3.5-.6 1.2-1 2-1 1.6 0 2.5 1.2 2.5 2.6 0 .7-.1 1.4-.4 2.1-.2.4-.4.9-.7 1.6zm6.7-.1c-.2.2-.5.3-.8.3-.5 0-.9-.2-1.1-.6-.5.4-1.2.6-1.9.6-.6 0-1.2-.1-1.7-.5.5-.4.8-1 .8-1.7 0-.5-.2-1-.5-1.4 1.5.1 2.7.3 3.4.6 0-.2.1-.5.1-.7 0-.8-.9-1.2-2.1-1.2-1.1 0-2 .3-2.5.8-.6.6-.9 1.4-.9 2.2 0 .8.3 1.6.9 2.2.6.6 1.4.9 2.3.9 1.2 0 2.2-.4 2.9-1.2l.9-1.4c-.1.8-.3 1.5-.5 1.9z" />
</svg>`

export default async () => {
  const [posts, notesSidebar] = await Promise.all([
    getPosts(),
    getNotesSidebar(),
  ])

  const themeConfig: BlogThemeConfig = {
    logo: '/horse.svg',
    avator: '/avator.png',
    search: { provider: 'local' },
    docsDir: '/',
    posts,
    pageSize: 5,
    postLength: posts.length,
    notesSidebar,
    nav: [
      { text: 'Notes', link: notesSidebar[0]?.items[0]?.path ?? '/notes/' },
      { text: 'Blogs', link: '/blogs/' },
      { text: 'Archives', link: '/archives' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/chentianxiong123', ariaLabel: 'GitHub' },
      { icon: { svg: GITEE_ICON_SVG }, link: 'https://gitee.com/dllm7tou', ariaLabel: 'Gitee' },
      { icon: { svg: CSDN_ICON_SVG }, link: 'https://blog.csdn.net/qq_36710118', ariaLabel: 'CSDN' },
    ],
    aside: false,
    showFireworksAnimation: false,
  }

  return defineConfig({
    lang: 'zh-CN',
    title: '深念',
    description: '深念',
    head: [
      ['link', { rel: 'icon', type: 'image/svg', href: '/horse.svg' }],
      ['meta', { name: 'author', content: '深念' }],
      ['meta', { property: 'og:title', content: '深念' }],
      ['meta', { property: 'og:description', content: '深念' }],
    ],
    lastUpdated: false,
    ignoreDeadLinks: true,
    themeConfig: themeConfig as any,
    buildEnd: buildBlogRSS,
    markdown: {
      vPre: {
        block: true,
        inline: true,
      },
      theme: {
        light: 'vitesse-light',
        dark: 'vitesse-dark',
      },
      codeTransformers: [transformerTwoslash() as any],
      config: (md) => {
        md.use(mathjax3)

        // Mermaid: convert ```mermaid code blocks to <pre class="mermaid"> for client-side rendering
        const defaultFence = md.renderer.rules.fence!.bind(md.renderer.rules)
        md.renderer.rules.fence = (tokens, idx, options, env, self) => {
          const token = tokens[idx]
          if (token.info.trim() === 'mermaid') {
            return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>`
          }
          return defaultFence(tokens, idx, options, env, self)
        }
      },
    },
  })
}
