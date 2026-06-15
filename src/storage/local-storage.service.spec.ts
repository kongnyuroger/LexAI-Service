const mockMkdir = jest.fn().mockResolvedValue(undefined);
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockReadFile = jest.fn();
const mockUnlink = jest.fn().mockResolvedValue(undefined);

jest.mock('fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  unlink: mockUnlink,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { LocalStorageService } from './local-storage.service';

describe('LocalStorageService', () => {
  let service: LocalStorageService;
  const testRoot = '/tmp/lexai-test';

  beforeEach(async () => {
    process.env.STORAGE_PATH = testRoot;

    const module: TestingModule = await Test.createTestingModule({
      providers: [LocalStorageService],
    }).compile();

    service = module.get<LocalStorageService>(LocalStorageService);
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('creates the root storage directory', async () => {
      await service.onModuleInit();
      expect(mockMkdir).toHaveBeenCalledWith(testRoot, { recursive: true });
    });
  });

  describe('save', () => {
    it('writes the file and returns the full path', async () => {
      const buffer = Buffer.from('PDF content');
      const result = await service.save(buffer, 'contract.pdf', 'user-1', 'doc-1');

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('user-1'),
        { recursive: true },
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('file.pdf'),
        buffer,
      );
      expect(result).toContain('file.pdf');
    });

    it('preserves the file extension from the original filename', async () => {
      await service.save(Buffer.from('image'), 'photo.png', 'user-2', 'doc-2');

      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('file.png'),
        expect.any(Buffer),
      );
    });

    it('nests the file under userId/documentId in the root directory', async () => {
      await service.save(Buffer.from('data'), 'document.pdf', 'user-abc', 'doc-xyz');

      const writtenPath: string = mockWriteFile.mock.calls[0][0];
      expect(writtenPath).toContain('user-abc');
      expect(writtenPath).toContain('doc-xyz');
    });
  });

  describe('read', () => {
    it('returns the file contents as a Buffer', async () => {
      const fakeData = Buffer.from('file content');
      mockReadFile.mockResolvedValue(fakeData);

      const storagePath = `${testRoot}/user-1/doc-1/file.pdf`;
      const result = await service.read(storagePath);

      expect(result).toBe(fakeData);
      expect(mockReadFile).toHaveBeenCalledWith(storagePath);
    });
  });

  describe('delete', () => {
    it('unlinks the file at the given storage path', async () => {
      const storagePath = `${testRoot}/user-1/doc-1/file.pdf`;
      await service.delete(storagePath);

      expect(mockUnlink).toHaveBeenCalledWith(storagePath);
    });
  });
});
