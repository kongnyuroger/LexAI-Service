import { buildChatSystemPrompt } from './chat.prompt';

describe('buildChatSystemPrompt', () => {
  it('includes the document text in the prompt', () => {
    const result = buildChatSystemPrompt('This is a lease agreement.');
    expect(result).toContain('This is a lease agreement.');
  });

  it('does not append a legal context section when not provided', () => {
    const result = buildChatSystemPrompt('Document text.');
    expect(result).not.toContain('Relevant Cameroonian legal provisions');
  });

  it('appends the legal context section when provided', () => {
    const result = buildChatSystemPrompt(
      'Document text.',
      'Article 5: rights of tenants.',
    );
    expect(result).toContain('Relevant Cameroonian legal provisions for reference');
    expect(result).toContain('Article 5: rights of tenants.');
  });

  it('truncates documents longer than 8,000 characters', () => {
    const longText = 'y'.repeat(10_000);
    const result = buildChatSystemPrompt(longText);
    expect(result).toContain('[Document truncated]');
  });

  it('does not truncate documents shorter than 8,000 characters', () => {
    const shortText = 'A short contract.';
    const result = buildChatSystemPrompt(shortText);
    expect(result).not.toContain('[Document truncated]');
    expect(result).toContain('A short contract.');
  });

  it('appends legal context after truncated text', () => {
    const longText = 'z'.repeat(10_000);
    const result = buildChatSystemPrompt(longText, 'Provision XYZ.');
    expect(result).toContain('[Document truncated]');
    expect(result).toContain('Provision XYZ.');
  });
});
