import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminClientsController } from './admin-clients.controller';
import { ClientUser } from './client-user.entity';
import { Client } from './client.entity';
import { ClientsService } from './clients.service';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientUser])],
  controllers: [AdminClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
