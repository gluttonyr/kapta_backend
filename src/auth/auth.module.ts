import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientUser } from '../clients/client-user.entity';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { SuperAdmin } from './super-admin.entity';

// Global: every module can protect its routes with @Auth(...).
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SuperAdmin, ClientUser]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret)
          throw new Error(
            'JWT_SECRET manquant dans .env : le serveur ne peut pas démarrer.',
          );
        return {
          secret,
          signOptions: {
            expiresIn: (config.get<string>('JWT_EXPIRATION') ||
              '30d') as JwtSignOptions['expiresIn'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [JwtModule, TypeOrmModule, AuthGuard],
})
export class AuthModule {}
