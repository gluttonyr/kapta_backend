import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttemptLimiter } from '../common/attempt-limiter';
import { hashPassword, verifyPassword } from '../common/password';
import { ClientUser } from '../clients/client-user.entity';
import { Role, TokenPayload } from './auth.guard';
import { SuperAdmin } from './super-admin.entity';

const INVALID_CREDENTIALS = 'E-mail ou mot de passe incorrect.';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly loginLimiter = new AttemptLimiter(10, 15 * 60_000);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    @InjectRepository(SuperAdmin)
    private readonly superAdmins: Repository<SuperAdmin>,
    @InjectRepository(ClientUser)
    private readonly clientUsers: Repository<ClientUser>,
  ) {}

  /** Creates the super admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD; an existing one is never changed. */
  async onApplicationBootstrap() {
    const email = this.config
      .get<string>('SUPER_ADMIN_EMAIL')
      ?.trim()
      .toLowerCase();
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD') ?? '';
    if (!email || !password) {
      if (!(await this.superAdmins.count())) {
        this.logger.warn(
          'Aucun super admin : renseignez SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD dans .env.',
        );
      }
      return;
    }
    if (await this.superAdmins.existsBy({ email })) return;
    if (password.length < 10) {
      this.logger.error(
        'SUPER_ADMIN_PASSWORD doit faire au moins 10 caractères : super admin non créé.',
      );
      return;
    }
    await this.superAdmins.save(
      this.superAdmins.create({
        email,
        passwordHash: await hashPassword(password),
      }),
    );
    this.logger.log(`Super admin créé : ${email}`);
  }

  async loginSuperAdmin(email: string, password: string) {
    const key = `admin:${email.trim().toLowerCase()}`;
    this.loginLimiter.assertAllowed(key);
    const admin = await this.superAdmins.findOneBy({
      email: email.trim().toLowerCase(),
    });
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      this.loginLimiter.recordFailure(key);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.loginLimiter.reset(key);
    return {
      accessToken: await this.sign(admin.id, 'SUPER_ADMIN'),
      email: admin.email,
    };
  }

  async loginClientUser(email: string, password: string) {
    const key = `client:${email.trim().toLowerCase()}`;
    this.loginLimiter.assertAllowed(key);
    const user = await this.clientUsers.findOne({
      where: { email: email.trim().toLowerCase() },
      relations: { client: true },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      this.loginLimiter.recordFailure(key);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    this.loginLimiter.reset(key);
    if (!user.active || !user.client.active)
      throw new UnauthorizedException('Ce compte est désactivé.');
    user.lastLoginAt = new Date();
    await this.clientUsers.save(user);
    return {
      accessToken: await this.sign(user.id, 'CLIENT'),
      email: user.email,
      client: { id: user.client.id, name: user.client.name },
    };
  }

  private sign(sub: string, role: Role) {
    const payload: TokenPayload = { sub, role };
    return this.jwt.signAsync(payload);
  }
}
