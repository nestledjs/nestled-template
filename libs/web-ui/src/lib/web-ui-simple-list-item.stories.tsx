import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { WebUiSimpleListItem } from './web-ui-simple-list-item';
import type { StoryContext } from '@storybook/react-vite';
import { UserCircleIcon } from '@heroicons/react/24/outline';

const meta = {
  component: WebUiSimpleListItem,
  title: 'WebUi/SimpleListItem',
  tags: ['autodocs'],
  args: {
    lineOne: 'Main Text',
    lineTwo: 'Secondary Text',
  },
} satisfies Meta<typeof WebUiSimpleListItem>;
export default meta;

type Story = StoryObj<typeof meta>;

export const ListItemLi: Story = {
  args: {
    type: 'li',
    onClick: undefined,
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Main Text')).toBeInTheDocument();
    await expect(canvas.getByText('Secondary Text')).toBeInTheDocument();
  },
};

export const ListItemDivClickable: Story = {
  args: {
    type: 'div',
    onClick: () => {},
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Main Text')).toBeInTheDocument();
    await expect(canvas.getByText('Secondary Text')).toBeInTheDocument();
    // Check for Chevron icon
    await expect(canvas.getByTestId('chevron-icon')).toBeInTheDocument();
  },
};

export const WithAvatars: Story = {
  args: {
    type: 'li',
    avatar: <UserCircleIcon className="h-6 w-6 text-blue-500" />,
    avatar2: <UserCircleIcon className="h-6 w-6 text-green-500" />,
  },
};

export const Selected: Story = {
  args: {
    type: 'li',
    selected: true,
  },
}; 