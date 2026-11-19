import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule } from '../clients/clients.module';
import { ActivationCode } from './activation-code.entity';
import { AdminLicensesController } from './admin-licenses.controller';
import { LicenseController } from './license.controller';
import { License } from './license.entity';
import { LicensesService } from './licenses.service';

@Module({
  imports: [TypeOrmModule.forFeature([ActivationCode, License]), ClientsModule],
  controllers: [AdminLicensesController, LicenseController],
  providers: [LicensesService],
})
export class LicensesModule {}
