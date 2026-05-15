# Storybook Stories Best Practices

This document captures best practices for writing and maintaining Storybook stories in this project, based on the latest Storybook 9 and Vitest conventions.

## General Guidelines

- **Use the latest Storybook and Vitest conventions.**
  - All test utilities (e.g., `expect`, `within`, `userEvent`) should be imported from `storybook/test`.
  - Use types from `@storybook/react` for React projects (e.g., `Meta`, `StoryObj`).
- **No `vi` declarations** should appear in stories.
- **Only import what you use.**
  - Do not import utilities (like `userEvent`) unless they are actually used in the story or play function.
- **Type all play function arguments** to avoid implicit `any` errors (e.g., use `StoryContext` from `@storybook/react`).
- **Follow file naming conventions:**
  - Place story files alongside their components, using the `.stories.tsx` extension (e.g., `component-name.stories.tsx`).
- **Use the `args` property** to provide default props for stories.
- **Use the `play` function** for interaction and assertion tests, following Storybook's recommended patterns.
- **Keep stories focused and clear.**
  - Each story should demonstrate a single, clear state or behavior of the component.
- **If you feel a component should be improved, suggest improvements.**
  - If a test fails or a story feels awkward, don't just modify the story to "make it pass." Instead, consider and document ways the component itself could be improved. We are always looking to follow best practices and improve our components, not just our stories.
- **Document new patterns or improvements** here as they are discovered, so the team can continuously improve story quality.

## Example Template

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { expect, within } from 'storybook/test';
import { MyComponent } from './my-component';
import type { StoryContext } from '@storybook/react';

const meta = {
  component: MyComponent,
  title: 'MyComponent',
  tags: ['autodocs'],
  args: {
    /* default props */
  },
} satisfies Meta<typeof MyComponent>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithInteraction: Story = {
  args: {
    /* custom props */
  },
  play: async ({ canvasElement }: StoryContext) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Some text')).toBeInTheDocument();
  },
};
```

---

**Please update this file with any new best practices or lessons learned as you work on stories!** 