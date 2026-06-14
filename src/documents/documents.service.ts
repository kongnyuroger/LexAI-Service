import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async upload(file: Express.Multer.File, userId: string) {
    const documentId = randomUUID();

    const storagePath = await this.storage.save(
      file.buffer,
      file.originalname,
      userId,
      documentId,
    );

    const document = await this.prisma.document.create({
      data: {
        id: documentId,
        userId,
        originalFilename: file.originalname,
        fileType: file.mimetype,
        storagePath,
        status: 'UPLOADED',
      },
    });

    return document;
  }

  async findOne(documentId: string, userId: string) {
    return this.prisma.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        originalFilename: true,
        fileType: true,
        status: true,
        createdAt: true,
        // extractedText intentionally omitted to keep payload small
      },
    });
  }
}
