import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeBackendUrl } from '../common/backend-url';
import { hashPassword } from '../common/password';
import { ClientUser } from './client-user.entity';
import { Client } from './client.entity';
import {
  CreateClientDto,
  CreateClientUserDto,
  UpdateClientDto,
  UpdateClientUserDto,
} from './clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Client) private readonly clients: Repository<Client>,
    @InjectRepository(ClientUser)
    private readonly users: Repository<ClientUser>,
  ) {}

  findAll() {
    return this.clients.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const client = await this.clients.findOneBy({ id });
    if (!client) throw new NotFoundException('Client introuvable.');
    return client;
  }

  create(dto: CreateClientDto) {
    return this.clients.save(
      this.clients.create({
        name: dto.name.trim(),
        backendUrl: normalizeBackendUrl(dto.backendUrl, this.production),
      }),
    );
  }

  async update(id: string, dto: UpdateClientDto) {
    const client = await this.findOne(id);
    if (dto.name !== undefined) client.name = dto.name.trim();
    if (dto.backendUrl !== undefined)
      client.backendUrl = normalizeBackendUrl(dto.backendUrl, this.production);
    if (dto.active !== undefined) client.active = dto.active;
    return this.clients.save(client);
  }

  async findUsers(clientId: string) {
    await this.findOne(clientId);
    const users = await this.users.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
    return users.map((user) => this.toUserResponse(user));
  }

  async createUser(clientId: string, dto: CreateClientUserDto) {
    await this.findOne(clientId);
    const email = dto.email.trim().toLowerCase();
    if (await this.users.existsBy({ email }))
      throw new ConflictException('Un compte existe déjà avec cet e-mail.');
    const user = await this.users.save(
      this.users.create({
        email,
        clientId,
        passwordHash: await hashPassword(dto.password),
      }),
    );
    return this.toUserResponse(user);
  }

  async updateUser(id: string, dto: UpdateClientUserDto) {
    const user = await this.users.findOneBy({ id });
    if (!user) throw new NotFoundException('Compte introuvable.');
    if (dto.active !== undefined) user.active = dto.active;
    if (dto.password !== undefined)
      user.passwordHash = await hashPassword(dto.password);
    return this.toUserResponse(await this.users.save(user));
  }

  private get production() {
    return this.config.get('NODE_ENV') === 'production';
  }

  /** Never the password hash. */
  private toUserResponse(user: ClientUser) {
    return {
      id: user.id,
      email: user.email,
      clientId: user.clientId,
      active: user.active,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
