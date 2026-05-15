import { toCount } from '@nestled-template/shared/utils'
import { CorePaging } from '@nestled-template/shared/sdk'

import React, { Dispatch, ReactElement, ReactNode, SetStateAction, useCallback, useState } from 'react'
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
import dayjs from 'dayjs'

export interface WebUiDataTableProps {
  data?: any
  path: string
  fields: string[]
  pagination?: CorePaging | null
  setSkip?: (skip: number) => void
  filters?: any
  setFilters?: (filters: any) => void
  filterOptions?: { id: string; name: string; options: { value: string; label: string }[] }[]
  loading?: boolean
  additionalFilters?: ReactElement | null
  setSort?: Dispatch<SetStateAction<{ orderBy: string; orderDirection: string }>>
  sort?: { orderBy: string; orderDirection: string }
}

export function WebUiDataTable(props: WebUiDataTableProps) {
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const toggleIdVisibility = useCallback((rowId: string) => {
    setVisibleIds((prev) => {
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
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch {
      // ignore
    }
  }, [])
  function getNestedProperty(item: any, fieldPath: string) {
    const value = fieldPath
      .split('.')
      .reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), item)

    if (fieldPath.toLowerCase().includes('date') && value) {
      return dayjs(value).format('MMMM D, YYYY') // Format the date as desired
    }

    return value
  }

  // Render values safely in table cells
  function renderValue(value: unknown): ReactNode {
    if (value === null || value === undefined) return ''

    // Arrays (e.g., many-to-many relations)
    if (Array.isArray(value)) {
      if (value.length === 0) return ''
      const labels = value.map((entry) => {
        if (entry === null || entry === undefined) return ''
        if (typeof entry === 'object') {
          const obj = entry as Record<string, unknown>
          const label = (obj.name as string) ?? (obj.title as string) ?? (obj.id as string) ?? (obj.slug as string)
          return label ?? JSON.stringify(obj)
        }
        return String(entry)
      })
      return labels.filter(Boolean).join(', ')
    }

    // Objects (e.g., relation values)
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>
      const label = (obj.name as string) ?? (obj.title as string) ?? (obj.id as string) ?? (obj.slug as string)
      return label ?? JSON.stringify(obj)
    }

    // Primitives
    return String(value)
  }

  function formatFieldName(fieldName: string) {
    return fieldName
      .replace(/([a-z])([A-Z])/g, '$1 $2') // Insert a space between lowercase and uppercase letters
      .split('.') // Split by periods if necessary
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1)) // Capitalize the first letter of each part
      .join(' ')
  }

  function handleSort(fieldName: string) {
    const isCurrentSortField = props?.sort?.orderBy === fieldName
    props?.setSort?.({
      orderBy: fieldName,
      orderDirection: isCurrentSortField && props?.sort?.orderDirection === 'asc' ? 'desc' : 'asc',
    })
  }

  function OrderDirectionIcon({ fieldName }: { fieldName: string }) {
    if (fieldName === props?.sort?.orderBy) {
      switch (props?.sort?.orderDirection) {
        case 'desc':
          return <ChevronUpIcon className={'w-5 h-5 font-bold'} />
        case 'asc':
          return <ChevronDownIcon className={'w-5 h-5 font-bold'} />
        default:
          return <ChevronUpDownIcon className={'w-6 h-6'} />
      }
    }
    return <ChevronUpDownIcon className={'w-6 h-6'} />
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
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                  <span className="sr-only">Edit</span>
                </th>
                {props?.fields?.map((field, index) => {
                  switch (index) {
                    case 0:
                      return (
                        <th
                          key={index}
                          scope="col"
                          className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6"
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(field)}
                            className="flex justify-between items-center w-full text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1"
                            aria-label={`Sort by ${formatFieldName(props.fields[index])}`}
                            aria-sort={
                              props.sort?.orderBy === field
                                ? props.sort.orderDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <span>{formatFieldName(props.fields[index])}</span>
                            <OrderDirectionIcon fieldName={props.fields[index]} />
                          </button>
                        </th>
                      )
                    case props.fields.length - 1:
                      return (
                        <th
                          key={index}
                          scope="col"
                          className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 lg:table-cell"
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(field)}
                            className="flex justify-between items-center w-full text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1"
                            aria-label={`Sort by ${formatFieldName(props.fields[index])}`}
                            aria-sort={
                              props.sort?.orderBy === field
                                ? props.sort.orderDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <span>{formatFieldName(props.fields[index])}</span>
                            <OrderDirectionIcon fieldName={props.fields[index]} />
                          </button>
                        </th>
                      )
                    default:
                      return (
                        <th
                          key={index}
                          scope="col"
                          className="hidden px-3 py-3.5 text-left text-sm font-semibold text-gray-900 lg:table-cell"
                        >
                          <button
                            type="button"
                            onClick={() => handleSort(field)}
                            className="flex justify-between items-center w-full text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 rounded px-2 py-1 -mx-2 -my-1"
                            aria-label={`Sort by ${formatFieldName(props.fields[index])}`}
                            aria-sort={
                              props.sort?.orderBy === field
                                ? props.sort.orderDirection === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <span>{formatFieldName(props.fields[index])}</span>
                            <OrderDirectionIcon fieldName={props.fields[index]} />
                          </button>
                        </th>
                      )
                  }
                })}
                {/* Removed trailing Edit column */}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {props?.data?.map((item: typeof props.data[0]) => {
                return (
                  <tr key={item.id}>
                    {/* Edit cell moved to far left */}
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-left text-sm font-medium sm:pl-6">
                      <Link to={`${props.path}/${item.id}`} className="text-blue-600 hover:text-blue-900" title="Edit">
                        <PencilIcon className="w-5 h-5" />
                        <span className="sr-only">Edit {String(item.id)}</span>
                      </Link>
                    </td>
                    {props.fields.map((field, index) => {
                      const fieldValue = getNestedProperty(item, field)
                      switch (index) {
                        case 0:
                          return (
                            <td
                              key={index}
                              className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6"
                            >
                              {/* Special handling for ID field: show copy + eye icons instead of raw ID */}
                              {field.toLowerCase() === 'id' ? (
                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <button
                                      type="button"
                                      className="text-gray-600 hover:text-gray-900"
                                      onClick={() => copyToClipboard(String(item.id))}
                                      title="Copy ID"
                                      aria-label="Copy ID"
                                    >
                                      <DocumentDuplicateIcon className="w-5 h-5" />
                                    </button>
                                    {copiedId === String(item.id) && (
                                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                        Copied!
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    className="text-gray-600 hover:text-gray-900"
                                    onClick={() => toggleIdVisibility(String(item.id))}
                                    title={visibleIds.has(String(item.id)) ? 'Hide ID' : 'Show ID'}
                                    aria-label={visibleIds.has(String(item.id)) ? 'Hide ID' : 'Show ID'}
                                  >
                                    {visibleIds.has(String(item.id)) ? (
                                      <EyeSlashIcon className="w-5 h-5" />
                                    ) : (
                                      <EyeIcon className="w-5 h-5" />
                                    )}
                                  </button>
                                  {visibleIds.has(String(item.id)) && (
                                    <span className="text-xs text-gray-500 font-mono">{String(item.id)}</span>
                                  )}
                                </div>
                              ) : (
                                renderValue(fieldValue)
                              )}
                            </td>
                          )
                        default:
                          return (
                            <td
                              key={index}
                              className="hidden whitespace-nowrap px-3 py-4 text-sm text-gray-500 lg:table-cell"
                            >
                              {renderValue(fieldValue)}
                            </td>
                          )
                      }
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
                <div
                  onClick={() => {
                    props.setSkip?.((props?.pagination?.skip ?? 0) - (props?.pagination?.take ?? 0))
                  }}
                  className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Previous
                </div>
              ) : null}
              {(props?.pagination?.skip ?? 0) + (props?.pagination?.take ?? 0) < (props?.pagination?.count ?? 0) ? (
                <div
                  onClick={() => {
                    props.setSkip?.((props?.pagination?.skip ?? 0) + (props?.pagination?.take ?? 0))
                  }}
                  className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Next
                </div>
              ) : null}
            </div>
          </nav>
        ) : null}
      </>
    </>
  )
}
