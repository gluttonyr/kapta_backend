import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Auth } from '../auth/auth.guard';
import {
  CreateClientDto,
  CreateClientUserDto,
  UpdateClientDto,
  UpdateClientUserDto,
} from './clients.dto';
import { ClientsService } from './clients.service';

@Controller('admin')
@Auth('SUPER_ADMIN')
export class AdminClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients')
  findAll() {
    return this.clients.findAll();
  }

  @Get('clients/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findOne(id);
  }

  @Post('clients')
  create(@Body() body: CreateClientDto) {
    return this.clients.create(body);
  }

  /** Rename, change the backend URL, or deactivate the client (all its phones stop). */
  @Patch('clients/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClientDto,
  ) {
    return this.clients.update(id, body);
  }

  @Get('clients/:id/users')
  findUsers(@Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findUsers(id);
  }

  @Post('clients/:id/users')
  createUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateClientUserDto,
  ) {
    return this.clients.createUser(id, body);
  }

  /** Deactivate an account or set a new password. */
  @Patch('client-users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClientUserDto,
  ) {
    return this.clients.updateUser(id, body);
  }
}
