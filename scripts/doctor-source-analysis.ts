const startsWithBlockComment = (source: string, index: number): boolean =>
  source[index] === '/' && source[index + 1] === '*'

const startsWithLineComment = (
  source: string,
  index: number,
  onlyWhitespaceOnLine: boolean,
): boolean => onlyWhitespaceOnLine && source[index] === '/' && source[index + 1] === '/'

const skipBlockComment = (
  source: string,
  startIndex: number,
): { index: number; preservedNewlines: string } => {
  let index = startIndex + 2
  let preservedNewlines = ''

  while (index < source.length) {
    if (source[index] === '\n') {
      preservedNewlines += '\n'
      index += 1
    } else if (source[index] === '*' && source[index + 1] === '/') {
      index += 2
      break
    } else {
      index += 1
    }
  }

  return { index, preservedNewlines }
}

const skipLineComment = (source: string, startIndex: number): number => {
  let index = startIndex
  while (index < source.length && source[index] !== '\n') {
    index += 1
  }
  return index
}

const skipStringLiteral = (source: string, startIndex: number): number => {
  const quote = source[startIndex]
  let index = startIndex + 1

  while (index < source.length) {
    const current = source[index]
    if (current === '\\') {
      index += 2
      continue
    }
    if (current === quote) return index + 1
    index += 1
  }

  return index
}

const updateWhitespaceState = (current: string, onlyWhitespaceOnLine: boolean): boolean => {
  if (current === '\n') return true
  if (current === ' ' || current === '\t' || current === '\r') return onlyWhitespaceOnLine
  return false
}

/**
 * Remove comments before Doctor's lightweight source scans without mistaking comment-like text in
 * string literals for comments. Newlines inside block comments are retained so diagnostics keep
 * their original source line numbers.
 */
export const stripComments = (source: string): string => {
  let output = ''
  let index = 0
  let onlyWhitespaceOnLine = true

  while (index < source.length) {
    if (startsWithBlockComment(source, index)) {
      const skipped = skipBlockComment(source, index)
      output += skipped.preservedNewlines
      onlyWhitespaceOnLine = skipped.preservedNewlines.length > 0 || onlyWhitespaceOnLine
      index = skipped.index
    } else if (startsWithLineComment(source, index, onlyWhitespaceOnLine)) {
      index = skipLineComment(source, index)
    } else if (source[index] === "'" || source[index] === '"' || source[index] === '`') {
      const end = skipStringLiteral(source, index)
      output += source.slice(index, end)
      onlyWhitespaceOnLine = false
      index = end
    } else {
      output += source[index]
      onlyWhitespaceOnLine = updateWhitespaceState(source[index], onlyWhitespaceOnLine)
      index += 1
    }
  }

  return output
}
