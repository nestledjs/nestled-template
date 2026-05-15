/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_GTM_TRACKING_ID: string
  readonly VITE_MODE: string
  // Add more VITE_ variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

// TypeScript declarations for importing markdown files
declare module '*.md' {
  import type { ComponentType } from 'react'
  
  interface MarkdownModule {
    default: ComponentType
    filename: string
    attributes: {
      title: string
      date: string
      image: string
      meta: [{ title: string }, { description: string }]
      categories: string[]
    }
  }
  
  const module: MarkdownModule
  export = module
}

declare module '*.mdx' {
  import type { ComponentType } from 'react'
  
  interface MDXModule {
    default: ComponentType
    filename: string
    attributes: {
      title: string
      date: string
      image: string
      meta: [{ title: string }, { description: string }]
      categories: string[]
    }
  }
  
  const module: MDXModule
  export = module
} 