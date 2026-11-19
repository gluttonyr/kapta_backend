import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Shared by the server and the e2e tests. */
export function configureApp(app: INestApplication) {
  // Unknown fields are refused: a client cannot set e.g. `clientId` or `active` itself.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
