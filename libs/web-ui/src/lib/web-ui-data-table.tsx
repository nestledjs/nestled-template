import {
  toCount,
  formatFieldName,
  getNestedProperty,
  renderValue,
} from '@nestled-template/shared/utils'
import { CorePaging } from '@nestled-template/shared/sdk'

import React, {
  Dispatch,
  ReactElement,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link } from 'react-router'
import {
  ChevronDownIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilIcon,
} from '@heroicons/react/24/outline'

export interface WebUiDataTableProps {
  readonly data?: any
  readonly path: string
  readonly fields: string[]
  readonly pagination?: CorePaging | null
  readonly setSkip?: (skip: number) => void
  readonly additionalFilters?: ReactElement | null
  readonly setSort?: Dispatch<SetStateAction<{ orderBy: string; orderDirection: string }>>
  readonly sort?: { orderBy: string; orderDirection: string }
}

function headerThClass(index: number) {
  if (index === 0) return 'py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6'
  return 'hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 lg:table-cell'
}

interface OrderDirectionIconProps {
  readonly fieldName: string
  readonly sort?: { orderBy: string; orderDirection: string }
}

function OrderDirectionIcon({ fieldName, sort }: OrderDirectionIconProps) {
  if (fieldName === sort?.orderBy) {
    if (sort.orderDirection === 'desc') {
      return <ChevronUpIcon className={'w-5 h-5 font-bold'} />
    }
    if (sort.orderDirection === 'asc') {
      return <ChevronDownIcon className={'w-5 h-5 font-bold'} />
    }
    return <ChevronUpDownIcon className={'w-6 h-6'} />
  }
  return <ChevronUpDownIcon className={'w-6 h-6'} />
}

function getAriaSortValue(
  field: string,
  sort?: { orderBy: string; orderDirection: string },
): 'ascending' | 'descending' | 'none' {
  if (sort?.orderBy !== field) return 'none'
  return sort.orderDirection === 'asc' ? 'ascending' : 'descending'
}

export function WebUiDataTable(props: WebUiDataTableProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
    }
  }, [])

  const toggleIdVisibility = useCallback((rowId: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }, [])

  const copyToClipboard = useCallback(async (value: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
        setCopiedId(value)
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current)
        copiedTimeoutRef.current = setTimeout(() => {
          setCopiedId(null)
          copiedTimeoutRef.current = null
        }, 2000)
      }
    } catch {
      // ignore
    }
  }, [])

  function handleSort(fieldName: string) {
    const isCurrentSortField = props?.sort?.orderBy === fieldName
    props?.setSort?.({
      orderBy: fieldName,
      orderDirection: isCurrentSortField && props?.sort?.orderDirection === 'asc' ? 'desc' : 'asc',
    })
  }

  function renderFirstColumnCell(item: any, field: string, fieldValue: unknown) {
    if (field.toLowerCase() !== 'id') {
      return renderValue(fieldValue)
    }
    const itemId = String(item.id)
    return (
      <div className="flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            className="text-gray-600 hover:text-gray-900"
            onClick={() => copyToClipboard(itemId)}
            title="Copy ID"
            aria-label="Copy ID"
          >
            <DocumentDuplicateIcon className="w-5 h-5" />
          </button>
          {copiedId === itemId && (
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
              Copied!
            </div>
          )}
        </div>
        <button
          type="button"
          className="text-gray-600 hover:text-gray-900"
          onClick={() => toggleIdVisibility(itemId)}
          title={visibleIds.has(itemId) ? 'Hide ID' : 'Show ID'}
          aria-label={visibleIds.has(itemId) ? 'Hide ID' : 'Show ID'}
        >
          {visibleIds.has(itemId) ? (
            <EyeSlashIcon className="w-5 h-5" />
          ) : (
            <EyeIcon className="w-5 h-5" />
          )}
        </button>
        {visibleIds.has(itemId) && (
          <span className="text-xs text-gray-500 font-mono">{itemId}</span>
        )}
      </div>
    )
  }

  return (
    <>
      {props?.additionalFilters && props.additionalFilters}

      <>
        <div className="-mx-4 mt-8 overflow-x-auto shadow ring-1 ring-black ring-opacity-5 sm:-mx-6 md:mx-0 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                {/* Edit column moved to far left */}
                <th
                  scope="col"
                  className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                >
                  <span className="sr-only">Edit</span>
                </th>
                {props?.fields?.map((field, fieldIndex) => (
                  <th
                    key={field}
                    scope="col"
                    className={headerThClass(fieldIndex)}
                    aria-sort={getAriaSortValue(field, props.sort)}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(field)}
                      className="flex justify-between items-center w-full text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1"
                      aria-label={`Sort by ${formatFieldName(field)}`}
                    >
                      <span>{formatFieldName(field)}</span>
                      <OrderDirectionIcon fieldName={field} sort={props.sort} />
                    </button>
                  </th>
                ))}
                {/* Removed trailing Edit column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {props?.data?.map((item: (typeof props.data)[0]) => {
                return (
                  <tr key={item.id}>
                    {/* Edit cell moved to far left */}
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-left text-sm font-medium sm:pl-6">
                      <Link
                        to={`${props.path}/${item.id}`}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <PencilIcon className="w-5 h-5" />
                        <span className="sr-only">Edit {String(item.id)}</span>
                      </Link>
                    </td>
                    {props.fields.map((field, index) => {
                      const fieldValue = getNestedProperty(item, field)
                      if (index === 0) {
                        return (
                          <td
                            key={field}
                            className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6"
                          >
                            {renderFirstColumnCell(item, field, fieldValue)}
                          </td>
                        )
                      }
                      return (
                        <td
                          key={field}
                          className="hidden whitespace-nowrap px-3 py-4 text-sm text-gray-500 lg:table-cell"
                        >
                          {renderValue(fieldValue)}
                        </td>
                      )
                    })}

                    {/* Removed trailing Edit cell */}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {props?.pagination ? (
          <nav
            className=" px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6"
            aria-label="Pagination"
          >
            <div className="hidden sm:block">
              <p className="text-sm text-gray-700">
                Showing{' '}
                <span className="font-medium">
                  {props?.pagination?.count === 0 ? 0 : (props?.pagination?.skip ?? 0) + 1}
                </span>{' '}
                to <span className="font-medium">{toCount(props?.pagination)}</span> of{' '}
                <span className="font-medium">{props.pagination.count}</span> results
              </p>
            </div>
            <div className="flex-1 flex justify-between sm:justify-end">
              {(props?.pagination?.skip ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    props.setSkip?.((props?.pagination?.skip ?? 0) - (props?.pagination?.take ?? 0))
                  }}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Previous
                </button>
              ) : null}
              {(props?.pagination?.skip ?? 0) + (props?.pagination?.take ?? 0) <
              (props?.pagination?.count ?? 0) ? (
                <button
                  type="button"
                  onClick={() => {
                    props.setSkip?.((props?.pagination?.skip ?? 0) + (props?.pagination?.take ?? 0))
                  }}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Next
                </button>
              ) : null}
            </div>
          </nav>
        ) : null}
      </>
    </>
  )
}
