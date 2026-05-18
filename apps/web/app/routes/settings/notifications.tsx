import React, { useState } from 'react'
import { BellAlertIcon, BellIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import {
  UserPreferences,
  UserPreferencesQuery,
  UserCreateUserPreference,
  UserUpdateUserPreference,
  type UserCreateUserPreferenceMutation,
  type UserUpdateUserPreferenceMutation,
} from '@nestled-template/shared/sdk'
import { gql, type ApolloCache } from '@apollo/client'
import { useQuery, useMutation } from '@apollo/client/react'

type CacheReference = {
  __ref?: string
}

function updatePreferencesCache(
  cache: ApolloCache,
  updatedPreference: { __typename?: string; id: string; value: string },
) {
  const updatedPreferenceId = cache.identify(updatedPreference)
  cache.modify({
    fields: {
      userPreferences(existingPreferences = []) {
        return (existingPreferences as CacheReference[]).map(pref =>
          pref.__ref === updatedPreferenceId
            ? { ...pref, value: String(updatedPreference.value) }
            : pref,
        )
      },
    },
  })
}

interface NotificationSetting {
  key: string
  title: string
  description: string
  enabled: boolean
  category: 'email' | 'security' | 'marketing'
}

// Default notification settings
const DEFAULT_NOTIFICATIONS: NotificationSetting[] = [
  {
    key: 'notif_org_invites',
    title: 'Organization Invitations',
    description: 'Receive emails when you are invited to join an organization',
    enabled: true,
    category: 'email',
  },
  {
    key: 'notif_member_added',
    title: 'New Team Members',
    description: 'Get notified when new members join your organization',
    enabled: true,
    category: 'email',
  },
  {
    key: 'notif_role_changed',
    title: 'Role Changes',
    description: 'Receive notifications when your role or permissions change',
    enabled: true,
    category: 'email',
  },
  {
    key: 'notif_weekly_digest',
    title: 'Weekly Digest',
    description: 'Receive a weekly summary of organization activity',
    enabled: false,
    category: 'email',
  },
  {
    key: 'notif_security_alerts',
    title: 'Security Alerts',
    description: 'Important notifications about account security',
    enabled: true,
    category: 'security',
  },
  {
    key: 'notif_login_alerts',
    title: 'Login Notifications',
    description: 'Get notified of new login attempts',
    enabled: true,
    category: 'security',
  },
  {
    key: 'notif_password_changes',
    title: 'Password Changes',
    description: 'Alert when your password is changed',
    enabled: true,
    category: 'security',
  },
  {
    key: 'notif_product_updates',
    title: 'Product Updates',
    description: 'Learn about new features and improvements',
    enabled: false,
    category: 'marketing',
  },
  {
    key: 'notif_newsletters',
    title: 'Newsletters',
    description: 'Receive our monthly newsletter',
    enabled: false,
    category: 'marketing',
  },
]

export const loader = () => ({})

function handleUpdatePreferenceCache(
  cache: Parameters<typeof updatePreferencesCache>[0],
  data:
    | { userUpdateUserPreference?: Parameters<typeof updatePreferencesCache>[1] | null }
    | null
    | undefined,
) {
  if (data?.userUpdateUserPreference) {
    updatePreferencesCache(cache, data.userUpdateUserPreference)
  }
}

export default function NotificationsSettings() {
  const { data: preferencesData } = useQuery<UserPreferencesQuery>(UserPreferences)
  const preferences = preferencesData?.userPreferences || []

  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const [createPreference] = useMutation<UserCreateUserPreferenceMutation>(UserCreateUserPreference)
  const [updatePreference] = useMutation<UserUpdateUserPreferenceMutation>(UserUpdateUserPreference)

  const showSuccess = (message: string) => {
    setFormSuccess(message)
    setFormError(null)
    setTimeout(() => setFormSuccess(null), 3000)
  }

  const showError = (message: string) => {
    setFormError(message)
    setFormSuccess(null)
  }

  // Merge default settings with user preferences
  const notifications: NotificationSetting[] = DEFAULT_NOTIFICATIONS.map(defaultSetting => {
    const userPref = preferences.find(p => p.key === defaultSetting.key)
    return {
      ...defaultSetting,
      enabled: userPref ? userPref.value === 'true' : defaultSetting.enabled,
    }
  })

  const updateExistingPreference = async (existing: (typeof preferences)[0], newValue: boolean) => {
    await updatePreference({
      variables: {
        userPreferenceId: existing.id,
        input: { value: String(newValue) },
      },
      optimisticResponse: {
        userUpdateUserPreference: {
          __typename: 'UserPreference',
          id: existing.id,
          key: existing.key,
          value: String(newValue),
          createdAt: existing.createdAt,
          updatedAt: new Date().toISOString(),
        },
      },
      update: (cache, { data }) => handleUpdatePreferenceCache(cache, data),
    })
  }

  const createNewPreference = async (key: string, newValue: boolean) => {
    await createPreference({
      variables: {
        input: {
          key,
          value: String(newValue),
        },
      },
      optimisticResponse: {
        userCreateUserPreference: {
          __typename: 'UserPreference',
          id: `temp-${Date.now()}`,
          key,
          value: String(newValue),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      update: (cache, { data }) => {
        if (!data?.userCreateUserPreference) return
        cache.modify({
          fields: {
            userPreferences(existingPreferences = []) {
              const newPrefRef = cache.writeFragment({
                data: data.userCreateUserPreference,
                fragment: gql`
                  fragment NewUserPreference on UserPreference {
                    id
                    key
                    value
                    createdAt
                    updatedAt
                  }
                `,
              })
              return [...existingPreferences, newPrefRef]
            },
          },
        })
      },
    })
  }

  const toggleNotification = async (key: string, currentValue: boolean) => {
    const newValue = !currentValue

    try {
      const existing = preferences.find(p => p.key === key)
      if (existing) {
        await updateExistingPreference(existing, newValue)
      } else {
        await createNewPreference(key, newValue)
      }
      showSuccess('Notification preferences saved!')
    } catch (error) {
      showError((error as Error)?.message ?? 'Failed to save preferences')
    }
  }

  const emailNotifications = notifications.filter(n => n.category === 'email')
  const securityNotifications = notifications.filter(n => n.category === 'security')
  const marketingNotifications = notifications.filter(n => n.category === 'marketing')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 dark:bg-emerald-500/10 p-3">
            <BellIcon className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
              Notification Preferences
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage how you receive notifications and updates
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-950 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-100">
        <p>
          This template currently persists these settings to the database, but none of these
          preferences do anything out-of-the-box. If you build internal notification features, you
          can tie them to these preferences. If you use a third-party CRM or email platform, sync
          email preferences through its API so subscription and compliance rules stay in one place.
        </p>
        <p className="mt-3">
          Important account notices, such as password resets, verification emails, and security
          warnings, should usually remain mandatory and should not be controlled by opt-out
          switches.
        </p>
      </div>

      {formSuccess && (
        <div className="rounded-lg text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 p-3">
          {formSuccess}
        </div>
      )}

      {formError && (
        <div className="rounded-lg text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3">
          {formError}
        </div>
      )}

      {/* Email Notifications */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-sky-100 dark:bg-sky-500/10 p-2">
            <EnvelopeIcon className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Email Notifications
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Choose which emails you want to receive
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {emailNotifications.map(notification => (
            <NotificationToggle
              key={notification.key}
              notification={notification}
              onToggle={toggleNotification}
            />
          ))}
        </div>
      </div>

      {/* Security Notifications */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-amber-100 dark:bg-amber-500/10 p-2">
            <BellAlertIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Security Notifications
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Critical security alerts (highly recommended)
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {securityNotifications.map(notification => (
            <NotificationToggle
              key={notification.key}
              notification={notification}
              onToggle={toggleNotification}
            />
          ))}
        </div>
      </div>

      {/* Marketing Notifications */}
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/5 p-6 backdrop-blur">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-violet-100 dark:bg-violet-500/10 p-2">
            <EnvelopeIcon className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Marketing & Updates
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Stay informed about new features and offers
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {marketingNotifications.map(notification => (
            <NotificationToggle
              key={notification.key}
              notification={notification}
              onToggle={toggleNotification}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface NotificationToggleProps {
  readonly notification: NotificationSetting
  readonly onToggle: (key: string, currentValue: boolean) => void
}

function NotificationToggle({ notification, onToggle }: NotificationToggleProps) {
  return (
    <div className="flex items-start justify-between p-4 rounded-lg bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10">
      <div className="flex-1 pr-4">
        <h4 className="text-sm font-medium text-zinc-900 dark:text-white">{notification.title}</h4>
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-1">{notification.description}</p>
      </div>
      <button
        onClick={() => onToggle(notification.key, notification.enabled)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${
          notification.enabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
        }`}
        role="switch"
        aria-checked={notification.enabled}
        aria-label={`Toggle ${notification.title}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            notification.enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
