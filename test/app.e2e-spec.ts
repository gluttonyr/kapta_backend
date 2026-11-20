import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client as PgClient } from 'pg';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

// Runs against a throwaway database, recreated on every run (the .env database is never touched).
const TEST_DB = 'kapta_test';
const ADMIN = { email: 'owner@kapta.test', password: 'super-secret-123' };
const DAY_MS = 24 * 60 * 60_000;

async function recreateTestDatabase() {
  const pg = new PgClient({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'postgres',
  });
  await pg.connect();
  await pg.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await pg.query(`CREATE DATABASE ${TEST_DB}`);
  await pg.end();
}

describe('Kapta license server (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) =>
    req.set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DB_NAME: TEST_DB,
      JWT_SECRET: 'e2e-test-secret',
      SUPER_ADMIN_EMAIL: ADMIN.email,
      SUPER_ADMIN_PASSWORD: ADMIN.password,
    });
    await recreateTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the API status', () =>
    http().get('/').expect(200, { name: 'Kapta API', status: 'ok' }));

  it('serves the admin panel with a strict content policy', async () => {
    await http().get('/console').expect(301).expect('Location', '/console/');
    const page = await http().get('/console/').expect(200);
    expect(page.text).toContain('<script src="admin.js"></script>');
    expect(page.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(page.headers['x-frame-options']).toBe('DENY');
    await http()
      .get('/console/admin.js')
      .expect(200)
      .expect('Content-Type', /javascript/);
    await http().get('/console/missing.js').expect(404);
  });

  it('signs the super admin in, only with the right password', async () => {
    await http()
      .post('/auth/admin/login')
      .send({ email: ADMIN.email, password: 'wrong-password' })
      .expect(401);
    const res = await http().post('/auth/admin/login').send(ADMIN).expect(200);
    adminToken = res.body.accessToken;
    expect(adminToken).toEqual(expect.any(String));
  });

  it('protects the admin routes', async () => {
    await http().get('/admin/clients').expect(401);
    await http()
      .get('/admin/clients')
      .set('Authorization', 'Bearer not-a-token')
      .expect(401);
  });

  describe('a client with an account and activation codes', () => {
    let clientId: string;
    let userToken: string;
    let codes: { id: string; code: string }[];

    it('creates a client only with an https backend URL', async () => {
      await asAdmin(http().post('/admin/clients'))
        .send({ name: 'JM Services', backendUrl: 'http://evil.example' })
        .expect(400);
      const res = await asAdmin(http().post('/admin/clients'))
        .send({ name: 'JM Services', backendUrl: 'https://api.jm.example/' })
        .expect(201);
      clientId = res.body.id;
      expect(res.body.backendUrl).toBe('https://api.jm.example');
    });

    it('creates the client account, without exposing its password', async () => {
      await asAdmin(http().post(`/admin/clients/${clientId}/users`))
        .send({ email: 'admin@jm.example', password: 'short' })
        .expect(400);
      await asAdmin(http().post(`/admin/clients/${clientId}/users`))
        .send({
          email: 'admin@jm.example',
          password: 'client-pass-1',
          active: false,
          clientId: 'x',
        })
        .expect(400);
      const res = await asAdmin(http().post(`/admin/clients/${clientId}/users`))
        .send({ email: 'Admin@JM.example', password: 'client-pass-1' })
        .expect(201);
      expect(res.body.email).toBe('admin@jm.example');
      expect(res.body).not.toHaveProperty('passwordHash');
      await asAdmin(http().post(`/admin/clients/${clientId}/users`))
        .send({ email: 'admin@jm.example', password: 'client-pass-2' })
        .expect(409);
    });

    it('signs the client account in; it cannot use the admin routes', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: 'admin@jm.example', password: 'client-pass-1' })
        .expect(200);
      userToken = res.body.accessToken;
      expect(res.body.client).toEqual({ id: clientId, name: 'JM Services' });
      await http()
        .get('/admin/clients')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await http()
        .post('/auth/admin/login')
        .send({ email: 'admin@jm.example', password: 'client-pass-1' })
        .expect(401);
    });

    it('gives no backend URL before activation', async () => {
      const res = await http()
        .get('/license/status')
        .query({ deviceId: 'device-AAAA-1' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body).toMatchObject({
        valid: false,
        reason: 'NON_ACTIVEE',
        client: { name: 'JM Services' },
      });
      expect(res.body.client).not.toHaveProperty('backendUrl');
    });

    it('generates codes shown once, then listed by their last characters only', async () => {
      const res = await asAdmin(http().post(`/admin/clients/${clientId}/codes`))
        .send({ durationDays: 30, count: 2 })
        .expect(201);
      codes = res.body;
      expect(codes).toHaveLength(2);
      expect(codes[0].code).toMatch(
        /^KPT-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/,
      );
      const list = await asAdmin(
        http().get(`/admin/clients/${clientId}/codes`),
      ).expect(200);
      expect(
        list.body.every(
          (code: any) =>
            code.status === 'DISPONIBLE' &&
            !('code' in code) &&
            !('codeHash' in code),
        ),
      ).toBe(true);
    });

    it('activates a phone once per code, and a second code extends the license', async () => {
      const activate = (code: string, deviceId: string) =>
        http()
          .post('/license/activate')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ code, deviceId });

      // Typed in lower case with spaces: still the same code.
      const first = await activate(
        codes[0].code.toLowerCase().replace(/-/g, ' '),
        'device-AAAA-1',
      ).expect(200);
      expect(first.body).toMatchObject({
        valid: true,
        daysLeft: 30,
        client: {
          id: clientId,
          name: 'JM Services',
          backendUrl: 'https://api.jm.example',
        },
      });

      const reused = await activate(codes[0].code, 'device-BBBB-2').expect(400);
      expect(reused.body.message).toBe('Ce code a déjà été utilisé.');
      await activate('KPT-AAAA-BBBB-CCCC', 'device-BBBB-2').expect(400);

      const second = await activate(codes[1].code, 'device-AAAA-1').expect(200);
      const extendedBy =
        new Date(second.body.expiresAt).getTime() -
        new Date(first.body.expiresAt).getTime();
      expect(Math.round(extendedBy / DAY_MS)).toBe(30);
      expect(second.body.daysLeft).toBe(60);

      const list = await asAdmin(
        http().get(`/admin/clients/${clientId}/codes`),
      ).expect(200);
      expect(list.body.map((code: any) => code.status)).toEqual([
        'UTILISE',
        'UTILISE',
      ]);
    });

    it('refuses a code generated for another client', async () => {
      const other = await asAdmin(http().post('/admin/clients'))
        .send({ name: 'Autre client', backendUrl: 'https://api.other.example' })
        .expect(201);
      const [otherCode] = (
        await asAdmin(http().post(`/admin/clients/${other.body.id}/codes`))
          .send({ durationDays: 7 })
          .expect(201)
      ).body;
      const res = await http()
        .post('/license/activate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ code: otherCode.code, deviceId: 'device-CCCC-3' })
        .expect(400);
      expect(res.body.message).toBe('Code d’activation invalide.');
    });

    it('stops a phone when its license is revoked', async () => {
      const licenses = await asAdmin(
        http().get(`/admin/clients/${clientId}/licenses`),
      ).expect(200);
      expect(licenses.body).toHaveLength(1);
      await asAdmin(
        http().post(`/admin/licenses/${licenses.body[0].id}/revoke`),
      ).expect(200);
      const res = await http()
        .get('/license/status')
        .query({ deviceId: 'device-AAAA-1' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ valid: false, reason: 'REVOQUEE' });
      expect(res.body.client).not.toHaveProperty('backendUrl');
    });

    it('stops every account of a deactivated client', async () => {
      await asAdmin(http().patch(`/admin/clients/${clientId}`))
        .send({ active: false })
        .expect(200);
      await http()
        .get('/license/status')
        .query({ deviceId: 'device-AAAA-1' })
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      await http()
        .post('/auth/login')
        .send({ email: 'admin@jm.example', password: 'client-pass-1' })
        .expect(401);
    });
  });
});
