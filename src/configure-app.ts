import { INestApplication, ValidationPipe } from '@nestjs/common';
import express from 'express';
import { join } from 'path';

// public/ sits next to src/ and dist/, so this resolves from both.
const ADMIN_DIR = join(__dirname, '..', 'public', 'admin');

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

  // The Android app needs no CORS. Only the web build of the app (another origin) does:
  // CORS_ORIGINS lists its exact origins, comma separated; nothing is allowed by default.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length) app.enableCors({ origin: corsOrigins });

  // Super admin panel: static page calling the API on the same origin. Only its own files may run,
  // and it cannot be shown inside another site.
  app.use(
    '/console',
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      // The page is /console/, so that its relative links (admin.js…) resolve under /console.
      if (req.originalUrl === '/console') return res.redirect(301, '/console/');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cache-Control', 'no-cache');
      next();
    },
    express.static(ADMIN_DIR, { index: 'index.html', fallthrough: false }),
  );
}
