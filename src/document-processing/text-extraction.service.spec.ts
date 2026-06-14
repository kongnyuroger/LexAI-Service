import { Test, TestingModule } from '@nestjs/testing';
import { TextExtractionService } from './text-extraction.service';

// Mock all three extraction libraries so tests are fast and offline
jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: 'Extracted PDF text content here.' }),
);
jest.mock('mammoth', () => ({
  extractRawText: jest
    .fn()
    .mockResolvedValue({ value: 'Extracted DOCX content here.' }),
}));
jest.mock('tesseract.js', () => ({
  recognize: jest
    .fn()
    .mockResolvedValue({ data: { text: 'OCR result from image.' } }),
}));

// Mock child_process.execFile so pdftoppm is never actually spawned
jest.mock('child_process', () => ({
  execFile: jest.fn((_cmd, _args, cb) => cb(null, '', '')),
}));

// Mock fs so we control what pdftoppm "produces"
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  mkdtemp: jest.fn().mockResolvedValue('/tmp/lexai-ocr-test'),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),   // no PNG pages → empty OCR result
  rm: jest.fn().mockResolvedValue(undefined),
}));

import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

describe('TextExtractionService', () => {
  let service: TextExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TextExtractionService],
    }).compile();

    service = module.get<TextExtractionService>(TextExtractionService);
    jest.clearAllMocks();
  });

  describe('extract — PDF', () => {
    it('returns cleaned text from a text-based PDF', async () => {
      (pdfParse as jest.Mock).mockResolvedValueOnce({
        text: 'This is a legally binding contract between Party A and Party B, effective immediately.',
      });

      const result = await service.extract(
        Buffer.from('%PDF-1.4'),
        'application/pdf',
      );

      expect(pdfParse).toHaveBeenCalledTimes(1);
      expect(result).toContain('Party A');
    });

    it('falls back to OCR when PDF text is too short', async () => {
      (pdfParse as jest.Mock).mockResolvedValueOnce({ text: 'hi' });
      // readdir returns no pages → OCR returns empty string (tested separately)

      const result = await service.extract(
        Buffer.from('%PDF-1.4'),
        'application/pdf',
      );

      // pdfParse was called but text was too short, so OCR fallback ran
      expect(pdfParse).toHaveBeenCalledTimes(1);
      // With no PNG pages produced, result is empty string
      expect(result).toBe('');
    });
  });

  describe('extract — image', () => {
    it('runs OCR on a JPEG buffer', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: { text: 'Invoice total: 50,000 XAF' },
      });

      const result = await service.extract(Buffer.from([0xff, 0xd8]), 'image/jpeg');

      expect(Tesseract.recognize).toHaveBeenCalledTimes(1);
      expect(result).toContain('Invoice total');
    });

    it('runs OCR on a PNG buffer', async () => {
      (Tesseract.recognize as jest.Mock).mockResolvedValueOnce({
        data: { text: 'Lease agreement' },
      });

      const result = await service.extract(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png');
      expect(result).toContain('Lease agreement');
    });
  });

  describe('extract — DOCX', () => {
    it('extracts text from a DOCX buffer', async () => {
      (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({
        value: 'Employment contract between Employer and Employee.',
      });

      const result = await service.extract(
        Buffer.from('PK'), // DOCX is a ZIP, starts with PK
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      expect(mammoth.extractRawText).toHaveBeenCalledTimes(1);
      expect(result).toContain('Employment contract');
    });
  });

  describe('text cleaning', () => {
    it('strips control characters and collapses whitespace', async () => {
      (pdfParse as jest.Mock).mockResolvedValueOnce({
        text: 'Hello\x00\x01 World\r\n\r\n\r\nNext  paragraph',
      });

      const result = await service.extract(
        Buffer.from('%PDF-1.4'),
        'application/pdf',
      );

      expect(result).not.toMatch(/[\x00-\x08]/);
      expect(result).not.toContain('\r');
      expect(result).not.toMatch(/\n{3,}/);
    });
  });

  describe('unsupported type', () => {
    it('throws for an unknown MIME type', async () => {
      await expect(
        service.extract(Buffer.from('data'), 'text/plain'),
      ).rejects.toThrow('Unsupported file type');
    });
  });
});
