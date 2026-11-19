import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { ClientUser } from '../clients/client-user.entity';
import { SuperAdmin } from './super-admin.entity';

export type Role = 'SUPER_ADMIN' | 'CLIENT';
export interface TokenPayload {
  sub: string;
  role: Role;
}
type AuthRequest = Request & { clientUser?: ClientUser };

const ROLE_KEY = 'kapta:role';

/** Route reserved to one role. The account is read again from the database on every call. */
export const Auth = (role: Role) =>
  applyDecorators(SetMetadata(ROLE_KEY, role), UseGuards(AuthGuard));

/** The signed-in client account (with its client), on routes marked @Auth('CLIENT'). */
export const CurrentClientUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): ClientUser =>
    context.switchToHttp().getRequest<AuthRequest>().clientUser!,
);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(SuperAdmin)
    private readonly superAdmins: Repository<SuperAdmin>,
    @InjectRepository(ClientUser)
    private readonly clientUsers: Repository<ClientUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const role =
      this.reflector.get<Role>(ROLE_KEY, context.getHandler()) ??
      this.reflector.get<Role>(ROLE_KEY, context.getClass());
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException('Connexion requise.');

    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expirée. Reconnectez-vous.');
    }
    if (payload.role !== role) throw new ForbiddenException('Accès refusé.');

    if (role === 'SUPER_ADMIN') {
      if (!(await this.superAdmins.existsBy({ id: payload.sub })))
        throw new UnauthorizedException('Compte introuvable.');
      return true;
    }

    const user = await this.clientUsers.findOne({
      where: { id: payload.sub },
      relations: { client: true },
    });
    if (!user) throw new UnauthorizedException('Compte introuvable.');
    if (!user.active || !user.client.active)
      throw new ForbiddenException('Ce compte est désactivé.');
    request.clientUser = user;
    return true;
  }
}
