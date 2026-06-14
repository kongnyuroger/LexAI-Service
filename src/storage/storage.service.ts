// Abstract storage interface — swap LocalStorageService for an S3/R2
// implementation without touching any other module.
export abstract class StorageService {
  abstract save(
    buffer: Buffer,
    originalFilename: string,
    userId: string,
    documentId: string,
  ): Promise<string>;

  abstract read(storagePath: string): Promise<Buffer>;

  abstract delete(storagePath: string): Promise<void>;
}
