# Contributing

## Setup

1. Install Node 22.
2. Run `npm ci`.
3. Copy `.env.example` if you need provider credentials.

## Quality Gate

- `npm run lint`
- `npm run typecheck`
- `npm run test`

## Development Notes

- Keep configs provider-agnostic.
- Do not log prompts or secrets.
- Prefer adding tests alongside new routing behavior.
