import { Injectable, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { StorageService } from './storage.service';

// TODO (production): replace with an S3/R2 implementation of StorageService.
// Files are stored under: {STORAGE_PATH}/{userId}/{documentId}/{filename}
@Injectable()
export class LocalStorageService
  extends StorageService
  implements OnModuleInit
{
  private readonly root: string;

  constructor() {
    super();
    this.root = process.env.STORAGE_PATH ?? './uploads';
  }

  async onModuleInit() {
    await fs.mkdir(this.root, { recursive: true });
  }

  async save(
    buffer: Buffer,
    originalFilename: string,
    userId: string,
    documentId: string,
  ): Promise<string> {
    const dir = path.join(this.root, userId, documentId);
    await fs.mkdir(dir, { recursive: true });

    const ext = path.extname(originalFilename);
    const filename = `file${ext}`;
    const fullPath = path.join(dir, filename);

    await fs.writeFile(fullPath, buffer);
    return fullPath;
  }

  async read(storagePath: string): Promise<Buffer> {
    return fs.readFile(storagePath);
  }

  async delete(storagePath: string): Promise<void> {
    await fs.unlink(storagePath);
  }
}
