# web-ui

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test web-ui` to execute the unit tests via [Vitest](https://vitest.dev/).

## UI Migration Best Practices (Storybook 9, Vitest, React Router 7)

- Always update `@nestled-template` imports to `@nestled-template`, and maintain a mapping table for known package moves.
- Consolidate UI components into a single WebUI project, using barrel files for folders with multiple components.
- Refactor complex functions for readability, prefer nullish coalescing, and preserve exact Tailwind styles.
- Always use `cn` instead of `classnames` for class composition.
- For forms migrated to `@nestledjs/forms`, remove the `buttonText` prop and add a `button` field as the last field, and always provide an `id` prop in kebab-case.
- Check all imports against `package.json` and the WebUI folder; notify the user with a red X if a dependency or UI library is missing, but never remove or fix broken imports just for linter errors.
- UI components must be dry: they should not use atoms, context, global state, or Apollo hooks; if they do, notify the user and do not write a story or keep them in the UI library.
- For each migrated component, a Storybook story must be written at the time of migration (unless the component is not dry, per above rules). Never skip writing a story for a migrated component.
- **All imports from `react-router` must be migrated to `react-router` (React Router 7+) as part of the modernization process. Do not use `react-router-dom` in the UI library.**

## Storybook Stories Best Practices

- Do not wrap stories in `MemoryRouter` or any router provider; the Storybook Preview is already wrapped in a React Router instance, so all routing context is globally available in stories.
