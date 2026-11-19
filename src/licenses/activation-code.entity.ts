import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';

/** A single-use code that gives one phone `durationDays` of license for its client. */
@Entity('activation_codes')
export class ActivationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** sha256 of the normalized code; the code itself is shown only once, when generated. */
  @Column({ name: 'code_hash', unique: true })
  codeHash: string;

  /** Last 4 characters, to recognise a code in the admin list. */
  @Column({ name: 'code_hint', length: 4 })
  codeHint: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'duration_days', type: 'int' })
  durationDays: number;

  /** The code must be used before this date; null = no limit. */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'used_by_user_id', type: 'uuid', nullable: true })
  usedByUserId: string | null;

  @Column({ name: 'device_id', type: 'varchar', nullable: true })
  deviceId: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
