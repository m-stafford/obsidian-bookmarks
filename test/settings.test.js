import { describe, it, expect } from 'vitest';
import { DEFAULTS, normalizeSettings } from '../src/settings.js';

describe('DEFAULTS', () => {
  it('matches the spec', () => {
    expect(DEFAULTS).toEqual({
      apiBaseUrl: 'http://127.0.0.1:27123',
      apiKey: '',
      targetNote: 'Reading List.md',
      papersFolder: 'Papers',
    });
  });
});

describe('normalizeSettings', () => {
  it('fills defaults for missing keys', () => {
    expect(normalizeSettings({})).toEqual(DEFAULTS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULTS);
  });
  it('trims strings and strips a trailing slash from the base URL', () => {
    expect(normalizeSettings({ apiBaseUrl: ' http://127.0.0.1:27123/ ', apiKey: ' abc ' }))
      .toMatchObject({ apiBaseUrl: 'http://127.0.0.1:27123', apiKey: 'abc' });
  });
  it('adds http:// to a scheme-less base URL and leaves an explicit scheme alone', () => {
    expect(normalizeSettings({ apiBaseUrl: '127.0.0.1:27123/' }).apiBaseUrl).toBe('http://127.0.0.1:27123');
    expect(normalizeSettings({ apiBaseUrl: 'https://127.0.0.1:27124' }).apiBaseUrl).toBe('https://127.0.0.1:27124');
  });
  it('falls back to the default base URL and note when blank', () => {
    expect(normalizeSettings({ apiBaseUrl: '  ', targetNote: '' }))
      .toMatchObject({ apiBaseUrl: DEFAULTS.apiBaseUrl, targetNote: DEFAULTS.targetNote });
  });
  it('adds .md to the target note when missing and strips surrounding slashes', () => {
    expect(normalizeSettings({ targetNote: '/Inbox/Reading List/' }).targetNote).toBe('Inbox/Reading List.md');
    expect(normalizeSettings({ targetNote: 'Notes.MD' }).targetNote).toBe('Notes.MD');
  });
  it('strips surrounding slashes from the papers folder and allows an empty folder', () => {
    expect(normalizeSettings({ papersFolder: '/Papers/arXiv/' }).papersFolder).toBe('Papers/arXiv');
    expect(normalizeSettings({ papersFolder: '' }).papersFolder).toBe('');
    expect(normalizeSettings({ papersFolder: undefined }).papersFolder).toBe('Papers');
  });
  it('ignores non-string values', () => {
    expect(normalizeSettings({ apiKey: 42, targetNote: null })).toMatchObject({ apiKey: '', targetNote: DEFAULTS.targetNote });
  });
});
