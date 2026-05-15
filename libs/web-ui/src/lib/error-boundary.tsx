import JSON5 from 'json5'

// Helper: extract and pretty-print JSON-like substrings from a string
function renderStringWithEmbeddedJson(str: string) {
  // Special handling for 'invocation:'
  const invocationIdx = str.indexOf('invocation:')
  if (invocationIdx !== -1) {
    // Find the first '{' after 'invocation:'
    const braceStart = str.indexOf('{', invocationIdx)
    if (braceStart !== -1) {
      // Find the matching closing '}' (handle nested braces)
      let braceCount = 0
      let endIdx = -1
      for (let i = braceStart; i < str.length; i++) {
        if (str[i] === '{') braceCount++
        if (str[i] === '}') braceCount--
        if (braceCount === 0) {
          endIdx = i
          break
        }
      }
      if (endIdx !== -1) {
        const before = str.slice(0, braceStart)
        const objStr = str.slice(braceStart, endIdx + 1)
        const after = str.slice(endIdx + 1)
        let parsedObj = null
        try {
          parsedObj = JSON5.parse(objStr)
        } catch {
          // Do nothing, parsedObj remains null
        }
        return (
          <>
            <span className="font-mono text-xs text-gray-700">{before}</span>
            {parsedObj ? (
              <pre className="bg-gray-50 rounded border border-gray-200 p-3 overflow-x-auto text-left text-xs font-mono mt-2 max-h-64 whitespace-pre-wrap">
                {JSON5.stringify(parsedObj, null, 2)}
              </pre>
            ) : (
              <span className="font-mono text-xs text-gray-700">{objStr}</span>
            )}
            <span className="font-mono text-xs text-gray-700">{after}</span>
          </>
        )
      }
    }
  }
  // Fallback: previous logic for generic JSON blocks
  // Limit string length to prevent ReDoS attacks
  const MAX_STRING_LENGTH = 10000
  const safeStr = str.length > MAX_STRING_LENGTH ? str.slice(0, MAX_STRING_LENGTH) + '...' : str

  // Use safer regex with possessive quantifier simulation (limit backtracking)
  // Match opening bracket/brace, then up to 5000 chars (reasonable for error messages), then closing
  const jsonRegex = /([\[{][\s\S]{0,5000}?[\]}])/g
  const parts: (string | object)[] = []
  let lastIndex = 0
  let match
  let iterations = 0
  const MAX_ITERATIONS = 100 // Prevent infinite loops

  while ((match = jsonRegex.exec(safeStr)) !== null && iterations < MAX_ITERATIONS) {
    iterations++
    if (match.index > lastIndex) {
      parts.push(safeStr.slice(lastIndex, match.index))
    }
    try {
      const parsed = JSON5.parse(match[0])
      parts.push(parsed)
    } catch {
      parts.push(match[0])
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < safeStr.length) {
    parts.push(safeStr.slice(lastIndex))
  }
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'object' && part !== null ? (
          <pre key={i} className="bg-gray-50 rounded border border-gray-200 p-3 overflow-x-auto text-left text-xs font-mono mt-2 max-h-64 whitespace-pre-wrap">
            {JSON5.stringify(part, null, 2)}
          </pre>
        ) : (
          <span key={i} className="font-mono text-xs text-gray-700">{String(part)}</span>
        )
      )}
    </>
  )
}

export function WebErrorBoundaryUi({ error }: { error: Error }) {
  // Log the full error object for debugging
  console.error('Route ErrorBoundary caught:', error)

  // Detect aggregate error by checking for an 'errors' array
  const isAggregate = Array.isArray((error as any).errors)
  const errors = isAggregate ? (error as any).errors : [error]

  // Helper to pretty-print objects/arrays or parseable JSON strings, and extract embedded JSON from strings
  function renderPretty(obj: any) {
    if (typeof obj === 'object' && obj !== null) {
      return (
        <pre className="bg-gray-50 rounded border border-gray-200 p-3 overflow-x-auto text-left text-xs font-mono mt-2 max-h-64 whitespace-pre-wrap">
          {JSON5.stringify(obj, null, 2)}
        </pre>
      )
    }
    if (typeof obj === 'string') {
      // Try to parse as JSON5
      try {
        const parsed = JSON5.parse(obj)
        if (typeof parsed === 'object' && parsed !== null) {
          return (
            <pre className="bg-gray-50 rounded border border-gray-200 p-3 overflow-x-auto text-left text-xs font-mono mt-2 max-h-64 whitespace-pre-wrap">
              {JSON5.stringify(parsed, null, 2)}
            </pre>
          )
        }
      } catch {
        // Not pure JSON, try to extract embedded JSON or invocation object
        return renderStringWithEmbeddedJson(obj)
      }
      return <span className="font-mono text-xs text-gray-700">{obj}</span>
    }
    return <span className="font-mono text-xs text-gray-700">{String(obj)}</span>
  }

  return (
    <div className="flex justify-center items-center min-h-[60vh]">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
        <div className="flex items-center mb-4">
          <svg className="w-7 h-7 text-red-500 mr-2" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z" /></svg>
          <h1 className="text-2xl font-bold text-red-600">Something went wrong</h1>
        </div>
        <p className="mt-2 text-gray-700 text-base">{renderPretty(error.message)}</p>
        <div className="mt-6">
          <h2 className="font-semibold text-gray-800 mb-2">Details:</h2>
          <ul className="list-disc list-inside space-y-4">
            {errors.map((err: any, i: number) => (
              <li key={i} className="mb-2">
                <div className="font-medium text-gray-900">{renderPretty(err?.message || String(err))}</div>
                {/* Show stack if available - always render to prevent hydration mismatch */}
                <details className="mt-2" style={{ display: err?.stack ? 'block' : 'none' }}>
                  <summary className="cursor-pointer text-xs text-gray-500">Stack trace</summary>
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto text-left text-xs font-mono max-h-40 whitespace-pre-wrap">{err?.stack || ''}</pre>
                </details>
                {/* Show extra fields prettily if present */}
                {Object.keys(err || {})
                  .filter((k) => !['message', 'stack', 'name'].includes(k))
                  .map((k) => (
                    <div key={k} className="mt-1">
                      <span className="font-mono text-xs text-gray-600">{k}:</span>
                      {renderPretty(err[k])}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
