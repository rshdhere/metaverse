<div align="center">

  <p>
    <img src="./apps/client/public/turborepo-icon-seeklogo.svg" alt="Turborepo" width="52" />
    <img src="https://bun.sh/logo.svg" alt="Bun" width="58" />
    <img src="https://raw.githubusercontent.com/colinhacks/zod/main/logo.svg" alt="Zod" width="58" />
    <img src="https://trpc.io/img/logo.svg" alt="tRPC" width="52" />
    <img src="https://www.prisma.io/favicon.ico" alt="Prisma" width="52" />
  </p>

</div>

<div align="center">

## TURBOREPO + BUN + ZOD + TRPC + PRISMA



[![tRPC](https://github.com/user-attachments/assets/9565f06a-eb4f-48fc-9020-a7a8f0b3d6bd)](https://trpc.io)






</div>

## 1. Install Dependencies

From the root of the monorepo, install all workspace dependencies :

```bash
bun install
```

## 2. Generate Prisma-Client

move to the `/store` package and generate the prisma-client :

```bash
bun run prisma:generate
```

## 3. Environment variables

move to the `/config` package and add your `.env` :

```bash
BACKEND_PORT=3001
JWT_SECRET=your-jwt-secret
DATABASE_URL=your-database-connection-string
RESEND_API_KEY=your-resend-api-key
CLIENT_ID_GITHUB=your-github-client-id
CLIENT_SECRET_GITHUB=your-github-client-secret
```
## 4. Change address for email service

move to the `/api` package, Inside `src/email.ts` change the "from-address" and update the "bold-tag" to your address/domain from **resend** and your labs page or your service name accordingly

```bash
from: "your-resend-email/domain"
<b>your-name/your-email-service</b>!

```

