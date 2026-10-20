import { type RefObject, useCallback, useContext, useEffect, useRef } from 'react'
import { type BlockerFunction, UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'

export function AuthorNavigationGuard({ dirtyRef }: { dirtyRef: RefObject<boolean> }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext)
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirtyRef])
  return dataRouter ? <RouterNavigationGuard dirtyRef={dirtyRef} /> : null
}

function RouterNavigationGuard({ dirtyRef }: { dirtyRef: RefObject<boolean> }) {
  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        dirtyRef.current &&
        (currentLocation.pathname !== nextLocation.pathname ||
          currentLocation.search !== nextLocation.search),
      [dirtyRef],
    ),
  )
  return blocker.state === 'blocked' ? (
    <UnsavedChangesDialog onStay={blocker.reset} onLeave={blocker.proceed} />
  ) : null
}

function UnsavedChangesDialog({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    const returnFocus = document.activeElement
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialogRef}
      className="author-leave-dialog"
      aria-labelledby="author-leave-title"
      aria-describedby="author-leave-description"
      onCancel={(event) => {
        event.preventDefault()
        onStay()
      }}
    >
      <p className="eyebrow">Unsaved note</p>
      <h2 id="author-leave-title">저장하지 않은 기록이 있습니다.</h2>
      <p id="author-leave-description">
        떠나면 현재 변경사항이 사라집니다. 계속 작성하거나 초안을 저장한 뒤 이동할 수 있습니다.
      </p>
      <div>
        <button className="author-button" type="button" onClick={onStay} autoFocus>
          계속 작성
        </button>
        <button className="author-button is-primary" type="button" onClick={onLeave}>
          변경사항 버리고 이동
        </button>
      </div>
    </dialog>
  )
}
