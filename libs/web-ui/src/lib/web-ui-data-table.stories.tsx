import type { Meta, StoryObj, StoryContext } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { WebUiDataTable } from './web-ui-data-table'
import React from 'react'

const mockData = [
  { id: '1', name: 'Alice', email: 'alice@example.com', createdAt: '2024-01-01' },
  { id: '2', name: 'Bob', email: 'bob@example.com', createdAt: '2024-01-02' },
]

const mockFields = ['name', 'email', 'createdAt']

const mockPagination = {
  count: 2,
  skip: 0,
  take: 2,
}

const meta = {
  component: WebUiDataTable,
  title: 'WebUi/DataTable',
  tags: ['autodocs'],
  args: {
    data: mockData,
    path: '/users',
    fields: mockFields,
  },
} satisfies Meta<typeof WebUiDataTable>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    expect(canvas.getByText('Name')).toBeInTheDocument()
    expect(canvas.getByText('Email')).toBeInTheDocument()
    expect(canvas.getByText('Created At')).toBeInTheDocument()
    expect(canvas.getAllByRole('row')).toHaveLength(3) // header + 2 data rows
  },
}

export const WithPagination: Story = {
  args: {
    pagination: mockPagination,
    setSkip: () => {},
  },
}

export const Loading: Story = {
  args: {
    loading: true,
    data: [],
  },
}
