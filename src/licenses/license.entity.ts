import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Client } from '../clients/client.entity';

/** The right of one phone to capture for one client until expiresAt. A new code extends it. */
@Entity('licenses')
@Index(['clientId', 'deviceId'], { unique: true })
export class License {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  /** The account that activated the phone last. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'device_id' })
  deviceId: string;

  @Column({ name: 'activated_at', type: 'timestamptz' })
  activatedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_check_at', type: 'timestamptz', nullable: true })
  lastCheckAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
