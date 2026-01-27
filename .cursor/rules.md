# Cursor Rules for Turborepo + tRPC Project

## Project Structure

This is a **Turborepo monorepo** using:
- **bun** as package manager
- **TypeScript** with strict mode enabled
- **Next.js** for client applications
- **tRPC** for end-to-end type-safe APIs
- **Tailwind CSS** for styling
- **ESLint + Prettier** for code quality

## TypeScript - Strict Mode

Always enforce strict TypeScript practices:

- **NEVER use `any`** - Use `unknown` and narrow with type guards when type is uncertain
- **NEVER use `as` type assertions** unless absolutely necessary and documented why
- **NEVER use `// @ts-ignore` or `// @ts-expect-error`** without a comment explaining why
- **ALWAYS use explicit return types** for functions, especially for tRPC procedures
- **ALWAYS use `satisfies`** for type checking object literals when you want to preserve the literal type
- **ALWAYS handle `undefined` cases** - `noUncheckedIndexedAccess` is enabled
- **PREFER `interface` over `type`** for object shapes (better error messages and performance)
- **USE discriminated unions** for state management and error handling

## tRPC Guidelines

### Procedure Definitions

```typescript
// GOOD - Explicit input/output types with Zod
export const userRouter = router({
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }): Promise<User> => {
      // Explicit return type
    }),
});

// BAD - Implicit types, no validation
export const userRouter = router({
  getById: publicProcedure.query(async ({ input }) => {
    // Missing input validation and return type
  }),
});
```

### Input Validation

- **ALWAYS use Zod schemas** for input validation
- **ALWAYS define reusable schemas** in a shared location
- **ALWAYS use `.transform()` or `.refine()` for complex validation**
- **PREFER `.safeParse()` when you need to handle errors gracefully**

### Error Handling

```typescript
// GOOD - Use TRPCError with proper codes
import { TRPCError } from "@trpc/server";

throw new TRPCError({
  code: "NOT_FOUND",
  message: "User not found",
  cause: originalError, // Preserve error chain
});

// BAD - Generic errors
throw new Error("Something went wrong");
```

### Client Usage

```typescript
// GOOD - Type-safe queries with proper error handling
const { data, error, isLoading } = trpc.user.getById.useQuery(
  { id: userId },
  {
    enabled: Boolean(userId),
    retry: false,
  }
);

// GOOD - Mutations with optimistic updates
const utils = trpc.useUtils();
const mutation = trpc.user.update.useMutation({
  onSuccess: () => {
    utils.user.getById.invalidate({ id: userId });
  },
});
```

## React / Next.js Conventions

### Components

- **USE functional components only** - No class components
- **USE explicit interface for props** - Named `ComponentNameProps`
- **USE arrow functions** for component definitions
- **MARK client components** with `"use client"` directive at the top
- **PREFER Server Components** unless client-side interactivity is needed

```typescript
// GOOD
"use client";

import { type ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary";
}

export const Button = ({ children, onClick, variant = "primary" }: ButtonProps) => {
  return (
    <button className={variant} onClick={onClick}>
      {children}
    </button>
  );
};
```

### Hooks

- **ALWAYS specify generic types** for hooks like `useState<Type>()`
- **USE custom hooks** to encapsulate tRPC queries/mutations
- **FOLLOW the `use` prefix convention** for all hooks

```typescript
// GOOD - Custom hook for tRPC query
export const useUser = (userId: string) => {
  return trpc.user.getById.useQuery(
    { id: userId },
    { enabled: Boolean(userId) }
  );
};
```

## Imports and Exports

- **USE named exports** - Avoid default exports (except Next.js pages)
- **USE `import type`** for type-only imports
- **ORGANIZE imports**: React → External → Internal → Types → Styles

```typescript
// GOOD
import { useState, useEffect } from "react";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@repo/ui";
import type { User } from "@/types";
```

## File Naming

- **Components**: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- **Hooks**: `camelCase.ts` with `use` prefix (e.g., `useAuth.ts`)
- **Utils/Helpers**: `camelCase.ts` (e.g., `formatDate.ts`)
- **Types**: `camelCase.ts` or co-located with implementation
- **tRPC routers**: `camelCase.ts` (e.g., `userRouter.ts`)

## Zod Schemas

- **DEFINE schemas in a shared package** when used across apps
- **USE `.describe()` for documentation**
- **INFER types from schemas** - Don't duplicate type definitions

```typescript
// GOOD - Schema with inferred type
export const userSchema = z.object({
  id: z.string().uuid().describe("Unique user identifier"),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  createdAt: z.date(),
});

export type User = z.infer<typeof userSchema>;

// BAD - Duplicated type definition
interface User {
  id: string;
  email: string;
  // ... duplication of schema
}
```

## Error Handling Patterns

```typescript
// GOOD - Result type pattern for procedures
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// GOOD - Exhaustive error handling
function handleError(error: TRPCClientError<AppRouter>): string {
  switch (error.data?.code) {
    case "NOT_FOUND":
      return "Resource not found";
    case "UNAUTHORIZED":
      return "Please log in";
    case "FORBIDDEN":
      return "Access denied";
    default:
      return "An unexpected error occurred";
  }
}
```

## Testing Considerations

- **Mock tRPC procedures** at the router level, not HTTP level
- **USE `createCallerFactory`** for testing procedures directly
- **TEST Zod schemas** independently

## Monorepo Package References

- **USE workspace protocol** for internal packages: `"@repo/ui": "workspace:*"`
- **SHARE types** via dedicated packages when used across apps
- **KEEP tRPC router** in a shared package if multiple clients consume it

## Performance

- **USE `React.memo()`** sparingly and only when profiling shows benefit
- **USE `useMemo` and `useCallback`** only when passing to memoized children or in deps
- **PREFER Server Components** for data fetching to reduce client bundle
- **USE tRPC's `prefetch`** for anticipated data needs

## Do Not

- Use `any` type
- Suppress TypeScript errors without justification
- Use untyped API responses - always validate with Zod
- Mix client and server code without clear boundaries
- Use string literals for tRPC error codes - use the enum
- Forget to handle loading and error states in UI
- Create new packages without updating workspace configuration (bun automatically detects workspaces)
