// These are protocol operation boundaries, not replacement UI assertions.
const evaluate = 'evaluate'
export const fixtureLifecycleCases = [
  { file: 'turn-header-time.test.mjs', name: 'work header has only', operations: ['Emulation.setLocaleOverride', 'Emulation.setTimezoneOverride', 'Emulation.setDeviceMetricsOverride', 'Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate, evaluate, evaluate] },
  { file: 'turn-activity.test.mjs', name: 'completed turn auto-folds once', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate] },
  { file: 'tool-sequences.test.mjs', name: 'screenshot topology:', operations: ['Emulation.setDeviceMetricsOverride', 'Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate, evaluate] },
  { file: 't3-theme-paint.test.mjs', name: 'T3 Chat: exact upstream paint', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, 'DOM.enable', 'CSS.enable', 'DOM.getDocument', 'DOM.querySelector', 'Input.dispatchMouseEvent'], assignment: true },
  { file: 'final-retention.test.mjs', name: 'reopened async history mounts', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate] },
  { file: 'activity-continuity.test.mjs', name: 'active current face survives', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate] },
  { file: 'activity-native.test.mjs', name: 'actual native ticker and spinner', operations: ['Emulation.setDeviceMetricsOverride', 'Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate] },
  { file: 'combined-thought-activity.test.mjs', target: 'helpers/native-thought.mjs', name: 'combined native Thought live alone', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate, evaluate] },
  { file: 'inbox-unread-retention.test.mjs', name: 'shipping bundle retains background unread', cleanup: true, operations: ['Emulation.setFocusEmulationEnabled', 'Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate] },
  { file: 'latest-reply-browser.test.mjs', name: 'Chrome: identical live/history prose', operations: ['Emulation.setFocusEmulationEnabled', 'Page.getFrameTree', 'Page.setDocumentContent', evaluate] },
  { file: 'native-font-compatibility.test.mjs', name: 'native chosen family stays live', operations: ['Page.getFrameTree', 'Page.setDocumentContent', evaluate, evaluate, evaluate, evaluate], assertion: true },
]

export function lifecycleScenarios(spec) {
  const scenarios = [{ kind: 'acquire-reject' }]
  for (let step = 1; step <= spec.operations.length; step++) {
    for (const kind of ['reject', 'throw']) scenarios.push({ kind, step })
  }
  if (spec.assignment) scenarios.push({ kind: 'assignment', step: 8 })
  if (spec.assertion) scenarios.push({ kind: 'assertion', step: 5 })
  scenarios.push({ kind: 'transfer' })
  return scenarios
}
