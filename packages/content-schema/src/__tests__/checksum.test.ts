import { canonicalize, computeChecksum, sha256Hex, verifyChecksum } from '../checksum';

describe('sha256Hex', () => {
  // The published vectors: if these drift, every bundle checksum drifts with
  // them and downloads start failing verification.
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(sha256Hex('a'.repeat(1000))).toHaveLength(64);
  });

  it('hashes Persian text by its UTF-8 bytes', () => {
    expect(sha256Hex('دانه')).toBe(sha256Hex('دانه'));
    expect(sha256Hex('دانه')).not.toBe(sha256Hex('دانه ')); // trailing space matters
  });
});

describe('canonicalize', () => {
  it('is independent of key order', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('sorts nested keys and preserves array order', () => {
    expect(canonicalize({ x: [{ b: 1, a: 2 }] })).toBe('{"x":[{"a":2,"b":1}]}');
    expect(canonicalize([3, 1, 2])).toBe('[3,1,2]');
  });

  it('drops undefined but keeps null', () => {
    expect(canonicalize({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('computeChecksum', () => {
  const bundle = { seedId: 'seed-1', revision: 2, blocks: [{ id: 'b1', type: 'richText' }] };

  it('is stable across key order', () => {
    expect(computeChecksum(bundle)).toBe(
      computeChecksum({ blocks: bundle.blocks, revision: 2, seedId: 'seed-1' })
    );
  });

  it('ignores the checksum field itself', () => {
    expect(computeChecksum({ ...bundle, checksum: 'whatever' })).toBe(computeChecksum(bundle));
  });

  it('changes when content changes', () => {
    expect(computeChecksum({ ...bundle, revision: 3 })).not.toBe(computeChecksum(bundle));
  });

  it('verifies a bundle against its declared checksum', () => {
    const signed = { ...bundle, checksum: computeChecksum(bundle) };
    expect(verifyChecksum(signed)).toBe(true);
    expect(verifyChecksum({ ...signed, revision: 9 })).toBe(false);
    expect(verifyChecksum(bundle)).toBe(false); // no checksum declared
  });
});
