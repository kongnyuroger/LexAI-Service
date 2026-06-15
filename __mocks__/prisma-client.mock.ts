// Stub for the Prisma 7 generated client in Jest (CJS mode).
// The real generated/prisma/client uses import.meta.url (ESM-only)
// which ts-jest cannot transform. Unit tests mock PrismaService
// directly via useValue, so this stub only needs to satisfy imports.

export class PrismaClient {
  $connect = jest.fn().mockResolvedValue(undefined);
  $disconnect = jest.fn().mockResolvedValue(undefined);
  $transaction = jest.fn();
  $queryRawUnsafe = jest.fn().mockResolvedValue([]);
  $executeRawUnsafe = jest.fn().mockResolvedValue(1);
  user = { findUnique: jest.fn(), create: jest.fn(), upsert: jest.fn() };
  document = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  };
  analysis = {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  };
  riskFlag = {
    create: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  chatMessage = {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  };
  legalSource = {
    findMany: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  };
}

export enum Plan {
  FREE = 'FREE',
  PREMIUM = 'PREMIUM',
}

export enum DocumentStatus {
  UPLOADED = 'UPLOADED',
  PROCESSING = 'PROCESSING',
  TEXT_EXTRACTED = 'TEXT_EXTRACTED',
  ANALYZED = 'ANALYZED',
  FAILED = 'FAILED',
}

export enum Severity {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum MessageRole {
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
}
