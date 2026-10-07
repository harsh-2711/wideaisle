// Conventional Commits, as AGENTS.md requires.
// A missing "Refs: T-xxx" footer is a warning, not an error, so owner
// commits and merge commits still go through.
const TASK_REF = /^Refs: T-\d{3,}\b/m;

export default {
  extends: ["@commitlint/config-conventional"],
  plugins: [
    {
      rules: {
        "task-ref-footer": ({ raw }) => [
          TASK_REF.test(raw ?? ""),
          'add a task footer, for example "Refs: T-042"',
        ],
      },
    },
  ],
  rules: {
    "task-ref-footer": [1, "always"],
  },
};
