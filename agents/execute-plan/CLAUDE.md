# Nestled Template — Remote Coder

This agent uses template mode — no local Claude session runs. TaskOS takes the task description and passes it directly to:

```
claude --remote "{description}" | flightdesk register -
```

The description is set by the Code Planner agent and should be a single line like:
`Implement the plan at ~/IdeaProjects/nestled-template/plans/YYYY-MM-DD-slug.md`
