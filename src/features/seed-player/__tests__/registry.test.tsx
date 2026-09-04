import { render } from '@testing-library/react-native';
import React from 'react';

import { BlockRenderer, isBlockTypeKnown } from '@/features/seed-player/registry';
import { unknownBlockSeed } from '@/data/__fixtures__/unknown-block-seed';
import { skyDarknessSeed } from '@/data/seeds/sky-darkness';
import { initI18n } from '@/i18n';
import type { AnyBlock } from '@/models/seed';

beforeAll(() => {
  initI18n('fa');
});

const props = {
  seed: skyDarknessSeed,
  draft: {},
  setDraft: jest.fn(),
  onRetry: jest.fn(),
  onOpenSources: jest.fn(),
  reflection: '',
  onReflectionChange: jest.fn(),
};

describe('the block registry', () => {
  it('knows every MVP block type', () => {
    for (const block of skyDarknessSeed.blocks) {
      expect(isBlockTypeKnown(block.type)).toBe(true);
    }
  });

  it('does not claim to know a type it has never seen', () => {
    expect(isBlockTypeKnown('starMap3d')).toBe(false);
  });

  // The whole point of the registry: one unrecognised block must never cost a
  // reader the rest of the seed.
  // Rendering at all is half the assertion: a throw here would reject the
  // promise and fail the test, which is exactly the regression to catch.
  it('renders the named fallback for an unknown type instead of throwing', async () => {
    const unknown = { id: 'b-unknown', type: 'starMap3d' } as AnyBlock;

    const view = await render(<BlockRenderer {...props} block={unknown} />);
    expect(view.getByText('این بخش به نسخه‌ی جدید اپ نیاز دارد')).toBeTruthy();
  });

  it('renders a known block through its own view', async () => {
    const richText = skyDarknessSeed.blocks[0];
    const view = await render(<BlockRenderer {...props} block={richText} />);
    expect(view.getByText('پارادوکس اولبرس')).toBeTruthy();
  });
});

/**
 * The fixture left the production catalogue in goal 5 — it was invalid by
 * construction and real readers saw it whenever a remote fetch failed. It stays
 * here, because the path it exercises is the one that keeps content newer than
 * the app from costing a reader the whole seed.
 */
describe('a seed carrying a block type this build has never seen', () => {
  it('renders every block, falling back on the one it does not know', async () => {
    const seen: string[] = [];

    for (const block of unknownBlockSeed.blocks) {
      const view = await render(
        <BlockRenderer {...props} seed={unknownBlockSeed} block={block} />
      );
      if (!isBlockTypeKnown(block.type)) {
        expect(view.getByText('این بخش به نسخه‌ی جدید اپ نیاز دارد')).toBeTruthy();
        seen.push(block.type);
      }
    }

    // The fixture is only worth keeping while it still contains an unknown type.
    expect(seen).toContain('starMap3d');
  });
});
