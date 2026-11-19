import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  generateActivationCode,
  hashActivationCode,
  normalizeActivationCode,
} from '../common/activation-code';
import { AttemptLimiter } from '../common/attempt-limiter';
import { ClientUser } from '../clients/client-user.entity';
import { Client } from '../clients/client.entity';
import { ClientsService } from '../clients/clients.service';
import { ActivationCode } from './activation-code.entity';
import { License } from './license.entity';
import { GenerateCodesDto } from './licenses.dto';

const DAY_MS = 24 * 60 * 60_000;

export type CodeStatus = 'DISPONIBLE' | 'UTILISE' | 'EXPIRE' | 'REVOQUE';
export type LicenseStatus = 'ACTIVE' | 'EXPIREE' | 'REVOQUEE';

@Injectable()
export class LicensesService {
  private readonly activationLimiter = new AttemptLimiter(10, 15 * 60_000);

  constructor(
    private readonly dataSource: DataSource,
    private readonly clientsService: ClientsService,
    @InjectRepository(ActivationCode)
    private readonly codes: Repository<ActivationCode>,
    @InjectRepository(License) private readonly licenses: Repository<License>,
  ) {}

  // ── Super admin ──────────────────────────────────────────────────────────

  /** The plain codes are returned only here, once: only their hash is kept. */
  async generateCodes(clientId: string, dto: GenerateCodesDto) {
    await this.clientsService.findOne(clientId);
    const count = dto.count ?? 1;
    const expiresAt = dto.validForDays
      ? new Date(Date.now() + dto.validForDays * DAY_MS)
      : null;
    const created: {
      id: string;
      code: string;
      durationDays: number;
      expiresAt: Date | null;
    }[] = [];
    while (created.length < count) {
      const code = generateActivationCode();
      const normalized = normalizeActivationCode(code);
      const codeHash = hashActivationCode(normalized);
      // A collision is practically impossible; draw again if it ever happens.
      if (await this.codes.existsBy({ codeHash })) continue;
      const saved = await this.codes.save(
        this.codes.create({
          codeHash,
          codeHint: normalized.slice(-4),
          clientId,
          durationDays: dto.durationDays,
          expiresAt,
        }),
      );
      created.push({
        id: saved.id,
        code,
        durationDays: saved.durationDays,
        expiresAt: saved.expiresAt,
      });
    }
    return created;
  }

  async findCodes(clientId: string) {
    await this.clientsService.findOne(clientId);
    const codes = await this.codes.find({
      where: { clientId },
      order: { createdAt: 'DESC' },
    });
    return codes.map((code) => ({
      id: code.id,
      codeHint: `KPT-…-${code.codeHint}`,
      status: this.codeStatus(code),
      durationDays: code.durationDays,
      expiresAt: code.expiresAt,
      usedAt: code.usedAt,
      usedByUserId: code.usedByUserId,
      deviceId: code.deviceId,
      revokedAt: code.revokedAt,
      createdAt: code.createdAt,
    }));
  }

  async revokeCode(id: string) {
    const code = await this.codes.findOneBy({ id });
    if (!code) throw new NotFoundException('Code introuvable.');
    if (code.usedAt) {
      throw new BadRequestException(
        'Ce code est déjà utilisé : révoquez la licence du téléphone à la place.',
      );
    }
    code.revokedAt ??= new Date();
    await this.codes.save(code);
    return { id: code.id, status: this.codeStatus(code) };
  }

  async findLicenses(clientId: string) {
    await this.clientsService.findOne(clientId);
    const licenses = await this.licenses.find({
      where: { clientId },
      order: { expiresAt: 'DESC' },
    });
    return licenses.map((license) => ({
      id: license.id,
      deviceId: license.deviceId,
      userId: license.userId,
      status: this.licenseStatus(license),
      activatedAt: license.activatedAt,
      expiresAt: license.expiresAt,
      revokedAt: license.revokedAt,
      lastCheckAt: license.lastCheckAt,
    }));
  }

  async revokeLicense(id: string) {
    const license = await this.licenses.findOneBy({ id });
    if (!license) throw new NotFoundException('Licence introuvable.');
    license.revokedAt ??= new Date();
    await this.licenses.save(license);
    return { id: license.id, status: this.licenseStatus(license) };
  }

  // ── Kapta app ────────────────────────────────────────────────────────────

  /** Uses a code once on this phone. A phone with a running license is extended from its current end date. */
  async activate(user: ClientUser, rawCode: string, deviceId: string) {
    const limiterKey = user.id;
    this.activationLimiter.assertAllowed(limiterKey);
    const normalized = normalizeActivationCode(rawCode);

    const license = await this.dataSource.transaction(async (manager) => {
      // Locked row: two phones typing the same code at once cannot both use it.
      const code = normalized
        ? await manager.findOne(ActivationCode, {
            where: {
              codeHash: hashActivationCode(normalized),
              clientId: user.clientId,
            },
            lock: { mode: 'pessimistic_write' },
          })
        : null;
      const refusal = !code
        ? 'Code d’activation invalide.'
        : code.revokedAt
          ? 'Ce code a été révoqué.'
          : code.usedAt
            ? 'Ce code a déjà été utilisé.'
            : code.expiresAt && code.expiresAt <= new Date()
              ? 'Ce code a expiré.'
              : null;
      if (refusal || !code) {
        this.activationLimiter.recordFailure(limiterKey);
        throw new BadRequestException(refusal);
      }

      const now = new Date();
      let current = await manager.findOne(License, {
        where: { clientId: user.clientId, deviceId },
        lock: { mode: 'pessimistic_write' },
      });
      const running =
        !!current && !current.revokedAt && current.expiresAt > now;
      const start = running && current ? current.expiresAt : now;
      const expiresAt = new Date(start.getTime() + code.durationDays * DAY_MS);
      if (!current) {
        current = manager.create(License, {
          clientId: user.clientId,
          deviceId,
          activatedAt: now,
        });
      } else if (!running) {
        current.activatedAt = now;
        current.revokedAt = null;
      }
      current.userId = user.id;
      current.expiresAt = expiresAt;
      current.lastCheckAt = now;
      const saved = await manager.save(current);

      code.usedAt = now;
      code.usedByUserId = user.id;
      code.deviceId = deviceId;
      await manager.save(code);
      return saved;
    });

    this.activationLimiter.reset(limiterKey);
    return this.licenseView(license, user.client);
  }

  /** Checked by the app on start and regularly: the backend URL is given only while the license runs. */
  async status(user: ClientUser, deviceId: string) {
    const license = await this.licenses.findOneBy({
      clientId: user.clientId,
      deviceId,
    });
    if (!license) {
      return {
        valid: false,
        reason: 'NON_ACTIVEE',
        client: { name: user.client.name },
        serverTime: new Date(),
      };
    }
    license.lastCheckAt = new Date();
    await this.licenses.save(license);
    return this.licenseView(license, user.client);
  }

  private licenseView(license: License, client: Client) {
    const status = this.licenseStatus(license);
    const valid = status === 'ACTIVE';
    return {
      valid,
      reason: valid ? null : status,
      expiresAt: license.expiresAt,
      daysLeft: valid
        ? Math.ceil((license.expiresAt.getTime() - Date.now()) / DAY_MS)
        : 0,
      client: valid
        ? { id: client.id, name: client.name, backendUrl: client.backendUrl }
        : { name: client.name },
      serverTime: new Date(),
    };
  }

  private codeStatus(code: ActivationCode): CodeStatus {
    if (code.usedAt) return 'UTILISE';
    if (code.revokedAt) return 'REVOQUE';
    if (code.expiresAt && code.expiresAt <= new Date()) return 'EXPIRE';
    return 'DISPONIBLE';
  }

  private licenseStatus(license: License): LicenseStatus {
    if (license.revokedAt) return 'REVOQUEE';
    return license.expiresAt > new Date() ? 'ACTIVE' : 'EXPIREE';
  }
}
