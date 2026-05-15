import React, { useState, Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import {
  BuildingOfficeIcon,
  CheckIcon,
  ChevronUpDownIcon,
  PlusIcon,
} from '@heroicons/react/20/solid'

interface Organization {
  id: string
  name: string
  members?: any[]
}

interface OrganizationSwitcherProps {
  organizations: Organization[]
  activeOrganization: Organization | null
  onSwitchOrganization: (organizationId: string) => Promise<void>
  onCreateOrganization?: () => void
  className?: string
}

export function OrganizationSwitcher({
  organizations,
  activeOrganization,
  onSwitchOrganization,
  onCreateOrganization,
  className = '',
}: OrganizationSwitcherProps) {
  const [isSwitching, setIsSwitching] = useState(false)

  const handleSwitch = async (organizationId: string) => {
    if (organizationId === activeOrganization?.id) return

    setIsSwitching(true)
    try {
      await onSwitchOrganization(organizationId)
      // Page will refresh due to organization context change
      window.location.reload()
    } catch (error) {
      console.error('Failed to switch organization:', error)
      setIsSwitching(false)
    }
  }

  if (organizations.length === 0) {
    return null
  }

  return (
    <Menu as="div" className={`relative inline-block text-left ${className}`}>
      <div>
        <Menu.Button className="inline-flex w-full justify-between items-center gap-x-1.5 rounded-md bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-700 hover:bg-zinc-700">
          <div className="flex items-center gap-2 min-w-0">
            <BuildingOfficeIcon className="h-5 w-5 text-zinc-400 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{activeOrganization?.name || 'Select Organization'}</span>
          </div>
          <ChevronUpDownIcon
            className="h-5 w-5 text-zinc-400 flex-shrink-0"
            aria-hidden="true"
          />
        </Menu.Button>
      </div>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute left-0 z-10 mt-2 w-72 origin-top-left rounded-md bg-zinc-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {/* Current organization section */}
            <div className="px-3 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Your Organizations
            </div>

            {organizations.map((org) => (
              <Menu.Item key={org.id}>
                {({ active }) => (
                  <button
                    onClick={() => handleSwitch(org.id)}
                    disabled={isSwitching}
                    className={`${
                      active ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-200'
                    } ${
                      isSwitching ? 'opacity-50 cursor-not-allowed' : ''
                    } group flex items-center justify-between w-full px-4 py-2 text-sm`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-emerald-500/10 text-emerald-400 font-semibold">
                        {org.name?.charAt(0).toUpperCase() || 'O'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="truncate font-medium">{org.name}</div>
                        <div className="text-xs text-zinc-400">
                          {org.members?.length || 0} member{org.members?.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    {org.id === activeOrganization?.id && (
                      <CheckIcon className="h-5 w-5 text-emerald-400 flex-shrink-0" aria-hidden="true" />
                    )}
                  </button>
                )}
              </Menu.Item>
            ))}

            {/* Create organization option */}
            {onCreateOrganization && (
              <>
                <div className="border-t border-zinc-700 my-1" />
                <Menu.Item>
                  {({ active }) => (
                    <button
                      onClick={onCreateOrganization}
                      className={`${
                        active ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-200'
                      } group flex items-center gap-3 w-full px-4 py-2 text-sm`}
                    >
                      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-zinc-700 text-zinc-400">
                        <PlusIcon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <span className="font-medium">Create Organization</span>
                    </button>
                  )}
                </Menu.Item>
              </>
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
