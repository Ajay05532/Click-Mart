import { useEffect } from 'react'

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title === 'ClickMart' ? title : `${title} · ClickMart`
  }, [title])
}
