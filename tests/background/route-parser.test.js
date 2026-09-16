import { describe, expect, it } from 'vitest';
import { parseThreadUrl } from '../../src/background/route-parser.js';

describe('parseThreadUrl', () => {
  it.each([
    [
      'Google Chat app route',
      'https://chat.google.com/app/chat/space-alpha/topic/thread-123/?hl=en#details',
      {
        id: 'space/space-alpha/topic/thread-123',
        spaceId: 'space-alpha',
        threadId: 'thread-123',
        url: 'https://chat.google.com/app/chat/space-alpha/topic/thread-123/?hl=en#details'
      }
    ],
    [
      'Gmail hash route with query parameters',
      'https://mail.google.com/chat/u/0/?hl=en#chat/space/space-beta/topic/thread-456',
      {
        id: 'space/space-beta/topic/thread-456',
        spaceId: 'space-beta',
        threadId: 'thread-456',
        url: 'https://mail.google.com/chat/u/0/?hl=en#chat/space/space-beta/topic/thread-456'
      }
    ],
    [
      'Gmail route with an optional trailing slash',
      'https://mail.google.com/chat/#chat/space/space-gamma/topic/thread-789/',
      {
        id: 'space/space-gamma/topic/thread-789',
        spaceId: 'space-gamma',
        threadId: 'thread-789',
        url: 'https://mail.google.com/chat/#chat/space/space-gamma/topic/thread-789/'
      }
    ]
  ])('parses a valid %s', (_name, rawUrl, expected) => {
    expect(parseThreadUrl(rawUrl)).toEqual(expected);
  });

  it.each([
    'https://chat.google.com/',
    'https://chat.google.com/app/chat/space-alpha',
    'https://chat.google.com/app/chat/space-alpha/topic/',
    'https://mail.google.com/chat/#chat/space/space-alpha/topic/',
    'https://mail.google.com/mail/u/0/#chat/space/space-alpha/topic/thread-123',
    'https://example.com/app/chat/space-alpha/topic/thread-123',
    'ftp://chat.google.com/app/chat/space-alpha/topic/thread-123',
    'not a url'
  ])('rejects a non-thread URL: %s', (rawUrl) => {
    expect(parseThreadUrl(rawUrl)).toBeNull();
  });
});
