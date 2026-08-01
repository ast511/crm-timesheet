# Project Instructions

## Tech Stack

- React (Vite)
- NestJS
- Prisma ORM
- PostgreSQL
- Docker Compose
- TypeScript

---

## Architecture

Frontend
↓ REST API
NestJS
↓
Prisma ORM
↓
PostgreSQL

---

## General Rules

- Always use TypeScript.
- Never use JavaScript.
- Follow SOLID principles.
- Follow DRY and KISS principles.
- Keep business logic inside NestJS services.
- Controllers should remain thin.
- Validate every request.
- Use Prisma for every database interaction.
- Never write raw SQL unless explicitly requested.
- Never duplicate code.
- Keep the code modular and reusable.
- Prefer composition over inheritance.
- Generate clean, maintainable and production-ready code.
- Keep methods and components small and focused.
- Prefer readability over clever implementations.

---

## Development Workflow

Before implementing any solution:

1. Understand the existing architecture.
2. Reuse existing code whenever possible.
3. Avoid introducing duplicate functionality.
4. Keep changes as small as possible.
5. Prefer extending existing modules instead of creating new ones.

When unsure:

- Ask before making architectural decisions.
- Never make assumptions that could break existing functionality.

---

## Prisma

- Every schema change must use Prisma Migrations.
- Never modify the database manually.
- Always keep `schema.prisma` synchronized with the application.
- Never generate SQL manually unless explicitly requested.
- Never use `prisma db push` unless explicitly requested.
- Prefer Prisma Migrations for every database change.
- Document every Prisma schema change inside the corresponding feature documentation.

Whenever `schema.prisma` changes:

1. Explain what changed.
2. Explain why the migration is required.
3. Suggest the migration command.
4. Wait for user approval before executing migrations.

---

## Docker

The project uses Docker Compose.

The `docker-compose.yml` file is located in the project root.

Initially Docker is used only for PostgreSQL.

Later the same Docker Compose file will also contain:

- frontend
- backend
- postgres

Docker Compose is the single source of truth for the local development infrastructure.

Claude must never overwrite or recreate `docker-compose.yml` unless explicitly requested.

Claude may extend it when adding new infrastructure services.

---

## Command Execution Policy

Claude must NEVER execute commands automatically.

Before executing any command that modifies the development environment, Claude must:

1. Explain why the command is required.
2. Explain what the command will do.
3. Wait for explicit user approval.

Examples include:

- Docker commands
- Package installation
- Database migrations
- Git operations
- File deletion or moving
- Build and deployment commands

Code generation is allowed without approval.

Environment modifications require explicit user approval.

---

## Frontend

- Build reusable UI components.
- Keep components small and focused.
- Reuse layouts whenever possible.
- Avoid duplicated UI logic.
- Separate presentation from business logic.
- Organize components by feature whenever appropriate.

---

## Backend

Modules:

- auth
- users
- roles
- permissions

Each module should contain:

- controller
- service
- dto
- entities
- tests

Business logic belongs only inside services.

Controllers should only:

- receive requests
- validate input
- call services
- return responses

---

## API

- Build REST APIs.
- Use meaningful endpoint names.
- Use appropriate HTTP methods.
- Return proper HTTP status codes.
- Use consistent response structures.
- Return meaningful error messages.
- Validate all incoming requests.
- Use DTOs for requests and responses.
- Support API versioning when appropriate.
- Support pagination where appropriate.
- Support filtering and sorting when applicable.
- Never expose internal implementation details in API responses.

---

## Testing

Every important feature should be testable.

Testing strategy:

- Unit tests for business logic.
- Integration tests for API behavior.
- End-to-end tests for complete user flows.

Tests should be updated whenever application behavior changes.

---

## Logging

- Use a centralized logging strategy.
- Never leave debugging logs in production code.
- Log errors with enough context for troubleshooting.
- Keep log messages meaningful and consistent.
- Never log passwords, tokens, secrets or sensitive user information.

---

## Environment

- Never hardcode secrets.
- Never hardcode passwords.
- Never hardcode API keys.
- Never hardcode URLs.
- Store configuration in environment variables.
- Keep development and production configurations separated.
- Document every required environment variable.
- Every new environment variable must also be added to `.env.example`.

---

## Git

- Never commit secrets.
- Never commit environment files containing secrets.
- Never commit generated files unless explicitly required.
- Keep commits focused on a single feature.
- Do not rewrite Git history unless explicitly requested.

---

## Folder Structure

```text
project/
│
├── frontend/
├── backend/
├── FEATURES/
│   ├── README.md
│   ├── HISTORY.md
│   ├── TEMPLATE.md
│   └── ...
├── docker-compose.yml
├── README.md
├── CLAUDE.md
├── .env
├── .env.example
└── .gitignore
```

---

## Feature Workflow

Before implementing a feature:

1. Read `FEATURES/HISTORY.md`.
2. Read `FEATURES/TEMPLATE.md`.
3. Review related feature documents if necessary.
4. Avoid breaking existing functionality.

After implementing a feature:

1. Create a new feature document using `FEATURES/TEMPLATE.md`.
2. Assign the next available incremental number.
3. Update `FEATURES/HISTORY.md`.
4. Document all backend, frontend, database and API changes.
5. Never overwrite previous feature documents.

---

## Coding Style

- Follow Clean Architecture principles.
- Follow SOLID.
- Follow DRY.
- Follow KISS.
- Keep methods small.
- Keep components small.
- Use meaningful names.
- Avoid magic numbers.
- Prefer readability over complexity.
- Comment only complex business logic.
- Remove dead code.
- Remove unused imports and variables.

---

## Documentation

When implementing new functionality:

- Keep documentation synchronized with the code.
- Update feature history.
- Document architectural decisions when necessary.
- Explain non-obvious implementation choices.

---

## Before Finishing Any Task

Claude should verify:

- Project builds successfully.
- No TypeScript errors exist.
- Prisma schema is valid.
- Imports are clean.
- No duplicated code was introduced.
- No unused imports or variables remain.
- All new files follow the project folder structure.
- Documentation has been updated if required.
- New features follow the project architecture.
- Existing functionality has not been broken.

If any manual command is required, Claude must explain it and wait for user approval before execution.
