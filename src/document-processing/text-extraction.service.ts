import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
// pdf-parse is CJS-only; use require to get the callable function
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';

const execFileAsync = promisify(execFile);

// Minimum character count to consider PDF text extraction successful.
// Scanned PDFs produce near-zero text even with pdf-parse.
const MIN_TEXT_LENGTH = 50;

@Injectable()
export class TextExtractionService {
  private readonly logger = new Logger(TextExtractionService.name);

  async extract(buffer: Buffer, mimeType: string): Promise<string> {
    let raw: string;

    if (mimeType === 'application/pdf') {
      raw = await this.extractFromPdf(buffer);
    } else if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      raw = await this.ocrImage(buffer);
    } else if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      raw = await this.extractFromDocx(buffer);
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    return this.cleanText(raw);
  }

  private async extractFromPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    const text = data.text ?? '';

    if (text.trim().length >= MIN_TEXT_LENGTH) {
      return text;
    }

    // Text too short → likely a scanned PDF. Fall back to OCR via pdftoppm.
    // TODO (production): run pdftoppm in a job queue worker, not synchronously.
    this.logger.warn(
      'PDF yielded insufficient text — attempting OCR via pdftoppm',
    );
    return this.ocrPdf(buffer);
  }

  // Rasterise each PDF page with pdftoppm (poppler-utils) then OCR with tesseract.
  // Requires pdftoppm to be installed on the system (available on the server).
  private async ocrPdf(buffer: Buffer): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lexai-ocr-'));
    const pdfPath = path.join(tmpDir, 'input.pdf');

    try {
      await fs.writeFile(pdfPath, buffer);

      // pdftoppm -r 150 -png input.pdf tmpDir/page
      await execFileAsync('pdftoppm', [
        '-r', '150',
        '-png',
        pdfPath,
        path.join(tmpDir, 'page'),
      ]);

      const entries = await fs.readdir(tmpDir);
      const pngFiles = entries
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => path.join(tmpDir, f));

      if (pngFiles.length === 0) {
        this.logger.warn('pdftoppm produced no pages — returning empty text');
        return '';
      }

      const pageTexts = await Promise.all(
        pngFiles.map((f) => this.ocrImageFromPath(f)),
      );
      return pageTexts.join('\n\n');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async ocrImage(buffer: Buffer): Promise<string> {
    const { data } = await Tesseract.recognize(buffer, 'eng');
    return data.text;
  }

  private async ocrImageFromPath(filePath: string): Promise<string> {
    const { data } = await Tesseract.recognize(filePath, 'eng');
    return data.text;
  }

  private async extractFromDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  private cleanText(text: string): string {
    return text
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars (keep \t \n \r)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')        // collapse horizontal whitespace
      .replace(/\n{3,}/g, '\n\n')     // collapse 3+ blank lines to 2
      .trim();
  }
}
