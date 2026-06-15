import {
  buildAnalysisUserPrompt,
  ANALYSIS_SYSTEM_PROMPT,
} from './analysis.prompt';

describe('buildAnalysisUserPrompt', () => {
  it('includes the document text in the prompt', () => {
    const result = buildAnalysisUserPrompt('This is a contract.');
    expect(result).toContain('This is a contract.');
  });

  it('does not append a legal context section when legalContext is omitted', () => {
    const result = buildAnalysisUserPrompt('Contract text.');
    expect(result).not.toContain('Relevant Cameroonian legal provisions');
  });

  it('appends the legal context when provided', () => {
    const result = buildAnalysisUserPrompt('Contract text.', 'Article 42: obligation to pay.');
    expect(result).toContain('Relevant Cameroonian legal provisions');
    expect(result).toContain('Article 42: obligation to pay.');
  });

  it('truncates documents longer than 12,000 characters', () => {
    const longText = 'x'.repeat(15_000);
    const result = buildAnalysisUserPrompt(longText);
    expect(result).toContain('[Document truncated for analysis]');
  });

  it('does not truncate documents shorter than 12,000 characters', () => {
    const shortText = 'short document';
    const result = buildAnalysisUserPrompt(shortText);
    expect(result).not.toContain('[Document truncated for analysis]');
    expect(result).toContain('short document');
  });

  it('includes legal context after truncated text', () => {
    const longText = 'x'.repeat(15_000);
    const result = buildAnalysisUserPrompt(longText, 'Legal provision here.');
    expect(result).toContain('[Document truncated for analysis]');
    expect(result).toContain('Legal provision here.');
  });
});

describe('ANALYSIS_SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof ANALYSIS_SYSTEM_PROMPT).toBe('string');
    expect(ANALYSIS_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it('instructs the model to return only JSON', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('JSON');
  });
});
