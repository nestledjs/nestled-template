import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { WebErrorBoundaryUi } from './error-boundary';
import type { StoryContext } from '@storybook/react-vite';

const meta = {
  component: WebErrorBoundaryUi,
  title: 'WebUi/ErrorBoundary',
  tags: ['autodocs'],
  args: {
    error: new Error('Test error: Something went wrong!'),
  },
} satisfies Meta<typeof WebErrorBoundaryUi>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithAggregateError: Story = {
  args: {
    error: Object.assign(new Error('Aggregate error occurred!'), {
      errors: [
        new Error('First error in aggregate'),
        new Error('Second error in aggregate'),
      ],
    }),
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Aggregate error occurred!')).toBeInTheDocument();
    await expect(canvas.getByText('First error in aggregate')).toBeInTheDocument();
    await expect(canvas.getByText('Second error in aggregate')).toBeInTheDocument();
  },
}; 