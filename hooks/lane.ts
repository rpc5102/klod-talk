// One lane for every write Cave Talk makes in the background. Hooks put work
// on it and return at once, so Claude never waits on Cave Talk, and the
// writes still land in the order the events came. A task must not put work
// on the lane and await it, or the lane waits on itself.

let tail: Promise<void> = Promise.resolve()

/** A failed task never stops the lane: `onError` hears of it and the next runs. */
export function lane(task: () => Promise<void>, onError: (error: unknown) => void): Promise<void> {
  const run = tail.then(task).catch(onError)
  tail = run

  return run
}
