import { Injectable, Logger } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserPrompt,
} from './prompts/analysis.prompt';

export interface AnalysisSummary {
  purpose: string;
  mainParties: string[];
  importantDates: string[];
  moneyInvolved: string[];
  responsibilities: string[];
}

export interface RiskFlagResult {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  clauseText: string;
  explanation: string;
}

export interface AnalysisResult {
  summary: AnalysisSummary;
  riskFlags: RiskFlagResult[];
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(private openai: OpenAIService) {}

  async analyzeText(text: string, legalContext?: string): Promise<AnalysisResult> {
    const raw = await this.openai.chat([
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: buildAnalysisUserPrompt(text, legalContext) },
    ]);

    return this.parseResponse(raw);
  }

  private parseResponse(raw: string): AnalysisResult {
    // GPT-4 occasionally wraps JSON in markdown code fences despite instructions
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let parsed: AnalysisResult;
    try {
      parsed = JSON.parse(cleaned) as AnalysisResult;
    } catch {
      this.logger.error(
        `GPT-4 returned non-JSON response: ${raw.slice(0, 200)}`,
      );
      throw new Error(
        'AI analysis returned an invalid response. Please try again.',
      );
    }

    if (!parsed?.summary || !Array.isArray(parsed?.riskFlags)) {
      this.logger.error(
        `GPT-4 response missing required fields: ${raw.slice(0, 200)}`,
      );
      throw new Error(
        'AI analysis returned an incomplete response. Please try again.',
      );
    }

    return parsed;
  }
}
