import type { Meta, StoryObj } from '@storybook/react-vite'
import { WebUiConfirmationModal } from './web-ui-confirmation-modal'
import React, { useState } from 'react'

const meta: Meta = {
  title: 'WebUi/ConfirmationModalFeature',
  component: WebUiConfirmationModal,
  tags: ['autodocs'],
}
export default meta

function ConfirmationModalDefaultStory() {
  const [open, setOpen] = useState(true)
  return (
    <WebUiConfirmationModal
      open={open}
      setOpen={setOpen}
      title="Delete Item"
      body="Are you sure you want to delete this item? This action cannot be undone."
      actionText="Delete"
      actionFunction={() => {
        alert('Deleted!')
        setOpen(false)
      }}
    />
  )
}

export const Default: StoryObj = {
  render: ConfirmationModalDefaultStory,
}
