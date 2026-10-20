import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { AuthorApiError, getAuthorSession, type AuthorSession } from './author-api'

type SessionState =
  | { status: 'loading' | 'anonymous' | 'forbidden' | 'unavailable'; session: null }
  | { status: 'ready'; session: AuthorSession }

const AuthorSessionContext = createContext<SessionState>({
  status: 'loading',
  session: null,
})

export function AuthorSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading', session: null })
  useEffect(() => {
    const controller = new AbortController()
    void getAuthorSession(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setState({ status: 'ready', session })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status:
            error instanceof AuthorApiError && error.status === 401
              ? 'anonymous'
              : error instanceof AuthorApiError && error.status === 403
                ? 'forbidden'
                : 'unavailable',
          session: null,
        })
      })
    return () => controller.abort()
  }, [])
  return <AuthorSessionContext.Provider value={state}>{children}</AuthorSessionContext.Provider>
}

export function useAuthorSession(): SessionState {
  return useContext(AuthorSessionContext)
}
