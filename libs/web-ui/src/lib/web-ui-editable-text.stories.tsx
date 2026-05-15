import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect, userEvent } from 'storybook/test';
import { WebUiEditableText } from './web-ui-editable-text';
import type { StoryContext } from '@storybook/react-vite';

const meta = {
  component: WebUiEditableText,
  title: 'WebUi/EditableText',
  tags: ['autodocs'],
  args: {
    text: 'Click to edit me',
  },
} satisfies Meta<typeof WebUiEditableText>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    const text = canvas.getByText('Click to edit me');
    expect(text).toBeInTheDocument();
    await userEvent.click(text);
    const input = canvas.getByDisplayValue('Click to edit me');
    expect(input).toBeInTheDocument();
  },
};

export const Multiline: Story = {
  args: {
    text: 'Multiline\nText',
    multiline: true,
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    // Use a function matcher since the text contains a literal newline
    const text = canvas.getByText((content) => content.includes('Multiline') && content.includes('Text'));
    expect(text).toBeInTheDocument();
    await userEvent.click(text);
    const textarea = canvas.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    text: '',
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    const text = canvas.getByText('Click to edit');
    expect(text).toBeInTheDocument();
  },
};

export const Highlighted: Story = {
  args: {
    text: '',
    highlight: true,
  },
}; 