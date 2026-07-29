import { useEffect, useState } from 'react'
import { useQuery } from '@apollo/client/react'
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import {
  AdminOrganizationPicker,
  AdminOrganizationPickerQuery,
  AdminUserPicker,
  AdminUserPickerQuery,
} from '@nestled-template/shared/sdk'
import { ChevronUpDownIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { cn } from '@nestled-template/shared/utils'

export interface EntityOption {
  readonly id: string
  readonly label: string
  readonly sublabel?: string
}

// Debounce a rapidly-changing value so we don't fire a query on every keystroke.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

const inputClasses =
  'block w-full rounded-lg border border-zinc-300 dark:border-white/10 bg-white dark:bg-white/5 py-2 pl-3 pr-16 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500'

interface EntityFilterComboboxProps {
  readonly label: string
  readonly id: string
  readonly placeholder: string
  readonly value: EntityOption | null
  readonly onChange: (value: EntityOption | null) => void
  readonly options: readonly EntityOption[]
  readonly loading: boolean
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

// Presentational async combobox shared by the user and organization filters.
function EntityFilterCombobox({
  label,
  id,
  placeholder,
  value,
  onChange,
  options,
  loading,
  query,
  onQueryChange,
}: EntityFilterComboboxProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-2"
      >
        {label}
      </label>
      <Combobox value={value} onChange={onChange} by="id" immediate>
        <div className="relative">
          <ComboboxInput
            id={id}
            className={inputClasses}
            placeholder={placeholder}
            displayValue={(option: EntityOption | null) => option?.label ?? ''}
            onChange={event => onQueryChange(event.target.value)}
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
            {value && (
              <button
                type="button"
                aria-label={`Clear ${label.toLowerCase()}`}
                onClick={() => {
                  onChange(null)
                  onQueryChange('')
                }}
                className="rounded p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
            <ComboboxButton className="flex items-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              <ChevronUpDownIcon className="h-5 w-5" />
            </ComboboxButton>
          </div>

          <ComboboxOptions className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-zinc-800 py-1 shadow-lg focus:outline-none">
            {loading && (
              <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Searching…</div>
            )}
            {!loading && options.length === 0 && (
              <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                {query ? 'No matches found' : 'Type to search…'}
              </div>
            )}
            {options.map(option => (
              <ComboboxOption
                key={option.id}
                value={option}
                className={({ focus }) =>
                  cn(
                    'cursor-pointer px-3 py-2 text-sm',
                    focus
                      ? 'bg-emerald-50 dark:bg-white/10 text-zinc-900 dark:text-white'
                      : 'text-zinc-900 dark:text-zinc-100',
                  )
                }
              >
                <div className="font-medium">{option.label}</div>
                {option.sublabel && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">{option.sublabel}</div>
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>
    </div>
  )
}

interface FilterProps {
  readonly value: EntityOption | null
  readonly onChange: (value: EntityOption | null) => void
}

type AdminUser = NonNullable<AdminUserPickerQuery['adminUsers']['users'][number]>
type AdminOrganization = NonNullable<
  AdminOrganizationPickerQuery['adminOrganizations']['organizations'][number]
>

// Reset the local search term whenever the parent clears the selection, so a
// page-level "Clear Filters" does not leave the dropdown filtering on stale text.
function useResetQueryOnClear(value: EntityOption | null, setQuery: (query: string) => void) {
  useEffect(() => {
    if (!value) setQuery('')
  }, [value, setQuery])
}

function userToOption(user: AdminUser): EntityOption {
  // Build the name from non-null parts so a missing firstName/lastName does not
  // render "undefined Lovelace" / "null null"; fall back to email, then id.
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ')
  const email = user.emails?.find(e => e.primary)?.email ?? user.emails?.[0]?.email
  return {
    id: user.id,
    label: name || email || user.id,
    sublabel: [email, user.id].filter(Boolean).join(' · '),
  }
}

// Searchable dropdown of real users; the selected user's id drives the filter.
export function UserFilterCombobox({ value, onChange }: FilterProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  useResetQueryOnClear(value, setQuery)

  const searchTerm = debouncedQuery.trim()
  const { data, loading } = useQuery<AdminUserPickerQuery>(AdminUserPicker, {
    variables: { filters: { search: searchTerm, take: 20 } },
    skip: searchTerm.length === 0,
  })

  const options = searchTerm ? (data?.adminUsers?.users ?? []).map(userToOption) : []
  // Treat the debounce gap (typed but not yet queried) as loading so the dropdown
  // shows "Searching…" rather than flashing "No matches found".
  const isLoading = loading || (query.trim().length > 0 && query.trim() !== searchTerm)

  return (
    <EntityFilterCombobox
      label="User"
      id="userFilter"
      placeholder="Search users by name, email, or ID…"
      value={value}
      onChange={onChange}
      options={options}
      loading={isLoading}
      query={query}
      onQueryChange={setQuery}
    />
  )
}

function organizationToOption(org: AdminOrganization): EntityOption {
  return { id: org.id, label: org.name || org.id, sublabel: org.id }
}

// Searchable dropdown of real organizations; the selected org's id drives the filter.
export function OrganizationFilterCombobox({ value, onChange }: FilterProps) {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  useResetQueryOnClear(value, setQuery)

  const searchTerm = debouncedQuery.trim()
  const { data, loading } = useQuery<AdminOrganizationPickerQuery>(AdminOrganizationPicker, {
    variables: { filters: { search: searchTerm, take: 20 } },
    skip: searchTerm.length === 0,
  })

  const options = searchTerm
    ? (data?.adminOrganizations?.organizations ?? []).map(organizationToOption)
    : []
  // Treat the debounce gap (typed but not yet queried) as loading so the dropdown
  // shows "Searching…" rather than flashing "No matches found".
  const isLoading = loading || (query.trim().length > 0 && query.trim() !== searchTerm)

  return (
    <EntityFilterCombobox
      label="Organization"
      id="organizationFilter"
      placeholder="Search organizations by name or ID…"
      value={value}
      onChange={onChange}
      options={options}
      loading={isLoading}
      query={query}
      onQueryChange={setQuery}
    />
  )
}
