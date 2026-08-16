import { describe, it, expect } from 'vitest';
import { parsePaperclipOutput } from '../src/services/literature.js';

describe('literature.parsePaperclipOutput', () => {
  it('parses a JSON object with a results array', () => {
    const stdout = JSON.stringify({
      results: [
        { title: 'Cluster failure', doi: '10.1073/pnas.1602413113', year: 2016 },
        { title: 'AFNI methods', id: 'doc-2', abstract: 'Neuroimaging.' },
      ],
    });
    const refs = parsePaperclipOutput(stdout, 6);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({
      title: 'Cluster failure',
      doi: '10.1073/pnas.1602413113',
      year: '2016',
      source: 'paperclip',
    });
    expect(refs[1]).toMatchObject({
      title: 'AFNI methods',
      primary_id: 'doc-2',
      abstract: 'Neuroimaging.',
      doi: null,
    });
  });

  it('parses a bare JSON array and respects the limit', () => {
    const stdout = JSON.stringify([{ title: 'a' }, { title: 'b' }, { title: 'c' }]);
    const refs = parsePaperclipOutput(stdout, 2);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.title)).toEqual(['a', 'b']);
  });

  it('returns [] for empty output', () => {
    expect(parsePaperclipOutput('', 5)).toEqual([]);
    expect(parsePaperclipOutput('   ', 5)).toEqual([]);
  });

  it('returns [] for non-JSON shell output (logged for later wiring)', () => {
    const refs = parsePaperclipOutput('doc-id-1  Some Paper Title\ndoc-id-2 Other', 5);
    expect(refs).toEqual([]);
  });
});
