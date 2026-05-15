import type { Meta, StoryObj } from '@storybook/react-vite';
import { within, expect } from 'storybook/test';
import { WebUiSocialLinks } from './web-ui-social-links';
import type { StoryContext } from '@storybook/react-vite';

const mockUser = {
  facebook: 'https://facebook.com/testuser',
  twitter: 'https://twitter.com/testuser',
  instagram: 'https://instagram.com/testuser',
  linkedin: 'https://linkedin.com/in/testuser',
  youtube: 'https://youtube.com/testuser',
};

const meta = {
  component: WebUiSocialLinks,
  title: 'WebUi/SocialLinks',
  tags: ['autodocs'],
  args: {
    member: mockUser,
    color: 'red',
  },
} satisfies Meta<typeof WebUiSocialLinks>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    // Check for the presence of social icons/links with accessible names
    await expect(canvas.getAllByRole('link')).toHaveLength(5);
    await expect(canvas.getByRole('link', { name: 'Facebook' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Twitter' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'YouTube' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: 'Instagram' })).toBeInTheDocument();
  },
}; 