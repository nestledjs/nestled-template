import type { Meta, StoryObj, StoryContext } from '@storybook/react-vite'
import { within, expect } from 'storybook/test'
import { WebUiHeader } from './web-ui-header'

const navigation = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'Contact', href: '/contact' },
]

const meta = {
  component: WebUiHeader,
  title: 'WebUi/Header',
  tags: ['autodocs'],
  args: {
    navigation,
    logo: 'https://placehold.co/40x40',
    icon: 'https://placehold.co/40x40',
    siteName: 'Your Site',
    isAuthenticated: false,
  },
} satisfies Meta<typeof WebUiHeader>
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Home')).toBeInTheDocument()
    await expect(canvas.getByText('About')).toBeInTheDocument()
    await expect(canvas.getByText('Contact')).toBeInTheDocument()
    await expect(canvas.getByText('Login')).toBeInTheDocument()
  },
}

export const Authenticated: Story = {
  args: {
    isAuthenticated: true,
    userName: 'Ada Lovelace',
    userEmail: 'ada@example.com',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Open account menu')).toBeInTheDocument()
  },
}
