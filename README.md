# biru-nest

## NestJS

```bash
# https://docs.nestjs.com/

nest new biru-nest --strict
✨  We will scaffold your app in a few seconds..

✔ Which package manager would you ❤️  to use? pnpm
CREATE biru-nest/.prettierrc (51 bytes)
CREATE biru-nest/README.md (5036 bytes)
CREATE biru-nest/eslint.config.mjs (836 bytes)
CREATE biru-nest/nest-cli.json (171 bytes)
CREATE biru-nest/package.json (2035 bytes)
CREATE biru-nest/tsconfig.build.json (97 bytes)
CREATE biru-nest/tsconfig.json (541 bytes)
CREATE biru-nest/src/app.controller.ts (274 bytes)
CREATE biru-nest/src/app.module.ts (249 bytes)
CREATE biru-nest/src/app.service.ts (142 bytes)
CREATE biru-nest/src/main.ts (228 bytes)
CREATE biru-nest/src/app.controller.spec.ts (617 bytes)
CREATE biru-nest/test/jest-e2e.json (183 bytes)
CREATE biru-nest/test/app.e2e-spec.ts (674 bytes)

✔ Installation in progress... ☕

🚀  Successfully created project biru-nest
👉  Get started with the following commands:

$ cd biru-nest
$ pnpm run start


                          Thanks for installing Nest 🙏
                 Please consider donating to our open collective
                        to help us maintain this package.


               🍷  Donate: https://opencollective.com/nest
```

## Editor

```bash
# Visual Studio Code
# https://github.com/prettier/prettier-vscode
# https://marketplace.visualstudio.com/items?itemName=tombonnike.vscode-status-bar-format-toggle

# .vscode/settings.json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "always",
    "source.addMissingImports": "always",
    "source.organizeImports": "always"
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

## Controllers

```bash
# https://docs.nestjs.com/controllers

Hint
To quickly create a CRUD controller with built-in validation, you can use the CLI's CRUD generator: nest g resource [name].
```

## Configuration

```bash
# https://docs.nestjs.com/techniques/configuration

pnpm add @nestjs/config

# app.module.tsJS
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
})

export class AppModule {}
```

## validation

```bash
# https://docs.nestjs.com/techniques/validation

pnpm add class-validator class-transformer
```

## Cookies

```bash
# https://docs.nestjs.com/techniques/cookies

pnpm add cookie-parser
pnpm add -D @types/cookie-parser

import * as cookieParser from 'cookie-parser';

app.use(cookieParser());
```

```bash
# https://docs.nestjs.com/techniques/http-module

pnpm add @nestjs/axios axios

@Module({
  imports: [HttpModule],
  providers: [CatsService],
})
export class CatsModule {}
```

## Authentication

```bash
# https://docs.nestjs.com/security/authentication
pnpm add @nestjs/jwt
```

## Encryption and Hashing

```bash
# https://docs.nestjs.com/security/encryption-and-hashing

pnpm add bcrypt
pnpm add -D @types/bcrypt
```

## Helmet

```bash
# https://docs.nestjs.com/security/helmet

pnpm add helmet

import helmet from 'helmet';

app.use(helmet());
```

## CORS

```bash
# https://docs.nestjs.com/security/cors

const app = await NestFactory.create(AppModule, {
  cors: {
    origin: 'https://biru-eight.vercel.app',
  },
});
```

## Rate Limiting

```bash
# https://docs.nestjs.com/security/rate-limiting

pnpm add @nestjs/throttler

app.module.ts

@Module({
  imports: [
     ThrottlerModule.forRoot({
      throttlers: [
        {
          ttl: 60000,
          limit: 10,
        },
      ],
    }),
  ],
})

export class AppModule {}
```

## Websockets

```bash
# https://docs.nestjs.com/websockets/gateways

pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
```

## Swagger

```bash
# https://docs.nestjs.com/openapi/introduction

pnpm add @nestjs/swagger

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

# http://localhost:3000/api
```

## Passport (authentication)

```bash
# https://docs.nestjs.com/recipes/passport

pnpm add @nestjs/passport passport passport-local
pnpm add -D @types/passport-local

pnpm add @nestjs/jwt passport-jwt
pnpm add -D @types/passport-jwt
```

## Prisma

```bash
# https://docs.nestjs.com/recipes/prisma
# https://www.prisma.io/docs/orm/tools/prisma-cli

pnpm install prisma --save-dev
pnpm prisma
pnpm prisma init
pnpm prisma migrate dev --name init
tree prisma
pnpm @prisma/client
pnpm prisma generate
```

## Global prefix

```bash
# https://docs.nestjs.com/faq/global-prefix

const app = await NestFactory.create(AppModule);

app.setGlobalPrefix('api');
```

## uuid

```bash
# https://github.com/uuidjs/uuid

pnpm add uuid
```

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

# biru-nest
